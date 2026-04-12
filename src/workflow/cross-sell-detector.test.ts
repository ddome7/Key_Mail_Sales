/**
 * cross-sell-detector.test.ts — TDD tests for cross-sell trigger detection.
 *
 * v4 ULTRA §17 트리거 매트릭스 11개 규칙 코드화 검증.
 */

import { describe, it, expect } from 'vitest';
import {
  TRIGGER_MATRIX,
  checkCrossSellOpportunities,
  type ClientServiceContext,
  type TriggerRule,
} from './cross-sell-detector.js';

describe('TRIGGER_MATRIX', () => {
  it('contains exactly 11 rules (v4 ULTRA §17 full coverage)', () => {
    expect(TRIGGER_MATRIX).toHaveLength(11);
  });

  it('all rules have required fields', () => {
    for (const rule of TRIGGER_MATRIX) {
      expect(rule.fromService).toBeTruthy();
      expect(rule.toService).toBeTruthy();
      expect(rule.timingCondition).toBeTruthy();
      expect(typeof rule.timingCheck).toBe('function');
      expect([1, 2, 3]).toContain(rule.speechPattern);
    }
  });

  it('includes cafe viral -> blog experience rule', () => {
    const rule = TRIGGER_MATRIX.find(
      (r) => r.fromService === '카페 바이럴' && r.toService === '블로그 체험단',
    );
    expect(rule).toBeDefined();
    expect(rule!.speechPattern).toBe(1);
  });

  it('includes single campaign -> annual retainer rule', () => {
    const rule = TRIGGER_MATRIX.find(
      (r) => r.fromService === '단일 캠페인' && r.toService === '연간 리테이너',
    );
    expect(rule).toBeDefined();
    expect(rule!.speechPattern).toBe(3);
  });
});

describe('checkCrossSellOpportunities', () => {
  const baseCtx: ClientServiceContext = {
    currentServices: [],
    weeksElapsed: 0,
    contentCount: 0,
    campaignCount: 0,
    engagementTrend: 'flat',
  };

  it('returns empty array when no services active', () => {
    const result = checkCrossSellOpportunities(baseCtx, 1, '테스트회사');
    expect(result).toEqual([]);
  });

  it('triggers blog experience when cafe viral + 2 weeks elapsed', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['카페 바이럴'],
      weeksElapsed: 2,
    };
    const result = checkCrossSellOpportunities(ctx, 1, '테스트회사');
    const blogTrigger = result.find((r) => r.rule.toService === '블로그 체험단');
    expect(blogTrigger).toBeDefined();
    expect(blogTrigger!.clientId).toBe(1);
    expect(blogTrigger!.companyName).toBe('테스트회사');
  });

  it('does NOT trigger blog experience when cafe viral + only 1 week', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['카페 바이럴'],
      weeksElapsed: 1,
    };
    const result = checkCrossSellOpportunities(ctx, 1, '테스트회사');
    const blogTrigger = result.find((r) => r.rule.toService === '블로그 체험단');
    expect(blogTrigger).toBeUndefined();
  });

  it('triggers performance DA when drop campaign + 5+ contents', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['드랍 캠페인'],
      contentCount: 5,
    };
    const result = checkCrossSellOpportunities(ctx, 2, '드랍테스트');
    const perfTrigger = result.find((r) => r.rule.toService === '퍼포먼스 DA');
    expect(perfTrigger).toBeDefined();
    expect(perfTrigger!.rule.speechPattern).toBe(2);
  });

  it('triggers 2nd license + performance when UGC influencer + content uploaded', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['UGC 인플루언서'],
      contentCount: 1,
    };
    const result = checkCrossSellOpportunities(ctx, 3, 'UGC테스트');
    const licenseTrigger = result.find(
      (r) => r.rule.toService === '2차 라이선스 + 퍼포먼스',
    );
    expect(licenseTrigger).toBeDefined();
  });

  it('triggers annual retainer when single campaign + 3+ campaigns', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['단일 캠페인'],
      campaignCount: 3,
    };
    const result = checkCrossSellOpportunities(ctx, 4, '리테이너테스트');
    const retainerTrigger = result.find(
      (r) => r.rule.toService === '연간 리테이너',
    );
    expect(retainerTrigger).toBeDefined();
    expect(retainerTrigger!.rule.speechPattern).toBe(3);
  });

  it('triggers cafe monitoring when cafe viral + 4+ weeks (campaign end)', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['카페 바이럴'],
      weeksElapsed: 4,
    };
    const result = checkCrossSellOpportunities(ctx, 5, '모니터링테스트');
    const monitorTrigger = result.find(
      (r) => r.rule.toService === '카페 모니터링',
    );
    expect(monitorTrigger).toBeDefined();
  });

  it('triggers blog keyword when drop campaign + engagement up', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['드랍 캠페인'],
      engagementTrend: 'up',
    };
    const result = checkCrossSellOpportunities(ctx, 6, '키워드테스트');
    const keywordTrigger = result.find(
      (r) => r.rule.toService === '블로그 키워드 선점',
    );
    expect(keywordTrigger).toBeDefined();
    expect(keywordTrigger!.rule.speechPattern).toBe(1);
  });

  it('triggers UGC material when performance DA + engagement down', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['퍼포먼스 DA'],
      engagementTrend: 'down',
    };
    const result = checkCrossSellOpportunities(ctx, 7, 'UGC소재테스트');
    const ugcTrigger = result.find(
      (r) => r.rule.toService === 'UGC 소재 제작',
    );
    expect(ugcTrigger).toBeDefined();
    expect(ugcTrigger!.rule.speechPattern).toBe(2);
  });

  it('triggers UGC + drop when insta channel + engagement flat', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['인스타 채널 대행'],
      engagementTrend: 'flat',
    };
    const result = checkCrossSellOpportunities(ctx, 8, '인스타테스트');
    const ugcDropTrigger = result.find(
      (r) => r.rule.toService === 'UGC + 드랍',
    );
    expect(ugcDropTrigger).toBeDefined();
    expect(ugcDropTrigger!.rule.speechPattern).toBe(1);
  });

  it('triggers live commerce when UGC influencer + engagement up', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['UGC 인플루언서'],
      engagementTrend: 'up',
    };
    const result = checkCrossSellOpportunities(ctx, 9, '라이브테스트');
    const liveTrigger = result.find(
      (r) => r.rule.toService === '라이브 커머스',
    );
    expect(liveTrigger).toBeDefined();
    expect(liveTrigger!.rule.speechPattern).toBe(2);
  });

  it('returns multiple triggers when conditions match multiple rules', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['카페 바이럴'],
      weeksElapsed: 4, // >= 2 for blog, >= 4 for monitoring
    };
    const result = checkCrossSellOpportunities(ctx, 10, '다중트리거');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const services = result.map((r) => r.rule.toService);
    expect(services).toContain('블로그 체험단');
    expect(services).toContain('카페 모니터링');
  });

  it('triggers cafe viral when blog experience + content completed', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['블로그 체험단'],
      contentCount: 1,
    };
    const result = checkCrossSellOpportunities(ctx, 11, '블로그테스트');
    const cafeTrigger = result.find(
      (r) => r.rule.toService === '카페 바이럴',
    );
    expect(cafeTrigger).toBeDefined();
    expect(cafeTrigger!.rule.speechPattern).toBe(1);
  });

  it('triggers UGC pre-buzzing when live commerce active', () => {
    const ctx: ClientServiceContext = {
      ...baseCtx,
      currentServices: ['라이브 커머스'],
      weeksElapsed: 0,
    };
    const result = checkCrossSellOpportunities(ctx, 12, '사전버징테스트');
    const buzzTrigger = result.find(
      (r) => r.rule.toService === 'UGC 인플루언서 사전 버징',
    );
    expect(buzzTrigger).toBeDefined();
  });
});
