---
phase: 04-workflow-c
plan: 07
subsystem: workflow/uat
tags: [workflow-c, uat, cadence, follow-up, dry-run, phase4, wave3, on-demand]
requirements:
  - FLLW-01
  - FLLW-02
  - FLLW-03
  - FLLW-04
dependency-graph:
  requires:
    - src/workflow/workflow-c.ts (04-05 — runWorkflowCForClient + WorkflowCDependencies)
    - src/workflow/cadence-report.ts (04-06 — renderSingleResult)
    - scripts/run-workflow-c.ts (04-06 — DI wiring pattern reference)
  provides:
    - scripts/_uat-workflow-c-dryrun.ts (gitignored — 3-scenario UAT dry-run)
    - .planning/phases/04-workflow-c/04-UAT.md (12-point UAT template, pending)
  affects:
    - /gsd-verify-work 4 (UAT 실행 시 이 스크립트와 템플릿 사용)
tech-stack:
  added: []
  patterns:
    - Phase 3 UAT 패턴 복제 (scripts/_uat-*.ts gitignored + 04-UAT.md committed)
    - Gmail MCP stub fallback (standalone vs Claude Code session)
    - 시나리오 분기 (--scenario 1|2|3 CLI flag)
    - DB 백업 자동화 (copyFileSync on UAT start)
key-files:
  created:
    - scripts/_uat-workflow-c-dryrun.ts (gitignored)
    - .planning/phases/04-workflow-c/04-UAT.md
  modified: []
decisions:
  - "Phase 3 UAT 패턴(03-UAT.md + scripts/_uat-*.ts) 그대로 복제하되, Workflow C 전용 3 시나리오 구조로 확장"
  - "Gmail MCP 도구 래퍼는 declare + typeof 패턴으로 stub/real 자동 분기 — Claude Code 세션 유무에 따라 동작 모드 결정"
  - "FLLW-04 수용 기준을 D-17 재해석(대표님 확인 후 전환)으로 문서화"
metrics:
  duration: "약 3분"
  completed: "2026-04-12"
  tasks: 1
  commits: 1
  files_created: 2
  files_modified: 0
---

# Phase 04 Plan 07: Workflow C UAT Dry-Run Script + 04-UAT.md Template Summary

Phase 4 실운영 검증을 위한 3-시나리오 UAT 스크립트(scripts/_uat-workflow-c-dryrun.ts, gitignored)와 12개 검증 포인트가 담긴 04-UAT.md 템플릿 작성. Phase 3 UAT 패턴(03-UAT.md)을 그대로 복제하되 Workflow C 전용 시나리오(성공/금기차단/Dormant)와 RESEARCH 오픈 질문 #5(labelIds) 관찰 섹션 추가.

## 대표님께 드리는 보고 (쉽게 풀어서)

**안녕하세요 대표님, Phase 4의 마지막 준비 작업 04-07 완료 보고드립니다!**

이번 플랜은 Phase 4 팔로업 자동화 시스템을 **실제 운영 환경에서 검증하기 위한 "시험 도구"와 "시험 기록지"**를 만드는 작업이었습니다.

### 1. "이 작업은 뭘 한 건가요?"

**비유하면 이렇습니다:** 04-05에서 세탁기 본체를, 04-06에서 버튼과 알림판을 만들었다면, 이번 04-07은 **"세탁기가 제대로 세탁하는지 테스트할 도구"**를 준비한 겁니다.

구체적으로 두 가지를 만들었어요.

**첫 번째 — 테스트 도구 (UAT 스크립트):**

3가지 시나리오로 테스트할 수 있는 스크립트입니다.

- **시나리오 1 (정상 작동):** 특정 회사에 대해 팔로업 이메일 드래프트가 제대로 만들어지는지 확인
- **시나리오 2 (안전 장치):** "답장 안 주시면 제안을 철회하겠습니다" 같은 **압박 표현이 자동 차단**되는지 확인
- **시나리오 3 (휴면 전환):** 30일 이상 연락 없는 회사를 **대표님 확인 후 휴면 처리**하는 플로우가 동작하는지 확인

실행 방법은 간단합니다:
```
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 1
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 2
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 3
```

**두 번째 — 시험 기록지 (04-UAT.md):**

각 시나리오의 "기대 결과"와 "실제 결과"를 비교 기록하는 양식입니다. 12개 검증 항목이 모두 [pending] 상태로 준비되어 있고, 실제 테스트를 진행하면 하나씩 채워나가게 됩니다. Phase 3 때 사용했던 03-UAT.md 양식을 그대로 복제했어요.

### 2. "이건 왜 필요했나요?"

04-05, 04-06에서 만든 코드는 **자동 테스트(단위 테스트)**로 로직이 맞는지 확인했지만, 실제로:

- Gmail에 드래프트가 진짜 생기는지
- 드래프트의 말투가 대표님 기준에 맞는지
- 압박 표현 차단이 실제 Gmail 환경에서도 동작하는지

이런 건 **실제 Gmail + 실제 DB로 직접 돌려봐야만** 알 수 있습니다. 그래서 이 "시험 도구"가 필요한 거예요. Phase 3에서도 이 방식으로 검증해서 성공했던 검증된 접근법입니다!

### 3. "안전 장치는 있나요?"

네, 여러 겹으로 준비했습니다.

1. **DB 자동 백업:** 테스트 시작하면 자동으로 DB를 복사해 둡니다. 문제가 생기면 원복 가능.
2. **드래프트 삭제 필수:** 테스트로 만든 Gmail 드래프트는 검증 후 반드시 수동 삭제합니다. 실수로 발송되는 일이 없도록.
3. **gitignore:** 이 테스트 스크립트는 저장소에 올라가지 않습니다. 실제 회사 데이터가 포함될 수 있으므로.

### 4. "다음 단계는요?"

**지금 만든 도구를 가지고 실제 테스트를 진행하면 Phase 4가 완성됩니다!** `/gsd-verify-work 4` 명령으로 3개 시나리오를 순서대로 실행하고, 대표님이 Gmail에서 드래프트를 직접 확인해 주시면 됩니다.

Phase 4 코드 작업은 이것으로 모두 완료이고, 남은 건 **실운영 검증만** 입니다. 거의 다 왔어요!!

---

## One-Liner

Workflow C UAT dry-run 스크립트(3-시나리오: 성공경로/금기차단/Dormant확인, Gmail MCP stub fallback, DB 자동 백업) + 04-UAT.md 12-point 검증 템플릿(Phase 3 03-UAT.md 구조 복제, RESEARCH #5 labelIds 관찰 섹션, FLLW-04 D-17 재해석 문서화).

## Architecture Context

Wave 3 마지막 플랜. Phase 4 코드 완성 후 실운영 검증 진입점.

```
scripts/_uat-workflow-c-dryrun.ts (이번 플랜, gitignored)
      │
      ├─ --scenario 1 → runWorkflowCForClient (04-05) → Gmail draft
      ├─ --scenario 2 → forbidden body DI → forbidden-phrase-guard 차단
      └─ --scenario 3 → askCeoDormantConfirmation DI → Dormant 전환
      │
      ▼
renderSingleResult (04-06) → 결과 출력
      │
      ▼
04-UAT.md (이번 플랜) ← 실측 결과 기록
```

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | fc48cef | feat | UAT dry-run script (gitignored) + 04-UAT.md template (12 points, all pending) |

## Deviations from Plan

None — plan 그대로 실행. 스크립트 생성 + 템플릿 작성만으로 구성된 자동 파트이므로 편차 없음.

## Known Stubs

| File | Location | Stub | Reason | Resolution |
|------|----------|------|--------|------------|
| scripts/_uat-workflow-c-dryrun.ts | buildGmailReadThreadTool (stub branch) | 빈 배열 `[]` 반환 | Claude Code 세션 외 실행 시 Gmail MCP 미접근 | Claude Code 세션에서 실행하면 실제 MCP 도구 자동 연결 |
| scripts/_uat-workflow-c-dryrun.ts | buildGmailDraftTool (stub branch) | `uat-stub-draft-N` 반환 | 동일 이유 | 동일 해결 |

## Self-Check: PASSED

- [x] scripts/_uat-workflow-c-dryrun.ts: FOUND (gitignored, local only)
- [x] .planning/phases/04-workflow-c/04-UAT.md: FOUND
- [x] Commit fc48cef: FOUND
- [x] 04-UAT.md has 12 testable scenarios (all [pending])
- [x] scripts/_uat-* gitignore rule confirmed in .gitignore line 9
