import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { addDeal, savePipeline } from './pipeline.js';
import { getDealsNeedingFollowup, loadSessionState } from './session-loader.js';

import type { Deal } from './pipeline.js';

describe('getDealsNeedingFollowup', () => {
  it('should return deals where lastActionDate is 3+ days ago', () => {
    const deals: Deal[] = [
      {
        id: 'old-deal',
        companyName: '오래된 회사',
        stage: 'LEAD',
        lastActionDate: '2026-04-01',
      },
    ];

    const result = getDealsNeedingFollowup(deals, '2026-04-07');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('old-deal');
  });

  it('should NOT return deals contacted today', () => {
    const deals: Deal[] = [
      {
        id: 'today-deal',
        companyName: '오늘 연락한 회사',
        stage: 'LEAD',
        lastActionDate: '2026-04-07',
      },
    ];

    const result = getDealsNeedingFollowup(deals, '2026-04-07');
    expect(result).toHaveLength(0);
  });

  it('should NOT return deals contacted yesterday (< 3 days)', () => {
    const deals: Deal[] = [
      {
        id: 'yesterday-deal',
        companyName: '어제 연락한 회사',
        stage: 'PROSPECT',
        lastActionDate: '2026-04-06',
      },
    ];

    const result = getDealsNeedingFollowup(deals, '2026-04-07');
    expect(result).toHaveLength(0);
  });

  it('should exclude DORMANT stage deals', () => {
    const deals: Deal[] = [
      {
        id: 'dormant-deal',
        companyName: '휴면 회사',
        stage: 'DORMANT',
        lastActionDate: '2026-03-01', // very old
      },
    ];

    const result = getDealsNeedingFollowup(deals, '2026-04-07');
    expect(result).toHaveLength(0);
  });

  it('should return multiple deals needing followup', () => {
    const deals: Deal[] = [
      {
        id: 'deal-1',
        companyName: '회사 A',
        stage: 'PROSPECT',
        lastActionDate: '2026-04-01',
      },
      {
        id: 'deal-2',
        companyName: '회사 B',
        stage: 'CLIENT',
        lastActionDate: '2026-04-02',
      },
      {
        id: 'deal-3',
        companyName: '최근 회사',
        stage: 'LEAD',
        lastActionDate: '2026-04-07',
      },
      {
        id: 'deal-4',
        companyName: '휴면 회사',
        stage: 'DORMANT',
        lastActionDate: '2026-03-15',
      },
    ];

    const result = getDealsNeedingFollowup(deals, '2026-04-07');
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toContain('deal-1');
    expect(result.map((d) => d.id)).toContain('deal-2');
  });
});

describe('loadSessionState', () => {
  let tmpDir: string;
  let pipelinePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'session-test-'));
    pipelinePath = join(tmpDir, 'pipeline.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty state when no deals exist', () => {
    const state = loadSessionState(pipelinePath, '2026-04-07');
    expect(state.totalDeals).toBe(0);
    expect(state.needFollowup).toEqual([]);
    expect(state.byStage.PROSPECT).toBe(0);
    expect(state.byStage.LEAD).toBe(0);
    expect(state.byStage.CLIENT).toBe(0);
    expect(state.byStage.RETENTION).toBe(0);
    expect(state.byStage.DORMANT).toBe(0);
    expect(state.summary).toBeDefined();
  });

  it('should return full summary with deals and followup needs', () => {
    // Add deals
    addDeal({ companyName: 'A사', stage: 'PROSPECT', lastActionDate: '2026-04-01' }, pipelinePath);
    addDeal({ companyName: 'B사', stage: 'LEAD', lastActionDate: '2026-04-07' }, pipelinePath);
    addDeal({ companyName: 'C사', stage: 'CLIENT', lastActionDate: '2026-04-02' }, pipelinePath);
    addDeal({ companyName: 'D사', stage: 'DORMANT', lastActionDate: '2026-03-01' }, pipelinePath);

    const state = loadSessionState(pipelinePath, '2026-04-07');
    expect(state.totalDeals).toBe(4);
    expect(state.byStage.PROSPECT).toBe(1);
    expect(state.byStage.LEAD).toBe(1);
    expect(state.byStage.CLIENT).toBe(1);
    expect(state.byStage.DORMANT).toBe(1);
    // A사 (4/1, 6 days ago) and C사 (4/2, 5 days ago) need followup
    // B사 contacted today, D사 is DORMANT
    expect(state.needFollowup).toHaveLength(2);
    expect(state.summary).toContain('4');
  });
});
