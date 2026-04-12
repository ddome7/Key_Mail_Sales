/**
 * learning-prompt-injector.test.ts — TDD tests for learning context injection.
 *
 * D-06, D-09, D-18 준수:
 * - compose.ts / follow-up-composer.ts 수정 없이 prompt 주입
 * - 빈 컨텍스트면 원본 그대로 반환
 */

import { describe, it, expect } from 'vitest';
import {
  injectLearningContext,
  buildLearningContext,
  type LearningContext,
} from './learning-prompt-injector.js';

describe('injectLearningContext', () => {
  const basePrompt = '당신은 퍼즐코퍼레이션 최영록 대표님의 세일즈 어시스턴트입니다.';

  it('returns original prompt when all context arrays are empty', () => {
    const ctx: LearningContext = {
      patternInsights: [],
      editPatterns: [],
      competitorNotes: [],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result).toBe(basePrompt);
  });

  it('appends pattern insights section when patternInsights is non-empty', () => {
    const ctx: LearningContext = {
      patternInsights: ['전략 E: 답장률 60% (10건 중 6건)'],
      editPatterns: [],
      competitorNotes: [],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result).toContain(basePrompt);
    expect(result).toContain('[과거 이메일 성과 학습]');
    expect(result).toContain('전략 E: 답장률 60% (10건 중 6건)');
  });

  it('appends edit patterns section when editPatterns is non-empty', () => {
    const ctx: LearningContext = {
      patternInsights: [],
      editPatterns: ['수정 패턴 (tone): 공공기관은 톤 레벨 3~4 선호'],
      competitorNotes: [],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result).toContain('[대표님 수정 패턴 학습]');
    expect(result).toContain('수정 패턴 (tone): 공공기관은 톤 레벨 3~4 선호');
  });

  it('appends competitor notes section when competitorNotes is non-empty', () => {
    const ctx: LearningContext = {
      patternInsights: [],
      editPatterns: [],
      competitorNotes: ['참고: OO마케팅: 1500만원 견적 제시 이력'],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result).toContain('[시장/경쟁사 참고 정보]');
    expect(result).toContain('참고: OO마케팅: 1500만원 견적 제시 이력');
  });

  it('appends all 3 sections in order when all are non-empty', () => {
    const ctx: LearningContext = {
      patternInsights: ['전략 A: 답장률 40%'],
      editPatterns: ['수정 패턴 (content): 가격 부분 삭제'],
      competitorNotes: ['참고: 경쟁사B: 저가 전략'],
    };
    const result = injectLearningContext(basePrompt, ctx);

    const patternIdx = result.indexOf('[과거 이메일 성과 학습]');
    const editIdx = result.indexOf('[대표님 수정 패턴 학습]');
    const competitorIdx = result.indexOf('[시장/경쟁사 참고 정보]');

    expect(patternIdx).toBeGreaterThan(-1);
    expect(editIdx).toBeGreaterThan(patternIdx);
    expect(competitorIdx).toBeGreaterThan(editIdx);
  });

  it('separates original prompt and learning context with double newline', () => {
    const ctx: LearningContext = {
      patternInsights: ['테스트 인사이트'],
      editPatterns: [],
      competitorNotes: [],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result.startsWith(basePrompt + '\n\n')).toBe(true);
  });

  it('handles multiple items per section', () => {
    const ctx: LearningContext = {
      patternInsights: [
        '전략 A: 답장률 40%',
        '전략 E: 답장률 60%',
        '전략 G: 답장률 75%',
      ],
      editPatterns: [],
      competitorNotes: [],
    };
    const result = injectLearningContext(basePrompt, ctx);
    expect(result).toContain('전략 A: 답장률 40%');
    expect(result).toContain('전략 E: 답장률 60%');
    expect(result).toContain('전략 G: 답장률 75%');
  });
});

describe('buildLearningContext', () => {
  it('returns empty arrays when all inputs are undefined', () => {
    const result = buildLearningContext({});
    expect(result.patternInsights).toEqual([]);
    expect(result.editPatterns).toEqual([]);
    expect(result.competitorNotes).toEqual([]);
  });

  it('returns empty arrays when all inputs are empty arrays', () => {
    const result = buildLearningContext({
      industryStats: [],
      editDeltas: [],
      competitorNotes: [],
    });
    expect(result.patternInsights).toEqual([]);
    expect(result.editPatterns).toEqual([]);
    expect(result.competitorNotes).toEqual([]);
  });

  it('formats industryStats into patternInsights', () => {
    const result = buildLearningContext({
      industryStats: [
        { strategyUsed: 'E', total: 10, replied: 6, replyRate: 60 },
      ],
    });
    expect(result.patternInsights).toHaveLength(1);
    expect(result.patternInsights[0]).toContain('전략 E');
    expect(result.patternInsights[0]).toContain('답장률 60%');
    expect(result.patternInsights[0]).toContain('10건 중 6건');
  });

  it('formats editDeltas into editPatterns', () => {
    const result = buildLearningContext({
      editDeltas: [
        { diffSummary: '공공기관은 톤 레벨 3~4 선호', diffCategory: 'tone' },
      ],
    });
    expect(result.editPatterns).toHaveLength(1);
    expect(result.editPatterns[0]).toContain('수정 패턴 (tone)');
    expect(result.editPatterns[0]).toContain('공공기관은 톤 레벨 3~4 선호');
  });

  it('formats competitorNotes with "참고:" prefix for pricing type', () => {
    const result = buildLearningContext({
      competitorNotes: [
        { competitorName: 'OO마케팅', detail: '1500만원 견적 제시' },
      ],
    });
    expect(result.competitorNotes).toHaveLength(1);
    expect(result.competitorNotes[0]).toContain('OO마케팅');
    expect(result.competitorNotes[0]).toContain('1500만원 견적 제시');
  });

  it('handles multiple items of each type', () => {
    const result = buildLearningContext({
      industryStats: [
        { strategyUsed: 'A', total: 5, replied: 2, replyRate: 40 },
        { strategyUsed: 'E', total: 8, replied: 5, replyRate: 62.5 },
      ],
      editDeltas: [
        { diffSummary: '가격 부분 삭제', diffCategory: 'content' },
        { diffSummary: '인사말 추가', diffCategory: 'greeting' },
      ],
      competitorNotes: [
        { competitorName: 'A사', detail: '저가 전략' },
        { competitorName: 'B사', detail: '패키지 번들' },
      ],
    });
    expect(result.patternInsights).toHaveLength(2);
    expect(result.editPatterns).toHaveLength(2);
    expect(result.competitorNotes).toHaveLength(2);
  });

  it('only includes non-empty sections in result', () => {
    const result = buildLearningContext({
      industryStats: [
        { strategyUsed: 'G', total: 3, replied: 3, replyRate: 100 },
      ],
    });
    expect(result.patternInsights).toHaveLength(1);
    expect(result.editPatterns).toEqual([]);
    expect(result.competitorNotes).toEqual([]);
  });

  it('integration: buildLearningContext output works with injectLearningContext', () => {
    const ctx = buildLearningContext({
      industryStats: [
        { strategyUsed: 'E', total: 10, replied: 6, replyRate: 60 },
      ],
      editDeltas: [
        { diffSummary: '톤 변경', diffCategory: 'tone' },
      ],
      competitorNotes: [
        { competitorName: '테스트사', detail: '참고 정보' },
      ],
    });
    const prompt = '기본 프롬프트';
    const result = injectLearningContext(prompt, ctx);
    expect(result).toContain('기본 프롬프트');
    expect(result).toContain('[과거 이메일 성과 학습]');
    expect(result).toContain('[대표님 수정 패턴 학습]');
    expect(result).toContain('[시장/경쟁사 참고 정보]');
  });
});
