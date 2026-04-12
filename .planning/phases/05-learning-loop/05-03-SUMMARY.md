---
phase: 05-learning-loop
plan: 03
subsystem: workflow
tags: [edit-delta, gmail, html-strip, diff, learning-loop, tdd]

# Dependency graph
requires:
  - phase: 05-01
    provides: "editDeltas table + createEditDeltaQueries (create, getByTouchpointId)"
  - phase: 05-02
    provides: "email-outcome-classifier / cross-sell-detector / learning-prompt-injector 순수 함수"
provides:
  - "extractEditDeltas(clientId, deps) — 드래프트 원본 vs Gmail 발송본 비교 배치 추출기"
  - "stripHtmlForComparison(html) — HTML→플레인텍스트 정규화 + 서명 스트립"
  - "EditDeltaResult / EditDeltaExtractorDeps 타입"
affects: [05-learning-loop, learning-orchestrator, runLearningLoop]

# Tech tracking
tech-stack:
  added: []
  patterns: ["HTML signature stripping for comparison", "optional AI DI with deterministic fallback", "batch touchpoint processing with skip/warning tracking"]

key-files:
  created:
    - src/workflow/edit-delta-extractor.ts
    - src/workflow/edit-delta-extractor.test.ts

key-decisions:
  - "서명 블록 스트립을 regex 기반으로 구현 (---, Best regards, 감사합니다 패턴) — AI 요약이 서명 차이를 걸러낼 수 있으므로 완벽하지 않아도 허용"
  - "loadThread DI 미주입 시 빈 스레드 반환 → 전체 skip (테스트 환경 안전)"
  - "AI summarizeDiff DI 미주입 시 diffCategory='content', diffSummary='(AI 미사용)' fallback"

patterns-established:
  - "HTML 서명 스트립 패턴: stripHtmlForComparison으로 HTML→플레인텍스트 + 서명 제거 후 비교"
  - "배치 결과 추적 패턴: processed/unchanged/modified/skipped/warnings로 상세 결과 집계"

requirements-completed: [LRNG-02]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 5 Plan 03: Edit Delta 추출기 Summary

**Gmail 발송 이메일 원본/수정본 비교 배치 추출기 + HTML 서명 스트립 유틸리티, AI/deterministic dual-path diff 요약, 14개 테스트 전수 통과**

## Performance

- **Duration:** 4분
- **Started:** 2026-04-12T08:10:47Z
- **Completed:** 2026-04-12T08:14:36Z
- **Tasks:** 2
- **Files modified:** 2

## 대표님께 보고

대표님, Phase 5 학습 루프의 핵심 기능인 "수정 패턴 감지기"를 완성했습니다!!

### 이게 뭔가요?

봇이 이메일 초안(드래프트)을 만들면, 대표님이 검토하시고 필요한 부분을 수정한 후 발송하시잖아요. 이 기능은 **"봇이 만든 원본"과 "대표님이 수정해서 실제 보낸 최종본"을 자동으로 비교**해서, 대표님이 어떤 부분을 어떻게 고쳤는지 기록합니다.

### 구체적으로 어떻게 동작하나요?

1. **원본 확보**: 봇이 드래프트를 만들 때 원본을 저장해둡니다
2. **최종본 확보**: Gmail에서 실제 발송된 이메일을 읽어옵니다
3. **서명 제거**: 이메일 서명(이름, 연락처 등)은 비교에서 제외합니다 — 서명이 달라서 "수정됨"으로 잘못 판정되는 걸 방지합니다
4. **비교 판정**:
   - **수정 없음** → "이 스타일 OK!" 라는 양성 신호로 기록 (D-09)
   - **수정 있음** → AI가 "톤 변경", "가격 부분 삭제" 같이 요약해서 기록
5. **저장**: edit_deltas 테이블에 기록 → 다음에 비슷한 이메일 쓸 때 봇이 참고합니다

### 왜 중요한가요?

이 기능이 있으면 봇이 **대표님의 수정 습관을 학습**할 수 있습니다! 예를 들어:
- "공공기관에는 톤을 더 격식있게 바꾸는 경향" → 다음부터 봇이 알아서 격식체로 작성
- "가격을 먼저 언급하지 않는 스타일" → 다음부터 봇이 가격을 뒤로 빼서 작성

시간이 갈수록 봇의 이메일 품질이 대표님 스타일에 맞게 개선됩니다!!

### 결과

- 테스트 14개 모두 통과
- AI 없이도 동작 (AI가 없으면 "수동 확인 필요"로 표시)
- 중복 방지 기능 내장 (같은 이메일을 두 번 비교하지 않음)
- Gmail 연결 없이도 테스트 가능 (모든 외부 의존성을 주입 방식으로 설계)

## Accomplishments
- stripHtmlForComparison: HTML→플레인텍스트 정규화 + 서명 블록 스트립 (6개 테스트)
- extractEditDeltas: 배치 추출기 8개 시나리오 커버 (unchanged/modified/AI/no-AI/skip/batch)
- D-09 양성 신호: original===final → diffCategory='none' 기록
- DI 패턴으로 Gmail MCP, AI 요약 모두 optional 주입

## Task Commits

1. **Task 1: stripHtmlForComparison + TDD** - `f2cebf8` (test)
2. **Task 2: extractEditDeltas 배치 추출기** - `feff067` (feat)

## Files Created/Modified
- `src/workflow/edit-delta-extractor.ts` - Edit delta 추출기 + HTML 서명 스트립 유틸리티 (170+ 줄)
- `src/workflow/edit-delta-extractor.test.ts` - 14개 테스트 (stripHtml 6 + extractEditDeltas 8)

## Decisions Made
- 서명 스트립을 regex 기반 3가지 패턴(---, Best regards, 감사합니다)으로 구현. AI 요약이 서명 차이를 별도로 필터할 수 있으므로 완벽하지 않아도 허용
- loadThread DI 미주입 시 빈 스레드 반환 → skip 처리 (테스트 환경 안전)
- AI summarizeDiff 미주입 시 deterministic fallback: diffCategory='content', diffSummary='(AI 미사용 — 수동 확인 필요)'

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- extractEditDeltas가 준비되어 Wave 2의 학습 오케스트레이터(runLearningLoop)에서 LRNG-02 서브루틴으로 호출 가능
- 05-01의 editDeltaQueries와 완전 호환
- 14개 테스트가 regression 방지

## Known Stubs

없음 - 모든 함수가 실제 로직을 수행하며, placeholder/TODO가 없습니다.

## Threat Flags

없음 - 계획된 threat model(T-05-06, T-05-07)에 따라 구현되었으며 새로운 위협 표면은 발견되지 않았습니다.

## Self-Check: PASSED

- All 3 files verified present on disk (edit-delta-extractor.ts, .test.ts, 05-03-SUMMARY.md)
- Commit f2cebf8 verified in git log
- Commit feff067 verified in git log
- edit-delta-extractor.ts: 231 lines (exceeds min_lines: 80)
- 14 tests passing

---
*Phase: 05-learning-loop*
*Completed: 2026-04-12*
