/**
 * Gmail HTML encoding safe character substitution.
 *
 * Certain Unicode characters (box drawing, arrows, smart quotes) render
 * incorrectly in Gmail HTML emails. This module provides a sanitizer
 * that replaces known-problematic characters with safe alternatives,
 * while preserving characters confirmed to render correctly.
 *
 * Based on: knowledge/email_patterns/실전_Gmail_인코딩_주의.md
 * and v4 ULTRA SECTION 6 Gmail rendering rules.
 */

export interface SanitizationDetail {
  char: string;
  count: number;
  replacement: string;
}

export interface SanitizationReport {
  totalReplacements: number;
  details: SanitizationDetail[];
}

/**
 * Mapping of unsafe characters to their safe replacements.
 * These characters are known to break or render incorrectly in Gmail HTML.
 */
export const UNSAFE_CHAR_MAP: Record<string, string> = {
  '\u2514': '-',     // └ (box drawing lower-left) -> dash
  '\u2192': '',      // → (rightwards arrow) -> remove
  '\u251C': '-',     // ├ (box drawing tee right) -> dash
  '\u2500': '-',     // ─ (box drawing horizontal) -> dash
  '\u2502': '|',     // │ (box drawing vertical) -> pipe
  '\u2510': '',      // ┐ (box drawing upper-right) -> remove
  '\u2518': '',      // ┘ (box drawing lower-right) -> remove
  '\u250C': '',      // ┌ (box drawing upper-left) -> remove
  '\u2013': '-',     // – (en dash) -> regular dash
  '\u2014': '-',     // — (em dash) -> regular dash
  '\u2018': "'",     // ' (left single quotation) -> apostrophe
  '\u2019': "'",     // ' (right single quotation) -> apostrophe
  '\u201C': '"',     // " (left double quotation) -> straight quote
  '\u201D': '"',     // " (right double quotation) -> straight quote
};

/**
 * Characters confirmed SAFE in Gmail HTML rendering.
 * These are explicitly NOT replaced by the sanitizer.
 */
export const SAFE_CHARS: string[] = [
  '■', '●', '◎', '※', '★',
  '①', '②', '③',
  '✅',
];

/**
 * Sanitize text for safe Gmail HTML rendering.
 * Replaces all unsafe characters with their safe alternatives.
 * Safe characters are preserved unchanged.
 *
 * @param html - Text/HTML content to sanitize
 * @returns Sanitized text safe for Gmail rendering
 */
export function sanitizeForGmail(html: string): string {
  let result = html;
  for (const [unsafe, safe] of Object.entries(UNSAFE_CHAR_MAP)) {
    result = result.replaceAll(unsafe, safe);
  }
  return result;
}

/**
 * Generate a report of what was changed during sanitization.
 *
 * @param original - Original text before sanitization
 * @param sanitized - Text after sanitization
 * @returns Report with total replacements and per-character details
 */
export function getSanitizationReport(
  original: string,
  sanitized: string,
): SanitizationReport {
  const details: SanitizationDetail[] = [];
  let totalReplacements = 0;

  for (const [unsafe, safe] of Object.entries(UNSAFE_CHAR_MAP)) {
    // Count occurrences of the unsafe char in original
    let count = 0;
    let index = original.indexOf(unsafe);
    while (index !== -1) {
      count++;
      index = original.indexOf(unsafe, index + 1);
    }

    if (count > 0) {
      totalReplacements += count;
      details.push({
        char: unsafe,
        count,
        replacement: safe,
      });
    }
  }

  return {
    totalReplacements,
    details,
  };
}
