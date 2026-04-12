---
phase: 05-learning-loop
plan: 02
subsystem: workflow
tags: [outcome-classifier, cross-sell, learning-loop, pure-functions, tdd]

# Dependency graph
requires:
  - phase: 04-followup
    provides: "cadence.ts / inbound-detector.ts / forbidden-phrase-guard.ts 순수 함수 패턴"
provides:
  - "classifyOutcomeDeterministic / classifyOutcomeWithAI (이메일 성과 5종 분류)"
  - "TRIGGER_MATRIX 상수 11개 + checkCrossSellOpportunities (크로스셀 감지)"
  - "injectLearningContext / buildLearningContext (학습 prompt 주입)"
affects: [05-learning-loop, learning-orchestrator, workflow-a-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns: ["optional DI for AI classification", "TRIGGER_MATRIX const-driven matching", "prompt append injection (D-18 compliant)"]

key-files:
  created:
    - src/workflow/email-outcome-classifier.ts
    - src/workflow/email-outcome-classifier.test.ts
    - src/workflow/cross-sell-detector.ts
    - src/workflow/cross-sell-detector.test.ts
    - src/workflow/learning-prompt-injector.ts
    - src/workflow/learning-prompt-injector.test.ts

key-decisions:
  - "TRIGGER_MATRIX 11개 규칙 v4 ULTRA section 17 원문 그대로 코드화 — 라이브 커머스 사전 버징은 v1에서 weeksElapsed >= 0 근사"
  - "classifyOutcomeWithAI는 optional DI 패턴으로 AI 미주입 시 안전하게 replied 반환"
  - "injectLearningContext는 compose.ts/follow-up-composer.ts 수정 없이 system prompt에 append (D-18 준수)"

patterns-established:
  - "optional DI 패턴: AI 분류 함수를 선택적으로 주입하여 순수 함수와 AI 세분화를 분리"
  - "TRIGGER_MATRIX 패턴: 비즈니스 규칙을 상수 배열로 코드화하고 timingCheck 함수로 조건 판정"
  - "prompt append 패턴: 기존 prompt builder 수정 없이 학습 컨텍스트를 뒤에 append"

requirements-completed: [LRNG-01, LRNG-03]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 5 Plan 02: 순수 함수 레이어 3종 Summary

**이메일 성과 5종 분류기 + v4 ULTRA section 17 크로스셀 11개 규칙 코드화 + 학습 prompt 주입기를 DB/AI 의존성 0인 순수 함수로 구현, 48개 테스트 전수 통과**

## Performance

- **Duration:** 5분
- **Started:** 2026-04-12T08:01:17Z
- **Completed:** 2026-04-12T08:05:59Z
- **Tasks:** 2
- **Files modified:** 6

## 대표님께 보고

대표님, Phase 5 학습 루프의 핵심 "두뇌" 모듈 3종을 만들었습니다!!

### 1. 이메일 성과 분류기 (email-outcome-classifier)
보낸 이메일에 답장이 왔는지, 안 왔는지를 자동으로 판정하는 기능입니다.
- **pending**: 아직 30일이 안 지났으니 기다리는 중
- **replied**: 답장이 왔음
- **no_reply**: 30일 넘게 답장이 없음 (포기 판정)
- **positive**: 답장 내용이 긍정적 (미팅 요청, 견적 요청 등)
- **negative**: 답장 내용이 거절/보류

이렇게 분류된 데이터가 쌓이면, "어떤 전략으로 보낸 이메일이 답장률이 높은지" 자동으로 알 수 있게 됩니다!

### 2. 크로스셀 감지기 (cross-sell-detector)
v4 ULTRA 프롬프트 section 17에 있는 "이 서비스를 하고 있으면 → 이 서비스를 추가로 제안해라" 규칙 11개를 코드로 만들었습니다. 예를 들어:
- 카페 바이럴 2주 진행 → "블로그 체험단도 같이 하시면 좋겠습니다" 자동 감지
- UGC 인플루언서 콘텐츠 업로드 후 → "2차 라이선스 + 퍼포먼스 광고" 제안 타이밍 감지
- 단일 캠페인 3회 이상 → "연간 리테이너 전환" 제안 타이밍 감지

### 3. 학습 프롬프트 주입기 (learning-prompt-injector)
봇이 이메일을 작성할 때, 과거에 쌓인 학습 데이터를 AI 프롬프트에 자동으로 넣어주는 기능입니다.
- "이 업종에서 전략 E를 쓰면 답장률 60%입니다" 같은 성과 데이터
- "대표님은 공공기관에게는 톤 레벨 3~4를 선호하십니다" 같은 수정 패턴
- "참고: 경쟁사 A가 1500만원에 제안한 적이 있습니다" 같은 시장 정보

기존에 만들어놓은 이메일 작성 코드(compose.ts, follow-up-composer.ts)는 한 줄도 건드리지 않았습니다!!

**48개 테스트 전수 통과 -- 안정적으로 동작합니다!!**

## Accomplishments
- 이메일 outcome 분류기: 5종 분류(pending/replied/no_reply/positive/negative) + AI 세분화 DI
- 크로스셀 트리거: v4 ULTRA section 17의 11개 규칙 전체 코드화 + 타이밍 판정
- 학습 prompt 주입: compose.ts 수정 없이 system prompt에 학습 데이터 append

## Task Commits

1. **Task 1: email-outcome-classifier + cross-sell-detector** - `f577078` (feat)
2. **Task 2: learning-prompt-injector** - `9f4b222` (feat)

## Files Created/Modified
- `src/workflow/email-outcome-classifier.ts` - 이메일 성과 5종 분류 순수 함수
- `src/workflow/email-outcome-classifier.test.ts` - 분류기 테스트 15건
- `src/workflow/cross-sell-detector.ts` - 크로스셀 트리거 매트릭스 11개 + 감지 함수
- `src/workflow/cross-sell-detector.test.ts` - 크로스셀 테스트 18건
- `src/workflow/learning-prompt-injector.ts` - 학습 컨텍스트 prompt 주입기
- `src/workflow/learning-prompt-injector.test.ts` - 주입기 테스트 15건

## Decisions Made
- TRIGGER_MATRIX 11개 규칙을 v4 ULTRA section 17 원문 그대로 코드화. "라이브 커머스 → 사전 버징"은 라이브 2주 전 타이밍이므로 v1에서는 weeksElapsed >= 0 으로 근사 (라이브 예정 시 항상 트리거)
- classifyOutcomeWithAI는 optional DI 패턴: AI 함수가 주입되지 않으면 'replied'를 그대로 반환하여 AI 없이도 안전하게 동작
- injectLearningContext는 기존 prompt builder 출력에 학습 데이터를 뒤에 붙이는 방식으로, compose.ts / follow-up-composer.ts 수정 불필요 (D-18 준수)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 3종 순수 함수 모듈이 준비되어 Wave 1의 edit-delta-extractor와 competitor-extractor가 이 모듈들을 import하여 사용 가능
- Wave 2의 학습 오케스트레이터(runLearningLoop)가 이 모듈들을 기반으로 전체 학습 파이프라인 조립 가능
- 48개 테스트가 안정적으로 통과하여 후속 개발 시 regression 방지

## Self-Check: PASSED

- All 6 source/test files verified on disk
- Commit f577078 verified in git log
- Commit 9f4b222 verified in git log
- 48 tests passing across 3 modules

---
*Phase: 05-learning-loop*
*Completed: 2026-04-12*
