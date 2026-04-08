import { describe, it, expect, vi } from 'vitest';
import { buildSearchQueries, researchToClientInput, ensureClient } from './research.js';
import type { MarketResearchResult } from '../types/research.js';

describe('research', () => {
  describe('buildSearchQueries', () => {
    it('returns array of 5+ search query strings containing company name', () => {
      const queries = buildSearchQueries('퍼즐코퍼레이션');
      expect(queries.length).toBeGreaterThanOrEqual(5);
      for (const q of queries) {
        expect(q).toContain('퍼즐코퍼레이션');
      }
    });

    it('includes queries for company info, products, marketing activity, and news', () => {
      const queries = buildSearchQueries('퍼즐코퍼레이션');
      const joined = queries.join(' ');

      // Company info query
      expect(joined).toContain('회사 소개');
      // Business registration (실존 확인)
      expect(joined).toContain('사업자등록');
      // Products/services
      expect(joined).toContain('제품 서비스');
      // Marketing activity
      expect(joined).toMatch(/인스타그램|블로그|유튜브|마케팅/);
      // News
      expect(joined).toMatch(/news\.naver\.com|news\.google\.com/);
    });

    it('appends additionalContext to the first query when provided', () => {
      const queries = buildSearchQueries('퍼즐코퍼레이션', '마케팅 대행사');
      expect(queries[0]).toContain('마케팅 대행사');
    });
  });

  describe('researchToClientInput', () => {
    const mockResearch: MarketResearchResult = {
      companyName: '테스트회사',
      verified: true,
      industry: 'IT',
      mainProducts: ['SaaS', '앱 개발'],
      companySize: '중소기업',
      marketingActivity: {
        instagram: '활발',
        blog: '주 2회',
      },
      websiteUrl: 'https://test.co.kr',
      recentNews: ['시리즈A 투자 유치'],
      rawNotes: '테스트회사는 IT 기업으로 SaaS와 앱 개발을 제공합니다.',
      researchedAt: '2026-04-08T00:00:00.000Z',
    };

    it('converts MarketResearchResult to ClientInput with correct field mapping', () => {
      const result = researchToClientInput(mockResearch, '김담당', 'kim@test.co.kr');

      expect(result.companyName).toBe('테스트회사');
      expect(result.contactName).toBe('김담당');
      expect(result.contactEmail).toBe('kim@test.co.kr');
    });

    it('sets stage to PROSPECT and lastContactDate to today', () => {
      const result = researchToClientInput(mockResearch);

      expect(result.stage).toBe('PROSPECT');
      // lastContactDate should be today in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      expect(result.lastContactDate).toBe(today);
    });

    it('maps industry and rawNotes correctly', () => {
      const result = researchToClientInput(mockResearch);

      expect(result.industry).toBe('IT');
      expect(result.notes).toBe('테스트회사는 IT 기업으로 SaaS와 앱 개발을 제공합니다.');
    });

    it('handles missing optional fields with null', () => {
      const result = researchToClientInput(mockResearch);

      expect(result.contactName).toBeNull();
      expect(result.contactEmail).toBeNull();
      expect(result.contactPhone).toBeNull();
      expect(result.budgetPattern).toBeNull();
      expect(result.budgetTier).toBeNull();
    });
  });

  describe('ensureClient', () => {
    const mockResearch: MarketResearchResult = {
      companyName: '테스트회사',
      verified: true,
      industry: 'IT',
      mainProducts: ['SaaS'],
      marketingActivity: {},
      rawNotes: '테스트 노트',
      researchedAt: '2026-04-08T00:00:00.000Z',
    };

    it('calls upsertClient when company does not exist', () => {
      const mockQueries = {
        getClient: vi.fn().mockReturnValue(undefined),
        getClientById: vi.fn(),
        upsertClient: vi.fn(),
        updateClientField: vi.fn(),
      };

      ensureClient('테스트회사', mockResearch, undefined, undefined, mockQueries as any);

      expect(mockQueries.getClient).toHaveBeenCalledWith('테스트회사');
      expect(mockQueries.upsertClient).toHaveBeenCalledTimes(1);
      expect(mockQueries.updateClientField).not.toHaveBeenCalled();
    });

    it('calls updateClientField for notes when company already exists', () => {
      const existingClient = {
        id: 1,
        companyName: '테스트회사',
        contactName: '기존담당',
        notes: '기존 노트',
      };
      const mockQueries = {
        getClient: vi.fn().mockReturnValue(existingClient),
        getClientById: vi.fn(),
        upsertClient: vi.fn(),
        updateClientField: vi.fn(),
      };

      ensureClient('테스트회사', mockResearch, undefined, undefined, mockQueries as any);

      expect(mockQueries.getClient).toHaveBeenCalledWith('테스트회사');
      expect(mockQueries.upsertClient).not.toHaveBeenCalled();
      expect(mockQueries.updateClientField).toHaveBeenCalledWith(
        '테스트회사',
        'notes',
        '테스트 노트',
      );
    });
  });
});
