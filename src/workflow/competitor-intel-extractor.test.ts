/**
 * competitor-intel-extractor.test.ts — TDD tests for AI competitor extraction.
 *
 * D-14: 통화 transcript / 이메일 답장에서 경쟁사 정보를 AI로 추출.
 * T-05-08: 경계 마커로 prompt injection 방어.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  extractCompetitorIntel,
  CompetitorIntelSchema,
  COMPETITOR_EXTRACTION_TOOL_NAME,
  type CompetitorIntelExtractorDeps,
  type CompetitorIntelResult,
} from './competitor-intel-extractor.js';

// ─── Helpers ──────────────────────────────────────────────────

function makeDeps(overrides: Partial<CompetitorIntelExtractorDeps> = {}): CompetitorIntelExtractorDeps {
  return {
    competitorIntelQueries: {
      create: vi.fn().mockReturnValue({ id: 1 }),
      exists: vi.fn().mockReturnValue(false),
      getByClient: vi.fn().mockReturnValue([]),
      getByIndustry: vi.fn().mockReturnValue([]),
    } as any,
    ...overrides,
  };
}

const SAMPLE_AI_RESULT = [
  {
    competitorName: 'ABC마케팅',
    intelType: 'pricing' as const,
    detail: '인플루언서 마케팅 건당 1500만원 견적 제시',
    confidence: 'confirmed' as const,
  },
  {
    competitorName: 'XYZ에이전시',
    intelType: 'service' as const,
    detail: '바이럴 마케팅 + SNS 운영 패키지 제공',
    confidence: 'inferred' as const,
  },
];

// ─── Tests ────────────────────────────────────────────────────

describe('CompetitorIntelSchema', () => {
  it('validates correct competitor intel array', () => {
    const result = CompetitorIntelSchema.safeParse(SAMPLE_AI_RESULT);
    expect(result.success).toBe(true);
  });

  it('rejects invalid intelType', () => {
    const result = CompetitorIntelSchema.safeParse([
      { competitorName: 'A', intelType: 'invalid', detail: 'x', confidence: 'confirmed' },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('extractCompetitorIntel', () => {
  it('Test 1: 경쟁사 언급 있는 텍스트 + AI DI -> CompetitorIntel 배열 반환 + DB 저장', async () => {
    const extractFn = vi.fn().mockResolvedValue(SAMPLE_AI_RESULT);
    const deps = makeDeps({ extractFn });

    const result = await extractCompetitorIntel(
      '다른 업체에서 1500만원에 해준다고 합니다. XYZ에이전시에서도 제안을 받았습니다.',
      1,
      'call_analysis',
      deps,
    );

    expect(result.newEntries).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(deps.competitorIntelQueries.create).toHaveBeenCalledTimes(2);
    expect(extractFn).toHaveBeenCalledTimes(1);
  });

  it('Test 2: 경쟁사 언급 없는 텍스트 + AI DI -> 빈 배열', async () => {
    const extractFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ extractFn });

    const result = await extractCompetitorIntel(
      '오늘 날씨가 좋습니다.',
      1,
      'email_reply',
      deps,
    );

    expect(result.newEntries).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(deps.competitorIntelQueries.create).not.toHaveBeenCalled();
  });

  it('Test 3: AI DI 미주입 -> 빈 배열 (graceful skip)', async () => {
    const deps = makeDeps(); // no extractFn

    const result = await extractCompetitorIntel(
      '경쟁사 ABC가 1500만원에 제안했습니다.',
      1,
      'call_analysis',
      deps,
    );

    expect(result.newEntries).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(deps.competitorIntelQueries.create).not.toHaveBeenCalled();
  });

  it('Test 4: 중복 (exists=true) -> skip, 신규만 저장', async () => {
    const extractFn = vi.fn().mockResolvedValue(SAMPLE_AI_RESULT);
    const deps = makeDeps({ extractFn });
    // First item exists, second is new
    (deps.competitorIntelQueries.exists as any)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const result = await extractCompetitorIntel(
      '경쟁사 정보가 있는 텍스트',
      1,
      'call_analysis',
      deps,
    );

    expect(result.newEntries).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(deps.competitorIntelQueries.create).toHaveBeenCalledTimes(1);
  });

  it('Test 5: source="call_analysis"로 통화 transcript 처리', async () => {
    const extractFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ extractFn });

    await extractCompetitorIntel('통화 내용', 1, 'call_analysis', deps);

    // extractFn should receive text wrapped in <call_transcript> marker
    const calledText = extractFn.mock.calls[0][0] as string;
    expect(calledText).toContain('<call_transcript>');
    expect(calledText).toContain('</call_transcript>');
    expect(calledText).toContain('통화 내용');
  });

  it('Test 6: source="email_reply"로 이메일 답장 처리', async () => {
    const extractFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ extractFn });

    await extractCompetitorIntel('이메일 답장 내용', 1, 'email_reply', deps);

    const calledText = extractFn.mock.calls[0][0] as string;
    expect(calledText).toContain('<email_content>');
    expect(calledText).toContain('</email_content>');
    expect(calledText).toContain('이메일 답장 내용');
  });

  it('Test 7: AI 응답이 zod 스키마 불일치 -> 빈 배열 + warning', async () => {
    const extractFn = vi.fn().mockResolvedValue([
      { competitorName: 'A', intelType: 'INVALID_TYPE', detail: 'x', confidence: 'confirmed' },
    ]);
    const deps = makeDeps({ extractFn });

    const result = await extractCompetitorIntel('텍스트', 1, 'call_analysis', deps);

    expect(result.newEntries).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('schema');
  });

  it('경계 마커 prompt 내 market_research source', async () => {
    const extractFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ extractFn });

    await extractCompetitorIntel('시장 조사 내용', 1, 'market_research', deps);

    const calledText = extractFn.mock.calls[0][0] as string;
    expect(calledText).toContain('<market_research>');
    expect(calledText).toContain('</market_research>');
  });

  it('create에 올바른 필드가 전달됨', async () => {
    const extractFn = vi.fn().mockResolvedValue([SAMPLE_AI_RESULT[0]]);
    const deps = makeDeps({ extractFn });

    await extractCompetitorIntel('텍스트', 42, 'email_reply', deps);

    expect(deps.competitorIntelQueries.create).toHaveBeenCalledWith({
      clientId: 42,
      competitorName: 'ABC마케팅',
      intelType: 'pricing',
      detail: '인플루언서 마케팅 건당 1500만원 견적 제시',
      source: 'email_reply',
      confidence: 'confirmed',
    });
  });
});
