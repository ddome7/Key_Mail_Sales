---
phase: 05-learning-loop
plan: 05
subsystem: workflow
tags: [learning-loop, orchestrator, report, batch, tdd]
dependency_graph:
  requires:
    - 05-01
    - 05-02
    - 05-03
    - 05-04
  provides:
    - runLearningLoop (D-16 batch orchestrator)
    - runLearnForClient (single-client primitive)
    - LearningLoopDependencies / LearningLoopResult types
    - renderLearningReport (D-17 Korean markdown report)
  affects:
    - src/workflow/learning-loop.ts
    - src/workflow/learning-report.ts
tech_stack:
  added: []
  patterns:
    - "per-iteration try-catch batch orchestration (workflow-c pattern replication)"
    - "4-subroutine sequential pipeline (LRNG-01~04)"
    - "Korean markdown report renderer (cadence-report pattern replication)"
key_files:
  created:
    - src/workflow/learning-loop.ts
    - src/workflow/learning-loop.test.ts
    - src/workflow/learning-report.ts
    - src/workflow/learning-report.test.ts
decisions:
  - "서비스 목록 추정은 touchpoint metadata.source에서 추출 (RESEARCH Pitfall 4: 부정확할 수 있으나 크로스셀은 제안일 뿐 자동 실행 아님)"
  - "engagementTrend는 v1에서 항상 'flat' (RESEARCH section 5)"
  - "LRNG-04는 email_received touchpoints의 스레드에서 외부 발신 메시지만 추출"
  - "빈 결과(clientsProcessed=0)일 때 '분석 대상 없음' 단축 보고서 반환"
metrics:
  duration: "4m 18s"
  completed: "2026-04-12T17:22:30+09:00"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 15
  files_created: 4
  files_modified: 0
---

# Phase 5 Plan 05: 학습 루프 오케스트레이터 + 보고서 렌더러 Summary

**한 줄 요약:** "학습 돌려줘" 단일 진입점 runLearningLoop가 4개 LRNG 서브루틴(이메일 성과 스캔, 수정 패턴 추출, 크로스셀 감지, 경쟁사 추출)을 순차 실행하고, renderLearningReport가 D-17 한국어 마크다운 보고서를 생성, 15개 테스트 전수 통과

## Performance

- **Duration:** 4분 18초
- **Started:** 2026-04-12T17:18:26Z
- **Completed:** 2026-04-12T17:22:30Z
- **Tasks:** 2/2
- **Files created:** 4

## 대표님께 보고

대표님, Phase 5 학습 루프의 **본체**를 완성했습니다!!

### 이게 뭔가요?

대표님이 "학습 돌려줘"라고 말씀하시면, 봇이 한 번에 4가지 학습을 자동으로 수행하는 기능입니다. 마치 리모컨의 "전원" 버튼처럼, 버튼 하나로 4개의 기기가 동시에 켜지는 것과 같습니다!

### 구체적으로 무엇을 하나요?

"학습 돌려줘" 한 마디로 아래 4단계가 자동으로 실행됩니다:

1. **이메일 성과 스캔 (LRNG-01)**: 보낸 이메일에 답장이 왔는지 자동 확인 + 성과 기록
2. **수정 패턴 추출 (LRNG-02)**: 봇의 초안과 대표님이 실제 보낸 이메일을 비교하여 수정 습관 학습
3. **크로스셀 기회 감지 (LRNG-03)**: "이 서비스를 하고 있으면 → 이 서비스도 제안" 타이밍 자동 감지
4. **경쟁사 정보 수집 (LRNG-04)**: 이메일 답장에서 경쟁사 관련 정보를 자동 추출

### 결과 보고서는 어떻게 나오나요?

학습이 끝나면 한국어 보고서가 자동으로 출력됩니다. 이런 형식입니다:

```
## 학습 루프 실행 결과 — 2026-04-10

### 이메일 성과 (LRNG-01)
- 신규 분석: 5건
- 기존 업데이트: 3건

### 수정 패턴 (LRNG-02)
- 발견: 8건 (수정됨: 6건, 수정 없음(양성): 2건)

### 크로스셀 기회 (LRNG-03)
| 거래처 | 현재 서비스 | 제안 서비스 | 타이밍 |
|--------|-------------|-------------|--------|
| 테스트회사 | 카페 바이럴 | 블로그 체험단 | 캠페인 2주차 |

### 시장 정보 (LRNG-04)
- 신규 수집: 4건

---
처리: 10개 거래처 / 실패: 1건
```

### 안전장치는?

- **거래처 하나가 실패해도 나머지는 정상 처리됩니다** — 10개 거래처 중 1개가 오류 나도, 나머지 9개는 계속 돌아갑니다
- **AI 없이도 동작합니다** — AI가 연결 안 되어 있으면 기본 모드로 동작 (오류 없음)
- **보안 규칙 준수** — 크로스셀 보고서에 경쟁사 단가를 직접 노출하지 않습니다

### 다음 단계는?

Wave 3(05-06)에서 CLI(명령줄)를 연결하면, 대표님이 실제로 "학습 돌려줘"라고 말씀하셨을 때 이 기능이 바로 실행됩니다!!

## Task Results

### Task 1: learning-loop 오케스트레이터 (TDD)
- **Commit:** `d1171b1`
- **Status:** DONE
- runLearnForClient: 4개 LRNG 서브루틴 순차 실행
- runLearningLoop: 활성 클라이언트 전수 배치 + per-client try-catch
- LearningLoopDependencies: AI DI 3종 optional (classifyOutcomeAI, summarizeDiff, extractCompetitor)
- 11개 테스트 통과 (10 scenarios + D-01 static grep)

### Task 2: learning-report 보고서 렌더러 (TDD)
- **Commit:** `1d5bd7c`
- **Status:** DONE
- renderLearningReport: D-17 형식 한국어 마크다운 보고서
- 4개 섹션: 이메일 성과 / 수정 패턴 / 크로스셀 기회 / 시장 정보
- 빈 크로스셀 → "감지된 기회 없음" fallback
- 전체 0 → "분석 대상 없음" 단축 보고서
- 4개 테스트 통과

## Files Created/Modified
- `src/workflow/learning-loop.ts` — 학습 루프 오케스트레이터 (372줄)
- `src/workflow/learning-loop.test.ts` — 오케스트레이터 테스트 11건
- `src/workflow/learning-report.ts` — 한국어 보고서 렌더러 (105줄)
- `src/workflow/learning-report.test.ts` — 렌더러 테스트 4건

## Decisions Made
- 서비스 목록 추정은 touchpoint metadata.source에서 추출. 정확하지 않을 수 있으나 크로스셀은 제안일 뿐 자동 실행 아님 (RESEARCH Pitfall 4)
- engagementTrend는 v1에서 항상 'flat' (RESEARCH section 5)
- LRNG-04는 email_received touchpoints의 Gmail 스레드에서 외부 발신 메시지만 추출
- 빈 결과(clientsProcessed=0)일 때 '분석 대상 없음' 단축 보고서 반환

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음 - 모든 함수가 실제 로직을 수행하며, stub/placeholder가 없습니다.

## Threat Flags

없음 - 계획된 threat model(T-05-11, T-05-12)에 따라 구현되었으며 새로운 위협 표면은 발견되지 않았습니다.

## Self-Check: PASSED

- All 4 source/test files verified on disk
- Commit d1171b1 verified in git log (learning-loop orchestrator)
- Commit 1d5bd7c verified in git log (learning-report renderer)
- learning-loop.ts: 372 lines (min 150 required)
- learning-report.ts: 105 lines (min 50 required)
- 15 tests passing across 2 modules
- D-01 grep clean: no forbidden scheduling keywords
