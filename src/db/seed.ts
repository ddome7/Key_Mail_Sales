import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { services, serviceRecommendations } from './schema.js';
import type { NewService, NewServiceRecommendation } from './schema.js';

const DB_PATH = resolve(process.cwd(), 'data', 'sales.db');

// Ensure data/ directory exists
const dataDir = resolve(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema: { services, serviceRecommendations } });

// ============================================================
// 17 Services from v4 ULTRA SECTION 2
// ============================================================
const serviceData: NewService[] = [
  {
    name: '카페 침투 바이럴',
    category: '바이럴',
    description: '맘카페, 커뮤니티 카페, 지역 카페 등 타겟 카페 침투',
    basePrice: 65000,
    priceUnit: '건당',
    priceNote: '원고 제작 + 업로드 + A/S 포함',
    processSteps: '카페 리스트업 → 콘텐츠 기획/가이드라인 → 원고 작성 → 검수 → 업로드 → 리포트',
    asPolicy: '업로드 후 24시간 이내 삭제 시 1회 100% 재작업 보장',
  },
  {
    name: '커뮤니티 침투 바이럴',
    category: '바이럴',
    description: '커뮤니티 플랫폼 침투 바이럴',
    basePrice: 100000,
    priceUnit: '건당',
    priceNote: '커뮤니티마다 상이 (10~30만원)',
    processSteps: '커뮤니티 선정 → 콘텐츠 기획 → 원고 작성 → 업로드',
    asPolicy: '업로드 후 A/S 접근이 어려울 수 있음',
  },
  {
    name: '카페 모니터링 캠페인',
    category: '바이럴',
    description: '카페 3~5개, 키워드 10개 이내 지정 모니터링. 오전/오후 2회.',
    basePrice: 1000000,
    priceUnit: '월',
    priceNote: '월 100만원 기본 + 댓글 건당 2만원. 키워드 추가 건당 8만원, 라인업 추가 건당 10만원',
    processSteps: '키워드 지정 → 모니터링 → 댓글 대응 → 리포트',
    asPolicy: '제3자 게시글에 댓글로 브랜드 어필하는 전략',
  },
  {
    name: '메가드랍 캠페인',
    category: '드랍',
    description: '직접 콘텐츠 제작 (크리에이터 협업). SNS 소셜 페이지 확산. 2차 라이선스 구매 가능.',
    basePrice: 400000,
    priceUnit: '건당',
    priceNote: '장기 클라이언트 특가 30만원',
    processSteps: '크리에이터 섭외 → 콘텐츠 제작 → 검수 → SNS 확산',
    asPolicy: '크리에이터 콘텐츠 2차 라이선스 구매 가능 → 퍼포먼스 캠페인 연계',
  },
  {
    name: '웨이브드랍 캠페인',
    category: '드랍',
    description: '외부 이슈/네이티브 콘텐츠 활용. SNS 소셜 페이지 확산.',
    basePrice: null,
    priceUnit: '건당',
    priceNote: '2차 라이선스 구매 불가 (직접 매출 연계 어려움)',
    processSteps: '이슈 탐색 → 네이티브 콘텐츠 기획 → SNS 확산 → 키워드 쿼리량 상승 → 블로그 키워드 선점',
    asPolicy: null,
  },
  {
    name: 'UGC 인플루언서 캠페인',
    category: 'UGC',
    description: '인스타그램 릴스 중심. 나노/마이크로/매크로 인플루언서 레이어 구성.',
    basePrice: null,
    priceUnit: '크리에이터 티어별',
    priceNote: '크리에이터 티어별 단가 상이 (협의 가능). 2차 라이선스 별도.',
    processSteps: '인플루언서 매칭 → 콘텐츠 가이드라인 → 제작 → 검수 → 업로드 → 리포트',
    asPolicy: '2차 라이선스: 광고 코드 + 메타/구글 광고 운영 (기간 협의)',
  },
  {
    name: '블로그 체험단',
    category: 'SEO',
    description: 'SEO 연계 전략. 전문 리뷰어 매칭 가능.',
    basePrice: null,
    priceUnit: '명당',
    priceNote: '드랍 캠페인과 세트로 운영 시 효과 극대화',
    processSteps: '리뷰어 섭외 → 제품 배송 → 콘텐츠 제작 → 검수 → 업로드',
    asPolicy: null,
  },
  {
    name: '인스타그램 채널 운영 대행',
    category: '채널운영',
    description: '콘텐츠 기획/제작 + 업로드 + DM 응답 + 커뮤니티 관리',
    basePrice: null,
    priceUnit: '월',
    priceNote: '월 단위 또는 연간 계약',
    processSteps: '콘텐츠 기획 → 제작 → 업로드 → DM 응답 → 커뮤니티 관리',
    asPolicy: null,
  },
  {
    name: '퍼포먼스 마케팅 DA',
    category: '퍼포먼스',
    description: 'Meta/GFA 광고. 크리에이터 2차 라이선스 활용 소재 제작.',
    basePrice: null,
    priceUnit: '월',
    priceNote: '광고 계정 권한 인수 후 운영 대행',
    processSteps: '소재 제작 → A/B 테스트 → 광고 운영 → 리포트',
    asPolicy: null,
  },
  {
    name: '라이브 커머스',
    category: '라이브',
    description: '쇼호스트/셀럽 섭외 및 운영. 네이버 라이브, 인스타그램 라이브.',
    basePrice: null,
    priceUnit: '회당',
    priceNote: '쇼호스트 vs 셀럽 구분 섭외',
    processSteps: '쇼호스트/셀럽 섭외 → 대본 작성 → 라이브 운영',
    asPolicy: null,
  },
  {
    name: '유튜브 크리에이터 협업',
    category: '유튜브',
    description: '뷰티, 푸드, 여행, 라이프스타일 등 카테고리별 크리에이터 협업',
    basePrice: null,
    priceUnit: '건당',
    priceNote: '카테고리별 크리에이터 매칭',
    processSteps: '기획안 작성 → 크리에이터 매칭 → 콘텐츠 제작 → 업로드',
    asPolicy: null,
  },
  {
    name: '트위터(X) 체험단',
    category: '바이럴',
    description: '트위터 기반 바이럴 확산',
    basePrice: null,
    priceUnit: '건당',
    priceNote: null,
    processSteps: '트위터 인플루언서 섭외 → 콘텐츠 제작 → 확산',
    asPolicy: null,
  },
  {
    name: 'KOL/KOC 마케팅',
    category: '해외',
    description: '인도네시아 등 동남아시아 시장. 해외 인플루언서 소싱 및 캠페인 운영.',
    basePrice: null,
    priceUnit: '패키지',
    priceNote: '항공권 + 숙박 + 포스팅료 패키지 협상 가능',
    processSteps: '해외 인플루언서 소싱 → 패키지 협상 → 캠페인 운영',
    asPolicy: null,
  },
  {
    name: '웹예능 콘텐츠 제작',
    category: '콘텐츠',
    description: '셀럽/인플루언서 협업 포맷. 브랜드 스토리텔링 엔터테인먼트 콘텐츠.',
    basePrice: null,
    priceUnit: '프로젝트',
    priceNote: '방송사 기준 출연진 스케쥴 관리',
    processSteps: '기획 → 출연진 섭외 → 촬영 → 편집 → 배포',
    asPolicy: null,
  },
  {
    name: 'BTL 오프라인 이벤트',
    category: 'BTL',
    description: 'BTL / 오프라인 이벤트 연계',
    basePrice: null,
    priceUnit: '프로젝트',
    priceNote: null,
    processSteps: null,
    asPolicy: null,
  },
  {
    name: '수출바우처 서비스',
    category: '해외',
    description: '수출바우처 플랫폼 통해 구매. B2B 브랜드 해외 진출 마케팅 지원.',
    basePrice: null,
    priceUnit: '프로젝트',
    priceNote: '통합 홍보 마케팅 메뉴',
    processSteps: '서비스 요청 → 서비스 수락 → 수락확인 → 과업 완료+보고서 → 정산',
    asPolicy: null,
  },
  {
    name: 'OSMU 전략',
    category: '전략',
    description: '하나의 콘텐츠를 여러 채널로 확산. 인플루언서 콘텐츠 → 퍼포먼스 소재 → 블로그 → 드랍 연계.',
    basePrice: null,
    priceUnit: '프로젝트',
    priceNote: 'TIER 3 이상 예산에서 적용 가능',
    processSteps: '콘텐츠 제작 → 다채널 변환 → 배포 → 성과 분석',
    asPolicy: null,
  },
];

// Note: 파워페이지 확산 캠페인 is service #17 but we need to add it
// Actually, looking at the list above, we have 17 items. Let me verify and add the missing one.
// The v4 ULTRA lists: 1.카페 침투 바이럴, 2.커뮤니티 침투 바이럴, 3.카페 모니터링,
// 4.드랍(메가드랍/웨이브드랍 = 2종), 5.UGC 인플루언서, 6.블로그 체험단,
// 7.인스타 채널 대행, 8.퍼포먼스 DA, 9.라이브 커머스, 10.유튜브 크리에이터,
// 11.트위터 체험단, 12.KOL/KOC, 13.웹예능 PPL, 14.BTL, 15.수출바우처, 16.OSMU, 17.파워페이지
// We have 메가드랍 and 웨이브드랍 separately = 18 items above, need to remove one or add 파워페이지.
// Actually: the plan says "17종 서비스" matching v4 ULTRA exactly. The document lists:
// 1~3 = 3, 4 (mega+wave) = 2, 5~17 = 13. That's 18 if split.
// But the system prompt numbers them 1-17 with 4 being one item (Drop Campaign with two sub-types).
// Let's keep them as separate entries in DB for accuracy (18 services is fine, covers all variants).
// Plus add 파워페이지:

const additionalService: NewService = {
  name: '파워페이지 확산 캠페인',
  category: '확산',
  description: '수백 개 제휴된 파워페이지 미디어 파워 활용. 기획/제작 콘텐츠의 확산.',
  basePrice: null,
  priceUnit: '프로젝트',
  priceNote: null,
  processSteps: '콘텐츠 기획 → 파워페이지 배포 → 확산 모니터링',
  asPolicy: null,
};

// ============================================================
// Service Recommendations from v4 ULTRA SECTION 12
// ============================================================
const recommendationData: NewServiceRecommendation[] = [
  // TIER 1: 300만원 이하 (스타터)
  { tier: 1, industry: null, serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: '30~40건', recommendedBudget: '195~260만원', salesMent: '소규모 예산으로도 충분히 의미 있는 바이럴이 가능합니다 :D' },
  { tier: 1, industry: null, serviceName: '블로그 체험단', priority: 2, recommendedQuantity: '10~15명', recommendedBudget: '300만원 이하', salesMent: '소규모 예산으로도 충분히 의미 있는 바이럴이 가능합니다 :D' },

  // TIER 2: 300~700만원 (그로스)
  { tier: 2, industry: null, serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: '50건', recommendedBudget: '300~700만원', salesMent: '바이럴 + 키워드 선점을 묶어서 구매 전환 플로우까지 설계 가능합니다' },
  { tier: 2, industry: null, serviceName: '블로그 체험단', priority: 1, recommendedQuantity: '10명', recommendedBudget: '300~700만원', salesMent: '바이럴 + 키워드 선점을 묶어서 구매 전환 플로우까지 설계 가능합니다' },
  { tier: 2, industry: null, serviceName: '웨이브드랍 캠페인', priority: 2, recommendedQuantity: '15~20건', recommendedBudget: '300~700만원', salesMent: '바이럴 + 키워드 선점을 묶어서 구매 전환 플로우까지 설계 가능합니다' },
  { tier: 2, industry: null, serviceName: 'UGC 인플루언서 캠페인', priority: 3, recommendedQuantity: '나노 5~8명', recommendedBudget: '300~700만원', salesMent: '바이럴 + 키워드 선점을 묶어서 구매 전환 플로우까지 설계 가능합니다' },

  // TIER 3: 700~1,500만원 (스케일)
  { tier: 3, industry: null, serviceName: '메가드랍 캠페인', priority: 1, recommendedQuantity: '20건', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },
  { tier: 3, industry: null, serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: '50건', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },
  { tier: 3, industry: null, serviceName: '블로그 체험단', priority: 1, recommendedQuantity: '15명', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },
  { tier: 3, industry: null, serviceName: 'UGC 인플루언서 캠페인', priority: 2, recommendedQuantity: '마이크로 5명', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },
  { tier: 3, industry: null, serviceName: '퍼포먼스 마케팅 DA', priority: 2, recommendedQuantity: '300만원', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },
  { tier: 3, industry: null, serviceName: 'OSMU 전략', priority: 3, recommendedQuantity: '통합 적용', recommendedBudget: '700~1,500만원', salesMent: '이 예산이면 OSMU 전략으로 콘텐츠 하나를 여러 채널에 확산시킬 수 있습니다' },

  // TIER 4: 1,500~3,000만원 (프리미엄)
  { tier: 4, industry: null, serviceName: '메가드랍 캠페인', priority: 1, recommendedQuantity: '풀패키지', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },
  { tier: 4, industry: null, serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: '풀패키지', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },
  { tier: 4, industry: null, serviceName: '퍼포먼스 마케팅 DA', priority: 1, recommendedQuantity: '풀패키지', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },
  { tier: 4, industry: null, serviceName: '블로그 체험단', priority: 1, recommendedQuantity: '풀패키지', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },
  { tier: 4, industry: null, serviceName: '인스타그램 채널 운영 대행', priority: 2, recommendedQuantity: '풀패키지', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },
  { tier: 4, industry: null, serviceName: '라이브 커머스', priority: 3, recommendedQuantity: '포함 가능', recommendedBudget: '1,500~3,000만원', salesMent: 'Conservative와 Ambitious 두 가지 시나리오를 준비해보았습니다' },

  // TIER 5: 3,000만원 이상 (엔터프라이즈)
  { tier: 5, industry: null, serviceName: '인스타그램 채널 운영 대행', priority: 1, recommendedQuantity: '연간 리테이너', recommendedBudget: '3,000만원 이상', salesMent: '연간 파트너십으로 함께하면 월별 최적화와 시너지를 극대화할 수 있습니다' },
  { tier: 5, industry: null, serviceName: '메가드랍 캠페인', priority: 1, recommendedQuantity: '전 채널 통합', recommendedBudget: '3,000만원 이상', salesMent: '연간 파트너십으로 함께하면 월별 최적화와 시너지를 극대화할 수 있습니다' },
  { tier: 5, industry: null, serviceName: '퍼포먼스 마케팅 DA', priority: 1, recommendedQuantity: '전 채널 통합', recommendedBudget: '3,000만원 이상', salesMent: '연간 파트너십으로 함께하면 월별 최적화와 시너지를 극대화할 수 있습니다' },
  { tier: 5, industry: null, serviceName: '라이브 커머스', priority: 2, recommendedQuantity: '전 채널 통합', recommendedBudget: '3,000만원 이상', salesMent: '연간 파트너십으로 함께하면 월별 최적화와 시너지를 극대화할 수 있습니다' },
  { tier: 5, industry: null, serviceName: '웹예능 콘텐츠 제작', priority: 2, recommendedQuantity: '셀럽 협업', recommendedBudget: '3,000만원 이상', salesMent: '연간 파트너십으로 함께하면 월별 최적화와 시너지를 극대화할 수 있습니다' },

  // Industry-specific recommendations (업종별 추천 우선순위)
  // F&B
  { tier: 0, industry: 'F&B', serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: '맘카페 핵심' },
  { tier: 0, industry: 'F&B', serviceName: '블로그 체험단', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: 'F&B', serviceName: '메가드랍 캠페인', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: 'SNS 확산' },
  { tier: 0, industry: 'F&B', serviceName: '라이브 커머스', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: '네이버 라이브' },

  // 뷰티
  { tier: 0, industry: '뷰티', serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: '릴스 중심' },
  { tier: 0, industry: '뷰티', serviceName: '웹예능 콘텐츠 제작', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: '뷰티웹예능 PPL' },
  { tier: 0, industry: '뷰티', serviceName: '블로그 체험단', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '뷰티', serviceName: '퍼포먼스 마케팅 DA', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: null },

  // 패션
  { tier: 0, industry: '패션', serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '패션', serviceName: '메가드랍 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '패션', serviceName: '인스타그램 채널 운영 대행', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '패션', serviceName: '파워페이지 확산 캠페인', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: null },

  // 주류
  { tier: 0, industry: '주류', serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: '전문 주류 인플루언서 + 블로거 개별 컨택' },
  { tier: 0, industry: '주류', serviceName: '블로그 체험단', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: '인스타 릴스 + 네이버 블로그 병행' },
  { tier: 0, industry: '주류', serviceName: '카페 침투 바이럴', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: '주류 커뮤니티. 주류광고법 준수 필수 언급' },

  // IT
  { tier: 0, industry: 'IT', serviceName: '커뮤니티 침투 바이럴', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: 'IT 커뮤니티' },
  { tier: 0, industry: 'IT', serviceName: '유튜브 크리에이터 협업', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: '리뷰' },
  { tier: 0, industry: 'IT', serviceName: '트위터(X) 체험단', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: null },

  // 대기업
  { tier: 0, industry: '대기업', serviceName: '메가드랍 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: '통합 캠페인 풀패키지' },
  { tier: 0, industry: '대기업', serviceName: '라이브 커머스', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: '+ 쇼호스트' },
  { tier: 0, industry: '대기업', serviceName: '인스타그램 채널 운영 대행', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: '연간 리테이너' },

  // 해외
  { tier: 0, industry: '해외', serviceName: 'KOL/KOC 마케팅', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '해외', serviceName: '수출바우처 서비스', priority: 2, recommendedQuantity: null, recommendedBudget: null, salesMent: null },
  { tier: 0, industry: '해외', serviceName: 'UGC 인플루언서 캠페인', priority: 3, recommendedQuantity: null, recommendedBudget: null, salesMent: '해외 인플루언서 패키지' },
];

async function seed() {
  console.log('Seeding services...');

  // Check if already seeded
  const existingServices = db.select().from(services).all();
  if (existingServices.length > 0) {
    console.log(`Services already seeded (${existingServices.length} rows). Skipping.`);
  } else {
    const allServices = [...serviceData, additionalService];
    for (const service of allServices) {
      db.insert(services).values(service).run();
    }
    console.log(`Inserted ${allServices.length} services.`);
  }

  // Check if recommendations already seeded
  const existingRecs = db.select().from(serviceRecommendations).all();
  if (existingRecs.length > 0) {
    console.log(`Recommendations already seeded (${existingRecs.length} rows). Skipping.`);
  } else {
    for (const rec of recommendationData) {
      db.insert(serviceRecommendations).values(rec).run();
    }
    console.log(`Inserted ${recommendationData.length} service recommendations.`);
  }

  console.log('Seed complete.');
}

seed().catch(console.error);
