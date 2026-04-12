---
phase: 05-learning-loop
plan: 04
subsystem: workflow
tags: [competitor-intel, pattern-tracker, ai-extraction, email-patterns, tdd]
dependency_graph:
  requires:
    - 05-01
    - 05-02
  provides:
    - extractCompetitorIntel (AI 경쟁사 정보 추출)
    - scanEmailPatterns (이메일 성과 배치 스캔)
    - CompetitorIntelSchema (zod 검증 스키마)
    - COMPETITOR_EXTRACTION_TOOL_NAME
  affects:
    - src/workflow/competitor-intel-extractor.ts
    - src/workflow/pattern-tracker.ts
tech_stack:
  added: []
  patterns:
    - "AI DI optional pattern (graceful skip on absent)"
    - "boundary marker injection defense (T-05-08)"
    - "Phase 4 hasInboundSince reuse"
    - "classifyOutcomeDeterministic + classifyOutcomeWithAI chaining"
key_files:
  created:
    - src/workflow/competitor-intel-extractor.ts
    - src/workflow/competitor-intel-extractor.test.ts
    - src/workflow/pattern-tracker.ts
    - src/workflow/pattern-tracker.test.ts
  modified: []
decisions:
  - "extractFn DI 미주입 시 빈 결과 반환 (AI 없이 경쟁사 추출 불가 -> graceful skip)"
  - "source별 경계 마커 매핑: call_analysis->call_transcript, email_reply->email_content, market_research->market_research"
  - "pattern-tracker는 Phase A(신규 등록) + Phase B(pending 재판정) 2단계로 분리"
  - "bodyPreview 200자 절단, subjectLine에서 [draft] 접두사 제거"
metrics:
  duration: "4m 10s"
  completed: "2026-04-12T17:15:18+09:00"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 23
  files_created: 4
  files_modified: 0
---

# Phase 5 Plan 04: AI 연동 모듈 2종 (경쟁사 추출 + 이메일 성과 스캔) Summary

**한 줄 요약:** 통화/이메일에서 경쟁사 정보를 AI로 추출하는 competitor-intel-extractor + 이메일 답장 여부를 배치 스캔하여 성과 패턴을 기록하는 pattern-tracker, 23개 테스트 전수 통과

## 대표님께 보고

대표님, Phase 5 학습 루프의 **AI 연동 모듈 2종**을 완성했습니다!!

### 1. 경쟁사 정보 자동 추출기 (competitor-intel-extractor)

통화 녹취나 이메일 답장에서 **경쟁사 정보를 AI가 자동으로 찾아서 DB에 저장**하는 기능입니다.

예를 들어 통화 중 "다른 업체에서 1500만원에 해준다고 하더라고요"라는 말이 나오면:
- 경쟁사 이름: unknown (명시되지 않았으므로)
- 정보 유형: 가격 정보 (pricing)
- 상세 내용: "1500만원 견적 제시"
- 확신도: 확인됨 (confirmed)

이렇게 구조화해서 자동 저장합니다. 나중에 같은 업종의 다른 거래처에 대응할 때 "지난번에 이 업종에서 경쟁사가 이 가격을 제시했다"는 정보를 활용할 수 있게 됩니다!

**안전장치:**
- AI가 없을 때는 아무것도 추출하지 않고 조용히 넘어갑니다 (오류 없음)
- 같은 정보가 반복 저장되지 않도록 중복 체크 기능이 있습니다
- 통화/이메일 내용을 AI에게 전달할 때 특수한 "경계 표시"를 붙여서, AI가 내용을 지시로 오해하지 않도록 보안 처리했습니다

### 2. 이메일 성과 배치 스캐너 (pattern-tracker)

**보낸 이메일에 답장이 왔는지, 안 왔는지를 자동으로 확인해서 기록**하는 기능입니다.

작동 방식:
1. 특정 거래처에게 보낸 이메일 목록을 가져옵니다
2. 각 이메일의 Gmail 스레드를 확인하여 답장이 왔는지 체크합니다
3. 결과를 자동 분류합니다:
   - **답장 옴 (replied)**: 답장이 왔고, 며칠 만에 왔는지도 기록
   - **긍정 답장 (positive)**: AI가 답장 내용을 분석해서 "미팅 잡자", "견적 보내달라" 같은 긍정적 답장 판정
   - **부정 답장 (negative)**: "지금은 어렵습니다" 같은 거절/보류 답장
   - **대기 중 (pending)**: 아직 30일이 안 지나서 기다리는 중
   - **미응답 (no_reply)**: 30일 넘게 답장이 없어서 포기 판정

이 데이터가 쌓이면, "**F&B 업종에서 전략 E를 쓴 이메일은 답장률이 60%입니다**" 같은 통계를 낼 수 있게 됩니다. 봇이 다음에 이메일을 쓸 때 더 효과적인 전략을 자동으로 선택할 수 있게 되는 것입니다!

### 왜 했나요?

이 두 모듈은 Phase 5 학습 루프의 핵심 "데이터 수집 엔진"입니다. 대표님이 "학습 돌려줘"라고 하시면 이 모듈들이 자동으로 돌아가서 성과 데이터를 수집하고, 다음 이메일에 그 경험을 반영합니다.

### 결과는?

- 테스트 **23개 전체 통과** (경쟁사 추출 11개 + 이메일 성과 스캔 12개)
- 기존 Phase 1~4 코드 수정 없음 (Phase 4의 답장 감지 기능만 재사용)
- AI가 없어도 안전하게 동작 (기본 분류만 수행, AI가 있으면 더 정밀한 분류)

## Task Results

### Task 1: competitor-intel-extractor AI 추출기
- **Commit:** `6fff7f2`
- **Status:** DONE
- extractCompetitorIntel: AI DI optional, 미주입 시 graceful skip
- CompetitorIntelSchema: zod 검증 (pricing/service/strategy/weakness/general)
- 경계 마커: call_transcript / email_content / market_research (T-05-08)
- exists() 중복 체크 후 신규만 create
- 11개 테스트 통과

### Task 2: pattern-tracker 이메일 성과 배치 스캔
- **Commit:** `e97ff23`
- **Status:** DONE
- scanEmailPatterns: Phase A(신규 등록) + Phase B(pending 재판정) 2단계
- hasInboundSince 재사용 (Phase 4 inbound-detector)
- classifyOutcomeDeterministic + classifyOutcomeWithAI 체이닝
- Pitfall 6: getByTouchpointId로 중복 skip
- subjectLine "[드래프트]" 접두사 제거, bodyPreview 200자 절단
- 12개 테스트 통과

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음 - 모든 함수가 실제 로직을 구현하며, stub/placeholder가 없습니다.

## Threat Flags

없음 - 계획된 threat model(T-05-08, T-05-09, T-05-10)에 따라 구현되었으며 새로운 위협 표면은 발견되지 않았습니다.

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit 6fff7f2 verified in git log (competitor-intel-extractor)
- Commit e97ff23 verified in git log (pattern-tracker)
- competitor-intel-extractor.ts: 163 lines (min 60 required)
- pattern-tracker.ts: 234 lines (min 100 required)
- 23 tests passing across 2 modules
