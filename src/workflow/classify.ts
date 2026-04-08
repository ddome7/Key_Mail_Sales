/**
 * SECTION 11 Email Classification Engine + Objection Detection + Lifecycle Mapping + Service Recommendation.
 *
 * 4-stage decision tree:
 *   1. 상대방 판단 (isNewClient)
 *   2. 상황 판단 (strategy A~L)
 *   3. 언어 판단 (korean/english/bilingual)
 *   4. 긴급도 판단 (ASAP/normal/low)
 *
 * Per D-05, EMAIL-02, EMAIL-03, EMAIL-04, OBJC-01, OBJC-02, OBJC-03.
 */

import type { ClassificationResult, Strategy, ToneLevel, Language, Urgency } from '../types/classification.js';
import type { Stage, Deal } from '../state/pipeline.js';
import type { createServiceQueries } from '../queries/services.js';

// ─── Objection Detection (SECTION 14: 5대 시나리오) ─────

/** Objection/rejection keyword groups based on v4 ULTRA SECTION 14 */
const OBJECTION_PATTERNS: string[][] = [
  // 비용 관련
  ['비싸', '비용', '가격이 높', '예산 초과', '부담'],
  // 경쟁사 비교
  ['다른 업체', '다른 곳', '비교 중', '경쟁사'],
  // 시기 관련
  ['지금은 아니', '지금은 아닌', '나중에', '다음에', '시기상조'],
  // 효과 의문
  ['효과가 있', '실적', '성과', 'ROI'],
  // 거절
  ['관심 없', '필요 없', '괜찮습니다'],
];

/**
 * Detect objection/rejection keywords in text.
 * Returns true if any keyword from the 5 objection scenarios is found.
 */
export function detectObjection(text: string): boolean {
  for (const group of OBJECTION_PATTERNS) {
    for (const keyword of group) {
      if (text.includes(keyword)) {
        return true;
      }
    }
  }
  return false;
}

// ─── Stage-to-Tone Mapping (SECTION 13 + SECTION 16) ────

const STAGE_TONE_MAP: Record<Stage, ToneLevel> = {
  PROSPECT: 2,   // 중립~친근: 첫 접점, 전문적이면서 접근 가능
  LEAD: 3,       // 친근: 관심 표현, 적극 제안
  CLIENT: 4,     // 친밀: 계약 진행, 파트너 톤
  RETENTION: 4,  // 친밀: 기존 고객, 감사 표현
  DORMANT: 1,    // 정중: 재접근, 조심스러운 톤
};

/**
 * Map client lifecycle stage to tone level.
 * SECTION 16 Tone Calibration + SECTION 13 Lifecycle mapping.
 */
export function mapStageToTone(stage: Stage): ToneLevel {
  return STAGE_TONE_MAP[stage];
}

// ─── Service Recommendation (SECTION 12) ─────────────────

export interface ServiceRecommendation {
  serviceName: string;
  tier: number;
  quantity?: string;
  note?: string;
}

/**
 * Get service recommendations based on budget tier and industry.
 * DI pattern: serviceQueries parameter for testability (per OBJC-03, D-15).
 */
export function getServiceRecommendation(
  budgetTier: number | null,
  industry: string | null,
  serviceQueries: ReturnType<typeof createServiceQueries>,
): ServiceRecommendation[] {
  if (budgetTier === null && industry === null) {
    return [];
  }

  if (budgetTier !== null && industry !== null) {
    const results = serviceQueries.getRecommendationsByTierAndIndustry(budgetTier, industry);
    if (results.length > 0) {
      return results.map((r: any) => ({
        serviceName: r.serviceName,
        tier: r.tier,
        quantity: r.quantity ?? undefined,
        note: r.note ?? undefined,
      }));
    }
  }

  if (budgetTier !== null) {
    const results = serviceQueries.getRecommendationsByTier(budgetTier);
    return results.map((r: any) => ({
      serviceName: r.serviceName,
      tier: r.tier,
      quantity: r.quantity ?? undefined,
      note: r.note ?? undefined,
    }));
  }

  return [];
}

// ─── Language Detection ──────────────────────────────────

/** Count Korean characters (Hangul syllables + Jamo) */
function countKorean(text: string): number {
  const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
  return (text.match(koreanPattern) || []).length;
}

/** Count ASCII alphabetic characters */
function countEnglish(text: string): number {
  const englishPattern = /[a-zA-Z]/g;
  return (text.match(englishPattern) || []).length;
}

/**
 * Detect language of text: korean, english, or bilingual.
 */
function detectLanguage(text: string): Language {
  const korCount = countKorean(text);
  const engCount = countEnglish(text);

  if (korCount === 0 && engCount === 0) return 'korean'; // default
  if (korCount === 0) return 'english';
  if (engCount === 0) return 'korean';

  const ratio = korCount / (korCount + engCount);
  if (ratio > 0.7) return 'korean';
  if (ratio < 0.3) return 'english';
  return 'bilingual';
}

// ─── Urgency Detection ───────────────────────────────────

const ASAP_KEYWORDS = ['급합니다', '긴급', '즉시', '오늘 중', '이번 주', 'ASAP', 'urgent', 'immediately'];
const LOW_KEYWORDS = ['여유', '천천히', '급하지 않', '참고로', 'no rush', 'whenever'];

function detectUrgency(text: string): Urgency {
  const lower = text.toLowerCase();
  for (const kw of ASAP_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return 'ASAP';
  }
  for (const kw of LOW_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return 'low';
  }
  return 'normal';
}

// ─── Pricing Detection ───────────────────────────────────

const PRICING_KEYWORDS = ['만원', '억', '원', '견적', '예산', '비용', '단가', '금액'];

function detectPricing(text: string): boolean {
  return PRICING_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Industry Detection ──────────────────────────────────

const INDUSTRY_MAP: Record<string, string[]> = {
  fnb: ['식품', 'F&B', '음식', '베이커리', '카페', '레스토랑', '음료', '식음'],
  beauty: ['뷰티', '화장품', '코스메틱', '스킨케어', '메이크업', '미용'],
  liquor: ['주류', '와인', '맥주', '위스키', '소주', '증류주'],
  it: ['IT', 'SaaS', '소프트웨어', '플랫폼', '앱', '테크', '기술'],
  furniture: ['가구', '인테리어', '리빙', '홈데코'],
  overseas: ['해외', '수출', '글로벌', '바우처', '해외진출'],
};

function detectIndustry(text: string): string | undefined {
  for (const [industry, keywords] of Object.entries(INDUSTRY_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return industry;
    }
  }
  return undefined;
}

// ─── Strategy Detection (SECTION 11: 4단계 판단 트리) ────

const STRATEGY_KEYWORDS: [Strategy, string[]][] = [
  ['B', ['견적', '단가', '가격표', '비용 문의']],
  ['C', ['제안서', '제안 요청', '기획안', '캠페인 제안']],
  ['D', ['비싸', '비용이 높', '다른 업체', '비교', '관심 없', '필요 없']],
  ['E', ['팔로업', '재연락', '확인 요청', '답변 대기']],
  ['F', ['감사합니다', '잘 진행', '만족', '추가 서비스']],
  ['G', ['크로스셀', '업셀', '추가 상품', '확장']],
  ['H', ['재계약', '연장', '갱신']],
  ['I', ['미응답', '연락 두절', '무응답']],
  ['J', ['불만', '클레임', '문제', '이슈']],
  ['K', ['소개', '레퍼런스', '추천인']],
  ['L', ['기타', '특수']],
];

function detectStrategy(text: string, hasObjection: boolean, isNewClient: boolean): Strategy {
  // Objection overrides to strategy D
  if (hasObjection) return 'D';

  for (const [strategy, keywords] of STRATEGY_KEYWORDS) {
    for (const kw of keywords) {
      if (text.includes(kw)) return strategy;
    }
  }

  // Default: A (new inquiry / first contact)
  return 'A';
}

// ─── Main Classification Function ────────────────────────

interface ClassifyOptions {
  getDealByCompanyFn?: (companyName: string) => Deal | undefined;
  stage?: Stage;
}

/**
 * Classify an email inquiry using the 4-stage decision tree (SECTION 11).
 *
 * 1. 상대방 판단: isNewClient (DB에 없으면 true)
 * 2. 상황 판단: strategy 결정
 * 3. 언어 판단: korean/english/bilingual
 * 4. 긴급도 판단: ASAP/normal/low
 *
 * DI pattern: getDealByCompany is optional param for testability.
 */
export function classifyInquiry(
  emailBody: string,
  companyName: string,
  options?: ClassifyOptions,
): ClassificationResult {
  // Step 1: 상대방 판단 — is this a new or existing client?
  const getDealFn = options?.getDealByCompanyFn;
  const deal = getDealFn ? getDealFn(companyName) : undefined;
  const isNewClient = !deal;

  // Get stage from deal or options or default to PROSPECT
  const stage: Stage = options?.stage ?? deal?.stage as Stage ?? 'PROSPECT';

  // Step 2: 상황 판단 — detect objection first, then determine strategy
  const hasObjection = detectObjection(emailBody);
  const hasPricing = detectPricing(emailBody);
  const strategy = detectStrategy(emailBody, hasObjection, isNewClient);

  // Step 3: 언어 판단
  const language = detectLanguage(emailBody);

  // Step 4: 긴급도 판단
  const urgency = detectUrgency(emailBody);

  // Additional context
  const toneLevel = mapStageToTone(stage);
  const industry = detectIndustry(emailBody);

  return {
    strategy,
    language,
    toneLevel,
    urgency,
    isNewClient,
    industry,
    hasPricing,
    hasObjection,
  };
}
