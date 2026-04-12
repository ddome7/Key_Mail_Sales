---
phase: 05-learning-loop
plan: 06
subsystem: workflow
tags: [learning-loop, cli, d-19, touchpoint-metadata, final-plan]
dependency_graph:
  requires:
    - 05-05
  provides:
    - scripts/run-learning-loop.ts (CLI entry point for "학습 돌려줘")
    - D-19 touchpoint metadata.originalBody (edit delta 기반 데이터)
  affects:
    - src/workflow/workflow-a.ts
    - src/workflow/workflow-b.ts
    - src/workflow/workflow-c.ts
    - scripts/run-learning-loop.ts
tech_stack:
  added: []
  patterns:
    - "run-workflow-c.ts CLI 패턴 복제 (DB 경로 해결, Gmail stub, 친절한 에러 안내)"
    - "metadata 속성 1줄 추가 (D-19 특수 예외, 로직 변경 없음)"
key_files:
  created:
    - scripts/run-learning-loop.ts
  modified:
    - src/workflow/workflow-a.ts
    - src/workflow/workflow-b.ts
    - src/workflow/workflow-c.ts
decisions:
  - "workflow-c.ts의 originalBody는 composeEmail 이전의 aiGeneratedBody 변수 사용 (compose 후 htmlBody와 동일하지 않을 수 있으므로 AI 원본을 보존)"
  - "CLI 단건 모드는 getActiveFollowupClients에서 companyName으로 filter 후 runLearnForClient 호출 (runLearningLoop batch와 독립)"
metrics:
  duration: "3m 42s"
  completed: "2026-04-12T17:29:28+09:00"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 0
  files_created: 1
  files_modified: 3
---

# Phase 5 Plan 06: CLI 진입점 + D-19 Touchpoint Metadata Summary

**한 줄 요약:** 학습 루프 CLI(scripts/run-learning-loop.ts)를 생성하고, workflow-a/b/c.ts의 createTouchpoint 4곳에 originalBody 메타데이터를 1줄씩 추가하여 edit delta 추출의 기반 데이터를 확보 -- 전체 프로젝트의 마지막 계획 완료!!

## Performance

- **Duration:** 3분 42초
- **Started:** 2026-04-12T17:25:46Z
- **Completed:** 2026-04-12T17:29:28Z
- **Tasks:** 2/2
- **Files created:** 1
- **Files modified:** 3

## 대표님께 보고

대표님, 드디어 **전체 프로젝트의 마지막 계획**을 완료했습니다!!

### 이번에 한 일 2가지

#### 1. "학습 돌려줘" 명령어 연결 (CLI 진입점)

지난번에 만든 학습 루프 본체(05-05)에 **명령줄 입구**를 연결했습니다. 이제 대표님이 "학습 돌려줘"라고 말씀하시면, 이 입구를 통해 학습 루프가 실행됩니다.

두 가지 모드가 있습니다:
- **전수 모드**: 그냥 실행하면 모든 활성 거래처를 한꺼번에 학습 분석합니다
- **단건 모드**: `--company 동반성장위원회` 이렇게 특정 회사 이름을 지정하면, 그 회사만 분석합니다

실행이 끝나면 한국어 보고서가 바로 화면에 출력됩니다. 이메일 성과, 수정 패턴, 크로스셀 기회, 경쟁사 정보 4가지를 한눈에 확인하실 수 있습니다!

#### 2. 이메일 원본 저장 장치 추가 (D-19)

봇이 이메일 초안을 만들 때, 그 **원본 내용을 기록**하도록 했습니다. 지금까지는 "어떤 이메일을 보냈는지"만 기록했는데, 이제는 "봇이 처음에 뭐라고 썼는지"도 함께 저장됩니다.

왜 이게 중요하냐면 -- 나중에 대표님이 초안을 수정해서 보내셨을 때, **봇 원본 vs 대표님 최종본**을 비교해서 "대표님이 어떤 부분을 자주 고치시는지" 학습할 수 있기 때문입니다. 이 데이터가 있어야 봇이 점점 더 대표님 스타일에 맞는 이메일을 쓸 수 있습니다!

수정은 아주 작습니다. 3개 파일(워크플로우 A, B, C)에 각각 1줄씩만 추가했고, 기존 로직은 전혀 건드리지 않았습니다. 기존 48개 테스트도 전부 통과합니다.

### 안전한가요?

- 기존 코드의 동작은 **하나도 바뀌지 않았습니다** -- 메타데이터(부가 정보)에 속성 1개를 추가한 것뿐입니다
- 이 원본 데이터는 로컬 DB에만 저장되며, 외부로 전송되지 않습니다
- 기존 48개 워크플로우 테스트 + 전체 테스트 모두 통과 확인했습니다

## Task Results

### Task 1: D-19 touchpoint metadata.originalBody 추가 (4곳)
- **Commit:** `b252647`
- **Status:** DONE
- workflow-a.ts L194: 초기 드래프트에 `originalBody: emailDraft.htmlBody` 추가
- workflow-a.ts L347: revision 드래프트에 `originalBody: revisedDraft.htmlBody` 추가
- workflow-b.ts L390: 후속 이메일에 `originalBody: emailDraft.htmlBody` 추가
- workflow-c.ts L514: 케이던스 팔로업에 `originalBody: aiGeneratedBody` 추가
- 기존 48개 workflow-a/b/c 테스트 전수 통과

### Task 2: CLI 진입점 scripts/run-learning-loop.ts
- **Commit:** `d99fbd4`
- **Status:** DONE
- 172줄, run-workflow-c.ts 패턴 복제
- --company <이름> 단건 모드, 플래그 없으면 전수 모드, --help 도움말
- Gmail MCP stub + AI DI 미주입 (deterministic 모드)
- D-01 준수: 스케줄링/타이머 관련 단어 없음 확인

## Files Created/Modified
- `scripts/run-learning-loop.ts` -- 학습 루프 CLI 진입점 (172줄)
- `src/workflow/workflow-a.ts` -- D-19 originalBody 2곳 추가
- `src/workflow/workflow-b.ts` -- D-19 originalBody 1곳 추가
- `src/workflow/workflow-c.ts` -- D-19 originalBody 1곳 추가

## Decisions Made
- workflow-c.ts의 originalBody는 composeEmail 이전의 aiGeneratedBody 변수 사용 (AI가 생성한 순수 원본 보존)
- CLI 단건 모드는 getActiveFollowupClients에서 companyName으로 filter 후 runLearnForClient 호출

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음 - CLI의 Gmail stub과 AI DI 미주입은 의도적 설계이며 (Claude Code 세션에서 실제 도구 주입 가능), 기능적 stub이 아닙니다.

## Threat Flags

없음 - 계획된 threat model(T-05-13, T-05-14)에 따라 구현되었으며 새로운 위협 표면은 발견되지 않았습니다.

## Self-Check: PASSED

- All 4 source files verified on disk
- Commit b252647 verified in git log (D-19 originalBody)
- Commit d99fbd4 verified in git log (CLI entry point)
- run-learning-loop.ts: 172 lines (min 50 required)
- originalBody count: workflow-a=2, workflow-b=1, workflow-c=1 (total 4 additions)
- 48 workflow-a/b/c tests passing
- D-01 grep clean: no forbidden scheduling keywords in CLI
