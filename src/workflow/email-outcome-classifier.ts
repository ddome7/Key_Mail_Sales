/**
 * Phase 5: 이메일 성공/실패 outcome 분류 순수 함수 (D-04).
 *
 * DB/네트워크/AI 의존성 0.
 *
 * 제공:
 * - OutcomeType: 5종 outcome union ('replied' | 'no_reply' | 'positive' | 'negative' | 'pending')
 * - classifyOutcomeDeterministic: 기계적 판정 (hasReply + daysElapsed 조합)
 * - classifyOutcomeWithAI: optional DI로 replied → positive/negative 세분화
 *
 * @module workflow/email-outcome-classifier
 */

// ─── Types ───────────────────────────────────────────────────

/**
 * 이메일 outcome 5종.
 *
 * D-04 기준:
 * - pending: 30일 이하 미응답 (아직 판정 불가)
 * - replied: 답장 수신 (AI 미분류 시 여기서 멈춤)
 * - no_reply: 30일 초과 미응답
 * - positive: AI가 답장 내용을 "다음 단계로 이어짐"으로 분류
 * - negative: AI가 답장 내용을 "거절/보류"로 분류
 */
export type OutcomeType = 'replied' | 'no_reply' | 'positive' | 'negative' | 'pending';

// ─── Deterministic classifier (D-04) ─────────────────────────

/**
 * 기계적 outcome 판정 — AI 불필요.
 *
 * 판정 로직:
 * 1. hasReply=true → 'replied' (답장이 왔으므로 일단 replied)
 * 2. hasReply=false + daysElapsed > 30 → 'no_reply' (충분히 기다림)
 * 3. hasReply=false + daysElapsed <= 30 → 'pending' (아직 판정 불가)
 *
 * @param hasReply 답장 수신 여부
 * @param daysElapsed 이메일 발송 후 경과 일수
 * @returns OutcomeType 중 'replied' | 'no_reply' | 'pending'
 */
export function classifyOutcomeDeterministic(
  hasReply: boolean,
  daysElapsed: number,
): OutcomeType {
  if (hasReply) return 'replied';
  if (daysElapsed > 30) return 'no_reply';
  return 'pending';
}

// ─── AI-enhanced classifier (D-04) ──────────────────────────

/**
 * AI 세분화 — optional DI (Dependency Injection, 외부 함수를 선택적으로 주입).
 *
 * replied 상태의 이메일을 positive/negative로 세분화한다.
 * classifyFn이 주입되지 않으면 'replied'를 그대로 반환하여,
 * AI 없이도 안전하게 동작한다.
 *
 * @param deterministicOutcome classifyOutcomeDeterministic의 결과
 * @param replyBody 답장 본문 (null이면 세분화 불가)
 * @param classifyFn AI 분류 함수 (선택적 DI)
 * @returns OutcomeType — classifyFn 주입 시 positive/negative, 미주입 시 replied 그대로
 */
export async function classifyOutcomeWithAI(
  deterministicOutcome: OutcomeType,
  replyBody: string | null,
  classifyFn?: (body: string) => Promise<'positive' | 'negative'>,
): Promise<OutcomeType> {
  if (deterministicOutcome !== 'replied' || !replyBody) return deterministicOutcome;
  if (!classifyFn) return 'replied'; // DI 미주입 → 세분화 안 함
  return classifyFn(replyBody);
}
