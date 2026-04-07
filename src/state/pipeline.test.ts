import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Will be implemented in pipeline.ts
import {
  PipelineSchema,
  DealSchema,
  loadPipeline,
  savePipeline,
  addDeal,
  updateDealStage,
  getDeal,
  getDealByCompany,
} from './pipeline.js';

describe('Pipeline Zod Schema', () => {
  it('should parse valid pipeline JSON', () => {
    const valid = {
      version: 1,
      lastUpdated: '2026-04-07T00:00:00.000Z',
      deals: [],
    };
    const result = PipelineSchema.parse(valid);
    expect(result.version).toBe(1);
    expect(result.deals).toEqual([]);
  });

  it('should reject invalid JSON (missing version)', () => {
    const invalid = {
      lastUpdated: '2026-04-07T00:00:00.000Z',
      deals: [],
    };
    expect(() => PipelineSchema.parse(invalid)).toThrow();
  });

  it('should reject invalid stage values in DealSchema', () => {
    const invalidDeal = {
      id: 'test-id',
      companyName: 'Test Corp',
      stage: 'INVALID_STAGE',
      lastActionDate: '2026-04-07',
    };
    expect(() => DealSchema.parse(invalidDeal)).toThrow();
  });

  it('should only allow 5 lifecycle stages', () => {
    const validStages = ['PROSPECT', 'LEAD', 'CLIENT', 'RETENTION', 'DORMANT'];
    for (const stage of validStages) {
      const deal = {
        id: `deal-${stage}`,
        companyName: `Company ${stage}`,
        stage,
        lastActionDate: '2026-04-07',
      };
      expect(() => DealSchema.parse(deal)).not.toThrow();
    }
  });
});

describe('Pipeline CRUD', () => {
  let tmpDir: string;
  let pipelinePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pipeline-test-'));
    pipelinePath = join(tmpDir, 'pipeline.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty pipeline when file does not exist', () => {
    const pipeline = loadPipeline(pipelinePath);
    expect(pipeline.version).toBe(1);
    expect(pipeline.deals).toEqual([]);
  });

  it('should save and load pipeline (roundtrip)', () => {
    const pipeline = {
      version: 1 as const,
      lastUpdated: '2026-04-07T00:00:00.000Z',
      deals: [
        {
          id: 'deal-1',
          companyName: '오아름 뷰티',
          stage: 'PROSPECT' as const,
          lastActionDate: '2026-04-07',
        },
      ],
    };
    savePipeline(pipeline, pipelinePath);
    const loaded = loadPipeline(pipelinePath);
    expect(loaded).toEqual(pipeline);
  });

  it('should throw ZodError on corrupted JSON file', () => {
    writeFileSync(pipelinePath, '{ broken json !!!', 'utf-8');
    expect(() => loadPipeline(pipelinePath)).toThrow();
  });

  it('should throw ZodError on invalid schema (e.g. wrong version)', () => {
    writeFileSync(pipelinePath, JSON.stringify({ version: 99, deals: [] }), 'utf-8');
    expect(() => loadPipeline(pipelinePath)).toThrow();
  });

  it('should addDeal and retrieve it with getDeal', () => {
    const deal = addDeal(
      {
        companyName: '새로운 회사',
        stage: 'PROSPECT',
        lastActionDate: '2026-04-07',
      },
      pipelinePath
    );
    expect(deal.id).toBeDefined();
    expect(deal.companyName).toBe('새로운 회사');

    const retrieved = getDeal(deal.id, pipelinePath);
    expect(retrieved).toBeDefined();
    expect(retrieved!.companyName).toBe('새로운 회사');
  });

  it('should updateDealStage and set lastActionDate to today', () => {
    const deal = addDeal(
      {
        companyName: 'Stage Test Corp',
        stage: 'PROSPECT',
        lastActionDate: '2026-04-01',
      },
      pipelinePath
    );

    const updated = updateDealStage(deal.id, 'LEAD', pipelinePath);
    expect(updated.stage).toBe('LEAD');

    const today = new Date().toISOString().split('T')[0];
    expect(updated.lastActionDate).toBe(today);
  });

  it('should getDealByCompany to find deal by company name', () => {
    addDeal(
      {
        companyName: '퍼즐코퍼레이션',
        stage: 'CLIENT',
        lastActionDate: '2026-04-05',
      },
      pipelinePath
    );

    const found = getDealByCompany('퍼즐코퍼레이션', pipelinePath);
    expect(found).toBeDefined();
    expect(found!.stage).toBe('CLIENT');
  });

  it('should use atomic write pattern (tmp file then rename)', () => {
    const pipeline = {
      version: 1 as const,
      lastUpdated: '2026-04-07T00:00:00.000Z',
      deals: [],
    };
    savePipeline(pipeline, pipelinePath);

    // After save, the .tmp file should NOT exist (it was renamed)
    expect(existsSync(pipelinePath + '.tmp')).toBe(false);
    // The actual file should exist
    expect(existsSync(pipelinePath)).toBe(true);
  });
});
