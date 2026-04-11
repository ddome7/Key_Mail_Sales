/**
 * Phase 4: 스레드 inbound 감지 순수 함수 (D-02 / D-03 / D-20 자동 차단).
 *
 * **배경:**
 * Gmail MCP `ThreadMessage` shape에 `labelIds` 필드가 없으므로
 * (src/workflow/thread-loader.ts L28-44 참조) INBOX/SENT 라벨 기반 판정이
 * 불가능하다. 대신 `from` 헤더의 자사 도메인(@puzl.co.kr) 포함 여부를
 * SENT 라벨 대체로 사용한다.
 *
 * **false-negative 선택 (pitfall #4):**
 * `from` 헤더가 비어있거나 공백인 메시지는 "inbound 아님"으로 판정한다.
 * 반대 선택(inbound로 처리)은 "답장이 있었는데 팔로업을 중단" 이라는
 * false-positive를 낳는데, 팔로업 톤 자체가 따뜻한 리마인드이므로
 * "답장 없는데 팔로업이 한 번 더 가는" 정도의 false-negative가 더 안전.
 *
 * **04-07 UAT 연계:**
 * 실제 Gmail MCP 응답에 `labelIds: ['INBOX'|'SENT']`가 있는 것이
 * 확인되면 Phase 4 후속 패치에서 `labelIds.includes('INBOX')` 우선
 * 판정을 추가할 수 있다. 현재는 from 도메인 fallback만 구현.
 *
 * **순수 함수 원칙:**
 * DB / 네트워크 / AI 의존성 0. Date.now() 등 시간 의존 없음.
 *
 * @module workflow/inbound-detector
 */

import type { ThreadMessage } from './thread-loader.js';

/**
 * 자사 소유 이메일 도메인 목록.
 *
 * CONTEXT.md 상 CC 필수 도메인(PM@puzl.co.kr, leader@puzl.co.kr)과 동일한
 * 도메인을 공유하므로 단일 도메인으로 커버 가능. 향후 관계사 도메인이
 * 추가되면 이 배열에 append.
 */
export const OWN_EMAIL_DOMAINS = ['@puzl.co.kr'] as const;

/**
 * 주어진 메시지가 자사 발신인지 판정.
 *
 * Gmail `from` 헤더는 "Display Name <email@domain>" 또는 "email@domain"
 * 형식이 모두 가능하므로, 대소문자 무시 substring 매칭으로 판정한다.
 *
 * @param message `from` 헤더를 가진 메시지 (ThreadMessage 또는 유사 shape)
 * @returns 자사 발신이면 true, 외부 발신 또는 빈 문자열이면 false
 */
export function isOwnMessage(message: Pick<ThreadMessage, 'from'>): boolean {
  const from = (message.from ?? '').toLowerCase().trim();
  if (!from) return false;
  return OWN_EMAIL_DOMAINS.some((domain) => from.includes(domain.toLowerCase()));
}

/**
 * `sinceMs` 시점 이후로 외부 inbound 메시지가 있는지 검사.
 *
 * **D-20 자동 차단:**
 * 팔로업 파이프라인은 "마지막 outbound 이후 답장이 없음"을 전제로
 * 동작한다. 이 함수가 true를 반환하면 상위 workflow-c는 해당 클라이언트의
 * 케이던스를 자동 중단한다.
 *
 * **엄격 비교 (> not >=):**
 * `internalDate <= sinceMs` 메시지는 "이전 혹은 동시 발생"으로 간주하여
 * 제외한다. 같은 ms epoch 상에 outbound와 inbound가 기록되는 것은
 * 사실상 outbound 본인 전송이므로 inbound 카운트에서 배제.
 *
 * **safe default:**
 * `from` 헤더가 누락된 메시지는 inbound로 인정하지 않는다 (pitfall #4).
 *
 * @param messages 시간순 정렬된 ThreadMessage 배열 (thread-loader 출력)
 * @param sinceMs 마지막 outbound 시점 — ms epoch (엄격 > 비교)
 * @returns 유효한 외부 inbound 메시지가 1건 이상이면 true
 */
export function hasInboundSince(
  messages: ThreadMessage[],
  sinceMs: number,
): boolean {
  return messages.some((m) => {
    // internalDate는 ms epoch 문자열 — parseInt 실패/빈 문자열 시 0 처리
    const ts = parseInt(m.internalDate ?? '0', 10) || 0;
    if (ts <= sinceMs) return false;

    // from 헤더 누락 → safe default (inbound 아님)
    if (!m.from || m.from.trim() === '') return false;

    // 자사 발신 → SENT 대체 판정 (inbound 아님)
    if (isOwnMessage(m)) return false;

    return true;
  });
}
