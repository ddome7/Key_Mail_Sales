import { describe, it, expect } from 'vitest';
import { sanitizeForGmail, UNSAFE_CHAR_MAP, SAFE_CHARS, getSanitizationReport } from './gmail-sanitizer.js';

describe('Gmail Sanitizer', () => {
  describe('UNSAFE_CHAR_MAP', () => {
    it('should contain at least 14 entries', () => {
      expect(Object.keys(UNSAFE_CHAR_MAP).length).toBeGreaterThanOrEqual(14);
    });

    it('should include box drawing characters', () => {
      expect(UNSAFE_CHAR_MAP['\u2514']).toBeDefined(); // └
      expect(UNSAFE_CHAR_MAP['\u251C']).toBeDefined(); // ├
      expect(UNSAFE_CHAR_MAP['\u2500']).toBeDefined(); // ─
      expect(UNSAFE_CHAR_MAP['\u2502']).toBeDefined(); // │
      expect(UNSAFE_CHAR_MAP['\u2510']).toBeDefined(); // ┐
      expect(UNSAFE_CHAR_MAP['\u2518']).toBeDefined(); // ┘
      expect(UNSAFE_CHAR_MAP['\u250C']).toBeDefined(); // ┌
    });

    it('should include arrow character', () => {
      expect(UNSAFE_CHAR_MAP['\u2192']).toBeDefined(); // →
    });

    it('should include dash variants', () => {
      expect(UNSAFE_CHAR_MAP['\u2013']).toBe('-'); // – (en dash)
      expect(UNSAFE_CHAR_MAP['\u2014']).toBe('-'); // — (em dash)
    });

    it('should include smart quotes', () => {
      expect(UNSAFE_CHAR_MAP['\u2018']).toBe("'"); // '
      expect(UNSAFE_CHAR_MAP['\u2019']).toBe("'"); // '
      expect(UNSAFE_CHAR_MAP['\u201C']).toBe('"'); // "
      expect(UNSAFE_CHAR_MAP['\u201D']).toBe('"'); // "
    });
  });

  describe('SAFE_CHARS', () => {
    it('should contain at least 5 safe characters', () => {
      expect(SAFE_CHARS.length).toBeGreaterThanOrEqual(5);
    });

    it('should include standard safe characters', () => {
      expect(SAFE_CHARS).toContain('■');
      expect(SAFE_CHARS).toContain('●');
      expect(SAFE_CHARS).toContain('◎');
      expect(SAFE_CHARS).toContain('※');
      expect(SAFE_CHARS).toContain('★');
    });
  });

  describe('sanitizeForGmail', () => {
    it('should replace └ with dash', () => {
      expect(sanitizeForGmail('└ 세부항목')).toBe('- 세부항목');
    });

    it('should remove → (arrow)', () => {
      const result = sanitizeForGmail('→ 다음단계');
      expect(result).not.toContain('→');
      // → maps to empty string, so result is ' 다음단계'
      expect(result).toBe(' 다음단계');
    });

    it('should preserve ■ (safe char)', () => {
      expect(sanitizeForGmail('■ 제목')).toBe('■ 제목');
    });

    it('should preserve multiple safe chars', () => {
      expect(sanitizeForGmail('● 항목 ★ 중요')).toBe('● 항목 ★ 중요');
    });

    it('should not modify normal text', () => {
      expect(sanitizeForGmail('정상 텍스트')).toBe('정상 텍스트');
    });

    it('should replace all UNSAFE_CHAR_MAP keys with their values', () => {
      for (const [unsafe, safe] of Object.entries(UNSAFE_CHAR_MAP)) {
        const result = sanitizeForGmail(unsafe);
        expect(result).toBe(safe);
      }
    });

    it('should preserve all SAFE_CHARS unchanged', () => {
      for (const safeChar of SAFE_CHARS) {
        expect(sanitizeForGmail(safeChar)).toBe(safeChar);
      }
    });

    it('should handle mixed unsafe + safe + normal text', () => {
      const input = '■ 제목\n└ 세부항목\n● 항목 → 다음\n정상 텍스트';
      const result = sanitizeForGmail(input);
      expect(result).toContain('■ 제목');      // safe preserved
      expect(result).toContain('- 세부항목');   // └ replaced
      expect(result).toContain('● 항목');       // safe preserved
      expect(result).not.toContain('→');         // arrow removed
      expect(result).toContain('정상 텍스트');   // normal preserved
    });

    it('should handle empty string', () => {
      expect(sanitizeForGmail('')).toBe('');
    });

    it('should replace en-dash and em-dash with regular dash', () => {
      expect(sanitizeForGmail('가격 – 범위')).toBe('가격 - 범위');
      expect(sanitizeForGmail('설명 — 내용')).toBe('설명 - 내용');
    });

    it('should replace smart quotes with straight quotes', () => {
      expect(sanitizeForGmail('\u201C인용문\u201D')).toBe('"인용문"');
      expect(sanitizeForGmail('\u2018단어\u2019')).toBe("'단어'");
    });
  });

  describe('getSanitizationReport', () => {
    it('should report number of replacements', () => {
      const original = '└ 항목1\n└ 항목2\n→ 다음';
      const sanitized = sanitizeForGmail(original);
      const report = getSanitizationReport(original, sanitized);
      expect(report.totalReplacements).toBe(3);
    });

    it('should detail which chars were replaced', () => {
      const original = '└ 세부항목';
      const sanitized = sanitizeForGmail(original);
      const report = getSanitizationReport(original, sanitized);
      expect(report.details.length).toBeGreaterThan(0);
      const dashDetail = report.details.find(d => d.char === '└');
      expect(dashDetail).toBeDefined();
      expect(dashDetail!.count).toBe(1);
      expect(dashDetail!.replacement).toBe('-');
    });

    it('should return zero replacements for clean text', () => {
      const original = '정상 텍스트 ■ ●';
      const sanitized = sanitizeForGmail(original);
      const report = getSanitizationReport(original, sanitized);
      expect(report.totalReplacements).toBe(0);
      expect(report.details).toHaveLength(0);
    });
  });
});
