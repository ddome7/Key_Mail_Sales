/**
 * Phase 5: 이메일 성과 패턴 배치 스캐너 (D-04, D-05, LRNG-01)
 *
 * 활성 클라이언트의 email_sent touchpoints를 배치 스캔하여:
 * 1. Gmail 답장 여부 판정 (Phase 4 hasInboundSince 재사용)
 * 2. outcome 분류 (classifyOutcomeDeterministic + classifyOutcomeWithAI)
 * 3. email_patterns DB에 기록
 * 4. 기존 pending 건의 30일 초과 재판정
 *
 * T-05-09: clientId 기준 필터링으로 교차 클라이언트 데이터 노출 방지.
 *
 * @module workflow/pattern-tracker
 */

import type { createTouchpointQueries } from '../queries/touchpoints.js';
import type { createEmailPatternQueries } from '../queries/email-patterns.js';
import type { createClientQueries } from '../queries/clients.js';
import type { ThreadMessage } from './thread-loader.js';
import { hasInboundSince } from './inbound-detector.js';
import { classifyOutcomeDeterministic, classifyOutcomeWithAI } from './email-outcome-classifier.js';

// ─── Types ──────────────────────────────────────────────────────

export interface PatternTrackerDeps {
  touchpointQueries: ReturnType<typeof createTouchpointQueries>;
  emailPatternQueries: ReturnType<typeof createEmailPatternQueries>;
  clientQueries: Pick<ReturnType<typeof createClientQueries>, 'getClientById'>;
  /** Gmail thread loader (DI). */
  loadThread: (threadId: string) => Promise<ThreadMessage[]>;
  /** AI outcome 분류 함수 (DI). 미주입 시 'replied' 유지. */
  classifyOutcomeAI?: (body: string) => Promise<'positive' | 'negative'>;
  /** 현재 시각 (테스트 DI용). */
  now?: () => Date;
}

export interface PatternScanResult {
  /** 신규 등록된 패턴 수 */
  patternsNew: number;
  /** pending -> replied/no_reply 업데이트 건수 */
  patternsUpdated: number;
  /** 이미 기록된 touchpointId skip 건수 */
  skipped: number;
  warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────

const DAY_MS = 86400000;

/**
 * touchpoint.metadata JSON에서 안전하게 파싱.
 */
function parseMetadata(metadata: string | null | undefined): Record<string, any> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

/**
 * "[드래프트] ..." 접두사 제거.
 */
function stripDraftPrefix(summary: string | null | undefined): string {
  if (!summary) return '';
  return summary.replace(/^\[드래프트\]\s*/, '');
}

/**
 * thread messages에서 첫 번째 inbound 메시지의 body를 추출.
 * hasInboundSince가 true인 경우에만 호출.
 */
function findFirstReplyBody(messages: ThreadMessage[], sinceMs: number): string | null {
  for (const m of messages) {
    const ts = parseInt(m.internalDate ?? '0', 10) || 0;
    if (ts <= sinceMs) continue;
    const from = (m.from ?? '').toLowerCase().trim();
    if (!from) continue;
    if (from.includes('@puzl.co.kr')) continue; // own message
    return m.body || null;
  }
  return null;
}

/**
 * thread messages에서 첫 번째 inbound 메시지의 timestamp를 추출.
 */
function findFirstReplyTimestamp(messages: ThreadMessage[], sinceMs: number): number | null {
  for (const m of messages) {
    const ts = parseInt(m.internalDate ?? '0', 10) || 0;
    if (ts <= sinceMs) continue;
    const from = (m.from ?? '').toLowerCase().trim();
    if (!from) continue;
    if (from.includes('@puzl.co.kr')) continue;
    return ts;
  }
  return null;
}

// ─── Main function ──────────────────────────────────────────────

/**
 * 특정 클라이언트의 email_sent touchpoints를 배치 스캔하여
 * email_patterns DB에 성과 패턴을 기록한다.
 *
 * Phase A: 신규 email_sent touchpoints 등록
 * Phase B: 기존 pending 건 재판정 (30일 초과 -> no_reply)
 */
export async function scanEmailPatterns(
  clientId: number,
  deps: PatternTrackerDeps,
): Promise<PatternScanResult> {
  const result: PatternScanResult = {
    patternsNew: 0,
    patternsUpdated: 0,
    skipped: 0,
    warnings: [],
  };

  const now = deps.now ? deps.now() : new Date();
  const nowMs = now.getTime();

  // Get client info for industry
  const client = deps.clientQueries.getClientById(clientId);
  const industry = client?.industry ?? null;

  // ─── Phase A: 신규 email_sent touchpoints 등록 ─────────────

  const timeline = deps.touchpointQueries.getTimelineByClient(clientId);
  const emailSentTouchpoints = timeline.filter((tp: any) => tp.type === 'email_sent');

  for (const tp of emailSentTouchpoints) {
    // Pitfall 6: 이미 기록된 touchpointId는 skip
    const existing = deps.emailPatternQueries.getByTouchpointId(tp.id);
    if (existing) {
      result.skipped++;
      continue;
    }

    const metadata = parseMetadata(tp.metadata as string | null);
    const sentAtMs = new Date(tp.occurredAt).getTime();
    const daysElapsed = Math.floor((nowMs - sentAtMs) / DAY_MS);

    // Gmail thread 로드
    const threadId = tp.sourceId;
    let threadMessages: ThreadMessage[] = [];
    if (threadId) {
      try {
        threadMessages = await deps.loadThread(threadId);
      } catch (err) {
        result.warnings.push(`loadThread error for tp ${tp.id}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    // D-04: hasInboundSince로 답장 수신 감지 (Phase 4 재사용)
    const hasReply = hasInboundSince(threadMessages, sentAtMs);

    // classifyOutcomeDeterministic
    let outcome = classifyOutcomeDeterministic(hasReply, daysElapsed);

    // 답장 body 추출 (replied일 때)
    let replyBody: string | null = null;
    let replyTimestamp: number | null = null;
    if (hasReply) {
      replyBody = findFirstReplyBody(threadMessages, sentAtMs);
      replyTimestamp = findFirstReplyTimestamp(threadMessages, sentAtMs);
    }

    // AI 세분화 (replied -> positive/negative)
    outcome = await classifyOutcomeWithAI(outcome, replyBody, deps.classifyOutcomeAI);

    // daysToReply 계산
    let daysToReply: number | null = null;
    if (hasReply && replyTimestamp) {
      daysToReply = Math.floor((replyTimestamp - sentAtMs) / DAY_MS);
    }

    // replyReceivedAt
    const replyReceivedAt = replyTimestamp ? new Date(replyTimestamp).toISOString() : null;

    // metadata에서 strategy/context 추출 (Pitfall 3)
    const cadence = metadata.cadence ?? {};
    const strategyUsed = cadence.contextType ?? metadata.strategy ?? null;
    const toneLevel = cadence.toneLevel ?? null;
    const contextType = cadence.contextType ?? null;

    // subjectLine: summary에서 "[드래프트]" 접두사 제거
    const subjectLine = stripDraftPrefix(tp.summary);

    // bodyPreview: originalBody를 200자 절단 (D-03)
    const rawBody = metadata.originalBody ?? '';
    const bodyPreview = rawBody.slice(0, 200);

    // email_patterns에 저장
    deps.emailPatternQueries.create({
      clientId,
      touchpointId: tp.id,
      strategyUsed,
      toneLevel,
      contextType,
      subjectLine,
      bodyPreview,
      sentAt: tp.occurredAt,
      replyReceivedAt,
      outcome,
      daysToReply,
      industry,
    });

    result.patternsNew++;
  }

  // ─── Phase B: 기존 pending 건 재판정 ───────────────────────

  const pendingPatterns = deps.emailPatternQueries.getPendingPatterns();

  for (const pattern of pendingPatterns) {
    // T-05-09: clientId 일치하는 건만 처리
    if ((pattern as any).clientId !== clientId) continue;

    const sentAtMs = new Date((pattern as any).sentAt).getTime();
    const daysElapsed = Math.floor((nowMs - sentAtMs) / DAY_MS);

    if (daysElapsed > 30) {
      deps.emailPatternQueries.updateOutcome(pattern.id, 'no_reply');
      result.patternsUpdated++;
    }
    // 30일 이하면 pending 유지
  }

  return result;
}
