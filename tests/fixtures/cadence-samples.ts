/**
 * Phase 4 cadence 테스트 픽스처
 *
 * Plan 04-01이 제공하는 **결정적(deterministic) 픽스처 세트**. 다운스트림 플랜
 * (04-02 context classifier / 04-03 cadence-engine / 04-05 workflow-c 통합 테스트
 * / 04-04 inbound-detector)이 이 파일에서 샘플을 import하여 아래 두 가지를 검증한다:
 *
 *  1. **6종 context_type 자동 분류** (D-11): 각 샘플의 subject/body 키워드가
 *     deterministic classifier를 통해 올바른 context_type으로 매핑되는지.
 *     `SAMPLE_OUTBOUND_GENERAL`만 의도적으로 모든 키워드 그룹에 매칭되지 않도록
 *     작성되어 있으며, 이는 "classifier → null → AI fallback → 'general'"
 *     경로를 검증한다.
 *
 *  2. **inbound-detector 판정** (D-03): `THREAD_WITH_INBOUND`는 2건 메시지
 *     배열(outbound + inbound) — inbound는 `cyr@puzl.co.kr`가 아닌 도메인에서
 *     발신되며 `internalDate`가 outbound보다 크다. `THREAD_NO_INBOUND`는
 *     outbound 1건만 포함하여 "답장 없음" 상태를 재현한다.
 *
 * ────────────────────────────────────────────────────────────
 * **주의:** 이 파일은 **테스트 전용 mock 데이터**다. 실제 클라이언트 식별 정보는
 * 포함되지 않으며 모든 회사명/이메일/본문 내용은 더미다. 운영 DB나 Gmail API와
 * 무관하게 순수 TypeScript 상수로만 export된다.
 */

import type { ThreadMessage } from '../../src/workflow/thread-loader.js';

// ─── 공통 헬퍼 ─────────────────────────────────────────────
/** 한국 시간(+09:00) 기준 ISO 문자열을 ms epoch 문자열로 변환한다. */
function toInternalDate(iso: string): string {
  return String(new Date(iso).getTime());
}

const CYR_EMAIL = 'cyr@puzl.co.kr';
const DUMMY_CLIENT_EMAIL = 'client@sample.co.kr';

// ─── 6종 context_type 대표 outbound 샘플 ────────────────────
// 각 샘플은 "대표님이 마지막으로 발송한 이메일" 하나를 의미한다.
// subject/body 키워드는 04-02 deterministic classifier가 사용할 CONTEXT_KEYWORDS
// 목록과 일치시킨다 (plan 04-02에서 고정 확정됨).

/**
 * proposal: 제안서 발송 후 팔로업 케이던스 (Day 3 → 7 → 14 → 30 표준).
 * 분류 키워드: "제안서", "기획안"
 */
export const SAMPLE_OUTBOUND_PROPOSAL: ThreadMessage = {
  messageId: 'msg-proposal-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: '[제안서] 동반성장 캠페인 기획안 드립니다',
  body:
    '<p>안녕하세요, 최영록입니다.</p>' +
    '<p>요청 주신 캠페인에 대한 <b>제안서</b>와 상세 기획안 함께 송부드립니다. ' +
    '검토 후 편하게 말씀 주시면 바로 다음 단계로 넘어가도록 준비하겠습니다.</p>',
  internalDate: toInternalDate('2026-04-01T10:00:00+09:00'),
};

/**
 * contract: 계약서/NDA 송부 후 빠른 팔로업 (Day 2 → 5).
 * 분류 키워드: "계약서", "법인인감", "사인"
 */
export const SAMPLE_OUTBOUND_CONTRACT: ThreadMessage = {
  messageId: 'msg-contract-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: '[계약서 초안] NDA + 본계약 송부드립니다',
  body:
    '<p>논의 주셨던 대로 <b>계약서</b> 초안(NDA + 본계약) 두 건 송부드립니다. ' +
    '내부 검토 후 <b>법인인감</b> 찍어서 회신 주시면, 저희도 같은 방식으로 <b>사인</b>해 마무리하겠습니다.</p>',
  internalDate: toInternalDate('2026-04-03T14:30:00+09:00'),
};

/**
 * meeting_qna: 미팅 직후 QnA 이메일 (Day 2 → 5, 모멘텀 유지).
 * 분류 키워드: "미팅 후", "답변 드립니다"
 */
export const SAMPLE_OUTBOUND_MEETING_QNA: ThreadMessage = {
  messageId: 'msg-meeting-qna-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: '어제 미팅 감사드립니다 — QnA 답변 드립니다',
  body:
    '<p>어제 미팅 후 주신 질문들에 대해 <b>답변 드립니다</b>. ' +
    '추가로 궁금하신 부분 있으면 편히 말씀 주세요.</p>',
  internalDate: toInternalDate('2026-04-05T09:15:00+09:00'),
};

/**
 * quote_revision: 견적 수정안 발송 후 팔로업 (Day 3 → 7).
 * 분류 키워드: "견적 수정", "재견적"
 */
export const SAMPLE_OUTBOUND_QUOTE_REVISION: ThreadMessage = {
  messageId: 'msg-quote-revision-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: 'Re: 견적 수정안 확인 부탁드립니다',
  body:
    '<p>논의 주셨던 범위에 맞춰 <b>견적 수정</b> 완료했습니다. ' +
    '첨부드린 재견적서 확인 후 편하게 피드백 주세요.</p>',
  internalDate: toInternalDate('2026-04-06T16:45:00+09:00'),
};

/**
 * influencer_outreach: 인플루언서 아웃리치 (Day 2 → 5 → 10, 짧은 주기).
 * 분류 키워드: "크리에이터", "협업 제안"
 */
export const SAMPLE_OUTBOUND_INFLUENCER: ThreadMessage = {
  messageId: 'msg-influencer-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: 'UGC 크리에이터 협업 제안',
  body:
    '<p>안녕하세요, 퍼즐코퍼레이션 최영록입니다. ' +
    '저희가 진행하는 <b>크리에이터</b> 네트워크에 맞는 <b>협업 제안</b>드리려 연락드렸습니다.</p>',
  internalDate: toInternalDate('2026-04-07T11:00:00+09:00'),
};

/**
 * general: 위 5개 카테고리 어디에도 속하지 않는 일반 이메일.
 * 의도적으로 모든 context 키워드 그룹과 매칭되지 않도록 짧게 작성 →
 * deterministic classifier null → AI fallback → 'general' 확정.
 */
export const SAMPLE_OUTBOUND_GENERAL: ThreadMessage = {
  messageId: 'msg-general-001',
  from: CYR_EMAIL,
  to: DUMMY_CLIENT_EMAIL,
  subject: '퍼즐코퍼레이션 소개드립니다',
  body:
    '<p>안녕하세요, 퍼즐코퍼레이션 최영록입니다. ' +
    '좋은 기회가 있어 간단히 인사드리고자 연락드렸습니다.</p>',
  internalDate: toInternalDate('2026-04-08T10:00:00+09:00'),
};

// ─── 스레드 픽스처 (inbound-detector 검증용) ────────────────

/**
 * 답장 있음: outbound 1건 + inbound 1건.
 *
 * - [0]: cyr@puzl.co.kr 발신 (outbound) — 04-01 10:00 KST
 * - [1]: client@sample.co.kr 발신 (inbound) — 04-02 08:30 KST
 *
 * inbound의 `internalDate`는 outbound보다 크다 → inbound-detector가
 * "마지막 outbound 이후 inbound 있음"으로 판정해야 한다.
 */
export const THREAD_WITH_INBOUND: ThreadMessage[] = [
  SAMPLE_OUTBOUND_PROPOSAL,
  {
    messageId: 'msg-inbound-001',
    from: `클라이언트 <${DUMMY_CLIENT_EMAIL}>`,
    to: CYR_EMAIL,
    subject: 'Re: [제안서] 동반성장 캠페인 기획안 드립니다',
    body:
      '<p>안녕하세요, 제안서 잘 받았습니다. ' +
      '내부 검토 후 다시 연락드리겠습니다. 감사합니다.</p>',
    internalDate: toInternalDate('2026-04-02T08:30:00+09:00'),
  },
];

/**
 * 답장 없음: outbound 1건만.
 * 대표님이 제안서를 보냈지만 클라이언트가 아직 답장하지 않은 상태 →
 * inbound-detector가 "답장 없음 → 케이던스 판정 진행"으로 분기해야 한다.
 */
export const THREAD_NO_INBOUND: ThreadMessage[] = [SAMPLE_OUTBOUND_PROPOSAL];
