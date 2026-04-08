/**
 * Tests for email composition module.
 * Validates prompt building and fixed HTML block combination.
 */

import { describe, it, expect } from 'vitest';
import { buildEmailPrompt, composeEmail } from './compose.js';
import type { ClassificationResult } from '../types/classification.js';
import type { MarketResearchResult } from '../types/research.js';
import type { ServiceRecommendation } from '../db/schema.js';

const baseClassification: ClassificationResult = {
  strategy: 'A',
  language: 'korean',
  toneLevel: 3,
  urgency: 'normal',
  isNewClient: true,
  industry: 'beauty',
  hasPricing: false,
  hasObjection: false,
};

const sampleResearch: MarketResearchResult = {
  companyName: '테스트뷰티',
  verified: true,
  industry: '뷰티',
  mainProducts: ['스킨케어', '메이크업'],
  companySize: '중소기업',
  marketingActivity: {
    instagram: '활발',
    blog: '운영 중',
  },
  websiteUrl: 'https://testbeauty.co.kr',
  recentNews: ['신제품 출시'],
  rawNotes: '뷰티 브랜드 조사 결과',
  researchedAt: '2026-04-08',
};

const sampleRecommendations: ServiceRecommendation[] = [
  {
    id: 1,
    tier: 3,
    industry: '뷰티',
    serviceName: 'UGC 인플루언서',
    priority: 1,
    recommendedQuantity: '20명',
    recommendedBudget: '500만원',
    salesMent: '뷰티 업종에 최적화된 UGC 캠페인',
  },
  {
    id: 2,
    tier: 3,
    industry: '뷰티',
    serviceName: '인스타 채널 대행',
    priority: 2,
    recommendedQuantity: '1개월',
    recommendedBudget: '300만원',
    salesMent: '브랜드 인스타그램 활성화',
  },
];

describe('buildEmailPrompt', () => {
  const promptSections = '## SECTION 1: 페르소나\n나는 퍼즐코퍼레이션의 세일즈 전문가입니다.';

  it('returns string containing system prompt sections in systemPrompt', () => {
    const result = buildEmailPrompt({
      classification: baseClassification,
      inquiryContext: '마케팅 문의드립니다',
      promptSections,
    });
    expect(result.systemPrompt).toContain('페르소나');
    expect(result.systemPrompt).toContain('세일즈 전문가');
  });

  it('includes companyName and inquiry context in user message', () => {
    const result = buildEmailPrompt({
      classification: baseClassification,
      inquiryContext: '마케팅 문의드립니다',
      promptSections,
      client: { companyName: '테스트컴퍼니' } as any,
    });
    expect(result.userMessage).toContain('테스트컴퍼니');
    expect(result.userMessage).toContain('마케팅 문의드립니다');
  });

  it('includes market research results when provided', () => {
    const result = buildEmailPrompt({
      classification: baseClassification,
      inquiryContext: '문의합니다',
      promptSections,
      research: sampleResearch,
    });
    expect(result.userMessage).toContain('테스트뷰티');
    expect(result.userMessage).toContain('스킨케어');
    expect(result.userMessage).toContain('신제품 출시');
  });

  it('includes service recommendations when provided', () => {
    const result = buildEmailPrompt({
      classification: baseClassification,
      inquiryContext: '문의합니다',
      promptSections,
      recommendations: sampleRecommendations,
    });
    expect(result.userMessage).toContain('UGC 인플루언서');
    expect(result.userMessage).toContain('인스타 채널 대행');
  });
});

describe('composeEmail', () => {
  const promptSections = '## SECTION 1\n테스트 프롬프트';
  const mockAiHtmlBody = '<p>안녕하세요, 테스트컴퍼니 담당자님.</p><p>문의 감사드립니다.</p>';

  it('returns EmailDraft with signature HTML appended', () => {
    const result = composeEmail({
      classification: baseClassification,
      inquiryContext: '문의합니다',
      promptSections,
      aiGeneratedBody: mockAiHtmlBody,
      companyName: '테스트컴퍼니',
      recipientEmail: 'test@test.com',
    });
    expect(result.htmlBody).toContain('감사합니다.');
    expect(result.htmlBody).toContain('퍼즐코퍼레이션');
    expect(result.htmlBody).toContain('최 영 록');
    expect(result.htmlBody).toContain('드림.');
  });

  it('returns EmailDraft with intro links HTML for strategy A', () => {
    const result = composeEmail({
      classification: { ...baseClassification, strategy: 'A' },
      inquiryContext: '문의합니다',
      promptSections,
      aiGeneratedBody: mockAiHtmlBody,
      companyName: '테스트컴퍼니',
      recipientEmail: 'test@test.com',
    });
    expect(result.htmlBody).toContain('featpaper.com');
    expect(result.htmlBody).toContain('회사 소개서');
  });

  it('does NOT include intro links for non-A strategies', () => {
    const result = composeEmail({
      classification: { ...baseClassification, strategy: 'D' },
      inquiryContext: '문의합니다',
      promptSections,
      aiGeneratedBody: mockAiHtmlBody,
      companyName: '테스트컴퍼니',
      recipientEmail: 'test@test.com',
    });
    expect(result.htmlBody).not.toContain('featpaper.com');
  });

  it('sets CC to MANDATORY_CC', () => {
    const result = composeEmail({
      classification: baseClassification,
      inquiryContext: '문의합니다',
      promptSections,
      aiGeneratedBody: mockAiHtmlBody,
      companyName: '테스트컴퍼니',
      recipientEmail: 'test@test.com',
    });
    expect(result.cc).toEqual(['PM@puzl.co.kr', 'leader@puzl.co.kr']);
  });
});
