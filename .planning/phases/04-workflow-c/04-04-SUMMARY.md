---
phase: 04-workflow-c
plan: 04
subsystem: workflow-a + workflow-b (Phase 2/3 오케스트레이터 touchpoint 기록부)
tags:
  - touchpoints
  - email_sent
  - D-04
  - surgical-edit
  - backward-compat
dependency-graph:
  requires:
    - 04-01 (touchpoints enum 확장 — 'email_sent' 값 사용 가능)
    - 02-* (workflow-a.ts Phase 2 완료)
    - 03-* (workflow-b.ts Phase 3 완료)
  provides:
    - neue Workflow A/B 실행 시 touchpoints에 type='email_sent' 레코드 적재
    - 04-05 workflow-c.ts가 getLastOutboundByClient 조회 시 신규 레코드를 outbound로 인식 가능
  affects:
    - src/workflow/workflow-a.ts (type 리터럴 2곳)
    - src/workflow/workflow-b.ts (type 리터럴 1곳 + 주석 1곳)
    - src/workflow/workflow-a.test.ts (assertion 2곳 + test name 2곳)
    - src/workflow/workflow-b.test.ts (assertion 1곳 + 주석 1곳)
tech-stack:
  added: []
  patterns:
    - "Phase 2/3 불변 원칙(D-12) 엄격 준수 — 리터럴 문자열만 교체, 로직 무변경"
    - "Legacy value 후방 호환 — touchpoints.test.ts 변경 없음으로 기존 'email' enum 조회 경로 보존"
key-files:
  created: []
  modified:
    - src/workflow/workflow-a.ts
    - src/workflow/workflow-a.test.ts
    - src/workflow/workflow-b.ts
    - src/workflow/workflow-b.test.ts
decisions:
  - "주석 내 legacy 'email' 언급은 정합성 차원에서 workflow-b.ts의 Step 9.5 1줄만 동기화, workflow-a.ts:49 설명 주석은 surgical edit 최소화 원칙으로 미변경(후속 문서 정비 플랜 대상)"
  - "touchpoints.test.ts는 legacy 'email' 후방 호환 검증 의의로 의도적으로 변경 없음"
  - "운영 DB 손실 0 증명은 main repo data/sales.db의 SELECT COUNT(*) WHERE type='email' 결과가 04-01 기준선(0)과 동일함으로 확인"
metrics:
  duration: "~6분"
  completed: 2026-04-12
  tasks: 1
  files_changed: 4
  lines_added: 10
  lines_removed: 10
  tests_passed: 40
  tests_failed: 0
requirements:
  - FLLW-01
---

# Phase 04 Plan 04: workflow-a/b email_sent 타입 전환 Summary

## 대표님께 드리는 보고 (쉬운 말로)

대표님, 04-04 단계를 깔끔하게 마무리했습니다. 이번 작업은 "외과수술"에 가까운 아주 작은 변경이었는데, 그 의미는 **대표님 세일즈봇이 팔로업 타이밍을 정확히 계산하는 데 꼭 필요한 기반** 작업이었습니다.

### 1. 왜 이 작업이 필요했나?

Phase 4에서 만드는 "팔로업 봇"은 클라이언트마다 "마지막으로 우리가 이메일을 보낸 시점"을 정확히 알아야 Day 3/7/14/30 팔로업 일정을 짤 수 있습니다. 그런데 기존 Phase 2/3 시스템은 이메일을 보낸 기록을 **touchpoints**(접촉 이력) 테이블에 `type='email'`이라는 이름으로 저장하고 있었습니다.

문제는 이 `'email'`이라는 이름이 **방향성이 없다**는 점입니다. 우리가 보낸 이메일인지, 상대방이 보낸 이메일인지 구분이 안 됩니다. 팔로업 봇은 "우리가 보낸 것(outbound)"만 보고 싶은데 말이죠.

그래서 04-01 단계에서 이미 `'email_sent'`(우리가 보낸 이메일)과 `'email_received'`(받은 이메일) 두 가지로 나눌 수 있도록 데이터베이스 구조를 확장해 뒀습니다. 이번 04-04는 그 확장된 구조를 **실제로 사용하기 시작하는** 작업입니다. Phase 2 워크플로 A와 Phase 3 워크플로 B가 이메일 드래프트를 만들 때마다, 앞으로는 `'email_sent'`라는 명확한 이름으로 기록을 남기게 됩니다.

### 2. 얼마나 작게 고쳤나?

자랑스럽게 말씀드릴 수 있는 부분입니다. 오직 **3곳의 문자열 단어 하나**만 바꿨습니다:

- `workflow-a.ts` 191번 줄: `'email'` → `'email_sent'` (드래프트 만들 때)
- `workflow-a.ts` 338번 줄: `'email'` → `'email_sent'` (드래프트 수정 요청 처리할 때)
- `workflow-b.ts` 383번 줄: `'email'` → `'email_sent'` (Phase 3 오케스트레이터 경로)

**총 변경 라인 수: +10 / -10**. 테스트 파일의 검증 문구까지 포함한 최종 수치입니다. Phase 2와 Phase 3의 로직은 한 줄도 건드리지 않았습니다(대표님이 강조하신 "기존 멀쩡한 부분은 절대 건드리지 말라" 원칙, 일명 D-12 Phase 2/3 불변 원칙을 엄격히 지켰습니다).

### 3. 과거 데이터는 안전한가?

네, **완벽하게 안전**합니다. 이 부분을 특별히 꼼꼼히 확인했습니다.

- 04-01 단계에서 데이터베이스 스키마를 확장할 때, `'email'`이라는 기존 값을 **제거하지 않고 유지**하도록 설계했습니다.
- 그래서 Phase 3 기간에 쌓인 과거 이메일 기록(만약 있었다면)은 `'email'` 이름 그대로 보존됩니다.
- 04-01에서 만든 `getLastOutboundByClient` 조회 함수는 `'email_sent'`와 `'email'`(legacy) **둘 다** 조회하도록 만들어져 있습니다. 즉, 과거 기록과 신규 기록 모두 팔로업 계산에 자연스럽게 포함됩니다.
- **운영 DB 손실 0 검증:** `data/sales.db`에서 `type='email'` 카운트를 이번 플랜 실행 전후로 비교했습니다. 결과 = **0 (변화 없음)**. 04-01 기준선과 완전히 동일합니다. (참고: 현재 main repo DB에는 아직 실제 레코드가 쌓이지 않아 기준선이 0입니다. 향후 실제 데이터가 쌓이면 이 검증 방법으로 계속 확인할 수 있습니다.)
- 후방 호환을 검증하는 테스트(`touchpoints.test.ts` 안의 `'email'` 리터럴을 쓰는 케이스들)는 **일부러 그대로 남겨뒀습니다**. 이 테스트들이 바로 "과거 데이터가 여전히 조회되는지"를 지키는 파수꾼 역할을 합니다.

### 4. 테스트는 전부 통과했나?

네, **40개 전부 GREEN**입니다.

- `workflow-a.test.ts`: 기존 Phase 2 테스트 전수 GREEN (assertion을 `'email_sent'` 기대값으로 2곳 업데이트)
- `workflow-b.test.ts`: 기존 Phase 3 테스트 전수 GREEN (assertion 1곳 업데이트)
- `touchpoints.test.ts`: 04-01에서 추가한 쿼리 테스트 + Phase 3 기존 테스트 전수 GREEN, 변경 없음

회귀(regression)는 0건입니다.

### 5. 다음 단계에 미치는 영향

이 작업 덕분에 다음 플랜 04-05(workflow-c.ts 오케스트레이터)가 "실제로 방금 보낸 이메일을 `getLastOutboundByClient`로 조회하면 제대로 걸려 나온다"는 것을 전제할 수 있습니다. 팔로업 봇이 "이 클라이언트는 3일 전에 우리가 이메일을 보냈구나 → Day 3 팔로업 후보" 같은 판단을 정확히 할 수 있게 되는 거죠.

요약하자면, 오늘의 작업은 "작지만 정확해야만 하는" 기초 공사였고, 계획대로 완벽히 처리됐습니다. 대표님, 다음 단계로 자신 있게 넘어가도 됩니다!!

## One-Liner

Phase 2/3 오케스트레이터(workflow-a/b)의 touchpoint 기록부에서 `type: 'email'` 리터럴 3곳을 `type: 'email_sent'`로 교체 — D-04 방향성 구분 이행, 로직 무변경, legacy 후방 호환 보존, 회귀 0.

## Architecture Context

### 변경 지점 (정확한 file:line 매핑)

| 파일 | 라인 | 변경 전 | 변경 후 | 비고 |
|------|------|---------|---------|------|
| `src/workflow/workflow-a.ts` | 191 | `type: 'email',` | `type: 'email_sent',` | 드래프트 최초 생성 경로 |
| `src/workflow/workflow-a.ts` | 338 | `type: 'email',` | `type: 'email_sent',` | handleRevisionRequest (수정 경로) |
| `src/workflow/workflow-b.ts` | 379 | `// Step 9.5: touchpoints('email') 기록` | `// Step 9.5: touchpoints('email_sent') 기록` | 정합성 차원 주석 동기화 |
| `src/workflow/workflow-b.ts` | 383 | `type: 'email',` | `type: 'email_sent',` | Phase 3 오케스트레이터 email 기록부 |
| `src/workflow/workflow-a.test.ts` | 251 | `... runWorkflowA가 email touchpoint를 기록한다` | `... runWorkflowA가 email_sent touchpoint를 기록한다` | test name 갱신 |
| `src/workflow/workflow-a.test.ts` | 263 | `expect(call.type).toBe('email');` | `expect(call.type).toBe('email_sent');` | assertion |
| `src/workflow/workflow-a.test.ts` | 272 | `... handleRevisionRequest도 email touchpoint를 기록한다 ...` | `... email_sent touchpoint를 기록한다 ...` | test name |
| `src/workflow/workflow-a.test.ts` | 295 | `expect(call.type).toBe('email');` | `expect(call.type).toBe('email_sent');` | assertion |
| `src/workflow/workflow-b.test.ts` | 295 | `// touchpoints: call + email = 2건` | `// touchpoints: call + email_sent = 2건` | 주석 |
| `src/workflow/workflow-b.test.ts` | 300 | `expect(tpCalls[1][0].type).toBe('email');` | `expect(tpCalls[1][0].type).toBe('email_sent');` | assertion |

**touchpoints.test.ts: 변경 없음** (legacy 'email' 후방 호환 테스트 보존 — `git diff src/queries/touchpoints.test.ts` = empty 확인)

### 데이터 흐름 변화

```
Before (Phase 2/3 구현):
 Workflow A/B 실행 → createDraft → touchpoints.createTouchpoint({ type: 'email', ... })
                                                                    ↑ 방향성 모호

After (04-04):
 Workflow A/B 실행 → createDraft → touchpoints.createTouchpoint({ type: 'email_sent', ... })
                                                                    ↑ outbound 명시
                                                                    ↑ legacy 'email'도 getLastOutboundByClient에서 같이 조회됨 (D-04 후방 호환)
```

### D-04 이행 경계

04-RESEARCH.md와 04-01 SUMMARY에서 D-04(touchpoints 방향성 enum 분리)는 2단계 이행으로 설계:
- **04-01 (스키마 단계):** enum 6값으로 확장, getLastOutboundByClient가 `['email_sent', 'email', 'call']` IN 조건으로 legacy 포함 조회
- **04-04 (실제 사용 단계):** 오케스트레이터가 신규 레코드를 `'email_sent'`로 적재 시작

이번 04-04가 그 두 번째 단계를 **최소 surgical edit으로** 이행했습니다.

## Implementation Details

### Task 1: workflow-a/b 3곳 + 테스트 5곳 업데이트 (`b9730bc`)

**What:**
- `workflow-a.ts`의 `touchpointQueries.createTouchpoint` 호출 2곳에서 `type: 'email'` → `type: 'email_sent'`
- `workflow-b.ts`의 `touchpointQueries.createTouchpoint` 호출 1곳에서 동일 교체 + 바로 위 Step 9.5 주석(`touchpoints('email') 기록` → `touchpoints('email_sent') 기록`) 동기화
- `workflow-a.test.ts`의 touchpoint assertion 2곳 + 관련 test name 2곳 업데이트
- `workflow-b.test.ts`의 touchpoint assertion 1곳 + inline 주석 1곳 업데이트

**Why:**
- 04-01의 getLastOutboundByClient가 기다리는 신규 방향성 enum `'email_sent'`를 오케스트레이터가 실제로 적재하기 시작해야 Phase 4 팔로업 파이프라인이 정상 동작한다.
- 로직/구조 변경 없이 리터럴 치환으로만 이행 가능한 이유: 04-01에서 enum을 **제거 없이 확장**했기 때문에 taype-level 호환성이 완벽히 보장된다.

**Regression:**
- workflow-a.test.ts 기존 27개 테스트 전수 GREEN (assertion 2곳 기대값 업데이트만)
- workflow-b.test.ts 기존 7개 테스트 전수 GREEN (assertion 1곳 + 주석)
- touchpoints.test.ts 6개 테스트 전수 GREEN (변경 없음, legacy 'email' 케이스 보존)
- 총 40 tests GREEN / 0 failed

**Commit:** `b9730bc` — `feat(04-04): migrate workflow-a/b to email_sent touchpoint type (D-04)`

## Verification Evidence

### 1. Scoped test run (전수 GREEN)

```bash
$ npx vitest run src/workflow/workflow-a.test.ts src/workflow/workflow-b.test.ts src/queries/touchpoints.test.ts

 RUN  v4.1.2 /Users/cyr/Desktop/Code/Sales/.claude/worktrees/agent-a17c47f9

 Test Files  3 passed (3)
      Tests  40 passed (40)
   Start at  02:05:59
   Duration  620ms
```

### 2. Diff 크기 (surgical edit 증명)

```bash
$ git diff --stat HEAD~1 src/workflow/
 src/workflow/workflow-a.test.ts | 8 ++++----
 src/workflow/workflow-a.ts      | 4 ++--
 src/workflow/workflow-b.test.ts | 4 ++--
 src/workflow/workflow-b.ts      | 4 ++--
 4 files changed, 10 insertions(+), 10 deletions(-)
```

성공 기준 `≤ 6 + production`에 대해 총 **+10/-10** (production: +4, test: +6) — surgical edit 범주 내.

### 3. legacy 'email' 리터럴 잔존 검증

```bash
$ grep -nE "'email'|\"email\"" src/workflow/
src/workflow/workflow-b.ts:16: *      9. createTouchpoint('email')       # 상단 파일 헤더 주석 — 로직 무관, 후속 문서 정비 대상
src/workflow/workflow-a.ts:49:   * 주입되면 ... type:'email' 터치포인트를 1건 기록한다.  # JSDoc 설명 — 로직 무관
```

production code의 활성 리터럴 교체는 완료. 상단 파일 헤더/JSDoc 주석 2건만 잔존하며 이는 로직 무관 문서라 plan의 "한 줄도 건드리지 않는다" 원칙 준수 차원에서 의도적으로 미변경.

### 4. 신규 `email_sent` 리터럴 분포

```bash
$ grep -n "email_sent" src/workflow/
src/workflow/workflow-a.ts:191:        type: 'email_sent',
src/workflow/workflow-a.ts:338:          type: 'email_sent',
src/workflow/workflow-b.ts:379:      // ─ Step 9.5: touchpoints('email_sent') 기록 (비치명적) ──
src/workflow/workflow-b.ts:383:          type: 'email_sent',
src/workflow/workflow-a.test.ts:251:  ... runWorkflowA가 email_sent touchpoint를 기록한다 ...
src/workflow/workflow-a.test.ts:263:    expect(call.type).toBe('email_sent');
src/workflow/workflow-a.test.ts:272:  ... handleRevisionRequest도 email_sent touchpoint를 기록한다 ...
src/workflow/workflow-a.test.ts:295:    expect(call.type).toBe('email_sent');
src/workflow/workflow-b.test.ts:295:    // touchpoints: call + email_sent = 2건
src/workflow/workflow-b.test.ts:300:    expect(tpCalls[1][0].type).toBe('email_sent');
```

모든 변경 지점이 기대 위치에 정확히 배치.

### 5. touchpoints.test.ts 변경 0 확인 (legacy 후방 호환 보존)

```bash
$ git diff HEAD~1 src/queries/touchpoints.test.ts
(empty output)
```

legacy 'email' 검증 케이스(line 72, 95)는 의도적으로 그대로 유지. Phase 3 데이터가 앞으로도 `getLastOutboundByClient`로 조회됨을 계속 검증한다.

### 6. 운영 DB 손실 0 증명

```bash
$ sqlite3 /Users/cyr/Desktop/Code/Sales/data/sales.db "SELECT COUNT(*) FROM touchpoints WHERE type='email';"
0
```

04-01 SUMMARY의 기준선 기록과 동일(0). 이번 플랜이 운영 DB에 쓰기를 하지 않았고, 마이그레이션은 이미 04-01에서 완료됐으므로 수치 변동 없음이 정상.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Minor cleanup] workflow-b.ts:379 주석 동기화**
- **Found during:** Task 1 실행 중 workflow-b.ts:383 type 리터럴 교체 작업
- **Issue:** 바로 위 라인 379의 주석이 `// Step 9.5: touchpoints('email') 기록 (비치명적)`로 남아있어, 아래 코드의 `'email_sent'`와 즉시 모순이 발생. 코드 읽는 사람 혼란 야기.
- **Fix:** 주석을 `touchpoints('email_sent') 기록`으로 업데이트. **로직 변경 아님, 문서 정합성만.**
- **Rationale:** deviations_policy의 Rule 2("변경 지점 **근처의** 주석 현대화 허용")에 정확히 부합. workflow-a.ts의 JSDoc 주석(line 49)과 workflow-b.ts 상단 헤더 주석(line 16)은 "변경 지점 근처"가 아니므로 건드리지 않음.
- **Files modified:** `src/workflow/workflow-b.ts` (1 line)
- **Commit:** `b9730bc` (atomic)

그 외 deviations 없음 — 플랜이 정의한 대로 정확히 실행.

## Deferred Items

**1. workflow-a.ts:49 JSDoc 주석의 `type:'email'` 표현**
- 이 주석은 `ensureInquiryAck` 함수의 JSDoc 문서화로, "변경 지점 근처"가 아닌 상단 섹션에 위치.
- 후속 문서 정비 플랜(또는 `/gsd-quick` 수준의 타이핑 정리)에서 `type:'email_sent'`로 동기화하면 됨.
- 로직/테스트 영향 0.

**2. workflow-b.ts:16 파일 헤더 주석의 `createTouchpoint('email')` 표현**
- Phase 3 워크플로 B 전체 9단계 요약 주석의 9번째 항목. 헤더 수준 위치라 "변경 지점 근처" 아님.
- 동일하게 후속 문서 정비 대상.

둘 다 의도적 deferral — "한 줄도 안 건드린다"는 D-12 원칙을 엄격히 지키기 위함.

## Self-Check

### Files exist verification

```bash
[ -f src/workflow/workflow-a.ts ] → FOUND
[ -f src/workflow/workflow-a.test.ts ] → FOUND
[ -f src/workflow/workflow-b.ts ] → FOUND
[ -f src/workflow/workflow-b.test.ts ] → FOUND
[ -f .planning/phases/04-workflow-c/04-04-SUMMARY.md ] → FOUND (this file)
```

### Commit exists verification

```bash
$ git log --oneline b9730bc
b9730bc feat(04-04): migrate workflow-a/b to email_sent touchpoint type (D-04)
→ FOUND
```

### Content-level verification

- `grep "type: 'email_sent'" src/workflow/workflow-a.ts` → 2 matches (line 191, 338) ✓
- `grep "type: 'email_sent'" src/workflow/workflow-b.ts` → 1 match (line 383) ✓
- `grep "expect.*toBe\('email_sent'\)" src/workflow/workflow-a.test.ts` → 2 matches ✓
- `grep "expect.*toBe\('email_sent'\)" src/workflow/workflow-b.test.ts` → 1 match ✓
- `git diff HEAD~1 src/queries/touchpoints.test.ts` → empty (legacy 보존) ✓
- Scoped vitest run → 40/40 passed ✓
- 운영 DB legacy 'email' count → 0 (04-01 기준선 동일) ✓

## Self-Check: PASSED

모든 변경이 계획대로 정확히 적용됐고, 테스트 회귀 0, 운영 데이터 손실 0, surgical edit 범위(총 20 라인) 준수.
