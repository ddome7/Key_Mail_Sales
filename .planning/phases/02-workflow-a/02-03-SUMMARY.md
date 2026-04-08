---
phase: 02-workflow-a
plan: 03
subsystem: workflow
tags: [typescript, classification-engine, quality-checklist, objection-detection, lifecycle-mapping, vitest, tdd]

requires:
  - phase: 01-foundation
    provides: "pipeline.ts (getDealByCompany, Stage type), services.ts (createServiceQueries), price-validator.ts, gmail-sanitizer.ts"
  - phase: 02-workflow-a
    plan: 01
    provides: "ClassificationResult type, QualityCheckResult type, Strategy/ToneLevel/Language/Urgency types"
provides:
  - "classifyInquiry() 4-stage decision tree for email strategy/tone/language/urgency"
  - "detectObjection() 5-scenario objection/rejection detection"
  - "mapStageToTone() lifecycle-to-tone-level mapping"
  - "getServiceRecommendation() budget tier + industry service mix lookup"
  - "validateQualityChecklist() 11-item pre-send quality gate"
  - "generateSubject() SECTION 8 email subject format"
  - "EMAIL_SIGNATURE_HTML, INTRO_LINKS_HTML, MANDATORY_CC fixed constants"
affects: [02-04, 02-05]

tech-stack:
  added: []
  patterns: ["Keyword-based classification with strategy priority chain", "Immutable HTML constants for tamper-proof email blocks (T-02-06)"]

key-files:
  created:
    - src/workflow/classify.ts
    - src/workflow/classify.test.ts
    - src/workflow/quality-checker.ts
    - src/workflow/quality-checker.test.ts
  modified: []

key-decisions:
  - "Objection detection uses substring matching with '지금은 아닌' variant added for Korean morphological completeness"
  - "Quality checklist check 8 (CC) is always a warning since draft-creator handles CC injection"
  - "Fixed HTML blocks are exported constants, not AI-generated, preventing T-02-06 tampering"

patterns-established:
  - "DI pattern for classification: getDealByCompanyFn passed as optional parameter for testability"
  - "Quality gate pattern: failures block sending, warnings are advisory"
  - "Immutable HTML constants: signature, links, CC defined as const exports"

requirements-completed: [EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06, EMAIL-07, EMAIL-10, EMAIL-11, APPR-03, OBJC-01, OBJC-02, OBJC-03]

duration: 4min
completed: 2026-04-08
---

# Phase 2 Plan 03: Classification Engine + Quality Checklist Summary

**4-stage email classification engine with 5-scenario objection detection, lifecycle tone mapping, and 11-item quality checklist with immutable HTML signature/link blocks**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T05:13:14Z
- **Completed:** 2026-04-08T05:17:48Z
- **Tasks:** 2 (TDD: RED + GREEN each)
- **Files modified:** 4

## Accomplishments
- Built classification engine with 4-stage decision tree: client status, strategy (A~L), language detection, urgency detection
- Implemented 5-scenario objection detection covering cost, competitor, timing, effectiveness, and rejection patterns
- Created 11-item quality checklist that validates signature, dangerous chars, pricing warnings, HTML format, subject format, and more
- Defined immutable HTML constants (signature, intro links, CC) preventing AI tampering (T-02-06 mitigation)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing classify tests** - `a438b3c` (test)
2. **Task 1 GREEN: Classification engine** - `44b15d8` (feat)
3. **Task 2 RED: Failing quality-checker tests** - `01535ba` (test)
4. **Task 2 GREEN: Quality checklist + subject generator** - `910f3e5` (feat)

## Files Created/Modified
- `src/workflow/classify.ts` - SECTION 11 classification engine: classifyInquiry, detectObjection, mapStageToTone, getServiceRecommendation
- `src/workflow/classify.test.ts` - 20 unit tests covering all classification functions
- `src/workflow/quality-checker.ts` - SECTION 20 quality checklist: validateQualityChecklist, generateSubject, fixed HTML blocks
- `src/workflow/quality-checker.test.ts` - 9 unit tests covering HTML blocks, quality validation, subject generation

## Decisions Made
- Added "지금은 아닌" as additional timing objection keyword — Korean morphology means "아닌" (adjective form) doesn't contain "아니" as substring since they're different Hangul syllable blocks
- Quality checklist check 8 (CC verification) is always a warning, not a failure, because CC injection happens in the draft-creator module (Plan 04)
- Fixed HTML blocks exported as immutable constants per T-02-06 threat mitigation — AI never generates signature or link content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added Korean morphological variant for timing objection keyword**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** "지금은 아니" keyword didn't match "지금은 아닌" because Korean Hangul syllable blocks "니" and "닌" are distinct Unicode characters
- **Fix:** Added "지금은 아닌" as additional keyword in timing objection group
- **Files modified:** src/workflow/classify.ts
- **Verification:** Test "지금은 아닌 것 같습니다" now correctly detected as objection
- **Committed in:** 44b15d8 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Korean morphology fix necessary for correct objection detection. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- classify.ts exports ready for compose.ts (Plan 04) to determine which v4 ULTRA sections to load
- quality-checker.ts exports ready for compose.ts to validate generated emails before draft creation
- Fixed HTML blocks (signature, links, CC) ready for draft-creator (Plan 04/05) to append to emails
- All 29 tests passing across both modules

---
*Phase: 02-workflow-a*
*Completed: 2026-04-08*
