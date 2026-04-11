/**
 * Gmail Thread Loader — DI 래퍼 (Plan 03-04)
 *
 * 기존 Gmail 스레드 전문(full history)을 로드하여 통화 후속 이메일 작성의
 * "맥락 재료"로 사용한다. 실제 Gmail MCP 도구 이름(`gmail_read_thread` /
 * `gmail_get_thread` / `list_thread_messages` 등)은 아직 미확정이므로(A4),
 * 이 모듈은 **DI 인터페이스만** 정의한다. Plan 05 오케스트레이터가 실제
 * MCP 호출 함수를 `GmailReadThreadFn` 타입으로 주입.
 *
 * 핵심 동작:
 * 1. threadId가 falsy / 공백 / '' 이면 도구 호출 없이 즉시 `[]` 반환
 *    (T-03-28: Gmail API가 빈 threadId를 잘못된 스레드로 해석하는 경우 차단)
 * 2. 유효 threadId는 도구로 전달 → raw 응답을 `ThreadMessage[]`로 정규화
 *    (T-03-29: 필드 누락 방어적 기본값 `?? ''`)
 * 3. `internalDate`(ms epoch 문자열) 기준 오름차순 정렬 → 오래된 → 최신 순
 *
 * @module thread-loader
 */

// ─── Types ───────────────────────────────────────────────────────

/**
 * 정규화된 Gmail 스레드 메시지 1건.
 *
 * Gmail MCP 도구가 반환하는 raw 응답이 어떤 형태든, loadThreadHistory는
 * 이 shape로 정규화한다. 각 필드는 누락 시 빈 문자열로 기본값.
 */
export interface ThreadMessage {
  /** Gmail message id (예: "18f4b2c3d4e5f678") */
  messageId: string;
  /** 발신자 (예: "이의선 <contact@example.com>") */
  from: string;
  /** 수신자 (To 헤더) */
  to: string;
  /** 메시지 제목 */
  subject: string;
  /** 본문 (plain text 또는 HTML; Gmail raw) */
  body: string;
  /**
   * Gmail `internalDate` — ms epoch 문자열.
   * 숫자 비교로 정렬하며, 누락 시 '0' (가장 오래된 것으로 취급).
   */
  internalDate: string;
}

/**
 * Gmail MCP의 스레드 조회 도구를 감싼 DI 함수 타입.
 *
 * Plan 05 오케스트레이터가 실제 MCP 호출 함수를 이 인터페이스로 주입.
 * 예시 (Plan 05에서 작성):
 * ```ts
 * const gmailReadThread: GmailReadThreadFn = async ({ threadId }) => {
 *   const raw = await mcpClient.invoke('gmail_read_thread', { threadId });
 *   return raw.messages.map((m) => ({
 *     messageId: m.id,
 *     from: m.headers.from,
 *     to: m.headers.to,
 *     subject: m.headers.subject,
 *     body: m.body,
 *     internalDate: m.internalDate,
 *   }));
 * };
 * ```
 *
 * 테스트에서는 `vi.fn()`으로 mock.
 */
export type GmailReadThreadFn = (args: {
  threadId: string;
}) => Promise<ThreadMessage[]>;

// ─── loadThreadHistory ────────────────────────────────────────────

/**
 * 기존 Gmail 스레드 이력을 로드.
 *
 * @param threadId - Gmail threadId. `undefined`/`null`/`''`/공백 → 빈 배열 (신규 스레드)
 * @param gmailReadThreadTool - DI Gmail MCP 도구 함수
 * @returns 시간순(오래된 → 최신) 정렬된 `ThreadMessage[]`
 *
 * **D-11 처리:** threadId가 없으면 "신규 스레드"로 간주하여 빈 배열 반환.
 * Gmail API가 빈 문자열 threadId를 거부/오류 반환하는 경우가 있어(Pitfall 간접),
 * 아예 호출 자체를 생략한다.
 *
 * **T-03-29 처리:** 도구 응답의 raw 필드가 누락될 수 있으므로 방어적 기본값을
 * 채운다. `internalDate` 누락 시 `'0'`으로 → 가장 오래된 것으로 정렬됨.
 *
 * @throws 도구 호출이 reject되면 에러를 그대로 전파 (오케스트레이터가 try/catch)
 */
export async function loadThreadHistory(
  threadId: string | null | undefined,
  gmailReadThreadTool: GmailReadThreadFn,
): Promise<ThreadMessage[]> {
  // 빈/누락 threadId → 도구 호출 없이 즉시 빈 배열 (T-03-28)
  if (!threadId || threadId.trim() === '') {
    return [];
  }

  const raw = await gmailReadThreadTool({ threadId });

  // 방어적 정규화: 필드 누락 시 빈 문자열/'0' 기본값 (T-03-29)
  const normalized: ThreadMessage[] = raw.map((m) => ({
    messageId: m.messageId ?? '',
    from: m.from ?? '',
    to: m.to ?? '',
    subject: m.subject ?? '',
    body: m.body ?? '',
    internalDate: m.internalDate ?? '0',
  }));

  // internalDate는 ms epoch 문자열 → 숫자 비교로 오름차순 정렬
  normalized.sort((a, b) => {
    const na = parseInt(a.internalDate, 10) || 0;
    const nb = parseInt(b.internalDate, 10) || 0;
    return na - nb;
  });

  return normalized;
}
