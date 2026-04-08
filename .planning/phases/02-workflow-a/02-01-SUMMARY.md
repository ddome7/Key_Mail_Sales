---
phase: 02-workflow-a
plan: 01
subsystem: types, workflow
tags: [typescript, zod, prompt-loader, v4-ultra, section-extraction]

requires:
  - phase: 01-foundation
    provides: "SQLite DB schema (Client, Service types), Zod validation patterns, Vitest testing setup"
provides:
  - "ClassificationResult type (Strategy A~L, ToneLevel, Language, Urgency)"
  - "MarketResearchResult Zod schema for structured research data"
  - "EmailDraft, QualityCheckResult, InquiryInput, WorkflowResult types"
  - "loadSections() for selective v4 ULTRA section extraction"
  - "getSectionsForClassification() for dynamic section selection"
  - "SECTION_MAP with 28 verified line ranges"
affects: [02-02, 02-03, 02-04, 02-05]

tech-stack:
  added: []
  patterns: ["Selective prompt section loading by line ranges", "Classification-driven dynamic section selection"]

key-files:
  created:
    - src/types/classification.ts
    - src/types/research.ts
    - src/types/email.ts
    - src/workflow/prompt-loader.ts
    - src/workflow/prompt-loader.test.ts
  modified: []

key-decisions:
  - "Zod import from 'zod' (not 'zod/v4') matching Phase 1 pattern for zod 4.x compatibility"
  - "SECTION_MAP uses verified line numbers from actual v4 ULTRA file (1187 lines)"
  - "Strategy subsections extracted individually (A through L) for granular loading"
  - "Industry playbooks extracted individually (fnb, beauty, liquor, it, furniture, overseas)"

patterns-established:
  - "Selective section loading: SECTION_MAP line ranges + loadSections() for token budget management"
  - "Classification-driven section selection: getSectionsForClassification() returns dynamic section list"

requirements-completed: [EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-06, EMAIL-07, EMAIL-11]

duration: 3min
completed: 2026-04-08
---

# Phase 2 Plan 01: Shared Types + v4 ULTRA Selective Section Loader Summary

**3 shared type contracts (ClassificationResult, MarketResearchResult, EmailDraft) and v4 ULTRA selective section loader achieving 80.7% token savings over full prompt loading**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T05:04:06Z
- **Completed:** 2026-04-08T05:06:54Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Defined shared type contracts for all Phase 2 workflow modules (classification, research, email)
- Built selective section loader that extracts specific sections from v4 ULTRA (1187 lines) by line range
- Achieved 80.7% character savings (5,575 chars for base sections vs 28,890 total) exceeding the 76% target
- Dynamic section selection based on classification results (strategy, language, industry, pricing, objection)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests + type definitions** - `921c06c` (test)
2. **Task 1 GREEN: prompt-loader implementation** - `e8111a2` (feat)

## Files Created/Modified
- `src/types/classification.ts` - Strategy A~L, ToneLevel 1~5, Language, Urgency, ClassificationResult interface
- `src/types/research.ts` - MarketResearchResult Zod schema with company research fields
- `src/types/email.ts` - InquiryInput, EmailDraft, QualityCheckResult, WorkflowResult interfaces
- `src/workflow/prompt-loader.ts` - SECTION_MAP (28 sections), loadSections(), getSectionsForClassification()
- `src/workflow/prompt-loader.test.ts` - 8 test cases covering section loading and classification-driven selection

## Decisions Made
- Used `'zod'` import path (not `'zod/v4'`) to match Phase 1 convention with zod 4.x
- Verified all 28 SECTION_MAP line ranges against actual v4_ULTRA_SYSTEM_PROMPT.md file
- Individual strategy subsections (A~L) and industry playbooks extracted separately for granular control

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Zod import path**
- **Found during:** Task 1 (type definitions)
- **Issue:** Initially used `'zod/v4'` import but existing codebase uses `'zod'` for zod 4.x
- **Fix:** Changed import to `'zod'` matching Phase 1 pattern
- **Files modified:** src/types/research.ts
- **Verification:** TypeScript compilation and tests pass
- **Committed in:** 921c06c (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import path fix necessary for consistency with existing codebase. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All shared types are ready for Plan 02 (classify.ts), Plan 03 (research.ts), Plan 04 (compose.ts), Plan 05 (workflow-a.ts)
- prompt-loader.ts is ready for use by any module needing v4 ULTRA sections
- SECTION_MAP provides the verified line ranges needed by quality-checker.ts and compose.ts

---
*Phase: 02-workflow-a*
*Completed: 2026-04-08*
