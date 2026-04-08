import { describe, it, expect } from 'vitest';
import { detectObjection, mapStageToTone, classifyInquiry, getServiceRecommendation } from './classify.js';

describe('detectObjection', () => {
  it('returns true for cost objection "비용이 너무 높아요"', () => {
    expect(detectObjection('비용이 너무 높아요')).toBe(true);
  });

  it('returns false for normal request "견적서 보내주세요"', () => {
    expect(detectObjection('견적서 보내주세요')).toBe(false);
  });

  it('returns true for competitor comparison "다른 업체와 비교 중"', () => {
    expect(detectObjection('다른 업체와 비교 중')).toBe(true);
  });

  it('returns true for timing objection "지금은 아닌 것 같습니다"', () => {
    expect(detectObjection('지금은 아닌 것 같습니다')).toBe(true);
  });

  it('returns true for rejection "관심 없습니다"', () => {
    expect(detectObjection('관심 없습니다')).toBe(true);
  });
});

describe('mapStageToTone', () => {
  it('returns toneLevel 2 for PROSPECT', () => {
    expect(mapStageToTone('PROSPECT')).toBe(2);
  });

  it('returns toneLevel 4 for CLIENT', () => {
    expect(mapStageToTone('CLIENT')).toBe(4);
  });

  it('returns toneLevel 1 for DORMANT', () => {
    expect(mapStageToTone('DORMANT')).toBe(1);
  });

  it('returns toneLevel 3 for LEAD', () => {
    expect(mapStageToTone('LEAD')).toBe(3);
  });

  it('returns toneLevel 4 for RETENTION', () => {
    expect(mapStageToTone('RETENTION')).toBe(4);
  });
});

describe('classifyInquiry', () => {
  it('determines strategy A for new inquiry', () => {
    const result = classifyInquiry(
      '안녕하세요, 마케팅 대행 문의드립니다. 저희 회사 제품 홍보를 도와주실 수 있나요?',
      '테스트컴퍼니',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.strategy).toBe('A');
    expect(result.isNewClient).toBe(true);
  });

  it('detects Korean language', () => {
    const result = classifyInquiry(
      '안녕하세요, 마케팅 문의드립니다.',
      '테스트컴퍼니',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.language).toBe('korean');
  });

  it('detects pricing mention and sets hasPricing=true', () => {
    const result = classifyInquiry(
      '견적서 보내주세요. 예산은 500만원 정도입니다.',
      '테스트컴퍼니',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.hasPricing).toBe(true);
  });

  it('detects objection and sets hasObjection=true', () => {
    const result = classifyInquiry(
      '비용이 너무 높아서 다른 곳도 알아보고 있습니다.',
      '테스트컴퍼니',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.hasObjection).toBe(true);
    expect(result.strategy).toBe('D');
  });

  it('uses stage from getDealByCompanyFn for tone mapping', () => {
    const result = classifyInquiry(
      '안녕하세요, 추가 서비스 문의드립니다.',
      '기존고객',
      {
        getDealByCompanyFn: () => ({
          id: 'test-id',
          companyName: '기존고객',
          stage: 'CLIENT' as const,
          lastActionDate: '2026-04-01',
        }),
      }
    );
    expect(result.isNewClient).toBe(false);
    expect(result.toneLevel).toBe(4);
  });

  it('detects ASAP urgency', () => {
    const result = classifyInquiry(
      '급합니다! 이번 주까지 꼭 필요합니다.',
      '테스트',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.urgency).toBe('ASAP');
  });

  it('detects English language', () => {
    const result = classifyInquiry(
      'Hello, I would like to inquire about your marketing services.',
      'TestCorp',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.language).toBe('english');
  });

  it('detects industry keyword', () => {
    const result = classifyInquiry(
      '저희는 뷰티 브랜드인데 마케팅 문의드립니다.',
      '뷰티브랜드',
      { getDealByCompanyFn: () => undefined }
    );
    expect(result.industry).toBe('beauty');
  });
});

describe('getServiceRecommendation', () => {
  it('returns empty array when both params are null', () => {
    const mockQueries = {
      getRecommendationsByTier: () => [],
      getRecommendationsByTierAndIndustry: () => [],
      getServiceByName: () => undefined,
      getServicePrice: () => undefined,
    };
    const result = getServiceRecommendation(null, null, mockQueries as any);
    expect(result).toEqual([]);
  });

  it('calls getRecommendationsByTier when budgetTier provided', () => {
    let calledWith: number | null = null;
    const mockQueries = {
      getRecommendationsByTier: (tier: number) => {
        calledWith = tier;
        return [{ serviceName: 'UGC 인플루언서', tier: 3, quantity: '10명', note: '추천' }];
      },
      getRecommendationsByTierAndIndustry: () => [],
      getServiceByName: () => undefined,
      getServicePrice: () => undefined,
    };
    const result = getServiceRecommendation(3, null, mockQueries as any);
    expect(calledWith).toBe(3);
    expect(result.length).toBeGreaterThan(0);
  });
});
