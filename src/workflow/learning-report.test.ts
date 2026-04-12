/**
 * learning-report.test.ts — renderLearningReport 4 scenarios
 *
 * D-17: 한국어 마크다운 보고서 렌더링 검증.
 */
import { describe, it, expect } from 'vitest';
import { renderLearningReport } from './learning-report.js';
import type { LearningLoopResult } from './learning-loop.js';

function makeFullResult(): LearningLoopResult {
  return {
    patternsNew: 5,
    patternsUpdated: 3,
    editDeltasFound: 8,
    editDeltasUnchanged: 2,
    crossSellOpportunities: [
      {
        rule: {
          fromService: '카페 바이럴',
          toService: '블로그 체험단',
          timingCondition: '캠페인 2주차',
          timingCheck: () => true,
          speechPattern: 1,
        },
        clientId: 1,
        companyName: '테스트회사',
      },
      {
        rule: {
          fromService: 'UGC 인플루언서',
          toService: '2차 라이선스 + 퍼포먼스',
          timingCondition: '콘텐츠 업로드 후',
          timingCheck: () => true,
          speechPattern: 2,
        },
        clientId: 2,
        companyName: '다른회사',
      },
    ],
    competitorIntelNew: 4,
    clientsProcessed: 10,
    clientsFailed: 1,
    warnings: ['warning1'],
  };
}

function makeEmptyResult(): LearningLoopResult {
  return {
    patternsNew: 0,
    patternsUpdated: 0,
    editDeltasFound: 0,
    editDeltasUnchanged: 0,
    crossSellOpportunities: [],
    competitorIntelNew: 0,
    clientsProcessed: 0,
    clientsFailed: 0,
    warnings: [],
  };
}

describe('renderLearningReport', () => {
  it('Test 1: full result renders 4 sections in Korean markdown', () => {
    const report = renderLearningReport(makeFullResult(), { date: '2026-04-10' });

    // Title
    expect(report).toContain('학습 루프 실행 결과');
    expect(report).toContain('2026-04-10');

    // Section 1: LRNG-01 이메일 성과
    expect(report).toContain('이메일 성과');
    expect(report).toContain('신규 분석: 5건');
    expect(report).toContain('기존 업데이트: 3건');

    // Section 2: LRNG-02 수정 패턴
    expect(report).toContain('수정 패턴');
    expect(report).toContain('발견: 8건');

    // Section 3: LRNG-03 크로스셀 기회
    expect(report).toContain('크로스셀 기회');
    expect(report).toContain('테스트회사');
    expect(report).toContain('카페 바이럴');
    expect(report).toContain('블로그 체험단');
    expect(report).toContain('다른회사');

    // Section 4: LRNG-04 시장 정보
    expect(report).toContain('시장 정보');
    expect(report).toContain('신규 수집: 4건');

    // Footer
    expect(report).toContain('처리: 10개 거래처');
    expect(report).toContain('실패: 1건');
  });

  it('Test 2: empty crossSellOpportunities shows fallback message', () => {
    const result = makeFullResult();
    result.crossSellOpportunities = [];

    const report = renderLearningReport(result, { date: '2026-04-10' });

    expect(report).toContain('감지된 기회 없음');
  });

  it('Test 3: all zeros shows "no analysis target" message', () => {
    const report = renderLearningReport(makeEmptyResult(), { date: '2026-04-10' });

    expect(report).toContain('분석 대상 없음');
  });

  it('Test 4: rendered in Korean following D-17 format', () => {
    const report = renderLearningReport(makeFullResult(), { date: '2026-04-10' });

    // Korean section headers
    expect(report).toContain('### 이메일 성과 (LRNG-01)');
    expect(report).toContain('### 수정 패턴 (LRNG-02)');
    expect(report).toContain('### 크로스셀 기회 (LRNG-03)');
    expect(report).toContain('### 시장 정보 (LRNG-04)');

    // Table header for cross-sell
    expect(report).toContain('거래처');
    expect(report).toContain('현재 서비스');
    expect(report).toContain('제안 서비스');
    expect(report).toContain('타이밍');
  });
});
