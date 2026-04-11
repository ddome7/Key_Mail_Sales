/**
 * ⚠️ PLACEHOLDER STUB for Plan 03-03 parallel execution.
 *
 * This file is intentionally a minimal type stub during parallel Wave 2 execution.
 * Plan 03-02 owns the real implementation (parseSlackCallMessage + ParsedCallSchema).
 * When 03-02 merges, the real implementation will replace this stub.
 *
 * The `ParsedCall` type contract defined here MUST stay in sync with
 * 03-02-PLAN.md `<interfaces>` section. If 03-02 changes the shape, update both.
 *
 * Do NOT add runtime logic here. Plan 03-03 only needs the `ParsedCall` type.
 */

export type ParsedCall = {
  source: 'ixio';
  shareType: '대화' | '통화';
  occurredAt: string; // ISO 8601 +09:00
  contact: {
    phone: string | null;
    companyName: string | null;
    contactName: string | null;
    contactTitle: string | null;
  };
  mainPoints: string[] | null;
  details: string[] | null;
  transcript: Array<{ speaker: 'me' | 'other'; text: string }> | null;
  rawText: string;
};

/**
 * Placeholder — Plan 03-02 provides the real parser.
 * This export exists so that imports don't break if any code references it
 * during parallel execution. It throws to prevent silent misuse.
 */
export function parseSlackCallMessage(_raw: string): never {
  throw new Error(
    'parseSlackCallMessage stub: real implementation is owned by Plan 03-02. ' +
      'If you see this error, the parallel merge did not complete correctly.',
  );
}
