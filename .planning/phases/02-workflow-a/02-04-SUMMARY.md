---
phase: 02-workflow-a
plan: 04
subsystem: workflow
tags: [typescript, email-composition, gmail-mcp, draft-creator, html-sanitizer, di-pattern, vitest, tdd]

requires:
  - phase: 01-foundation
    provides: "SQLite DB schema (Client, ServiceRecommendation types), gmail-sanitizer.ts"
  - phase: 02-workflow-a
    plan: 01
    provides: "ClassificationResult type, MarketResearchResult schema, EmailDraft type, loadSections/getSectionsForClassification"
  - phase: 02-workflow-a
    plan: 03
    provides: "EMAIL_SIGNATURE_HTML, INTRO_LINKS_HTML, MANDATORY_CC constants, generateSubject function"
provides:
  - "buildEmailPrompt() for structured AI prompt construction (system + user message)"
  - "composeEmail() for combining AI body with immutable signature/links/CC"
  - "createDraft() for Gmail MCP draft creation with sanitize + CC enforcement"
  - "createRevisionDraft() for new draft creation preserving original draftId"
  - "GmailToolFn type for DI-based Gmail MCP tool injection"
affects: [02-05]

tech-stack:
  added: []
  patterns: ["DI pattern for Gmail MCP tool (GmailToolFn injection)", "Immutable CC merge with deduplication", "Forced sanitization at draft creation boundary"]

key-files:
  created:
    - src/workflow/compose.ts
    - src/workflow/compose.test.ts
    - src/workflow/draft-creator.ts
    - src/workflow/draft-creator.test.ts
  modified: []

key-decisions:
  - "composeEmail does not call AI directly; it prepares prompt + assembles fixed blocks, AI invocation deferred to workflow orchestrator (Plan 05)"
  - "sanitizeForGmail called inside createDraft (not by caller) making it impossible to bypass (T-02-12)"
  - "MANDATORY_CC merged with deduplication so extra CCs can be added without duplicating mandatory ones"
  - "createRevisionDraft creates new draft via createDraft internally, sharing all safety guarantees"

patterns-established:
  - "DI pattern for external tools: GmailToolFn injected as parameter for testability"
  - "Forced safety at trust boundary: sanitization + CC enforcement inside createDraft, not optional"
  - "Revision audit trail: previousDraftId preserved for tracking modification history"

requirements-completed: [EMAIL-01, EMAIL-08, EMAIL-09, APPR-01, APPR-02]

duration: 4min
completed: 2026-04-08
---

# Phase 2 Plan 04: Email Composition + Gmail Draft Creator Summary

**Email prompt builder with structured AI context assembly, fixed HTML block combination (signature/links), and Gmail MCP draft creator with forced sanitization + CC enforcement + revision audit trail**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T05:20:14Z
- **Completed:** 2026-04-08T05:23:48Z
- **Tasks:** 2 (TDD: RED + GREEN each)
- **Files modified:** 4

## Accomplishments
- Built email prompt builder that structures classification, research, recommendations, and inquiry into AI-ready system+user prompt pair
- Implemented email composer that appends immutable signature HTML (always) and intro links HTML (strategy A only) to AI-generated body
- Created Gmail MCP draft creator with forced sanitization (T-02-12) and mandatory CC enforcement (T-02-10)
- Built revision draft creator that preserves original draftId for audit trail (T-02-11, D-12)
- All 15 tests passing across both modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Email composition (prompt builder + HTML combination)** - `36490ad` (feat)
2. **Task 2: Gmail MCP draft creator + revision draft** - `f32193c` (feat)

## Files Created/Modified
- `src/workflow/compose.ts` - buildEmailPrompt (system+user prompt assembly), composeEmail (AI body + fixed blocks)
- `src/workflow/compose.test.ts` - 8 tests: prompt structure (4) + composition with fixed blocks (4)
- `src/workflow/draft-creator.ts` - createDraft (sanitize+CC+Gmail MCP), createRevisionDraft (new draft preserving original)
- `src/workflow/draft-creator.test.ts` - 7 tests: sanitize (1) + CC enforcement (2) + threadId (2) + revision (2)

## Decisions Made
- composeEmail does not invoke AI -- it prepares the prompt and assembles fixed blocks; AI call happens in workflow-a.ts orchestrator (Plan 05)
- sanitizeForGmail is called inside createDraft, not by the caller, making bypass impossible (threat T-02-12 mitigation)
- MANDATORY_CC is merged with input CC using Set deduplication, allowing additional CCs without creating duplicates
- createRevisionDraft delegates to createDraft internally, inheriting all safety guarantees (sanitization, CC enforcement)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- compose.ts exports ready for workflow-a.ts orchestrator (Plan 05) to call buildEmailPrompt + composeEmail
- draft-creator.ts exports ready for workflow-a.ts to call createDraft/createRevisionDraft with Gmail MCP tool
- GmailToolFn type ready for production wrapping of gmail_create_draft MCP tool
- All threat mitigations (T-02-09 through T-02-12) implemented and verified

---
*Phase: 02-workflow-a*
*Completed: 2026-04-08*
