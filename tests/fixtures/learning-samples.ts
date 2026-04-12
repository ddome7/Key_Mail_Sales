/**
 * Phase 5 학습 루프 테스트 픽스처
 *
 * Plan 05-01이 제공하는 3개 신규 테이블(email_patterns, edit_deltas, competitor_intel)의
 * 샘플 데이터와 Gmail ThreadMessage 픽스처.
 *
 * Wave 1의 pattern-tracker, edit-delta-extractor, competitor-extractor가
 * 이 파일의 샘플을 import하여 검증한다.
 *
 * **주의:** 테스트 전용 mock 데이터. 실제 클라이언트 식별 정보 미포함.
 */

import type { NewEmailPattern, NewEditDelta, NewCompetitorIntel } from '../../src/db/schema.js';
import type { ThreadMessage } from '../../src/workflow/thread-loader.js';

// ─── 공통 헬퍼 ─────────────────────────────────────────────
/** 한국 시간(+09:00) 기준 ISO 문자열을 ms epoch 문자열로 변환한다. */
function toInternalDate(iso: string): string {
  return String(new Date(iso).getTime());
}

const CYR_EMAIL = 'cyr@puzl.co.kr';
const DUMMY_CLIENT_EMAIL = 'client@sample.co.kr';

// ─── email_patterns 샘플 (D-03) ────────────────────────────
/**
 * 답장을 받은 성공 패턴: F&B 업종, 전략 E, 답장까지 2일 소요.
 * clientId/touchpointId는 테스트에서 실제 INSERT 후 채워야 한다.
 */
export const SAMPLE_EMAIL_PATTERN: Omit<NewEmailPattern, 'id' | 'createdAt' | 'clientId'> = {
  touchpointId: null,
  strategyUsed: 'E',
  toneLevel: 3,
  contextType: 'proposal',
  subjectLine: '[제안서] F&B 캠페인 기획안 드립니다',
  bodyPreview: '안녕하세요, 퍼즐코퍼레이션 최영록입니다. 요청 주신 F&B 캠페인에 대한 제안서와 상세 기획안 함께 송부드립니다. 검토 후 편하게 말씀 주시면 바로 다음 단계로 넘어가도록 준비하겠습니다.',
  sentAt: '2026-04-01T10:00:00+09:00',
  replyReceivedAt: '2026-04-03T14:30:00+09:00',
  outcome: 'replied',
  daysToReply: 2,
  industry: 'F&B',
};

// ─── edit_deltas 샘플 (D-07) ────────────────────────────────
/**
 * 톤 변경 수정 패턴: 대표님이 봇의 드래프트에서 톤을 더 친근하게 수정한 사례.
 */
export const SAMPLE_EDIT_DELTA: Omit<NewEditDelta, 'id' | 'createdAt' | 'clientId'> = {
  touchpointId: null,
  originalBody: '<p>안녕하세요, 퍼즐코퍼레이션입니다. 건의 제안서를 보내드립니다. 검토 후 회신 부탁드립니다.</p>',
  finalBody: '<p>안녕하세요! 퍼즐코퍼레이션 최영록입니다 :) 요청 주신 건 제안서 바로 보내드려요. 편하게 검토하시고 궁금하신 점 있으면 말씀 주세요!</p>',
  diffSummary: '톤을 더 친근하게 변경 — 딱딱한 경어체에서 친근한 존칭+이모지 스타일로 전환',
  diffCategory: 'tone',
};

// ─── competitor_intel 샘플 (D-13) ────────────────────────────
/**
 * 확인된 경쟁사 가격 정보: 통화 분석에서 추출한 경쟁사 견적 단가.
 */
export const SAMPLE_COMPETITOR_INTEL: Omit<NewCompetitorIntel, 'id' | 'discoveredAt' | 'clientId'> = {
  competitorName: 'ABC마케팅',
  intelType: 'pricing',
  detail: '인플루언서 마케팅 건당 1500만원 견적 제시',
  source: 'call_analysis',
  confidence: 'confirmed',
};

// ─── Gmail ThreadMessage 픽스처 (edit delta 추출용) ──────────

/**
 * 대표님이 봇 드래프트를 **수정 후 발송**한 스레드.
 *
 * - [0]: 대표님 발신(cyr@puzl.co.kr) — body가 원본과 다름
 *   (원본은 touchpoint.metadata.original_body에 저장된 상태를 가정)
 */
export const THREAD_WITH_SENT_MODIFIED: ThreadMessage[] = [
  {
    messageId: 'msg-sent-modified-001',
    from: CYR_EMAIL,
    to: DUMMY_CLIENT_EMAIL,
    subject: '[제안서] 뷰티 브랜드 캠페인 기획안',
    body: '<p>안녕하세요! 퍼즐코퍼레이션 최영록입니다 :) 요청 주신 건 제안서 바로 보내드려요. 편하게 검토하시고 궁금하신 점 있으면 말씀 주세요!</p>',
    internalDate: toInternalDate('2026-04-01T10:00:00+09:00'),
  },
];

/**
 * 대표님이 봇 드래프트를 **수정 없이 그대로 발송**한 스레드.
 *
 * - body가 원본(touchpoint.metadata.original_body)과 동일
 * - D-09: "수정 안 한 이메일은 이 스타일이 OK라는 양성 신호"
 */
export const THREAD_WITH_SENT_UNCHANGED: ThreadMessage[] = [
  {
    messageId: 'msg-sent-unchanged-001',
    from: CYR_EMAIL,
    to: DUMMY_CLIENT_EMAIL,
    subject: '[견적서] UGC 캠페인 견적 송부드립니다',
    body: '<p>안녕하세요, 퍼즐코퍼레이션입니다. 건의 제안서를 보내드립니다. 검토 후 회신 부탁드립니다.</p>',
    internalDate: toInternalDate('2026-04-02T14:00:00+09:00'),
  },
];
