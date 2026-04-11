/**
 * Phase 4 순수 함수 레이어 — cadence 판정 + deterministic classifier.
 *
 * DB/네트워크/AI 의존성 0. v4 ULTRA §15 규칙 구현.
 *
 * 제공:
 * - CADENCE_MATRIX: context_type별 Day 경과 milestone 시퀀스
 * - CadenceContextType: 6종 context 타입 union
 * - classifyCadenceContextDeterministic: 키워드 pre-filter (D-11)
 * - computeCadenceStage: 마지막 outbound 시점 → 다음 실행 stage 판정
 * - TONE_INTENT_LABELS: toneIntent → 한국어 라벨
 *
 * Wave 1 (04-03 follow-up-composer 확장) / Wave 2 (04-05 workflow-c) 가 의존한다.
 * 시그니처 변경 금지 (interfaces_frozen).
 *
 * @module workflow/cadence
 */

// ─── Types ───────────────────────────────────────────────────

/**
 * 팔로업 컨텍스트 타입 6종.
 *
 * CONTEXT.md D-11 + D-12 근거:
 * - proposal: 제안서 발송 후
 * - contract: 계약서 발송 후 (타이밍 중요)
 * - meeting_qna: 미팅 후 QnA 이메일 (모멘텀 유지)
 * - quote_revision: 견적 수정안 발송 후
 * - influencer_outreach: 크리에이터 협업 제안 (짧은 주기)
 * - general: 위 어디에도 속하지 않는 일반 케이스 (표준 케이던스)
 */
export type CadenceContextType =
  | 'proposal'
  | 'contract'
  | 'meeting_qna'
  | 'quote_revision'
  | 'influencer_outreach'
  | 'general';

/**
 * context_type별 Day 경과 milestone 시퀀스.
 *
 * 근거: v4 ULTRA §15 L871-878 [상황별 팔로업 변형] + CONTEXT.md D-12 해석.
 *
 * D-12 해석 주의:
 * - v4 ULTRA 본문(L873)은 "제안서 발송 후: Day 3 → 7 → 14 (표준)"으로 Day 14까지만 명시.
 * - CONTEXT.md D-12는 "proposal: Day 3 → 7 → 14 → 30"으로 확정.
 * - FLLW-04(Dormant 전환) 일관성 및 마지막 터치 보장을 위해 Day 30 stage 포함.
 *
 * 마지막 stage는 isFinalTouch=true로 판정되어 "관계 유지 전환 + Dormant 후보"로 처리됨.
 */
export const CADENCE_MATRIX: Record<CadenceContextType, readonly number[]> = {
  general: [3, 7, 14, 30],
  proposal: [3, 7, 14, 30],
  contract: [2, 5],
  meeting_qna: [2, 5],
  quote_revision: [3, 7],
  influencer_outreach: [2, 5, 10],
} as const;

/**
 * computeCadenceStage 결과 shape.
 *
 * 상위 orchestrator (04-05 workflow-c)는 이 결과를 받아
 * - follow-up-composer에 stage 정보 주입
 * - isFinalTouch=true → Dormant 전환 후보로 보고 (D-17)
 * - toneLevel → v4 ULTRA §16 톤 캘리브레이션에 전달
 */
export interface CadenceStageResult {
  /** 0-based stage index (CADENCE_MATRIX 배열 index) */
  stageIndex: number;
  /** 해당 stage의 day milestone (예: 3, 7, 14, 30) */
  dayMilestone: number;
  /** 1-based ordinal — 리포트에 "N차 팔로업"으로 노출 */
  ordinal: number;
  /**
   * 해당 stage의 톤 의도 (v4 ULTRA §15 [팔로업 톤 규칙]):
   * - confirm: 확인 여부만 물어보기 (1차, 가볍게)
   * - add_value: 새로운 가치 추가 (2차, 답장할 이유 제공)
   * - alternative: 대안 제시 (3차, 문이 닫히기 전에)
   * - relationship: 관계 유지 전환 (마지막, 압박 제로)
   */
  toneIntent: 'confirm' | 'add_value' | 'alternative' | 'relationship';
  /** 마지막 milestone인지 여부 — D-17 Dormant 전환 후보 판정에 사용 */
  isFinalTouch: boolean;
  /** v4 ULTRA §16 톤 캘리브레이션 레벨 (1~5) */
  toneLevel: 1 | 2 | 3 | 4 | 5;
}

/** toneIntent → 한국어 라벨 (리포트 출력용) */
export const TONE_INTENT_LABELS: Record<CadenceStageResult['toneIntent'], string> = {
  confirm: '확인 여부만 물어보기',
  add_value: '새로운 가치 추가 — 답장할 이유 제공',
  alternative: '대안 제시 — 다른 시나리오 / 작은 규모',
  relationship: '관계 유지 전환 — 압박 제로, 따뜻하게',
};

// ─── Deterministic classifier (D-11) ─────────────────────────

/**
 * 컨텍스트 분류용 키워드 그룹.
 *
 * 우선순위 순서(위에서 아래로 첫 hit 반환):
 * 1. contract — 계약서 단계가 가장 구체적이고 후행 단계이므로 최우선
 * 2. quote_revision — 견적 관련은 제안서와 혼동될 수 있어 먼저 매칭
 * 3. proposal — 제안서 일반
 * 4. meeting_qna — 미팅 후 QnA
 * 5. influencer_outreach — 크리에이터/UGC 관련
 *
 * 근거: Phase 2 classify.ts의 OBJECTION_PATTERNS 패턴을 재사용
 * (import 하지 않고 재현 — 경로 분리 원칙).
 */
const CONTEXT_KEYWORDS: ReadonlyArray<readonly [CadenceContextType, ReadonlyArray<string>]> = [
  ['contract', ['계약서', '계약 체결', 'contract', 'NDA', '법인인감', '사인']],
  ['quote_revision', ['견적 수정', '견적서 수정', '수정 견적', '재견적', '단가 조정']],
  ['proposal', ['제안서', '기획안', '캠페인 제안', 'proposal', '제안 드립니다', '제안드립니다']],
  ['meeting_qna', ['미팅 감사', '미팅 후', 'QnA', '질의응답', '답변 드립니다', '미팅에서 논의']],
  ['influencer_outreach', ['크리에이터', '인플루언서', '협업 제안', 'UGC', '콘텐츠 제작 의뢰']],
];

/**
 * subject + body 문자열에서 context_type을 결정론적으로 분류한다.
 *
 * CONTEXT.md D-11 근거: AI 자동 분류 전 pre-filter 역할. 명백한 키워드가
 * 있는 경우 AI 비용을 아끼고 결정론적 경로로 분류. 매칭 실패 시 null
 * 반환 → 상위 workflow-c가 AI 분류 또는 'general' fallback으로 위임.
 *
 * @param outboundBody 마지막 outbound 이메일 본문
 * @param outboundSubject 마지막 outbound 이메일 제목
 * @returns 매칭된 context_type 또는 null (매칭 실패)
 */
export function classifyCadenceContextDeterministic(
  outboundBody: string,
  outboundSubject: string,
): CadenceContextType | null {
  const haystack = `${outboundSubject}\n${outboundBody}`;
  for (const [type, keywords] of CONTEXT_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return null;
}

// ─── computeCadenceStage ─────────────────────────────────────

/**
 * 마지막 outbound 시점 기준으로 다음 실행할 cadence stage를 판정한다.
 *
 * **catch-up 정책 (pitfall #3):**
 * "가장 높은 도달 milestone"만 반환한다 — 지연된 팔로업을 여러 건 한 번에
 * 생성하지 않음. 예: proposal 23일 경과에 실행 이력 0이면 Day 14만 반환하고
 * Day 3/7은 건너뜀. 상대방 이메일함에 갑자기 3통이 쌓이는 걸 방지.
 *
 * **executedStageIndices (D-13 재사용):**
 * 이미 실행된 stage는 제외한다. 실행 이력은 touchpoints metadata에서 복원.
 * 최신 milestone이 이미 실행되었다면 다음 상위 milestone을 탐색한다.
 *
 * **clock skew 가드:**
 * lastOutboundAt이 now보다 미래이면 null 반환 (시스템 시계 오류 방지).
 *
 * **결정론성:**
 * Date.now()를 내부에서 호출하지 않음 — `now: Date` 파라미터로 주입.
 * 테스트 재현성 확보 (pitfall #6).
 *
 * @param lastOutboundAt 마지막 outbound의 ISO 8601 문자열
 * @param now 현재 시점 (테스트 DI 또는 orchestrator에서 new Date() 주입)
 * @param contextType CADENCE_MATRIX 키
 * @param executedStageIndices 이미 실행된 stageIndex 배열 (D-13 재사용)
 * @returns 실행할 stage 정보 또는 null (실행할 stage 없음 / 에러)
 */
export function computeCadenceStage(
  lastOutboundAt: string,
  now: Date,
  contextType: CadenceContextType,
  executedStageIndices: number[] = [],
): CadenceStageResult | null {
  const lastMs = new Date(lastOutboundAt).getTime();
  if (Number.isNaN(lastMs)) return null;

  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return null;

  // clock skew 가드: 미래 시점 → 판정 중단
  if (lastMs > nowMs) return null;

  // elapsedDays는 floor 기준 (정확히 N일 경과 시에만 stage 활성화)
  const elapsedDays = Math.floor((nowMs - lastMs) / (24 * 60 * 60 * 1000));
  if (elapsedDays < 0) return null;

  const milestones = CADENCE_MATRIX[contextType];
  if (!milestones || milestones.length === 0) return null;

  // 이미 실행된 stage 중 가장 높은 index — 그 이하는 "과거"로 간주하고 건너뜀.
  // 예: executed=[2] 이면 Day 14까지 실행된 것이므로 다음은 Day 30(index 3)만 대기.
  const highestExecuted = executedStageIndices.length > 0
    ? Math.max(...executedStageIndices)
    : -1;

  // catch-up: highestExecuted 보다 높은 index 중에서
  // elapsedDays >= milestone 조건을 만족하는 가장 높은 stage 선택.
  // "가장 높은 도달 milestone"만 반환 — 지연된 팔로업 여러 건 생성 방지.
  let targetIdx = -1;
  for (let i = highestExecuted + 1; i < milestones.length; i++) {
    if (elapsedDays >= milestones[i]) {
      targetIdx = i;
    }
  }
  if (targetIdx === -1) return null;

  const ordinal = targetIdx + 1;
  const isFinal = targetIdx === milestones.length - 1;

  // 마지막 stage는 항상 relationship 전환 (isFinalTouch=true)
  // 그 외에는 ordinal 기준으로 confirm → add_value → alternative
  const toneIntent: CadenceStageResult['toneIntent'] = isFinal
    ? 'relationship'
    : ordinal === 1
      ? 'confirm'
      : ordinal === 2
        ? 'add_value'
        : 'alternative';

  // toneLevel 매핑 (v4 ULTRA §16 + CONTEXT.md D-14):
  // - confirm / add_value / relationship: 레벨 2 (따뜻한 프로)
  // - alternative: 레벨 3 (좀 더 적극적)
  const toneLevel: CadenceStageResult['toneLevel'] =
    toneIntent === 'alternative' ? 3 : 2;

  return {
    stageIndex: targetIdx,
    dayMilestone: milestones[targetIdx],
    ordinal,
    toneIntent,
    isFinalTouch: isFinal,
    toneLevel,
  };
}
