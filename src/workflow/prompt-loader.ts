/**
 * v4 ULTRA Selective Section Loader
 *
 * Extracts specific sections from v4_ULTRA_SYSTEM_PROMPT.md by line ranges
 * instead of loading the full 1187-line prompt. Achieves ~76% token savings
 * by only loading sections relevant to the current classification result.
 *
 * @module prompt-loader
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ClassificationResult } from '../types/classification.js';

interface SectionRange {
  start: number;
  end: number;
}

/**
 * Map of section IDs to their line ranges in v4_ULTRA_SYSTEM_PROMPT.md.
 * Line numbers are 1-indexed, matching the file directly.
 *
 * Verified against system/v4_ULTRA_SYSTEM_PROMPT.md (1187 lines).
 */
export const SECTION_MAP: Record<string, SectionRange> = {
  // Core sections
  'persona':              { start: 15, end: 36 },    // SECTION 1 - 나는 누구인가
  'service-catalog':      { start: 37, end: 139 },   // SECTION 2 - 퍼즐코퍼레이션이 하는 일
  'email-rules-kr':       { start: 231, end: 343 },  // SECTION 6 - 이메일 작성 규칙 (한국어)
  'email-rules-en':       { start: 344, end: 368 },  // SECTION 7 - 이메일 작성 규칙 (영문)
  'subject-format':       { start: 369, end: 379 },  // SECTION 8 - 이메일 제목 형식

  // Strategy subsections (SECTION 9)
  'strategy-A':           { start: 383, end: 391 },
  'strategy-B':           { start: 392, end: 398 },
  'strategy-C':           { start: 399, end: 404 },
  'strategy-D':           { start: 405, end: 412 },
  'strategy-E':           { start: 413, end: 420 },
  'strategy-F':           { start: 421, end: 425 },
  'strategy-G':           { start: 426, end: 435 },
  'strategy-H':           { start: 436, end: 449 },
  'strategy-I':           { start: 450, end: 458 },
  'strategy-J':           { start: 459, end: 463 },
  'strategy-K':           { start: 464, end: 469 },
  'strategy-L':           { start: 470, end: 474 },

  // Analytical sections
  'classification':       { start: 554, end: 598 },  // SECTION 11 - 분류 엔진
  'service-recommendation': { start: 599, end: 684 },// SECTION 12 - 서비스 추천 매트릭스
  'lifecycle':            { start: 685, end: 753 },   // SECTION 13 - 생애주기 관리
  'objection-handling':   { start: 754, end: 841 },   // SECTION 14 - 반론/거절 대응
  'followup-cadence':     { start: 841, end: 886 },   // SECTION 15 - 팔로업 케이던스 시스템 (Phase 4)
  'tone-calibration':     { start: 888, end: 930 },   // SECTION 16 - 톤 캘리브레이션

  // Industry playbooks (SECTION 18)
  'industry-fnb':         { start: 978, end: 983 },
  'industry-beauty':      { start: 985, end: 990 },
  'industry-liquor':      { start: 992, end: 997 },
  'industry-it':          { start: 999, end: 1004 },
  'industry-furniture':   { start: 1006, end: 1010 },
  'industry-overseas':    { start: 1012, end: 1017 },

  // Templates and checklists
  'proposal-template':    { start: 1019, end: 1073 }, // SECTION 19 - 제안서 템플릿
  'quality-checklist':    { start: 1074, end: 1113 }, // SECTION 20 - 품질 체크리스트
};

/** Default path to the v4 ULTRA system prompt file */
const DEFAULT_PROMPT_PATH = 'system/v4_ULTRA_SYSTEM_PROMPT.md';

/**
 * Load specific sections from v4 ULTRA system prompt by their IDs.
 * Invalid section IDs are silently skipped.
 *
 * @param sectionIds - Array of section keys from SECTION_MAP
 * @param filePath - Optional override for the prompt file path (for testing)
 * @returns Extracted sections joined by separator
 */
export function loadSections(sectionIds: string[], filePath?: string): string {
  const resolvedPath = resolve(filePath ?? DEFAULT_PROMPT_PATH);
  const content = readFileSync(resolvedPath, 'utf-8');
  const lines = content.split('\n');

  const sections: string[] = [];

  for (const id of sectionIds) {
    const range = SECTION_MAP[id];
    if (!range) {
      // Silently skip unknown section IDs
      continue;
    }
    // Line numbers are 1-indexed; slice is 0-indexed
    const extracted = lines.slice(range.start - 1, range.end).join('\n');
    if (extracted.trim()) {
      sections.push(extracted);
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Determine which v4 ULTRA sections to load based on a classification result.
 *
 * Always includes: persona, email-rules-kr, subject-format, tone-calibration, quality-checklist
 * Dynamically adds: strategy-specific, language-specific, industry-specific,
 *                    pricing-related, and objection-handling sections.
 *
 * @param result - Output from the classification engine
 * @returns Array of section IDs to pass to loadSections()
 */
export function getSectionsForClassification(result: ClassificationResult): string[] {
  // Base sections always loaded
  const sections: string[] = [
    'persona',
    'email-rules-kr',
    'subject-format',
    'tone-calibration',
    'quality-checklist',
  ];

  // Strategy-specific section
  sections.push(`strategy-${result.strategy}`);

  // Language-specific: add English rules for non-Korean emails
  if (result.language !== 'korean') {
    sections.push('email-rules-en');
  }

  // Industry playbook if industry is specified
  if (result.industry) {
    sections.push(`industry-${result.industry}`);
  }

  // Service recommendation when pricing is involved
  if (result.hasPricing) {
    sections.push('service-recommendation');
  }

  // Objection handling when objections are detected
  if (result.hasObjection) {
    sections.push('objection-handling');
  }

  return sections;
}
