/**
 * Phase 4 Plan 06 Task 1 — cadence-report.ts 단위 테스트
 *
 * D-06 리포트 형식 검증 (한국어 markdown 표 + Dormant 섹션 + pendingBeyondCap 블록).
 * renderCadenceReport / renderSingleResult 두 순수 함수를 deterministic하게 검증.
 */
import { describe, it, expect } from 'vitest';
import { renderCadenceReport, renderSingleResult } from './cadence-report.js';
import type { WorkflowCBatchResult, WorkflowCResult } from './workflow-c.js';

const FIXED_NOW = new Date('2026-04-11T00:00:00.000Z');

function emptyBatch(): WorkflowCBatchResult {
  return {
    processed: 0,
    drafted: 0,
    skipped: 0,
    errors: 0,
    rows: [],
    pendingBeyondCap: 0,
    dormantCandidates: [],
  };
}

describe('renderCadenceReport — header & summary', () => {
  it('빈 batch (processed=0)는 헤더 + 처리 요약 + 빈 표 본체만 출력하고 Dormant/대기 섹션은 미렌더링', () => {
    const out = renderCadenceReport(emptyBatch(), { now: FIXED_NOW });

    expect(out).toContain('## Workflow C 실행 결과 — 2026-04-11');
    expect(out).toContain('**처리:** 0건 검토 / 0건 드래프트 생성 / 0건 스킵 / 0건 오류');
    expect(out).toContain('| 회사명 | 마지막 접점 | 경과 | 다음 케이던스 | 드래프트 ID | 상태 |');
    // Dormant 섹션 미존재
    expect(out).not.toContain('휴면 전환 확인 필요');
    // 대기 섹션 미존재
    expect(out).not.toContain('### 대기 중');
  });

  it('첫 줄이 ## Workflow C 실행 결과 로 시작', () => {
    const out = renderCadenceReport(emptyBatch(), { now: FIXED_NOW });
    expect(out.split('\n')[0]).toBe('## Workflow C 실행 결과 — 2026-04-11');
  });

  it('표 헤더는 한국어 6컬럼 (회사명/마지막 접점/경과/다음 케이던스/드래프트 ID/상태)', () => {
    const out = renderCadenceReport(emptyBatch(), { now: FIXED_NOW });
    expect(out).toMatch(/\| 회사명 \| 마지막 접점 \| 경과 \| 다음 케이던스 \| 드래프트 ID \| 상태 \|/);
    expect(out).toMatch(/\|--------\|-------------\|------\|---------------\|-------------\|------\|/);
  });
});

describe('renderCadenceReport — 표 본문 행', () => {
  it('success 1건 → 표에 1행, draftId/경과 일수/다음 케이던스 채워지고 상태는 ✅ 드래프트', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 1,
      drafted: 1,
      rows: [
        {
          companyName: '동반성장위원회',
          lastOutboundAt: '2026-04-08T00:00:00.000Z',
          elapsedDays: 3,
          nextCadence: 'Day 3 · 확인 (1차)',
          draftId: 'draft_abc123',
          status: 'success',
          note: undefined,
        },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('| 동반성장위원회 | 2026-04-08T00:00:00.000Z | 3일 | Day 3 · 확인 (1차) | draft_abc123 | ✅ 드래프트 |');
    expect(out).toContain('**처리:** 1건 검토 / 1건 드래프트 생성 / 0건 스킵 / 0건 오류');
  });

  it('no_action(recent_inbound) → 상태 컬럼에 한국어 사유 라벨, draftId/nextCadence는 — 출력', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 1,
      skipped: 1,
      rows: [
        {
          companyName: '소프트캠페인',
          lastOutboundAt: '2026-04-05T00:00:00.000Z',
          elapsedDays: 6,
          nextCadence: null,
          draftId: null,
          status: 'no_action',
          note: '답장 수신됨 (자동 차단)',
        },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('| 소프트캠페인 | 2026-04-05T00:00:00.000Z | 6일 | — | — | ⏭️ 답장 수신됨 (자동 차단) |');
  });

  it('error 건 → 상태 컬럼에 ❌ 오류, note의 에러 메시지 노출 안 함 (간결성)', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 1,
      errors: 1,
      rows: [
        {
          companyName: '실패주식회사',
          lastOutboundAt: null,
          elapsedDays: null,
          nextCadence: null,
          draftId: null,
          status: 'error',
          note: '품질 실패: greeting 누락',
        },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('| 실패주식회사 | — | — | — | — | ❌ 오류 |');
  });

  it('elapsedDays / nextCadence / lastOutboundAt 모두 null → 모두 — 로 출력', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 1,
      skipped: 1,
      rows: [
        {
          companyName: '신규클라이언트',
          lastOutboundAt: null,
          elapsedDays: null,
          nextCadence: null,
          draftId: null,
          status: 'no_action',
          note: '마지막 접점 기록 없음',
        },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('| 신규클라이언트 | — | — | — | — | ⏭️ 마지막 접점 기록 없음 |');
  });

  it('success 3건 batch → 표에 정확히 3개 데이터 행', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 3,
      drafted: 3,
      rows: [
        {
          companyName: 'A회사',
          lastOutboundAt: '2026-04-08T00:00:00.000Z',
          elapsedDays: 3,
          nextCadence: 'Day 3 · 확인 (1차)',
          draftId: 'draft_a',
          status: 'success',
        },
        {
          companyName: 'B회사',
          lastOutboundAt: '2026-04-04T00:00:00.000Z',
          elapsedDays: 7,
          nextCadence: 'Day 7 · 가치 추가 (2차)',
          draftId: 'draft_b',
          status: 'success',
        },
        {
          companyName: 'C회사',
          lastOutboundAt: '2026-03-28T00:00:00.000Z',
          elapsedDays: 14,
          nextCadence: 'Day 14 · 대안 제시 (3차)',
          draftId: 'draft_c',
          status: 'success',
        },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    const dataRowCount = out.split('\n').filter((line) => line.startsWith('| A회사') || line.startsWith('| B회사') || line.startsWith('| C회사')).length;
    expect(dataRowCount).toBe(3);
  });
});

describe('renderCadenceReport — Dormant 섹션 (조건부)', () => {
  it('dormantCandidates 0건 → 휴면 섹션 미렌더링', () => {
    const out = renderCadenceReport(emptyBatch(), { now: FIXED_NOW });
    expect(out).not.toContain('### 🌙 휴면 전환 확인 필요');
    expect(out).not.toContain('휴면 전환 확인 필요 (D-17)');
  });

  it('dormantCandidates 2건 → 휴면 섹션 + 번호 매긴 목록 2개 + 결정 안내', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 2,
      drafted: 2,
      rows: [],
      dormantCandidates: [
        { companyName: '오래된회사1', draftId: 'draft_old_1' },
        { companyName: '오래된회사2', draftId: 'draft_old_2' },
      ],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('### 🌙 휴면 전환 확인 필요 (D-17)');
    expect(out).toContain('1. **오래된회사1** — 마지막 드래프트 `draft_old_1`');
    expect(out).toContain('2. **오래된회사2** — 마지막 드래프트 `draft_old_2`');
    expect(out).toContain('"전환해" / "유지해"');
  });
});

describe('renderCadenceReport — pendingBeyondCap 섹션 (조건부)', () => {
  it('pendingBeyondCap 0 → 대기 섹션 미렌더링', () => {
    const out = renderCadenceReport(emptyBatch(), { now: FIXED_NOW });
    expect(out).not.toContain('### 대기 중');
  });

  it('pendingBeyondCap 3 → 대기 섹션 + "3건이 남았습니다" 문구', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      processed: 10,
      drafted: 10,
      pendingBeyondCap: 3,
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW, maxDrafts: 10 });
    expect(out).toContain('### 대기 중');
    expect(out).toContain('처리 상한(10건)을 초과한 3건이 남았습니다');
    expect(out).toContain('재실행이 필요합니다');
  });

  it('maxDrafts 미지정 시 기본 10건으로 표시', () => {
    const batch: WorkflowCBatchResult = {
      ...emptyBatch(),
      pendingBeyondCap: 5,
    };
    const out = renderCadenceReport(batch, { now: FIXED_NOW });
    expect(out).toContain('처리 상한(10건)을 초과한 5건이 남았습니다');
  });
});

describe('renderSingleResult — 단건 모드 결과 렌더링', () => {
  it('success → "✅ {company} 드래프트 생성 ({draftId})" + 단계 라인', () => {
    const result: WorkflowCResult = {
      status: 'success',
      companyName: '동반성장위원회',
      draftId: 'draft_xyz',
      stage: {
        ordinal: 1,
        dayMilestone: 3,
        contextType: 'proposal',
        isFinalTouch: false,
      },
      dormantPending: false,
    };

    const out = renderSingleResult(result);
    expect(out).toContain('✅ 동반성장위원회 드래프트 생성 (draft_xyz)');
    expect(out).toContain('1차');
    expect(out).toContain('Day 3');
    expect(out).toContain('proposal');
  });

  it('success + dormantPending=true → "⚠️ 휴면 전환 확인 필요" 라인 추가', () => {
    const result: WorkflowCResult = {
      status: 'success',
      companyName: '오래된회사',
      draftId: 'draft_last',
      stage: {
        ordinal: 4,
        dayMilestone: 30,
        contextType: 'general',
        isFinalTouch: true,
      },
      dormantPending: true,
    };

    const out = renderSingleResult(result);
    expect(out).toContain('⚠️ 휴면 전환 확인 필요');
  });

  it('no_action(recent_inbound) → 한국어 사유 라벨', () => {
    const result: WorkflowCResult = {
      status: 'no_action',
      reason: 'recent_inbound',
      companyName: '응답왔음회사',
    };

    const out = renderSingleResult(result);
    expect(out).toContain('응답왔음회사');
    expect(out).toContain('⏭️');
    expect(out).toContain('답장 수신');
  });

  it('no_action(no_stage_due) → ⏸️ 미도래 라벨', () => {
    const result: WorkflowCResult = {
      status: 'no_action',
      reason: 'no_stage_due',
      companyName: '아직이른회사',
    };

    const out = renderSingleResult(result);
    expect(out).toContain('아직이른회사');
    expect(out).toContain('⏸️');
  });

  it('no_action(dormant) → 🌙 휴면 라벨', () => {
    const result: WorkflowCResult = {
      status: 'no_action',
      reason: 'dormant',
      companyName: '휴면중회사',
    };

    const out = renderSingleResult(result);
    expect(out).toContain('🌙');
    expect(out).toContain('휴면중회사');
  });

  it('no_action(skipped) → ❔ 라벨 (존재하지 않는 회사)', () => {
    const result: WorkflowCResult = {
      status: 'no_action',
      reason: 'skipped',
      companyName: '존재하지않는회사',
    };

    const out = renderSingleResult(result);
    expect(out).toContain('존재하지않는회사');
    expect(out).toContain('❔');
  });

  it('error → "❌ {company}: {error}"', () => {
    const result: WorkflowCResult = {
      status: 'error',
      companyName: '실패회사',
      error: '품질 실패: greeting 누락, action 키워드 누락',
    };

    const out = renderSingleResult(result);
    expect(out).toContain('❌ 실패회사: 품질 실패: greeting 누락, action 키워드 누락');
  });

  it('success + warnings → 경고 라인 추가', () => {
    const result: WorkflowCResult = {
      status: 'success',
      companyName: '경고회사',
      draftId: 'draft_warn',
      stage: {
        ordinal: 2,
        dayMilestone: 7,
        contextType: 'general',
        isFinalTouch: false,
      },
      dormantPending: false,
      warnings: ['가격 정보 불일치', '터치포인트 기록 실패'],
    };

    const out = renderSingleResult(result);
    expect(out).toContain('경고');
    expect(out).toContain('가격 정보 불일치');
    expect(out).toContain('터치포인트 기록 실패');
  });
});

describe('renderCadenceReport — 종합 시나리오 (모든 섹션 조합)', () => {
  it('success/no_action/error 혼합 + dormantCandidates + pendingBeyondCap → 전 섹션 렌더링', () => {
    const batch: WorkflowCBatchResult = {
      processed: 4,
      drafted: 2,
      skipped: 1,
      errors: 1,
      pendingBeyondCap: 2,
      rows: [
        {
          companyName: 'A회사',
          lastOutboundAt: '2026-04-08T00:00:00.000Z',
          elapsedDays: 3,
          nextCadence: 'Day 3 · 확인 (1차)',
          draftId: 'draft_a',
          status: 'success',
        },
        {
          companyName: 'B회사',
          lastOutboundAt: '2026-03-12T00:00:00.000Z',
          elapsedDays: 30,
          nextCadence: 'Day 30 · 관계 유지 (4차)',
          draftId: 'draft_b',
          status: 'success',
          note: '휴면 전환 확인 필요',
        },
        {
          companyName: 'C회사',
          lastOutboundAt: '2026-04-09T00:00:00.000Z',
          elapsedDays: 2,
          nextCadence: null,
          draftId: null,
          status: 'no_action',
          note: '아직 케이던스 도래 전',
        },
        {
          companyName: 'D회사',
          lastOutboundAt: null,
          elapsedDays: null,
          nextCadence: null,
          draftId: null,
          status: 'error',
          note: '교차 오염 감지',
        },
      ],
      dormantCandidates: [{ companyName: 'B회사', draftId: 'draft_b' }],
    };

    const out = renderCadenceReport(batch, { now: FIXED_NOW, maxDrafts: 2 });
    // 헤더
    expect(out).toContain('**처리:** 4건 검토 / 2건 드래프트 생성 / 1건 스킵 / 1건 오류');
    // 4행 모두
    expect(out).toContain('| A회사');
    expect(out).toContain('| B회사');
    expect(out).toContain('| C회사');
    expect(out).toContain('| D회사');
    // B회사는 휴면 확인 라벨
    expect(out).toContain('⚠️ 휴면 확인');
    // 대기 섹션
    expect(out).toContain('### 대기 중');
    expect(out).toContain('처리 상한(2건)을 초과한 2건이 남았습니다');
    // 휴면 섹션
    expect(out).toContain('### 🌙 휴면 전환 확인 필요 (D-17)');
    expect(out).toContain('1. **B회사** — 마지막 드래프트 `draft_b`');
  });
});
