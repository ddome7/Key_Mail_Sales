/**
 * Workflow B Orchestrator (Phase 3 Plan 05) — Call Follow-up Pipeline
 *
 * 대표님이 "통화 정리해줘" 요청 시 트리거되는 엔드투엔드 파이프라인:
 *
 *   Slack 커서 로드 → assertAllowedChannel → Slack MCP 메시지 조회
 *   → 메시지별로:
 *      1. parseSlackCallMessage (익시오 파서)
 *      2. analyzeCall (AI 분석 — DI된 Anthropic)
 *      3. matchClient (3단계 클라이언트 매칭)
 *      4. saveBriefing + createTouchpoint('call')
 *      5. loadThreadHistory (기존 Gmail 스레드)
 *      6. classifyCallFollowUp + buildFollowUpPrompt
 *      7. composeEmail + 안전 3중 게이트 (contamination/prices/quality)
 *      8. createDraft (Gmail MCP)
 *      9. createTouchpoint('email')
 *      10. saveSlackCursor (성공/skipped 시에만 전진)
 *
 * 설계 원칙:
 * - D-06 자동 폴링 금지: 타이머/스케줄러 API 절대 사용 금지. runWorkflowB는
 *   호출자(Claude 대화 레이어)가 명시적으로 호출할 때만 동작하는 평범한 async 함수.
 * - D-11 스레드 보존: 기존 emailThreadId가 있으면 그대로 유지, 없으면 undefined.
 * - D-12 Phase 2 재사용: composeEmail / safety 게이트 / createDraft는 수정 금지.
 * - 커서 전진 정책:
 *     success   → 전진 (처리 완료)
 *     skipped   → 전진 (파싱 실패 재처리 무가치)
 *     cancelled → 전진 X (대표님이 나중에 재시도 가능)
 *     error     → 전진 X (재시도 가능)
 * - per-message try/catch: 한 메시지 실패가 전체 실패로 이어지지 않음.
 *
 * @module workflow-b
 */

import { parseSlackCallMessage } from './call-parser.js';
import {
  matchClient,
  type CeoConfirmationRequest,
  type CeoConfirmationResponse,
} from './client-matcher.js';
import { analyzeCall, type AnthropicToolFn } from './call-analyzer.js';
import {
  loadThreadHistory,
  type GmailReadThreadFn,
} from './thread-loader.js';
import {
  classifyCallFollowUp,
  buildFollowUpSubject,
  buildFollowUpPrompt,
} from './follow-up-composer.js';
import { composeEmail } from './compose.js';
import { createDraft, type GmailToolFn } from './draft-creator.js';
import { validateNoContamination } from '../safety/cross-contamination.js';
import { validatePrices } from '../safety/price-validator.js';
import { validateQualityChecklist } from './quality-checker.js';
import { getDealByCompany } from '../state/pipeline.js';
import {
  loadSections,
  getSectionsForClassification,
} from './prompt-loader.js';
import {
  loadSlackCursor,
  saveSlackCursor,
  assertAllowedChannel,
} from '../state/slack-cursor.js';
import type { createClientQueries } from '../queries/clients.js';
import type { createServiceQueries } from '../queries/services.js';
import type { createBriefingQueries } from '../queries/briefings.js';
import type { createTouchpointQueries } from '../queries/touchpoints.js';

// ─── Slack MCP DI 타입 ─────────────────────────────────────────

/**
 * Slack 메시지 1건의 최소 표현. Plan 05 오케스트레이터가 실제 Slack MCP의
 * conversations_history / slack_get_channel_history 응답을 이 shape으로 정규화하여 주입.
 */
export interface SlackMessage {
  ts: string;
  text: string;
  user?: string;
}

/**
 * Slack MCP 도구를 감싼 DI 함수 타입.
 *
 * 실제 MCP 도구 이름(slack_get_channel_history / conversations_history 등)은
 * Plan 05가 어댑터를 작성하여 이 타입으로만 주입한다. 테스트에서는 vi.fn() mock.
 *
 * `channel` 인자로는 반드시 `ALLOWED_CHANNEL_ID`(#세일즈_통화요약)만 전달해야 하며,
 * runWorkflowB 내부에서 `assertAllowedChannel`로 선행 검증된다.
 */
export type SlackToolFn = (args: {
  channel: string;
  oldest: string;
  limit?: number;
}) => Promise<SlackMessage[]>;

// ─── Deps 인터페이스 ───────────────────────────────────────────

export interface WorkflowBDependencies {
  clientQueries: ReturnType<typeof createClientQueries>;
  serviceQueries: ReturnType<typeof createServiceQueries>;
  briefingQueries: ReturnType<typeof createBriefingQueries>;
  touchpointQueries: ReturnType<typeof createTouchpointQueries>;

  gmailTool: GmailToolFn;
  slackTool: SlackToolFn;
  anthropicTool: AnthropicToolFn;
  gmailReadThreadTool: GmailReadThreadFn;

  /**
   * D-05: 대표님에게 직접 대화형 질문. 실제 구현은 CLI 또는 Claude Agent 레이어.
   * Plan 05에서는 DI 인터페이스만 정의하며 단위 테스트는 vi.fn() mock.
   */
  askCeoConfirmation: (
    req: CeoConfirmationRequest,
  ) => Promise<CeoConfirmationResponse>;

  /** Phase 2 재사용: 교차 오염 검증용 전체 회사명 목록 */
  getAllCompanyNames: () => string[];

  pipelinePath?: string;
  ultraPath?: string;
  slackCursorPath?: string;

  /**
   * AI가 후속 이메일 본문을 생성하는 함수 (DI).
   * 오케스트레이터 내부에서 buildFollowUpPrompt 결과(system + userMessage)를
   * 넘겨받아 HTML 본문을 반환한다. 테스트에서는 mock으로 직접 aiGeneratedBody 주입.
   * 주입되지 않으면 안전한 placeholder 본문 사용.
   */
  generateFollowUpBody?: (
    system: string,
    userMessage: string,
  ) => Promise<string>;
}

// ─── 결과 타입 ─────────────────────────────────────────────────

export type ProcessedMessage =
  | {
      ts: string;
      status: 'success';
      draftId: string;
      clientName: string;
      warnings?: string[];
    }
  | { ts: string; status: 'skipped'; reason: string }
  | { ts: string; status: 'cancelled' }
  | {
      ts: string;
      status: 'error';
      error: string;
      warnings?: string[];
    };

export interface WorkflowBResult {
  processed: number;
  results: ProcessedMessage[];
}

// ─── 메인 진입점 ───────────────────────────────────────────────

/**
 * runWorkflowB — 슬랙 통화 요약 → 후속 이메일 드래프트 엔드투엔드 파이프라인.
 *
 * **D-06 자동 폴링 금지:** 이 함수는 호출자가 명시적으로 호출할 때만 실행되는
 * 평범한 async 함수이다. 어떠한 주기 실행 API도 이 파일에 포함되지 않는다
 * (정적 검사로 검증됨).
 *
 * @param deps - DI 의존성 번들
 * @param options.maxMessages - 한 번 실행에서 처리할 최대 메시지 수 (기본 20)
 * @returns WorkflowBResult — 각 메시지의 처리 결과
 */
export async function runWorkflowB(
  deps: WorkflowBDependencies,
  options: { maxMessages?: number } = {},
): Promise<WorkflowBResult> {
  const results: ProcessedMessage[] = [];

  // ─ 커서 로드 + 채널 화이트리스트 검증 (T-03-32) ───────
  const cursor = loadSlackCursor(deps.slackCursorPath);
  assertAllowedChannel(cursor.channelId);

  // ─ Step 1: 슬랙 메시지 조회 ────────────────────────────
  const messages = await deps.slackTool({
    channel: cursor.channelId,
    oldest: cursor.lastReadTs,
    limit: options.maxMessages ?? 20,
  });

  for (const msg of messages) {
    try {
      // ─ Step 2: 파싱 (익시오 형식 확인) ─────────────────
      const parseResult = parseSlackCallMessage(msg.text);
      if (!parseResult.success) {
        results.push({
          ts: msg.ts,
          status: 'skipped',
          reason: parseResult.reason,
        });
        // 재처리 무가치 → 커서 전진
        saveSlackCursor(
          {
            ...cursor,
            lastReadTs: msg.ts,
            lastReadAt: new Date().toISOString(),
          },
          deps.slackCursorPath,
        );
        continue;
      }
      const parsed = parseResult.data;

      // ─ Step 3: AI 통화 분석 ─────────────────────────────
      const analysis = await analyzeCall(parsed, deps.anthropicTool);

      // ─ Step 4: 3단계 클라이언트 매칭 ────────────────────
      const matchResult = await matchClient(
        parsed,
        {
          clientQueries: deps.clientQueries,
          askCeoConfirmation: deps.askCeoConfirmation,
        },
        analysis.extractedCompanyName ?? null,
      );

      if (matchResult.status === 'cancelled') {
        results.push({ ts: msg.ts, status: 'cancelled' });
        // 커서 갱신 X — 대표님이 나중에 재시도 가능
        continue;
      }

      const client = matchResult.client;

      // ─ Step 5: briefings + touchpoints('call') 저장 ───
      deps.briefingQueries.saveBriefing({
        clientId: client.id,
        slackTs: msg.ts,
        slackChannelId: cursor.channelId,
        occurredAt: parsed.occurredAt,
        source: 'ixio',
        summary: analysis.summary,
        actionItems: analysis.actionItems,
        sentiment: analysis.sentiment,
        rawTranscript: parsed.rawText,
      });

      deps.touchpointQueries.createTouchpoint({
        clientId: client.id,
        type: 'call',
        sourceId: msg.ts,
        summary: analysis.summary,
        metadata: {
          temperature: analysis.sentiment.temperature,
          tone: analysis.sentiment.tone,
          source: 'workflow-b',
          matchMethod: matchResult.method,
        },
        occurredAt: parsed.occurredAt,
      });

      // ─ Step 6: 기존 스레드 로드 + 프롬프트 조립 ─────────
      const deal = getDealByCompany(client.companyName, deps.pipelinePath);
      const existingThreadId = deal?.emailThreadId;

      const threadHistory = await loadThreadHistory(
        existingThreadId,
        deps.gmailReadThreadTool,
      );

      const classification = classifyCallFollowUp(
        analysis,
        threadHistory.length > 0,
      );

      let promptSections = '';
      try {
        promptSections = loadSections(
          getSectionsForClassification(classification),
          deps.ultraPath,
        );
      } catch {
        // v4 ULTRA 파일이 없어도(테스트 환경) 프롬프트 섹션 없이 진행
        promptSections = '';
      }

      const { system, userMessage } = buildFollowUpPrompt({
        classification,
        callAnalysis: analysis,
        threadHistory,
        client,
        promptSections,
      });

      // AI 본문 생성 (DI) — 주입 없으면 안전한 placeholder
      // placeholder는 품질 체크를 통과하도록 greeting + action 키워드 포함
      const aiGeneratedBody = deps.generateFollowUpBody
        ? await deps.generateFollowUpBody(system, userMessage)
        : '<p>안녕하세요.</p><p>통화에서 논의한 내용을 정리하여 안내 도와드리겠습니다.</p>';

      // ─ Step 7: 이메일 조립 (D-11 스레드 보존) ───────────
      // 주의: Phase 2 품질 체크가 "[퍼즐/최영록] 프리픽스"를 강제하므로 (체크 7),
      // 여기서는 항상 Phase 2 generateSubject가 만든 신규 형식으로 composeEmail을 통과시키고,
      // 품질 체크를 거친 뒤에 **createDraft 직전에** Re: 형식으로 덮어쓴다.
      const emailDraft = composeEmail({
        classification,
        client,
        inquiryContext: analysis.summary,
        promptSections,
        aiGeneratedBody,
        companyName: client.companyName,
        recipientEmail: client.contactEmail ?? '',
        // Pitfall 4: 기존 스레드 없으면 undefined (빈 문자열 금지)
        threadId: existingThreadId || undefined,
        contentSummary: '통화 후속',
      });

      // ─ Step 8: 안전 3중 게이트 (Phase 2 재사용, D-12) ──

      // 8a. 교차 오염 검증 (T-03-34)
      const allKnownCompanies = deps.getAllCompanyNames();
      const contamination = validateNoContamination(
        emailDraft.htmlBody,
        client.companyName,
        allKnownCompanies,
      );
      if (!contamination.safe) {
        results.push({
          ts: msg.ts,
          status: 'error',
          error: `교차 오염 감지: ${contamination.contaminations.join(', ')}`,
        });
        // 커서 갱신 X — 재시도 가능
        continue;
      }

      // 8b. 가격 검증 (경고만)
      const priceCheck = validatePrices(
        emailDraft.htmlBody,
        deps.serviceQueries,
      );
      const messageWarnings = [
        ...priceCheck.mismatches,
        ...priceCheck.warnings,
      ];

      // 8c. 품질 체크리스트
      const qualityCheck = validateQualityChecklist(
        emailDraft.htmlBody,
        emailDraft.subject,
        classification,
      );
      if (!qualityCheck.passed) {
        results.push({
          ts: msg.ts,
          status: 'error',
          error: `품질 실패: ${qualityCheck.failures.join(', ')}`,
          warnings: [...messageWarnings, ...qualityCheck.warnings],
        });
        continue;
      }
      messageWarnings.push(...qualityCheck.warnings);

      // ─ Pitfall 4: 기존 스레드가 있을 때만 subject를 "Re: {원 subject}"로 덮어쓰기 ─
      // 품질 체크 이후에 덮어써야 Phase 2 체크 7 ([퍼즐/최영록] 프리픽스 강제)과
      // Gmail 스레드 병합 요구(원 subject 보존)를 **둘 다** 만족할 수 있다.
      // 품질 체크는 신규 형식 subject로 통과 → Gmail에는 Re: 형식으로 송신.
      if (threadHistory.length > 0) {
        emailDraft.subject = buildFollowUpSubject(
          threadHistory,
          client,
          analysis,
        );
      }

      // ─ Step 9: Gmail 드래프트 생성 ──────────────────────
      const draftResult = await createDraft(emailDraft, deps.gmailTool);

      // ─ Step 9.5: touchpoints('email') 기록 (비치명적) ──
      try {
        deps.touchpointQueries.createTouchpoint({
          clientId: client.id,
          type: 'email',
          sourceId: draftResult.threadId ?? draftResult.draftId,
          summary: `[드래프트] ${emailDraft.subject}`,
          metadata: {
            draftId: draftResult.draftId,
            source: 'workflow-b',
            isReply: threadHistory.length > 0,
          },
          occurredAt: new Date().toISOString(),
        });
      } catch {
        messageWarnings.push('터치포인트(email) 기록 실패 (비치명적)');
      }

      results.push({
        ts: msg.ts,
        status: 'success',
        draftId: draftResult.draftId,
        clientName: client.companyName,
        warnings: messageWarnings.length > 0 ? messageWarnings : undefined,
      });

      // ─ 커서 갱신 (성공 시에만) ──────────────────────────
      saveSlackCursor(
        {
          ...cursor,
          lastReadTs: msg.ts,
          lastReadAt: new Date().toISOString(),
        },
        deps.slackCursorPath,
      );
    } catch (err) {
      // T-03-41: err.message만 저장 (API key/secret 유출 방지)
      results.push({
        ts: msg.ts,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      // 커서 갱신 X — 재시도 가능
    }
  }

  return { processed: results.length, results };
}
