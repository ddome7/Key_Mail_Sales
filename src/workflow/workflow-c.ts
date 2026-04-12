/**
 * Workflow C Orchestrator (Phase 4 Plan 05) — Cadence Follow-up Pipeline
 *
 * 대표님이 Claude Code 세션에서 "팔로업 돌려줘" 또는 "이 회사 팔로업해줘"
 * 요청 시 실행되는 엔드투엔드 파이프라인. v4 ULTRA §15 팔로업 케이던스
 * 시스템(Day 3/7/14/30 + 상황별 변형 + 톤 규칙 + 절대 금지 표현) 전체를
 * 코드로 구현한다.
 *
 * ─ 진입점 2종 ───────────────────────────────────────────────────────
 *   • runWorkflowCForClient(companyName, deps)  — primitive, 단일 client
 *   • runWorkflowC(deps, options)                — batch 스캔 또는 primitive dispatch
 *
 * ─ 19단계 파이프라인 (runWorkflowCForClient) ─────────────────────────
 *   1.  client 로드 (getClient)
 *   2.  stage=DORMANT 또는 followupPaused → 조기 반환
 *   3.  마지막 outbound 조회 (getLastOutboundByClient) + lastContactDate fallback
 *   4.  loadThreadHistory (기존 Gmail 스레드)
 *   5.  hasInboundSince — 자동 차단 판정 (D-20)
 *   6.  classifyCadenceContextDeterministic → AI fallback → 'general' fallback
 *   7.  executedStageIndices 추출 (touchpoints.metadata.cadence 기반)
 *   8.  computeCadenceStage — catch-up aware stage 결정
 *   9.  classifyCadenceFollowUp — Phase 2 ClassificationResult 생성
 *  10.  loadSections (§15 + 관련 섹션) — safe fallback
 *  11.  buildCadenceFollowUpPrompt — system+userMessage 조립
 *  12.  generateCadenceFollowUpBody (DI) — AI 본문 생성 or placeholder
 *  13.  validateNoForbiddenPhrases — 금기 표현 차단
 *  14.  composeEmail — Phase 2 재사용
 *  15.  validateNoContamination — 교차 오염 차단 (Phase 2 재사용)
 *  16.  validatePrices — 가격 검증 경고 (Phase 2 재사용)
 *  17.  validateQualityChecklist — 품질 체크 (Phase 2 재사용)
 *  18.  buildCadenceFollowUpSubject — Pitfall 4 Re: subject 덮어쓰기
 *  19.  createDraft + createTouchpoint('email_sent') + Dormant 확인
 *
 * ─ 설계 원칙 ────────────────────────────────────────────────────────
 *  • D-01 Claude Code 모드: 주기 실행 API(정적 검사로 검증) 사용 절대 금지.
 *    이 함수는 호출자가 명시적으로 호출할 때만 실행되는 평범한 async 함수.
 *  • D-12 Phase 2 불변: compose/draft-creator/quality-checker/cross-contamination/
 *    price-validator는 import만 할 뿐 수정하지 않는다.
 *  • DI 원칙: AI 호출(generateCadenceFollowUpBody, classifyContextWithAI)과
 *    사용자 대화(askCeoDormantConfirmation)는 모두 optional DI. 주입 없이도
 *    deterministic / placeholder / draft-only 모드로 동작한다.
 *  • per-iteration try-catch: batch 루프 한 client 실패가 전체를 중단시키지 않음.
 *  • fail-safe 기본값: touchpoint 기록 실패 등 비치명 에러는 warnings에 기록.
 *
 * @module workflow-c
 */

import { loadThreadHistory, type GmailReadThreadFn, type ThreadMessage } from './thread-loader.js';
import { createDraft, type GmailToolFn } from './draft-creator.js';
import { composeEmail } from './compose.js';
import { validateNoContamination } from '../safety/cross-contamination.js';
import { validatePrices } from '../safety/price-validator.js';
import { validateQualityChecklist } from './quality-checker.js';
import { loadSections } from './prompt-loader.js';
import {
  classifyCadenceContextDeterministic,
  computeCadenceStage,
  TONE_INTENT_LABELS,
  type CadenceContextType,
  type CadenceStageResult,
} from './cadence.js';
import { hasInboundSince } from './inbound-detector.js';
import { validateNoForbiddenPhrases } from './forbidden-phrase-guard.js';
import {
  classifyCadenceFollowUp,
  buildCadenceFollowUpPrompt,
  buildCadenceFollowUpSubject,
} from './follow-up-composer.js';
import { getDealByCompany, updateDealStage } from '../state/pipeline.js';
import type { Client } from '../db/schema.js';
import type { ClassificationResult } from '../types/classification.js';
import type { createClientQueries } from '../queries/clients.js';
import type { createServiceQueries } from '../queries/services.js';
import type { createTouchpointQueries } from '../queries/touchpoints.js';
import type { createBriefingQueries } from '../queries/briefings.js';

// ─── DI 타입 ───────────────────────────────────────────────────

/**
 * Workflow C 의 모든 외부 의존성을 주입하는 번들.
 *
 * AI 호출 2종과 사용자 대화 1종은 optional. 주입 없이도 deterministic /
 * placeholder / draft-only 모드로 동작하므로 단위 테스트가 간단하다.
 */
export interface WorkflowCDependencies {
  clientQueries: ReturnType<typeof createClientQueries>;
  serviceQueries: ReturnType<typeof createServiceQueries>;
  touchpointQueries: ReturnType<typeof createTouchpointQueries>;
  briefingQueries: ReturnType<typeof createBriefingQueries>;

  gmailTool: GmailToolFn;
  gmailReadThreadTool: GmailReadThreadFn;

  /** 교차 오염 검증용 전체 회사명 목록 (Phase 2 재사용) */
  getAllCompanyNames: () => string[];

  /**
   * AI가 케이던스 팔로업 본문을 생성하는 함수 (DI).
   * buildCadenceFollowUpPrompt 결과(system + userMessage)를 받아 HTML 본문 반환.
   * 주입되지 않으면 안전한 placeholder 본문 사용.
   */
  generateCadenceFollowUpBody?: (system: string, userMessage: string) => Promise<string>;

  /**
   * AI context 분류 (DI).
   * deterministic classifier가 null 반환 시에만 호출된다.
   * 주입되지 않으면 'general' fallback.
   */
  classifyContextWithAI?: (
    outboundBody: string,
    outboundSubject: string,
  ) => Promise<CadenceContextType>;

  /**
   * D-17 Dormant 확인 (DI).
   * stage.isFinalTouch=true 이고 draft가 성공적으로 생성된 후 호출된다.
   * 주입되지 않으면 stage 전환은 수행하지 않고 dormantPending=true만 기록한다.
   */
  askCeoDormantConfirmation?: (
    client: Client,
    draftId: string,
  ) => Promise<'confirm' | 'keep_active'>;

  pipelinePath?: string;
  ultraPath?: string;

  /** 테스트용 시계 주입 */
  now?: () => Date;
}

// ─── 결과 타입 ─────────────────────────────────────────────────

export type WorkflowCResult =
  | {
      status: 'no_action';
      reason: 'no_last_outbound' | 'recent_inbound' | 'no_stage_due' | 'paused' | 'dormant' | 'skipped';
      companyName: string;
    }
  | {
      status: 'success';
      companyName: string;
      draftId: string;
      stage: {
        ordinal: number;
        dayMilestone: number;
        contextType: CadenceContextType;
        isFinalTouch: boolean;
      };
      dormantPending: boolean;
      warnings?: string[];
    }
  | {
      status: 'error';
      companyName: string;
      error: string;
      warnings?: string[];
    };

export interface WorkflowCBatchResult {
  processed: number;
  drafted: number;
  skipped: number;
  errors: number;
  rows: Array<{
    companyName: string;
    lastOutboundAt: string | null;
    elapsedDays: number | null;
    nextCadence: string | null;
    draftId: string | null;
    status: WorkflowCResult['status'];
    note?: string;
  }>;
  pendingBeyondCap: number;
  dormantCandidates: Array<{ companyName: string; draftId: string }>;
}

// ─── 내부 헬퍼 ─────────────────────────────────────────────────

/**
 * classification 결과로부터 §15 팔로업 케이던스 섹션을 포함한 관련 섹션 목록을 반환한다.
 *
 * 항상 포함: persona / email-rules-kr / subject-format / tone-calibration /
 *   followup-cadence / lifecycle / quality-checklist
 */
function getSectionsForCadenceFollowUp(classification: ClassificationResult): string[] {
  const sections = [
    'persona',
    'email-rules-kr',
    'subject-format',
    'tone-calibration',
    'followup-cadence',
    'lifecycle',
    'quality-checklist',
  ];
  sections.push(`strategy-${classification.strategy}`);
  if (classification.language !== 'korean') sections.push('email-rules-en');
  if (classification.industry) sections.push(`industry-${classification.industry}`);
  if (classification.hasObjection) sections.push('objection-handling');
  return sections;
}

/**
 * v4 ULTRA 파일이 없어도(테스트 환경) 섹션 없이 조용히 빈 문자열을 반환한다.
 * workflow-b 패턴 복제.
 */
function safeLoadSections(sectionIds: string[], ultraPath?: string): string {
  try {
    return loadSections(sectionIds, ultraPath);
  } catch {
    return '';
  }
}

/**
 * generateCadenceFollowUpBody DI 미주입 시 사용되는 안전한 placeholder body.
 *
 * 설계:
 * - greeting / action / thanks 키워드 포함 → Phase 2 quality-checker 통과
 * - 금지 표현 블랙리스트 통과 (압박/철회/urgency/관계단절/정서조작 없음)
 * - "확인 도와드리겠습니다" 뉘앙스 (1차 팔로업 톤)
 */
function buildPlaceholderBody(): string {
  return (
    '<p>안녕하세요.</p>' +
    '<p>지난번 안내드린 내용 관련해서 확인 도와드리려 연락드립니다. ' +
    '혹시 궁금하신 부분이나 추가로 필요하신 자료가 있으시면 편하게 말씀 주세요. ' +
    '문의주시면 바로 안내 도와드리겠습니다. 감사합니다.</p>'
  );
}

/** 한국어 no_action reason 라벨 (batch rows note 용) */
const REASON_LABELS: Record<
  Extract<WorkflowCResult, { status: 'no_action' }>['reason'],
  string
> = {
  no_last_outbound: '마지막 접점 기록 없음',
  recent_inbound: '답장 수신됨 (자동 차단)',
  no_stage_due: '아직 케이던스 도래 전',
  paused: '수동 차단 상태',
  dormant: '휴면 상태',
  skipped: '클라이언트 없음',
};

/**
 * WorkflowCBatchResult.rows 1개 row를 조립한다.
 * status별로 필드 분기 — success는 nextCadence/draftId 채움, no_action/error는 null.
 */
function buildReportRow(
  client: Client,
  result: WorkflowCResult,
  now: Date,
): WorkflowCBatchResult['rows'][number] {
  const lastOutboundAt = client.lastContactDate ?? null;
  const elapsedDays = lastOutboundAt
    ? Math.floor((now.getTime() - new Date(lastOutboundAt).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  if (result.status === 'success') {
    const intentLabel = TONE_INTENT_LABELS[
      result.stage.isFinalTouch
        ? 'relationship'
        : result.stage.ordinal === 1
          ? 'confirm'
          : result.stage.ordinal === 2
            ? 'add_value'
            : 'alternative'
    ];
    return {
      companyName: result.companyName,
      lastOutboundAt,
      elapsedDays,
      nextCadence: `Day ${result.stage.dayMilestone} · ${intentLabel} (${result.stage.ordinal}차)`,
      draftId: result.draftId,
      status: 'success',
      note: result.dormantPending ? '휴면 전환 확인 필요' : undefined,
    };
  }

  if (result.status === 'no_action') {
    return {
      companyName: result.companyName,
      lastOutboundAt,
      elapsedDays,
      nextCadence: null,
      draftId: null,
      status: 'no_action',
      note: REASON_LABELS[result.reason],
    };
  }

  return {
    companyName: result.companyName,
    lastOutboundAt,
    elapsedDays,
    nextCadence: null,
    draftId: null,
    status: 'error',
    note: result.error,
  };
}

// ─── primitive: runWorkflowCForClient ──────────────────────────

/**
 * 단일 클라이언트에 대해 19단계 cadence 팔로업 파이프라인을 실행한다.
 *
 * 반환값 분기:
 *  • no_action — 조기 반환 (skipped/dormant/paused/no_last_outbound/recent_inbound/no_stage_due)
 *  • success — draft 생성 완료. stage 정보와 dormantPending 플래그 포함.
 *  • error — 안전 게이트(금기표현/교차오염/품질) 실패.
 */
export async function runWorkflowCForClient(
  companyName: string,
  deps: WorkflowCDependencies,
): Promise<WorkflowCResult> {
  const now = deps.now ? deps.now() : new Date();
  const warnings: string[] = [];

  // ─ Step 1: client 로드 ─────────────────────────────────────
  const client = deps.clientQueries.getClient(companyName);
  if (!client) {
    return { status: 'no_action', reason: 'skipped', companyName };
  }

  // ─ Step 2: Dormant / followupPaused 조기 반환 ──────────────
  if (client.stage === 'DORMANT') {
    return { status: 'no_action', reason: 'dormant', companyName };
  }
  if (client.followupPaused === true) {
    return { status: 'no_action', reason: 'paused', companyName };
  }

  // ─ Step 3: 마지막 outbound 조회 + lastContactDate fallback ─
  const lastOutboundTp = deps.touchpointQueries.getLastOutboundByClient(client.id);
  const lastOutboundAtIso: string | null =
    lastOutboundTp?.occurredAt ?? client.lastContactDate ?? null;

  if (!lastOutboundAtIso) {
    return { status: 'no_action', reason: 'no_last_outbound', companyName };
  }

  try {
    // ─ Step 4: thread 로드 ───────────────────────────────────
    const deal = getDealByCompany(companyName, deps.pipelinePath);
    const existingThreadId = deal?.emailThreadId;
    const threadHistory = await loadThreadHistory(
      existingThreadId,
      deps.gmailReadThreadTool,
    );

    // ─ Step 5: inbound 감지 — 자동 차단 (D-20) ───────────────
    const lastOutboundMs = new Date(lastOutboundAtIso).getTime();
    if (!Number.isNaN(lastOutboundMs) && hasInboundSince(threadHistory, lastOutboundMs)) {
      return { status: 'no_action', reason: 'recent_inbound', companyName };
    }

    // ─ Step 6: context 분류 (deterministic → AI → 'general') ─
    // 마지막 outbound 스레드 메시지로부터 subject/body 추출.
    // thread가 비어 있으면 방어적으로 빈 문자열 사용.
    const lastMsg = threadHistory.length > 0
      ? threadHistory[threadHistory.length - 1]
      : null;
    const outboundSubject = lastMsg?.subject ?? '';
    const outboundBody = lastMsg?.body ?? '';

    let contextType: CadenceContextType | null = classifyCadenceContextDeterministic(
      outboundBody,
      outboundSubject,
    );
    if (contextType === null) {
      if (deps.classifyContextWithAI) {
        contextType = await deps.classifyContextWithAI(outboundBody, outboundSubject);
      } else {
        contextType = 'general';
      }
    }

    // ─ Step 7: executedStageIndices 추출 ──────────────────────
    // touchpoints.metadata.cadence.stageIndex 기반. 기록 없는 touchpoint는 제외.
    const recentTouchpoints = deps.touchpointQueries.getTimelineByClient(client.id, 50) ?? [];
    const executedStageIndices: number[] = recentTouchpoints
      .filter(
        (tp) =>
          (tp.type === 'email_sent' || tp.type === 'email') &&
          tp.metadata &&
          typeof (tp.metadata as any).cadence === 'object' &&
          (tp.metadata as any).cadence !== null,
      )
      .map((tp) => (tp.metadata as any).cadence.stageIndex as number)
      .filter((n) => typeof n === 'number' && !Number.isNaN(n));

    // ─ Step 8: computeCadenceStage ────────────────────────────
    const stage: CadenceStageResult | null = computeCadenceStage(
      lastOutboundAtIso,
      now,
      contextType,
      executedStageIndices,
    );
    if (!stage) {
      return { status: 'no_action', reason: 'no_stage_due', companyName };
    }

    // ─ Step 9: Phase 2 ClassificationResult 생성 ─────────────
    const classification = classifyCadenceFollowUp(stage, client, false);

    // ─ Step 10: v4 ULTRA 섹션 로드 (safe fallback) ───────────
    const promptSections = safeLoadSections(
      getSectionsForCadenceFollowUp(classification),
      deps.ultraPath,
    );

    // ─ Step 11: cadence prompt 조립 ──────────────────────────
    const { system, userMessage } = buildCadenceFollowUpPrompt({
      classification,
      stage,
      contextType,
      threadHistory,
      client,
      promptSections,
    });

    // ─ Step 12: AI 본문 생성 (DI) or placeholder ─────────────
    const aiGeneratedBody = deps.generateCadenceFollowUpBody
      ? await deps.generateCadenceFollowUpBody(system, userMessage)
      : buildPlaceholderBody();

    // ─ Step 13: 금기 표현 게이트 (compose 이전) ──────────────
    const forbiddenCheck = validateNoForbiddenPhrases(aiGeneratedBody);
    if (!forbiddenCheck.safe) {
      const phrases = forbiddenCheck.violations.map((v) => v.phrase).join(', ');
      return {
        status: 'error',
        companyName,
        error: `금지 표현 감지: ${phrases}`,
      };
    }

    // ─ Step 14: composeEmail — Phase 2 재사용 ────────────────
    const emailDraft = composeEmail({
      classification,
      client,
      inquiryContext: '케이던스 팔로업',
      promptSections,
      aiGeneratedBody,
      companyName: client.companyName,
      recipientEmail: client.contactEmail ?? '',
      threadId: existingThreadId || undefined,
      contentSummary: `Day${stage.dayMilestone} 팔로업`,
    });

    // ─ Step 15: cross-contamination 차단 ─────────────────────
    const allKnownCompanies = deps.getAllCompanyNames();
    const contamination = validateNoContamination(
      emailDraft.htmlBody,
      client.companyName,
      allKnownCompanies,
    );
    if (!contamination.safe) {
      return {
        status: 'error',
        companyName,
        error: `교차 오염 감지: ${contamination.contaminations.join(', ')}`,
      };
    }

    // ─ Step 16: 가격 검증 (경고만) ───────────────────────────
    const priceCheck = validatePrices(emailDraft.htmlBody, deps.serviceQueries);
    warnings.push(...priceCheck.mismatches, ...priceCheck.warnings);

    // ─ Step 17: 품질 체크 ────────────────────────────────────
    const qualityCheck = validateQualityChecklist(
      emailDraft.htmlBody,
      emailDraft.subject,
      classification,
    );
    if (!qualityCheck.passed) {
      return {
        status: 'error',
        companyName,
        error: `품질 실패: ${qualityCheck.failures.join(', ')}`,
        warnings: [...warnings, ...qualityCheck.warnings],
      };
    }
    warnings.push(...qualityCheck.warnings);

    // ─ Step 18: Pitfall 4 — Re: subject 덮어쓰기 ─────────────
    // 기존 스레드가 있을 때만 buildCadenceFollowUpSubject 호출.
    // threadHistory가 비어 있으면 subject 덮어쓰지 않고 그대로 사용.
    if (threadHistory.length > 0) {
      emailDraft.subject = buildCadenceFollowUpSubject(threadHistory, client, stage);
    }

    // ─ Step 19a: createDraft ─────────────────────────────────
    const draftResult = await createDraft(emailDraft, deps.gmailTool);

    // ─ Step 19b: createTouchpoint type='email_sent' ──────────
    try {
      deps.touchpointQueries.createTouchpoint({
        clientId: client.id,
        type: 'email_sent',
        sourceId: draftResult.threadId ?? draftResult.draftId,
        summary: `[Day${stage.dayMilestone} 팔로업 드래프트] ${emailDraft.subject}`,
        metadata: {
          draftId: draftResult.draftId,
          source: 'workflow-c',
          cadence: {
            contextType,
            stageIndex: stage.stageIndex,
            ordinal: stage.ordinal,
            dayMilestone: stage.dayMilestone,
            toneIntent: stage.toneIntent,
            isFinalTouch: stage.isFinalTouch,
          },
        },
        occurredAt: new Date().toISOString(),
      } as any);
    } catch {
      warnings.push('터치포인트(email_sent) 기록 실패 (비치명적)');
    }

    // ─ Step 19c: Dormant 확인 ────────────────────────────────
    let dormantPending = false;
    if (stage.isFinalTouch) {
      dormantPending = true;
      if (deps.askCeoDormantConfirmation) {
        const resp = await deps.askCeoDormantConfirmation(client, draftResult.draftId);
        if (resp === 'confirm') {
          const dealForDormant = getDealByCompany(companyName, deps.pipelinePath);
          if (dealForDormant) {
            try {
              updateDealStage(dealForDormant.id, 'DORMANT', deps.pipelinePath);
              deps.clientQueries.updateClientField(companyName, 'stage', 'DORMANT');
              dormantPending = false;
            } catch (err) {
              warnings.push(
                `Dormant 전환 실패 (비치명적): ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
      }
    }

    return {
      status: 'success',
      companyName,
      draftId: draftResult.draftId,
      stage: {
        ordinal: stage.ordinal,
        dayMilestone: stage.dayMilestone,
        contextType,
        isFinalTouch: stage.isFinalTouch,
      },
      dormantPending,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    return {
      status: 'error',
      companyName,
      error: err instanceof Error ? err.message : String(err),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

// ─── batch: runWorkflowC ───────────────────────────────────────

/**
 * 팔로업 전수 스캔 또는 특정 client 모드 실행.
 *
 * options.companyName 존재 시 → primitive(runWorkflowCForClient) 결과를 그대로 반환.
 * 없으면 getActiveFollowupClients를 오래된 순으로 순회하며 drafted < maxDrafts 까지
 * 드래프트를 생성. 초과분은 pendingBeyondCap 카운트에만 반영한다.
 *
 * per-iteration try-catch로 한 client 실패가 batch 전체를 중단시키지 않는다.
 *
 * **D-01 Claude Code 모드:** 이 함수는 호출자(대표님의 Claude Code 세션)가 명시적으로
 * 호출할 때만 실행되는 평범한 async 함수다. 파일 내에 어떠한 주기 실행 API도 포함되지
 * 않으며 정적 grep 테스트로 회귀 검증된다.
 */
export async function runWorkflowC(
  deps: WorkflowCDependencies,
  options: { maxDrafts?: number; companyName?: string } = {},
): Promise<WorkflowCBatchResult | WorkflowCResult> {
  // ─ primitive 모드 dispatch ─
  if (options.companyName) {
    return runWorkflowCForClient(options.companyName, deps);
  }

  const maxDrafts = options.maxDrafts ?? 10;
  const now = deps.now ? deps.now() : new Date();

  // ─ 활성 클라이언트 조회 + 방어적 재정렬 (오래된 순) ─
  const activeClients = [...deps.clientQueries.getActiveFollowupClients()];
  activeClients.sort((a, b) => {
    const A = a.lastContactDate ?? '';
    const B = b.lastContactDate ?? '';
    return A.localeCompare(B);
  });

  const batch: WorkflowCBatchResult = {
    processed: 0,
    drafted: 0,
    skipped: 0,
    errors: 0,
    rows: [],
    pendingBeyondCap: 0,
    dormantCandidates: [],
  };

  for (const client of activeClients) {
    // 드래프트 상한 초과 — 추가 계산 없이 pendingBeyondCap만 증가.
    if (batch.drafted >= maxDrafts) {
      batch.pendingBeyondCap++;
      continue;
    }

    try {
      const result = await runWorkflowCForClient(client.companyName, deps);
      batch.processed++;
      batch.rows.push(buildReportRow(client, result, now));

      if (result.status === 'success') {
        batch.drafted++;
        if (result.dormantPending) {
          batch.dormantCandidates.push({
            companyName: client.companyName,
            draftId: result.draftId,
          });
        }
      } else if (result.status === 'no_action') {
        batch.skipped++;
      } else {
        batch.errors++;
      }
    } catch (err) {
      // per-iteration safety net — primitive 내부 throw가 여기로 흘러올 일은
      // 거의 없지만(runWorkflowCForClient가 자체 try-catch 보유), 방어적으로
      // 한 번 더 감싸 batch 전체 중단을 막는다.
      batch.processed++;
      batch.errors++;
      batch.rows.push({
        companyName: client.companyName,
        lastOutboundAt: client.lastContactDate ?? null,
        elapsedDays: null,
        nextCadence: null,
        draftId: null,
        status: 'error',
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return batch;
}
