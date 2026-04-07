---
phase: 01-foundation
plan: 02
subsystem: safety
tags: [cross-contamination, price-validation, gmail-sanitizer, email-safety, korean-won-parsing]

requires:
  - phase: 01-foundation-plan-01
    provides: "SQLite DB with clients/services tables, createClientQueries/createServiceQueries DI factories"
provides:
  - Cross-contamination guard (loadClientContext, validateNoContamination)
  - Price validator with Korean won parsing (extractPricesFromText, validatePrices)
  - Gmail HTML encoding sanitizer (sanitizeForGmail, UNSAFE_CHAR_MAP, SAFE_CHARS, getSanitizationReport)
affects: [01-03-PLAN, phase-2-email-workflow, phase-3-automation]

tech-stack:
  added: []
  patterns: [unsafe-char-map-substitution, text-proximity-service-association, position-sorted-regex-extraction]

key-files:
  created:
    - src/safety/cross-contamination.ts
    - src/safety/cross-contamination.test.ts
    - src/safety/price-validator.ts
    - src/safety/price-validator.test.ts
    - src/safety/gmail-sanitizer.ts
    - src/safety/gmail-sanitizer.test.ts
  modified: []

key-decisions:
  - "Price extraction returns results sorted by text position, not by pattern type, for predictable ordering"
  - "validatePrices uses text proximity (50-char window) to associate prices with service names"
  - "validateNoContamination receives allKnownCompanies as parameter instead of querying DB directly"

patterns-established:
  - "Safety modules use DI pattern: receive query functions as parameters, not import DB directly"
  - "Korean won parsing: 억 -> 만 -> comma-separated -> simple, sorted by text position"
  - "Gmail sanitization as last step before email draft creation"

requirements-completed: [FOUND-03, FOUND-04, FOUND-05]

duration: 4min
completed: 2026-04-07
---

# Phase 1 Plan 2: Email Safety Guards Summary

**Cross-contamination prevention guard, Korean won price validator (만원/억/원 parsing), and Gmail unsafe character sanitizer (14 chars replaced, 9 preserved) with 38 tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-07T09:44:44Z
- **Completed:** 2026-04-07T09:49:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Cross-contamination guard that loads single client only and detects other company names in email text
- Price validator that parses Korean won formats (650,000원, 300만원, 1.5억) and compares against service DB base prices
- Gmail sanitizer that replaces 14 unsafe Unicode characters (box drawing, arrows, smart quotes) while preserving 9 safe characters
- 38 tests covering all safety functions with in-memory SQLite test databases

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-contamination guard + Price validator (RED)** - `573d6fe` (test)
2. **Task 1: Cross-contamination guard + Price validator (GREEN)** - `f9c58de` (feat)
3. **Task 2: Gmail sanitizer (RED)** - `db67c76` (test)
4. **Task 2: Gmail sanitizer (GREEN)** - `3703aac` (feat)

## Files Created/Modified
- `src/safety/cross-contamination.ts` - loadClientContext (single-client load), validateNoContamination (email text scan for other companies)
- `src/safety/cross-contamination.test.ts` - 6 tests: single-client load, B사 exclusion, non-existent client, contamination detection, clean email, multiple contaminations
- `src/safety/price-validator.ts` - extractPricesFromText (Korean won regex), validatePrices (DB comparison with text-proximity service matching)
- `src/safety/price-validator.test.ts` - 11 tests: comma-separated/만원/억 extraction, multiple prices, simple won, no prices, validatePrices match/mismatch/no-prices/warning-format
- `src/safety/gmail-sanitizer.ts` - sanitizeForGmail (14 unsafe char replacements), UNSAFE_CHAR_MAP, SAFE_CHARS, getSanitizationReport
- `src/safety/gmail-sanitizer.test.ts` - 21 tests: map completeness, safe char preservation, individual replacements, mixed text, empty string, report generation

## Decisions Made
- Price extraction results sorted by text position (not pattern type) for predictable ordering when multiple prices appear
- validatePrices uses 50-character text proximity window to associate prices with service names (simple heuristic sufficient for structured email content)
- validateNoContamination receives company list as parameter rather than querying DB -- keeps the module pure and testable, caller manages the list

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Price extraction ordering fix**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** extractPricesFromText returned results in pattern-type order (억 first, then 만, then 원) instead of text-position order. Test expected "650,000원" before "300만원" in mixed text.
- **Fix:** Added internal _position tracking using regex match.index, sort by position before return, strip internal field
- **Files modified:** src/safety/price-validator.ts
- **Verification:** All 17 price validator tests pass including multi-price ordering
- **Committed in:** f9c58de (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix ensures predictable ordering of extracted prices. No scope creep.

## Issues Encountered
None - all tasks executed smoothly after the ordering fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 safety guards ready for Phase 2 email composition workflow integration
- Cross-contamination guard ready to be called before email drafting
- Price validator ready to check email drafts against service DB
- Gmail sanitizer ready as final step before Gmail draft creation
- All 53 tests green (15 from Plan 01 + 38 from Plan 02)

## Self-Check: PASSED

---
*Phase: 01-foundation*
*Completed: 2026-04-07*
