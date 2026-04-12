/**
 * Phase 5: 경쟁사 정보 AI 추출기 (D-14, LRNG-04)
 *
 * 통화 transcript 또는 이메일 답장에서 경쟁사 언급을 AI로 추출하여
 * competitor_intel DB에 저장한다.
 *
 * 설계 원칙:
 * - DI: extractFn(AI 호출)은 optional DI. 미주입 시 빈 결과 반환 (graceful skip).
 * - 안전: 경계 마커(<call_transcript>, <email_content>, <market_research>)로
 *   prompt injection 방어 (T-05-08, call-analyzer.ts 패턴 복제).
 * - 검증: AI 응답은 zod safeParse로 엄격 검증. 불일치 시 빈 배열 + warning.
 * - 중복 방지: exists() 체크 후 신규만 create.
 *
 * @module workflow/competitor-intel-extractor
 */

import { z } from 'zod';
import type { createCompetitorIntelQueries } from '../queries/competitor-intel.js';

// ─── Constants ──────────────────────────────────────────────────

/** AI tool 이름 (Claude tool_use 패턴 참조용 상수). */
export const COMPETITOR_EXTRACTION_TOOL_NAME = 'extract_competitor_intel';

// ─── Zod Schema ─────────────────────────────────────────────────

/**
 * AI가 반환하는 경쟁사 정보 배열의 검증 스키마.
 *
 * intelType: 정보 유형 (가격/서비스/전략/약점/일반)
 * confidence: 확신도 (확인됨/추론/소문)
 */
export const CompetitorIntelSchema = z.array(
  z.object({
    competitorName: z.string(),
    intelType: z.enum(['pricing', 'service', 'strategy', 'weakness', 'general']),
    detail: z.string(),
    confidence: z.enum(['confirmed', 'inferred', 'rumor']),
  }),
);

// ─── Types ──────────────────────────────────────────────────────

export type CompetitorIntelItem = z.infer<typeof CompetitorIntelSchema>[number];

export interface CompetitorIntelExtractorDeps {
  competitorIntelQueries: ReturnType<typeof createCompetitorIntelQueries>;
  /** AI 추출 함수 (DI). 미주입 시 경쟁사 추출 불가 -> graceful skip. */
  extractFn?: (text: string) => Promise<z.infer<typeof CompetitorIntelSchema>>;
}

export interface CompetitorIntelResult {
  newEntries: number;
  duplicatesSkipped: number;
  warnings: string[];
}

// ─── Source-specific markers (T-05-08 prompt injection 방어) ────

type SourceType = 'call_analysis' | 'email_reply' | 'market_research';

const SOURCE_MARKERS: Record<SourceType, { marker: string; label: string }> = {
  call_analysis: { marker: 'call_transcript', label: '통화 내용' },
  email_reply: { marker: 'email_content', label: '이메일 답장' },
  market_research: { marker: 'market_research', label: '시장 조사 자료' },
};

// ─── Prompt template ────────────────────────────────────────────

/**
 * 경계 마커로 감싼 텍스트를 생성한다.
 * call-analyzer.ts의 <call_transcript> 패턴을 복제.
 */
function wrapWithMarker(text: string, source: SourceType): string {
  const { marker, label } = SOURCE_MARKERS[source];
  return [
    `다음 ${label}에서 경쟁사 또는 시장 정보를 추출하세요.`,
    '경쟁사 이름이 불명확하면 "unknown"으로 표기하세요.',
    '해당 정보가 없으면 빈 배열을 반환하세요.',
    '',
    `<${marker}>`,
    text,
    `</${marker}>`,
  ].join('\n');
}

// ─── Main function ──────────────────────────────────────────────

/**
 * 텍스트에서 경쟁사 정보를 AI로 추출하여 DB에 저장한다.
 *
 * @param text 분석 대상 텍스트 (통화 transcript / 이메일 답장 / 시장 조사)
 * @param clientId 해당 거래처 ID
 * @param source 텍스트의 출처 (경계 마커 선택에 사용)
 * @param deps 의존성 (쿼리 모듈 + AI 추출 함수)
 * @returns 추출 결과 (신규/중복/경고 카운트)
 */
export async function extractCompetitorIntel(
  text: string,
  clientId: number,
  source: SourceType,
  deps: CompetitorIntelExtractorDeps,
): Promise<CompetitorIntelResult> {
  const result: CompetitorIntelResult = {
    newEntries: 0,
    duplicatesSkipped: 0,
    warnings: [],
  };

  // 1. extractFn 미주입 -> AI 없이 경쟁사 추출 불가, graceful skip
  if (!deps.extractFn) {
    return result;
  }

  // 2. extractFn 호출 -- 텍스트를 경계 마커로 감싸서 전달 (T-05-08)
  const wrappedText = wrapWithMarker(text, source);
  let rawItems: unknown;

  try {
    rawItems = await deps.extractFn(wrappedText);
  } catch (err) {
    result.warnings.push(`extractFn error: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  // 3. zod safeParse로 응답 검증
  const parsed = CompetitorIntelSchema.safeParse(rawItems);
  if (!parsed.success) {
    result.warnings.push(`AI response schema validation failed: ${parsed.error.message}`);
    return result;
  }

  const items = parsed.data;

  // 4. 각 항목 중복 체크 + 신규만 저장
  for (const item of items) {
    const isDuplicate = deps.competitorIntelQueries.exists(
      clientId,
      item.competitorName,
      item.intelType,
      item.detail,
    );

    if (isDuplicate) {
      result.duplicatesSkipped++;
      continue;
    }

    // 5. 신규 항목 저장
    deps.competitorIntelQueries.create({
      clientId,
      competitorName: item.competitorName,
      intelType: item.intelType,
      detail: item.detail,
      source,
      confidence: item.confidence,
    });

    result.newEntries++;
  }

  return result;
}
