/**
 * Phase 5: 크로스셀/업셀 트리거 감지 순수 함수 (D-10, D-11).
 *
 * v4 ULTRA §17 트리거 매트릭스 11개 서비스→서비스 연결을 코드화.
 * DB/네트워크/AI 의존성 0.
 *
 * 제공:
 * - TriggerRule: 크로스셀 트리거 규칙 인터페이스
 * - ClientServiceContext: 클라이언트의 현재 서비스 상태
 * - CrossSellOpportunity: 감지된 크로스셀 기회
 * - TRIGGER_MATRIX: 11개 트리거 규칙 상수
 * - checkCrossSellOpportunities: 매칭 함수
 *
 * @module workflow/cross-sell-detector
 */

// ─── Types ───────────────────────────────────────────────────

/**
 * 크로스셀 트리거 규칙 1건.
 *
 * v4 ULTRA §17 원문의 각 행(현재 서비스 → 크로스셀 제안 → 타이밍)을
 * 코드로 표현한 shape.
 */
export interface TriggerRule {
  /** 현재 진행 중인 서비스 이름 (v4 ULTRA §17 "현재 서비스" 열) */
  fromService: string;
  /** 제안할 크로스셀 서비스 (v4 ULTRA §17 "크로스셀 제안" 열) */
  toService: string;
  /** 타이밍 조건 설명 (한국어, 보고서 출력용) */
  timingCondition: string;
  /** 타이밍 조건 판정 함수 — ctx 기반으로 조건 충족 여부 반환 */
  timingCheck: (ctx: ClientServiceContext) => boolean;
  /** 제안 화법 패턴 (v4 ULTRA §17 [크로스셀 제안 화법] 1|2|3) */
  speechPattern: 1 | 2 | 3;
}

/**
 * 클라이언트의 현재 서비스 상태 컨텍스트.
 *
 * 오케스트레이터가 touchpoints/DB에서 조회하여 조립 후 이 함수에 전달.
 * 이 모듈은 DB에 직접 접근하지 않는다 (순수 함수 원칙).
 */
export interface ClientServiceContext {
  /** 현재 진행 중인 서비스 이름 목록 */
  currentServices: string[];
  /** 서비스 시작 후 경과 주수 */
  weeksElapsed: number;
  /** 확보된 콘텐츠 개수 */
  contentCount: number;
  /** 누적 캠페인 횟수 */
  campaignCount: number;
  /**
   * 인게이지먼트 추세 (v1에서는 항상 'flat').
   * v2에서 퍼포먼스 데이터 연동 시 실제 판정 예정.
   */
  engagementTrend: 'up' | 'flat' | 'down';
}

/**
 * 감지된 크로스셀 기회 1건.
 */
export interface CrossSellOpportunity {
  /** 매칭된 트리거 규칙 */
  rule: TriggerRule;
  /** 대상 클라이언트 ID */
  clientId: number;
  /** 대상 회사명 (보고서 출력용) */
  companyName: string;
}

// ─── TRIGGER_MATRIX (v4 ULTRA §17) ───────────────────────────

/**
 * v4 ULTRA §17 크로스셀 트리거 매트릭스 — 11개 규칙.
 *
 * 각 규칙의 timingCheck는 ClientServiceContext를 받아
 * 타이밍 조건 충족 여부를 boolean으로 반환한다.
 *
 * speechPattern 매핑:
 * - 1: 데이터 기반 제안 (키워드 데이터, 포스팅 완료 등 수치 근거)
 * - 2: OSMU 연계 제안 (콘텐츠 재활용, 소재 제작 등 자산 활용)
 * - 3: 시즌 연계 제안 (종료 시점, 분기 전환, 장기 전환)
 */
export const TRIGGER_MATRIX: readonly TriggerRule[] = [
  // 1. 카페 바이럴 → 블로그 체험단 (캠페인 2주차, 키워드 데이터 나올 때)
  {
    fromService: '카페 바이럴',
    toService: '블로그 체험단',
    timingCondition: '캠페인 2주차 (키워드 데이터 나올 때)',
    timingCheck: (ctx) => ctx.weeksElapsed >= 2,
    speechPattern: 1,
  },
  // 2. 카페 바이럴 → 카페 모니터링 (캠페인 종료 시)
  {
    fromService: '카페 바이럴',
    toService: '카페 모니터링',
    timingCondition: '캠페인 종료 시 ("지속적 관리 제안")',
    timingCheck: (ctx) => ctx.weeksElapsed >= 4,
    speechPattern: 3,
  },
  // 3. 드랍 캠페인 → 퍼포먼스 DA (콘텐츠 5개 이상 확보 시)
  {
    fromService: '드랍 캠페인',
    toService: '퍼포먼스 DA',
    timingCondition: '콘텐츠 5개 이상 확보 시',
    timingCheck: (ctx) => ctx.contentCount >= 5,
    speechPattern: 2,
  },
  // 4. 드랍 캠페인 → 블로그 키워드 선점 (쿼리량 상승 데이터 확인 시)
  {
    fromService: '드랍 캠페인',
    toService: '블로그 키워드 선점',
    timingCondition: '쿼리량 상승 데이터 확인 시',
    timingCheck: (ctx) => ctx.engagementTrend === 'up',
    speechPattern: 1,
  },
  // 5. UGC 인플루언서 → 2차 라이선스 + 퍼포먼스 (콘텐츠 업로드 후 성과 리포트 시)
  {
    fromService: 'UGC 인플루언서',
    toService: '2차 라이선스 + 퍼포먼스',
    timingCondition: '콘텐츠 업로드 후 성과 리포트 시',
    timingCheck: (ctx) => ctx.contentCount >= 1,
    speechPattern: 2,
  },
  // 6. UGC 인플루언서 → 라이브 커머스 (인플루언서 팬 반응 좋을 때)
  {
    fromService: 'UGC 인플루언서',
    toService: '라이브 커머스',
    timingCondition: '인플루언서 팬 반응 좋을 때',
    timingCheck: (ctx) => ctx.engagementTrend === 'up',
    speechPattern: 2,
  },
  // 7. 블로그 체험단 → 카페 바이럴 (블로그 포스팅 완료 시)
  {
    fromService: '블로그 체험단',
    toService: '카페 바이럴',
    timingCondition: '블로그 포스팅 완료 시',
    timingCheck: (ctx) => ctx.contentCount >= 1,
    speechPattern: 1,
  },
  // 8. 퍼포먼스 DA → UGC 소재 제작 (기존 소재 CTR 하락 시)
  {
    fromService: '퍼포먼스 DA',
    toService: 'UGC 소재 제작',
    timingCondition: '기존 소재 CTR 하락 시',
    timingCheck: (ctx) => ctx.engagementTrend === 'down',
    speechPattern: 2,
  },
  // 9. 인스타 채널 대행 → UGC + 드랍 (팔로워 정체기 도달 시)
  {
    fromService: '인스타 채널 대행',
    toService: 'UGC + 드랍',
    timingCondition: '팔로워 정체기 도달 시',
    timingCheck: (ctx) => ctx.engagementTrend === 'flat',
    speechPattern: 1,
  },
  // 10. 라이브 커머스 → UGC 인플루언서 사전 버징 (라이브 2주 전)
  // v1 근사: weeksElapsed >= 0 (라이브가 예정되어 있으면 항상 트리거)
  {
    fromService: '라이브 커머스',
    toService: 'UGC 인플루언서 사전 버징',
    timingCondition: '라이브 2주 전 (v1: 라이브 예정 시 항상 트리거)',
    timingCheck: (ctx) => ctx.weeksElapsed >= 0,
    speechPattern: 2,
  },
  // 11. 단일 캠페인 → 연간 리테이너 (캠페인 3회 이상 진행 시)
  {
    fromService: '단일 캠페인',
    toService: '연간 리테이너',
    timingCondition: '캠페인 3회 이상 진행 시',
    timingCheck: (ctx) => ctx.campaignCount >= 3,
    speechPattern: 3,
  },
] as const;

// ─── checkCrossSellOpportunities ─────────────────────────────

/**
 * 클라이언트의 현재 서비스 상태에서 크로스셀 기회를 감지한다.
 *
 * TRIGGER_MATRIX를 순회하며:
 * 1. currentServices에 fromService가 포함되어 있는지 확인
 * 2. timingCheck(ctx)가 true인지 확인
 * 3. 둘 다 충족하면 CrossSellOpportunity로 수집
 *
 * @param ctx 클라이언트의 현재 서비스 상태 (오케스트레이터가 DB에서 조립)
 * @param clientId 대상 클라이언트 ID
 * @param companyName 대상 회사명 (보고서 출력용)
 * @returns 매칭된 크로스셀 기회 목록 (빈 배열이면 기회 없음)
 */
export function checkCrossSellOpportunities(
  ctx: ClientServiceContext,
  clientId: number,
  companyName: string,
): CrossSellOpportunity[] {
  return TRIGGER_MATRIX.filter(
    (rule) =>
      ctx.currentServices.includes(rule.fromService) && rule.timingCheck(ctx),
  ).map((rule) => ({
    rule,
    clientId,
    companyName,
  }));
}
