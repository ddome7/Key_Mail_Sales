/**
 * Classification types for the v4 ULTRA email classification engine (SECTION 11).
 * Shared contract for all Phase 2 workflow modules.
 */

export type Strategy = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export type ToneLevel = 1 | 2 | 3 | 4 | 5;

export type Language = 'korean' | 'english' | 'bilingual';

export type Urgency = 'ASAP' | 'normal' | 'low';

export interface ClassificationResult {
  strategy: Strategy;
  language: Language;
  toneLevel: ToneLevel;
  urgency: Urgency;
  isNewClient: boolean;
  industry?: string;
  hasPricing: boolean;
  hasObjection: boolean;  // OBJC-01 반론 감지 여부
}
