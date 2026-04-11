/**
 * Phase 4-02 Task 1 — cadence.ts 단위 테스트
 *
 * 순수 함수 레이어 검증:
 * - classifyCadenceContextDeterministic (D-11 pre-filter)
 * - computeCadenceStage (D-08/D-12/D-13/D-14/D-17)
 * - CADENCE_MATRIX 상수 (CONTEXT.md D-12 해석)
 *
 * DB/네트워크/AI 의존성 0. 결정론적(Date 주입).
 */

import { describe, it, expect } from 'vitest';
import {
  CADENCE_MATRIX,
  classifyCadenceContextDeterministic,
  computeCadenceStage,
  TONE_INTENT_LABELS,
  type CadenceContextType,
} from './cadence.js';

// ─── CADENCE_MATRIX 상수 검증 ────────────────────────────────
describe('CADENCE_MATRIX constants', () => {
  it('general === [3, 7, 14, 30]', () => {
    expect([...CADENCE_MATRIX.general]).toEqual([3, 7, 14, 30]);
  });

  // CONTEXT.md D-12 해석 주의:
  // v4 ULTRA 본문(L873)은 proposal을 "Day 3 → 7 → 14 (표준)"으로 명시하나
  // CONTEXT.md D-12는 "proposal: Day 3 → 7 → 14 → 30"으로 확정.
  // FLLW-04(Dormant 전환) 일관성을 위해 Day 30 stage 포함.
  it('proposal === [3, 7, 14, 30] (CONTEXT.md D-12 해석)', () => {
    expect([...CADENCE_MATRIX.proposal]).toEqual([3, 7, 14, 30]);
  });

  it('contract === [2, 5] (계약은 타이밍 중요)', () => {
    expect([...CADENCE_MATRIX.contract]).toEqual([2, 5]);
  });

  it('meeting_qna === [2, 5] (미팅 모멘텀 유지)', () => {
    expect([...CADENCE_MATRIX.meeting_qna]).toEqual([2, 5]);
  });

  it('quote_revision === [3, 7] (검토 시간 확보)', () => {
    expect([...CADENCE_MATRIX.quote_revision]).toEqual([3, 7]);
  });

  it('influencer_outreach === [2, 5, 10] (짧은 주기)', () => {
    expect([...CADENCE_MATRIX.influencer_outreach]).toEqual([2, 5, 10]);
  });

  it('6개 context_type 모두 정의됨', () => {
    const keys = Object.keys(CADENCE_MATRIX).sort();
    expect(keys).toEqual(
      [
        'contract',
        'general',
        'influencer_outreach',
        'meeting_qna',
        'proposal',
        'quote_revision',
      ].sort(),
    );
  });

  it('TONE_INTENT_LABELS에 4개 toneIntent 라벨 모두 존재', () => {
    expect(TONE_INTENT_LABELS.confirm).toBeTruthy();
    expect(TONE_INTENT_LABELS.add_value).toBeTruthy();
    expect(TONE_INTENT_LABELS.alternative).toBeTruthy();
    expect(TONE_INTENT_LABELS.relationship).toBeTruthy();
  });
});

// ─── classifyCadenceContextDeterministic ────────────────────
describe('classifyCadenceContextDeterministic', () => {
  it('제안서 키워드 → proposal', () => {
    expect(
      classifyCadenceContextDeterministic('제안서 송부드립니다', '[제안서] 기획안'),
    ).toBe('proposal');
  });

  it('계약서 키워드 → contract', () => {
    expect(
      classifyCadenceContextDeterministic('법인인감 날인 부탁드립니다', '[계약서 초안] NDA'),
    ).toBe('contract');
  });

  it('미팅 감사 → meeting_qna', () => {
    expect(
      classifyCadenceContextDeterministic('어제 미팅에서 논의한 내용입니다', '미팅 감사 드립니다'),
    ).toBe('meeting_qna');
  });

  it('견적 수정 → quote_revision', () => {
    expect(
      classifyCadenceContextDeterministic('재견적 드립니다', 'Re: 견적 수정안'),
    ).toBe('quote_revision');
  });

  it('크리에이터 협업 → influencer_outreach', () => {
    expect(
      classifyCadenceContextDeterministic('UGC 제작 관련', '크리에이터 협업 제안'),
    ).toBe('influencer_outreach');
  });

  it('키워드 매칭 없음 → null (workflow-c에서 general fallback)', () => {
    expect(classifyCadenceContextDeterministic('안녕하세요', '소개드립니다')).toBeNull();
  });

  it('contract와 proposal 키워드 동시 존재 시 contract 우선', () => {
    expect(
      classifyCadenceContextDeterministic(
        '제안서 검토 후 계약서 초안 드립니다',
        'contract draft',
      ),
    ).toBe('contract');
  });

  it('빈 문자열 입력 → null', () => {
    expect(classifyCadenceContextDeterministic('', '')).toBeNull();
  });

  it('subject에만 키워드 존재해도 매칭', () => {
    expect(classifyCadenceContextDeterministic('', '[제안서] 초안')).toBe('proposal');
  });
});

// ─── computeCadenceStage ────────────────────────────────────
describe('computeCadenceStage', () => {
  // 고정된 now 값을 사용하여 결정론 확보
  const NOW = new Date('2026-04-15T10:00:00+09:00');

  /** NOW에서 N일 전 ISO 문자열 생성 */
  function daysAgoIso(days: number): string {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  it('proposal, elapsedDays=0 → null (milestone 미도달)', () => {
    expect(computeCadenceStage(daysAgoIso(0), NOW, 'proposal')).toBeNull();
  });

  it('proposal, elapsedDays=2 → null (Day 3 미도달)', () => {
    expect(computeCadenceStage(daysAgoIso(2), NOW, 'proposal')).toBeNull();
  });

  it('proposal, elapsedDays=3 → Day 3 (1차, confirm)', () => {
    const result = computeCadenceStage(daysAgoIso(3), NOW, 'proposal');
    expect(result).toMatchObject({
      stageIndex: 0,
      dayMilestone: 3,
      ordinal: 1,
      toneIntent: 'confirm',
      isFinalTouch: false,
      toneLevel: 2,
    });
  });

  it('proposal, elapsedDays=8 → Day 7 (2차, add_value)', () => {
    const result = computeCadenceStage(daysAgoIso(8), NOW, 'proposal');
    expect(result).toMatchObject({
      stageIndex: 1,
      dayMilestone: 7,
      ordinal: 2,
      toneIntent: 'add_value',
      isFinalTouch: false,
      toneLevel: 2,
    });
  });

  it('proposal, elapsedDays=15 → Day 14 (3차, alternative)', () => {
    const result = computeCadenceStage(daysAgoIso(15), NOW, 'proposal');
    expect(result).toMatchObject({
      stageIndex: 2,
      dayMilestone: 14,
      ordinal: 3,
      toneIntent: 'alternative',
      isFinalTouch: false,
      toneLevel: 3,
    });
  });

  it('proposal, elapsedDays=31 → Day 30 (마지막, relationship + isFinalTouch)', () => {
    const result = computeCadenceStage(daysAgoIso(31), NOW, 'proposal');
    expect(result).toMatchObject({
      stageIndex: 3,
      dayMilestone: 30,
      ordinal: 4,
      toneIntent: 'relationship',
      isFinalTouch: true,
      toneLevel: 2,
    });
  });

  it('proposal, elapsedDays=31, executedStageIndices=[3] → null (이미 실행)', () => {
    expect(computeCadenceStage(daysAgoIso(31), NOW, 'proposal', [3])).toBeNull();
  });

  it('proposal, elapsedDays=31, executedStageIndices=[0,1,2,3] → null (모두 실행)', () => {
    expect(computeCadenceStage(daysAgoIso(31), NOW, 'proposal', [0, 1, 2, 3])).toBeNull();
  });

  it('contract, elapsedDays=2 → Day 2 (1차)', () => {
    const result = computeCadenceStage(daysAgoIso(2), NOW, 'contract');
    expect(result).toMatchObject({
      stageIndex: 0,
      dayMilestone: 2,
      ordinal: 1,
      toneIntent: 'confirm',
      isFinalTouch: false,
    });
  });

  it('contract, elapsedDays=6 → Day 5 (2차 + isFinalTouch, 2 stage만 있으므로)', () => {
    const result = computeCadenceStage(daysAgoIso(6), NOW, 'contract');
    expect(result).toMatchObject({
      stageIndex: 1,
      dayMilestone: 5,
      ordinal: 2,
      isFinalTouch: true,
      toneIntent: 'relationship',
      toneLevel: 2,
    });
  });

  it('influencer_outreach, elapsedDays=11 → Day 10 (3차 + isFinalTouch)', () => {
    const result = computeCadenceStage(daysAgoIso(11), NOW, 'influencer_outreach');
    expect(result).toMatchObject({
      stageIndex: 2,
      dayMilestone: 10,
      ordinal: 3,
      isFinalTouch: true,
      toneIntent: 'relationship',
    });
  });

  it('lastOutboundAt이 now보다 미래 (clock skew) → null', () => {
    const future = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeCadenceStage(future, NOW, 'proposal')).toBeNull();
  });

  it('elapsedDays=0.9 같은 소수는 floor → 0일 → null', () => {
    const partial = new Date(NOW.getTime() - 0.9 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeCadenceStage(partial, NOW, 'proposal')).toBeNull();
  });

  it('잘못된 ISO 문자열 입력 → null', () => {
    expect(computeCadenceStage('not-an-iso', NOW, 'proposal')).toBeNull();
  });

  // catch-up 정책: 한 번에 최대 도달한 milestone만 반환 (지연된 팔로업 여러 건 생성 금지)
  it('catch-up — proposal elapsedDays=15, executed=[] → Day 14만 반환', () => {
    const result = computeCadenceStage(daysAgoIso(15), NOW, 'proposal', []);
    expect(result).toMatchObject({
      stageIndex: 2,
      dayMilestone: 14,
    });
  });

  // catch-up 응용: 이미 Day 14 실행했으면 Day 30까지 대기
  it('catch-up — proposal elapsedDays=15, executed=[2] → null (Day 30 대기)', () => {
    expect(computeCadenceStage(daysAgoIso(15), NOW, 'proposal', [2])).toBeNull();
  });

  // catch-up: 이미 Day 3 실행했으면 Day 7 반환 (다음 단계 진행)
  it('catch-up — proposal elapsedDays=8, executed=[0] → Day 7', () => {
    const result = computeCadenceStage(daysAgoIso(8), NOW, 'proposal', [0]);
    expect(result).toMatchObject({
      stageIndex: 1,
      dayMilestone: 7,
    });
  });

  it('meeting_qna, elapsedDays=5 → Day 5 (isFinalTouch=true)', () => {
    const result = computeCadenceStage(daysAgoIso(5), NOW, 'meeting_qna');
    expect(result).toMatchObject({
      stageIndex: 1,
      dayMilestone: 5,
      isFinalTouch: true,
    });
  });

  it('quote_revision, elapsedDays=3 → Day 3 (1차)', () => {
    const result = computeCadenceStage(daysAgoIso(3), NOW, 'quote_revision');
    expect(result).toMatchObject({
      stageIndex: 0,
      dayMilestone: 3,
      ordinal: 1,
      toneIntent: 'confirm',
      isFinalTouch: false,
    });
  });

  it('general, elapsedDays=30 → Day 30 (isFinalTouch=true)', () => {
    const result = computeCadenceStage(daysAgoIso(30), NOW, 'general');
    expect(result).toMatchObject({
      stageIndex: 3,
      dayMilestone: 30,
      isFinalTouch: true,
      toneIntent: 'relationship',
    });
  });

  // 모든 context_type 스모크 테스트
  it.each<[CadenceContextType, number, number]>([
    ['general', 3, 3],
    ['general', 7, 7],
    ['general', 14, 14],
    ['general', 30, 30],
    ['contract', 2, 2],
    ['contract', 5, 5],
    ['meeting_qna', 2, 2],
    ['quote_revision', 3, 3],
    ['quote_revision', 7, 7],
    ['influencer_outreach', 2, 2],
    ['influencer_outreach', 5, 5],
  ])('%s @ elapsed=%d → milestone %d', (type, elapsed, expectedMilestone) => {
    const result = computeCadenceStage(daysAgoIso(elapsed), NOW, type);
    expect(result?.dayMilestone).toBe(expectedMilestone);
  });
});
