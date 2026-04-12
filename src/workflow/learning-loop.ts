/**
 * Learning Loop Orchestrator (Phase 5 Plan 05) — D-16 "학습 돌려줘" 진입점
 *
 * 대표님이 Claude Code 세션에서 "학습 돌려줘" 요청 시 실행되는
 * 학습 파이프라인 오케스트레이터. 4개 LRNG 서브루틴을 순차 실행하고
 * 종합 LearningLoopResult를 반환한다.
 *
 * ─ 진입점 2종 ───────────────────────────────────────────────────
 *   runLearnForClient(clientId, deps)  — primitive, 단일 클라이언트
 *   runLearningLoop(deps, options?)    — batch, 활성 클라이언트 전수
 *
 * ─ 4단계 파이프라인 (runLearnForClient) ─────────────────────────
 *   1. LRNG-01: scanEmailPatterns — 이메일 성과 패턴 스캔
 *   2. LRNG-02: extractEditDeltas — 대표님 수정 패턴 추출
 *   3. LRNG-03: checkCrossSellOpportunities — 크로스셀 기회 감지
 *   4. LRNG-04: extractCompetitorIntel — 경쟁사 정보 추출
 *
 * ─ 설계 원칙 ────────────────────────────────────────────────────
 *   D-01 Claude Code 모드: 이 함수는 호출자가 명시적으로 호출할 때만
 *     실행되는 평범한 async 함수. 파일 어디에도 주기 실행 API 없음.
 *   DI 원칙: AI 호출(classifyOutcomeAI, summarizeDiff, extractCompetitor)은
 *     모두 optional DI. 미주입 시 deterministic/skip 모드로 동작.
 *   per-iteration try-catch: batch 루프 한 client 실패가 전체를 중단시키지 않음
 *     (workflow-c 패턴 복제).
 *
 * @module workflow/learning-loop
 */

import { scanEmailPatterns, type PatternScanResult } from './pattern-tracker.js';
import { extractEditDeltas, type EditDeltaResult } from './edit-delta-extractor.js';
import {
  checkCrossSellOpportunities,
  type ClientServiceContext,
  type CrossSellOpportunity,
} from './cross-sell-detector.js';
import {
  extractCompetitorIntel,
  type CompetitorIntelResult,
} from './competitor-intel-extractor.js';
import type { ThreadMessage } from './thread-loader.js';
import type { createClientQueries } from '../queries/clients.js';
import type { createTouchpointQueries } from '../queries/touchpoints.js';
import type { createEmailPatternQueries } from '../queries/email-patterns.js';
import type { createEditDeltaQueries } from '../queries/edit-deltas.js';
import type { createCompetitorIntelQueries } from '../queries/competitor-intel.js';

// ─── DI Types ───────────────────────────────────────────────────

/**
 * Learning Loop 의 모든 외부 의존성을 주입하는 번들.
 *
 * AI 호출 3종은 optional. 주입 없이도 deterministic / skip 모드로
 * 동작하므로 단위 테스트가 간단하다.
 */
export interface LearningLoopDependencies {
  clientQueries: Pick<
    ReturnType<typeof createClientQueries>,
    'getActiveFollowupClients' | 'getClientById'
  >;
  touchpointQueries: Pick<
    ReturnType<typeof createTouchpointQueries>,
    'getTimelineByClient'
  >;
  emailPatternQueries: ReturnType<typeof createEmailPatternQueries>;
  editDeltaQueries: Pick<
    ReturnType<typeof createEditDeltaQueries>,
    'create' | 'getByTouchpointId'
  >;
  competitorIntelQueries: ReturnType<typeof createCompetitorIntelQueries>;

  /** Gmail thread loader (DI). */
  loadThread: (threadId: string) => Promise<ThreadMessage[]>;

  // AI DI (optional — 미주입 시 deterministic/skip)
  /** AI outcome 분류 함수. 미주입 시 'replied' 유지. */
  classifyOutcomeAI?: (body: string) => Promise<'positive' | 'negative'>;
  /** AI diff 요약 함수. 미주입 시 deterministic fallback. */
  summarizeDiff?: (original: string, final: string) => Promise<{ summary: string; category: string }>;
  /** AI 경쟁사 추출 함수. 미주입 시 경쟁사 추출 skip. */
  extractCompetitor?: (text: string) => Promise<Array<{
    competitorName: string;
    intelType: 'pricing' | 'service' | 'strategy' | 'weakness' | 'general';
    detail: string;
    confidence: 'confirmed' | 'inferred' | 'rumor';
  }>>;

  /** 테스트용 시계 주입 */
  now?: () => Date;
}

// ─── Result Type ────────────────────────────────────────────────

/**
 * 학습 루프 실행 종합 결과.
 * 4개 LRNG 서브루틴의 개별 결과를 합산한 집계.
 */
export interface LearningLoopResult {
  /** LRNG-01: 신규 등록된 이메일 패턴 수 */
  patternsNew: number;
  /** LRNG-01: pending 재판정 업데이트 건수 */
  patternsUpdated: number;
  /** LRNG-02: 수정 패턴 발견 총 건수 (unchanged + modified) */
  editDeltasFound: number;
  /** LRNG-02: D-09 "수정 없음" 양성 신호 */
  editDeltasUnchanged: number;
  /** LRNG-03: 감지된 크로스셀 기회 목록 */
  crossSellOpportunities: CrossSellOpportunity[];
  /** LRNG-04: 신규 수집 경쟁사 정보 건수 */
  competitorIntelNew: number;
  /** 처리된 클라이언트 수 */
  clientsProcessed: number;
  /** 실패한 클라이언트 수 */
  clientsFailed: number;
  /** 경고 메시지 목록 */
  warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────

/** 빈 LearningLoopResult 생성 */
function emptyResult(): LearningLoopResult {
  return {
    patternsNew: 0,
    patternsUpdated: 0,
    editDeltasFound: 0,
    editDeltasUnchanged: 0,
    crossSellOpportunities: [],
    competitorIntelNew: 0,
    clientsProcessed: 0,
    clientsFailed: 0,
    warnings: [],
  };
}

/** PatternScanResult를 LearningLoopResult에 합산 */
function mergePatternResult(target: LearningLoopResult, scan: PatternScanResult): void {
  target.patternsNew += scan.patternsNew;
  target.patternsUpdated += scan.patternsUpdated;
  target.warnings.push(...scan.warnings);
}

/** EditDeltaResult를 LearningLoopResult에 합산 */
function mergeEditDeltaResult(target: LearningLoopResult, delta: EditDeltaResult): void {
  target.editDeltasFound += delta.unchanged + delta.modified;
  target.editDeltasUnchanged += delta.unchanged;
  target.warnings.push(...delta.warnings);
}

/** CompetitorIntelResult를 LearningLoopResult에 합산 */
function mergeCompetitorResult(target: LearningLoopResult, intel: CompetitorIntelResult): void {
  target.competitorIntelNew += intel.newEntries;
  target.warnings.push(...intel.warnings);
}

/**
 * touchpoints 타임라인에서 서비스 목록을 추정한다.
 * email_sent touchpoint의 metadata.source 또는 metadata.cadence.contextType에서 추출.
 * RESEARCH Pitfall 4: 정확하지 않을 수 있으나 크로스셀은 제안일 뿐 자동 실행 아님.
 */
function estimateServicesFromTouchpoints(touchpoints: any[]): string[] {
  const services = new Set<string>();
  for (const tp of touchpoints) {
    if (tp.type !== 'email_sent') continue;
    const meta = typeof tp.metadata === 'string'
      ? safeParseJson(tp.metadata)
      : (tp.metadata ?? {});
    if (meta.source && typeof meta.source === 'string') {
      services.add(meta.source);
    }
  }
  return [...services];
}

/** JSON 안전 파싱 */
function safeParseJson(str: string): Record<string, any> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

// ─── primitive: runLearnForClient ────────────────────────────────

/**
 * 단일 클라이언트에 대해 4개 LRNG 서브루틴을 순차 실행한다.
 *
 * 1. LRNG-01: scanEmailPatterns — pattern-tracker 호출
 * 2. LRNG-02: extractEditDeltas — edit-delta-extractor 호출
 * 3. LRNG-03: checkCrossSellOpportunities — cross-sell-detector 호출
 * 4. LRNG-04: extractCompetitorIntel — 최근 inbound 이메일에서 추출
 *
 * @param clientId 대상 클라이언트 ID
 * @param deps 의존성 번들
 * @returns 단일 클라이언트 학습 결과
 */
export async function runLearnForClient(
  clientId: number,
  deps: LearningLoopDependencies,
): Promise<LearningLoopResult> {
  const result = emptyResult();
  result.clientsProcessed = 1;

  const now = deps.now ? deps.now() : new Date();

  // ─ LRNG-01: scanEmailPatterns ────────────────────────────────
  const patternResult = await scanEmailPatterns(clientId, {
    touchpointQueries: deps.touchpointQueries as any,
    emailPatternQueries: deps.emailPatternQueries,
    clientQueries: deps.clientQueries as any,
    loadThread: deps.loadThread,
    classifyOutcomeAI: deps.classifyOutcomeAI,
    now: deps.now,
  });
  mergePatternResult(result, patternResult);

  // ─ LRNG-02: extractEditDeltas ────────────────────────────────
  const deltaResult = await extractEditDeltas(clientId, {
    getTimelineByClient: (id: number, limit?: number) =>
      deps.touchpointQueries.getTimelineByClient(id, limit),
    editDeltaQueries: deps.editDeltaQueries,
    loadThread: deps.loadThread,
    summarizeDiff: deps.summarizeDiff
      ? async (orig: string, fin: string) => {
          const r = await deps.summarizeDiff!(orig, fin);
          return {
            summary: r.summary,
            category: r.category as any,
          };
        }
      : undefined,
  });
  mergeEditDeltaResult(result, deltaResult);

  // ─ LRNG-03: checkCrossSellOpportunities ──────────────────────
  const timeline = deps.touchpointQueries.getTimelineByClient(clientId);
  const currentServices = estimateServicesFromTouchpoints(timeline);
  const client = deps.clientQueries.getClientById(clientId);

  if (client && currentServices.length > 0) {
    const emailSentTouchpoints = timeline.filter((tp: any) => tp.type === 'email_sent');
    const firstTpDate = emailSentTouchpoints.length > 0
      ? new Date(emailSentTouchpoints[0].occurredAt)
      : now;
    const weeksElapsed = Math.floor(
      (now.getTime() - firstTpDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );

    const contextTypes = new Set(
      emailSentTouchpoints
        .map((tp: any) => {
          const meta = typeof tp.metadata === 'string'
            ? safeParseJson(tp.metadata)
            : (tp.metadata ?? {});
          return meta?.cadence?.contextType ?? meta?.contextType;
        })
        .filter(Boolean),
    );

    const ctx: ClientServiceContext = {
      currentServices,
      weeksElapsed,
      contentCount: emailSentTouchpoints.length,
      campaignCount: contextTypes.size,
      engagementTrend: 'flat', // v1 default (RESEARCH section 5)
    };

    const opportunities = checkCrossSellOpportunities(
      ctx,
      clientId,
      client.companyName,
    );
    result.crossSellOpportunities.push(...opportunities);
  }

  // ─ LRNG-04: extractCompetitorIntel ───────────────────────────
  // inbound (email_received) touchpoints에서 경쟁사 정보 추출
  const inboundTouchpoints = timeline.filter(
    (tp: any) => tp.type === 'email_received',
  );

  for (const tp of inboundTouchpoints) {
    const threadId = tp.sourceId;
    if (!threadId) continue;

    let threadMessages: ThreadMessage[] = [];
    try {
      threadMessages = await deps.loadThread(threadId);
    } catch (err) {
      result.warnings.push(
        `LRNG-04 loadThread error for tp ${tp.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    // 스레드에서 외부 발신 메시지(답장 본문) 추출
    for (const msg of threadMessages) {
      const from = (msg.from ?? '').toLowerCase();
      if (from.includes('@puzl.co.kr')) continue; // own message skip

      const body = msg.body;
      if (!body) continue;

      const intelResult = await extractCompetitorIntel(
        body,
        clientId,
        'email_reply',
        {
          competitorIntelQueries: deps.competitorIntelQueries,
          extractFn: deps.extractCompetitor,
        },
      );
      mergeCompetitorResult(result, intelResult);
    }
  }

  return result;
}

// ─── batch: runLearningLoop ─────────────────────────────────────

/**
 * 활성 클라이언트 전수를 대상으로 학습 루프를 실행한다 (D-16).
 *
 * 1. clientQueries.getActiveFollowupClients()로 활성 클라이언트 목록 조회
 * 2. 각 클라이언트에 대해 try-catch 안에서 runLearnForClient 호출
 * 3. 결과 합산
 * 4. warnings 수집
 *
 * per-iteration try-catch로 한 client 실패가 batch 전체를 중단시키지 않는다
 * (workflow-c 패턴 복제).
 *
 * D-01 Claude Code 모드: 이 함수는 호출자가 명시적으로 호출할 때만
 * 실행되는 평범한 async 함수. 파일 어디에도 주기 실행 API가 없다.
 *
 * @param deps 의존성 번들
 * @param options 옵션 (현재 예약)
 * @returns 종합 학습 결과
 */
export async function runLearningLoop(
  deps: LearningLoopDependencies,
  options: Record<string, unknown> = {},
): Promise<LearningLoopResult> {
  const result = emptyResult();

  const activeClients = deps.clientQueries.getActiveFollowupClients();

  for (const client of activeClients) {
    try {
      const clientResult = await runLearnForClient(client.id, deps);

      // 합산
      result.patternsNew += clientResult.patternsNew;
      result.patternsUpdated += clientResult.patternsUpdated;
      result.editDeltasFound += clientResult.editDeltasFound;
      result.editDeltasUnchanged += clientResult.editDeltasUnchanged;
      result.crossSellOpportunities.push(...clientResult.crossSellOpportunities);
      result.competitorIntelNew += clientResult.competitorIntelNew;
      result.clientsProcessed += clientResult.clientsProcessed;
      result.clientsFailed += clientResult.clientsFailed;
      result.warnings.push(...clientResult.warnings);
    } catch (err) {
      // per-iteration try-catch (workflow-c 패턴 복제)
      result.clientsFailed++;
      result.warnings.push(
        `client ${client.id} (${client.companyName}) 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
