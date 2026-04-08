import { describe, it, expect } from 'vitest';
import { loadSections, getSectionsForClassification, SECTION_MAP } from './prompt-loader.js';
import type { ClassificationResult } from '../types/classification.js';

describe('prompt-loader', () => {
  describe('loadSections', () => {
    it('loads persona and email-rules-kr sections with correct content', () => {
      const result = loadSections(['persona', 'email-rules-kr']);

      // SECTION 1 content
      expect(result).toContain('SECTION 1');
      expect(result).toContain('나는 최영록이다');

      // SECTION 6 content
      expect(result).toContain('SECTION 6');
      expect(result).toContain('이메일 작성 규칙');

      // Sections joined by separator
      expect(result).toContain('---');
    });

    it('silently skips invalid section IDs', () => {
      const result = loadSections(['persona', 'nonexistent-section', 'email-rules-kr']);

      // Should still have persona and email-rules-kr content
      expect(result).toContain('SECTION 1');
      expect(result).toContain('SECTION 6');

      // Should not throw or include error text
      expect(result).not.toContain('nonexistent');
    });
  });

  describe('getSectionsForClassification', () => {
    const baseClassification: ClassificationResult = {
      strategy: 'A',
      language: 'korean',
      toneLevel: 3,
      urgency: 'normal',
      isNewClient: true,
      hasPricing: false,
      hasObjection: false,
    };

    it('includes strategy-A section for strategy A', () => {
      const sections = getSectionsForClassification({ ...baseClassification, strategy: 'A' });
      expect(sections).toContain('strategy-A');
    });

    it('includes service-recommendation when hasPricing is true', () => {
      const sections = getSectionsForClassification({ ...baseClassification, hasPricing: true });
      expect(sections).toContain('service-recommendation');
    });

    it('includes email-rules-en when language is english', () => {
      const sections = getSectionsForClassification({ ...baseClassification, language: 'english' });
      expect(sections).toContain('email-rules-en');
    });

    it('includes industry-beauty when industry is beauty', () => {
      const sections = getSectionsForClassification({ ...baseClassification, industry: 'beauty' });
      expect(sections).toContain('industry-beauty');
    });

    it('always includes base sections: persona, email-rules-kr, subject-format, tone-calibration, quality-checklist', () => {
      const sections = getSectionsForClassification(baseClassification);
      expect(sections).toContain('persona');
      expect(sections).toContain('email-rules-kr');
      expect(sections).toContain('subject-format');
      expect(sections).toContain('tone-calibration');
      expect(sections).toContain('quality-checklist');
    });

    it('includes objection-handling when hasObjection is true', () => {
      const sections = getSectionsForClassification({ ...baseClassification, hasObjection: true });
      expect(sections).toContain('objection-handling');
    });
  });
});
