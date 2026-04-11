---
phase: 04-workflow-c
plan: 02
subsystem: workflow/pure-functions
tags: [cadence, inbound-detection, forbidden-phrase, pure-functions, tdd]
requirements:
  - FLLW-01
  - FLLW-02
  - FLLW-03
dependency_graph:
  requires:
    - src/workflow/thread-loader.ts (ThreadMessage type-only import)
    - system/v4_ULTRA_SYSTEM_PROMPT.md §15 (cadence + forbidden phrases source of truth)
    - .planning/phases/04-workflow-c/04-CONTEXT.md (D-02, D-03, D-08, D-11, D-12, D-13, D-14, D-15, D-17)
  provides:
    - CADENCE_MATRIX (6 context types × milestones)
    - CadenceContextType union
    - CadenceStageResult interface
    - classifyCadenceContextDeterministic (keyword pre-filter)
    - computeCadenceStage (catch-up aware stage resolver)
    - TONE_INTENT_LABELS (Korean labels for reports)
    - OWN_EMAIL_DOMAINS (@puzl.co.kr)
    - isOwnMessage (case-insensitive domain match)
    - hasInboundSince (strict > comparison on internalDate)
    - FORBIDDEN_FOLLOWUP_PHRASES (14 blacklist entries)
    - ForbiddenPhraseCheckResult interface
    - validateNoForbiddenPhrases (substring validator)
  affects:
    - 04-03 follow-up-composer extension (Wave 1, will import CADENCE_MATRIX / CadenceStageResult)
    - 04-05 workflow-c orchestrator (Wave 2, will compose all three modules)
tech-stack:
  added: []
  patterns:
    - deterministic keyword classifier (classify.ts reuse pattern, no imports)
    - DI of Date via `now` parameter for test determinism
    - false-negative safe-default in inbound detection
key-files:
  created:
    - src/workflow/cadence.ts
    - src/workflow/cadence.test.ts
    - src/workflow/inbound-detector.ts
    - src/workflow/inbound-detector.test.ts
    - src/workflow/forbidden-phrase-guard.ts
    - src/workflow/forbidden-phrase-guard.test.ts
  modified: []
decisions:
  - "proposal cadence는 CONTEXT.md D-12 해석에 따라 [3, 7, 14, 30] 사용 — v4 ULTRA 본문(Day 14까지)보다 CONTEXT가 우선"
  - "catch-up 정책: 한 번 실행에 도달한 최대 milestone 1건만 반환. 지연된 팔로업 여러 건을 한 번에 발송하지 않음"
  - "executedStageIndices 판정은 max(executed)보다 큰 index만 후보 — 이미 더 높은 단계가 실행됐다면 낮은 단계로 되돌아가지 않음"
  - "inbound 감지는 from 헤더 자사 도메인 판정으로 SENT 라벨 대체 (ThreadMessage에 labelIds 없음)"
  - "from 헤더 누락 시 safe default = inbound 아님 (false-negative 선호)"
  - "forbidden-phrase 블랙리스트는 14개 엔트리로 v4 ULTRA §15 5대 카테고리 커버 (D-15 보수적 해석)"
metrics:
  completed: 2026-04-11
  tasks: 3
  test_cases: 100
  files_created: 6
  files_modified: 0
  commits: 3
---

# Phase 4 Plan 02: 순수 함수 레이어 (cadence + inbound-detector + forbidden-phrase-guard) Summary

팔로업 자동화의 결정론적 판정 3종 세트 — 케이던스 계산, 인바운드 감지, 금기 표현 검증 — 를 모두 순수 함수로 구현. DB/네트워크/AI 의존성 0, 총 100개 테스트 케이스 GREEN.

## 대표님께 드리는 보고 (쉬운 말 버전)

대표님, Phase 4 두 번째 플랜 완료 보고드립니다.

### 무엇을 만들었나요?

이번 플랜은 **"팔로업이 언제, 어떻게, 어떤 톤으로 나가야 하는지"를 판단하는 뇌의 기초 부분**을 만드는 작업이었습니다. 세 개의 작은 부품을 만들었는데요:

**1번 부품 — 케이던스 계산기 (`cadence.ts`)**

"이 클라이언트한테 마지막으로 이메일 보낸 게 N일 전이니까, 지금 몇 차 팔로업을 보내야 해?"를 결정하는 부품입니다. v4 ULTRA 프롬프트 §15에 대표님이 정해두신 규칙을 그대로 코드로 옮겼어요:

- **제안서 보낸 후:** Day 3 → 7 → 14 → 30 (총 4차)
- **계약서 보낸 후:** Day 2 → 5 (총 2차, 빠르게)
- **미팅 후 QnA:** Day 2 → 5 (총 2차, 모멘텀 유지)
- **견적 수정안 후:** Day 3 → 7 (총 2차)
- **크리에이터 아웃리치:** Day 2 → 5 → 10 (총 3차, 짧은 주기)
- **일반:** Day 3 → 7 → 14 → 30 (기본값)

이 부품은 "이 이메일이 제안서 보낸 건지, 계약서 보낸 건지, 미팅 후 QnA인지"를 키워드로 자동 분류해줍니다. 예를 들어 제목에 "계약서"가 들어있으면 계약 모드로, "제안서"가 들어있으면 제안 모드로 자동으로 구분해요. 이러면 AI를 호출하지 않고도 대부분의 케이스를 저렴하게 판단할 수 있어서 비용 절감 효과가 큽니다.

**catch-up 정책이 중요한데요** — 예를 들어 제안서 보낸 지 23일이 지났는데 그동안 팔로업을 한 번도 못 보냈다면, Day 3/7/14 팔로업을 몰아서 세 통 보내는 건 절대 금지입니다. "가장 최근 도달한 단계 하나만" 보냅니다. 즉 Day 14 팔로업만 딱 한 통. 상대방 메일함에 갑자기 세 통이 쌓이면 부담스럽고 관계가 망가지니까요. 대표님의 "따뜻한 리마인드" 철학 그대로입니다.

**2번 부품 — 인바운드 감지기 (`inbound-detector.ts`)**

"이 스레드에 내가 마지막으로 보낸 이후로, 상대방이 답장을 했나?"를 판단하는 부품입니다. 만약 답장이 이미 있었다면 팔로업을 보낼 필요가 없으니 **자동으로 케이던스를 중단**시키는 용도죠 (CONTEXT.md D-20 자동 차단 규칙).

원래는 Gmail이 주는 `INBOX`/`SENT` 라벨로 판단하려 했는데, 저희가 쓰는 Gmail MCP 도구 응답에는 그 라벨이 포함되지 않는 것을 Phase 3에서 확인했어요. 그래서 **"발신자 이메일이 @puzl.co.kr 도메인이면 우리 회사 발송"** 으로 대체했습니다. 대소문자는 무시하고요 (`cyr@puzl.co.kr`, `PM@puzl.co.kr`, `leader@puzl.co.kr` 모두 자동 인식).

**안전 기본값 원칙**이 있는데요 — 발신자 헤더가 비어있거나 이상하면 "인바운드 아님"으로 처리합니다. 이유: 잘못 판단하면 둘 중 하나가 발생하는데,
- A: 답장이 있었는데 인바운드를 놓치면 → 팔로업이 한 번 더 나감 (톤은 따뜻하니 민폐 수준은 낮음)
- B: 답장이 없었는데 인바운드로 오인하면 → 팔로업을 중단해버려서 상대방이 잊혀짐 (딜 유실)

A 쪽이 훨씬 안전하므로, 애매할 땐 무조건 A(팔로업 한 번 더)로 갑니다.

**3번 부품 — 금기 표현 검증기 (`forbidden-phrase-guard.ts`)**

v4 ULTRA 프롬프트 §15에 **"절대 하지 않는 것"** 으로 명시된 압박 표현들을 블랙리스트로 만들고, AI가 생성한 팔로업 본문에 이런 표현이 들어있으면 즉시 차단하는 부품입니다. 대표님이 세일즈 철학으로 늘 강조하시는 **"팔로업은 압박이 아니라 따뜻한 리마인드"** 원칙을 코드로 강제하는 거죠.

14개 블랙리스트 엔트리를 5대 카테고리로 나눠 만들었습니다:

| 카테고리 | 예시 표현 |
|---|---|
| 조건부 철회 암시 | "답장 안 주시면", "답변 없으시면", "회신 없으시면" |
| 철회/취소 언급 | "제안을 철회", "제안서를 철회", "견적을 철회", "견적서를 철회" |
| urgency 조작 | "마지막 기회", "이번이 정말 마지막", "마지막으로 한 번만" |
| 관계 단절 위협 | "더 이상 연락드리지 않", "더 이상 연락 안" |
| 정서 조작 | "실망스럽", "실망했" |

만약 AI가 실수로 "답장 안 주시면 제안을 철회하겠습니다" 같은 문장을 생성하면, 이 부품이 **두 개의 위반**(조건부 철회 + 제안 철회)을 동시에 감지해서 차단합니다. 한 번에 모든 위반을 리스트로 반환해서, 대표님이 "다시 작성" 버튼만 누르시면 되도록 만들었어요. 하나씩 고치는 게 아니라요.

### 어떻게 검증했나요?

**총 100개의 테스트를 작성해서 모두 통과했습니다.**

- 케이던스 계산기: **48개 테스트**
  - 6개 context type별 milestone 상수 검증
  - 키워드 분류기 9케이스 (제안서/계약서/미팅/견적/크리에이터/매칭실패/우선순위/빈입력/subject-only)
  - 단계 계산 24케이스 (경과일 0/2/3/8/15/31일, executedStageIndices 다양한 조합, clock skew 방어, 소수점 floor, 잘못된 ISO, catch-up 다양한 시나리오)
  - 모든 context type 파라미터화 스모크 테스트
- 인바운드 감지기: **19개 테스트**
  - 자사 도메인 판정 6케이스 (순수주소/display name/대문자/외부/빈문자열/다중)
  - 인바운드 검사 13케이스 (빈배열/정상 inbound/무 inbound/동시각 제외/이전 제외/빈 from/공백 from/다중 inbound/자사만/빈 internalDate/타입 호환)
- 금기 표현 검증기: **33개 테스트**
  - 블랙리스트 상수 4케이스 (길이/구조/중복/카테고리 커버)
  - 안전 본문 6케이스 (빈문자/인사/1차톤/2차톤/마지막톤/제안단어만)
  - 위반 검출 23케이스 (14개 엔트리 파라미터화 + 복합위반/마크업/null방어 등)

**순수 함수 원칙도 확인했습니다.** 세 파일 모두 데이터베이스 import, 네트워크 import, AI SDK import가 0건입니다. 완전한 pure TypeScript 함수라서, Wave 1/Wave 2의 상위 orchestrator가 AI 주입 없이도 이 로직들을 완벽히 테스트할 수 있어요.

### 병렬 실행 이야기

이번 플랜은 플랜 04-01과 **동시에 병렬로 실행**되었습니다. 04-01은 데이터베이스 스키마 쪽 작업(`src/db/*`, `src/queries/*`)이고 04-02는 순수 함수 쪽(`src/workflow/*`)이라 서로 겹치는 파일이 없어서 충돌 없이 각자 진행했습니다.

원래 계획엔 04-01 픽스처 파일(`tests/fixtures/cadence-samples.ts`)을 재사용하기로 했지만, 병렬 실행 중이라 아직 존재하지 않을 수 있어서 인바운드 감지기 테스트는 **자체 인라인 fixture**로 작성했습니다. 이러면 04-01 진행 상태와 무관하게 이 플랜이 독립적으로 검증 가능해지는 장점도 있어요.

### 다음 단계는요?

이 세 부품은 앞으로 이렇게 쓰입니다:

- **플랜 04-03** (Wave 1): Phase 3의 `follow-up-composer.ts`에 `buildCadenceFollowUpPrompt(stage, toneLevel, ...)` 함수를 추가해서, cadence.ts가 계산한 stage 정보를 프롬프트에 주입
- **플랜 04-05** (Wave 2): 최상위 `workflow-c.ts` orchestrator가 세 부품을 모두 조립 — touchpoints에서 마지막 outbound 조회 → `classifyCadenceContextDeterministic` → `hasInboundSince`로 인바운드 체크 → `computeCadenceStage`로 stage 결정 → follow-up-composer 호출 → `validateNoForbiddenPhrases`로 검증 → 통과하면 Gmail draft 생성

**freeze된 인터페이스 덕분에** Wave 1/Wave 2가 변경 걱정 없이 이 모듈들을 import할 수 있습니다. 시그니처는 이 플랜에서 최종 확정되었어요.

대표님, 이제 팔로업 자동화의 "판단 로직 기초"가 완성되었습니다. 다음 플랜부터는 이 부품들을 가지고 실제 이메일 드래프트를 만들어내는 단계로 넘어갑니다!

---

## 구현 상세 (기술 참고용)

### 1. `src/workflow/cadence.ts` (Task 1)

**Exports:**
- `CADENCE_MATRIX: Record<CadenceContextType, readonly number[]>`
- `type CadenceContextType`
- `interface CadenceStageResult`
- `TONE_INTENT_LABELS: Record<toneIntent, string>`
- `classifyCadenceContextDeterministic(body, subject): CadenceContextType | null`
- `computeCadenceStage(lastOutboundAt, now, contextType, executedStageIndices?): CadenceStageResult | null`

**핵심 로직:**
1. `classifyCadenceContextDeterministic` — `${subject}\n${body}` haystack에 대해 CONTEXT_KEYWORDS 배열을 우선순위 순회. 첫 hit 반환. 매칭 실패 시 `null` → 상위 workflow-c가 `'general'` fallback 처리.
2. `computeCadenceStage` —
   - `elapsedDays = Math.floor((nowMs - lastMs) / 86400000)` (floor 기준, 소수점 0일 → milestone 미도달)
   - Clock skew: `lastMs > nowMs` 또는 `elapsedDays < 0` → `null`
   - `highestExecuted = Math.max(...executedStageIndices)` — 이미 실행된 최대 index보다 큰 index만 후보
   - 후보 중 `elapsedDays >= milestones[i]`를 만족하는 **가장 높은 index** 선택 (catch-up 정책)
   - `isFinal = targetIdx === milestones.length - 1` → `toneIntent='relationship'`, `toneLevel=2`
   - 그 외: ordinal에 따라 `confirm` / `add_value` / `alternative`, `toneLevel`은 `alternative=3`, 나머지 `2`

**CADENCE_MATRIX 상수:**
```typescript
general:             [3, 7, 14, 30]
proposal:            [3, 7, 14, 30]  // D-12 해석 — v4 ULTRA 본문은 14까지
contract:            [2, 5]
meeting_qna:         [2, 5]
quote_revision:      [3, 7]
influencer_outreach: [2, 5, 10]
```

### 2. `src/workflow/inbound-detector.ts` (Task 2)

**Exports:**
- `OWN_EMAIL_DOMAINS: readonly ['@puzl.co.kr']`
- `isOwnMessage(message: Pick<ThreadMessage, 'from'>): boolean`
- `hasInboundSince(messages: ThreadMessage[], sinceMs: number): boolean`

**핵심 로직:**
1. `isOwnMessage` — `from.toLowerCase().trim()` → 빈 문자열이면 `false`, 아니면 OWN_EMAIL_DOMAINS 중 하나라도 substring 매칭되면 `true`. Display name이 섞여 있어도 `"cyr@puzl.co.kr"` 부분 매칭됨.
2. `hasInboundSince` — `messages.some((m) => ...)`:
   - `parseInt(m.internalDate ?? '0', 10) || 0` (파싱 실패 방어)
   - `ts <= sinceMs` → 제외 (엄격 > 비교)
   - `!m.from || m.from.trim() === ''` → 제외 (safe default, false-negative)
   - `isOwnMessage(m)` → 제외 (자사 발신은 SENT 대체 판정)
   - 그 외 → 유효한 inbound로 카운트

**ThreadMessage는 type-only import** 으로 런타임 의존성 0 유지.

### 3. `src/workflow/forbidden-phrase-guard.ts` (Task 3)

**Exports:**
- `interface ForbiddenPhraseEntry`
- `FORBIDDEN_FOLLOWUP_PHRASES: readonly ForbiddenPhraseEntry[]` (14 entries)
- `interface ForbiddenPhraseCheckResult`
- `validateNoForbiddenPhrases(htmlBody: string): ForbiddenPhraseCheckResult`

**블랙리스트 카테고리:**
1. 조건부 철회 암시 — 3 entries (답장 안 주시면, 답변 없으시면, 회신 없으시면)
2. 철회/취소 언급 — 4 entries (제안을 철회, 제안서를 철회, 견적을 철회, 견적서를 철회)
3. urgency 조작 — 3 entries (마지막 기회, 이번이 정말 마지막, 마지막으로 한 번만)
4. 관계 단절 위협 — 2 entries (더 이상 연락드리지 않, 더 이상 연락 안)
5. 정서 조작 — 2 entries (실망스럽, 실망했)

**핵심 로직:**
- `(htmlBody ?? '').toLowerCase()` → null/undefined 방어
- `FORBIDDEN_FOLLOWUP_PHRASES.filter(...).map(...)` — 첫 hit에서 조기 반환하지 않고 모든 위반 수집
- `safe = violations.length === 0`

어미 변형 ("철회하겠습니다", "철회합니다", "철회할 수도")은 어간 위주 phrase(`제안을 철회`)로 substring 매칭하여 모두 커버.

---

## Commits

| Task | Commit  | Message                                                                |
| ---- | ------- | ---------------------------------------------------------------------- |
| 1    | 820fe18 | feat(04-02): add cadence pure functions + matrix + classifier          |
| 2    | d3f3915 | feat(04-02): add inbound-detector pure function                        |
| 3    | c168b70 | feat(04-02): add forbidden-phrase-guard with v4 ULTRA §15 blacklist    |

---

## Verification

### Automated

```bash
npx vitest run src/workflow/cadence.test.ts src/workflow/inbound-detector.test.ts src/workflow/forbidden-phrase-guard.test.ts
```

**Result:**
```
Test Files  3 passed (3)
     Tests  100 passed (100)
  Duration  162ms
```

### Pure function 검증 (grep)

```bash
grep -E "import.*from.*['\"].*(queries|db|drizzle|better-sqlite|fetch|axios|anthropic)" \
  src/workflow/cadence.ts \
  src/workflow/inbound-detector.ts \
  src/workflow/forbidden-phrase-guard.ts
```

**Result:** No matches found. DB/네트워크/AI 의존성 0건 확인.

### Interface freeze 확인

플랜 `<interfaces_frozen>` 블록의 시그니처와 실제 export 100% 일치:
- `CadenceContextType`, `CADENCE_MATRIX`, `CadenceStageResult`, `TONE_INTENT_LABELS`, `classifyCadenceContextDeterministic`, `computeCadenceStage` (cadence.ts)
- `OWN_EMAIL_DOMAINS`, `isOwnMessage`, `hasInboundSince` (inbound-detector.ts)
- `FORBIDDEN_FOLLOWUP_PHRASES`, `ForbiddenPhraseCheckResult`, `validateNoForbiddenPhrases` (forbidden-phrase-guard.ts)

Wave 1 (04-03) / Wave 2 (04-05) 플랜이 이 타입들을 안전하게 import 가능.

---

## Deviations from Plan

**플랜 원문과 차이:**

1. **[Rule 2 - 안정성] 04-01 픽스처 대신 인라인 fixture 사용**
   - **Found during:** Task 2
   - **원인:** 04-02는 04-01과 병렬 실행되는 sibling 플랜이므로 `tests/fixtures/cadence-samples.ts`가 아직 존재하지 않을 수 있음.
   - **조치:** `inbound-detector.test.ts` 안에 `THREAD_WITH_INBOUND` / `THREAD_NO_INBOUND` 인라인 fixture 작성. 외부 의존성 0.
   - **부가 이익:** 04-02 테스트가 04-01 진행 상태와 완전히 독립적으로 실행 가능.
   - **영향:** 없음 — 04-01이 완료되면 후속 플랜에서 공용 fixture로 리팩토링 가능하나 필수 아님.

2. **[Rule 1 - catch-up 로직 버그 수정]**
   - **Found during:** Task 1 (RED→GREEN 전환 중)
   - **원인:** 초기 구현은 `executedStageIndices.includes(i)` 만으로 판정. `executed=[3]` (Day 30 실행됨)인데 Day 14(index 2)를 다시 반환하는 버그.
   - **조치:** `highestExecuted = Math.max(...executedStageIndices)` 계산 후 `i > highestExecuted` 범위만 후보에 포함. "이미 더 높은 단계가 실행됐다면 낮은 단계로 되돌아가지 않는다"는 catch-up 정책의 올바른 구현.
   - **테스트 보강:** `executedStageIndices=[3] → null`, `executedStageIndices=[2] (Day 14 already) → null (Day 30 대기)`, `executedStageIndices=[0] → Day 7` 세 케이스로 검증.

3. **[Rule 2 - 블랙리스트 엔트리 확장]**
   - **원인:** 플랜은 "9개 이상"을 요구. CONTEXT.md D-15 "보수적 해석"에 따라 어미 변형 커버를 위해 14개까지 확장.
   - **조치:** 5대 카테고리 × 2-4 엔트리 배치. 각 phrase는 어간 위주로 선정하여 어미 변형 ("철회하겠습니다"/"철회합니다"/"철회할 수도")을 substring 매칭으로 모두 커버.

4. **[Rule 3 - 테스트 reporter 변경]**
   - **원인:** 플랜의 `--reporter=basic` 플래그가 vitest 4.1.2에서 미지원 (ERR_LOAD_URL).
   - **조치:** `--reporter=default` 로 실행. 결과 동일.

**Auth 게이트:** 없음 (순수 함수 구현이라 외부 의존 0).

---

## Known Stubs

없음 — 세 모듈 모두 완결 구현이며, 상위 orchestrator가 이들을 소비한다.

## Threat Flags

없음 — 순수 함수 레이어이며 네트워크/DB/파일시스템 경계 접근 없음.

---

## Self-Check: PASSED

**Files verified:**
- FOUND: src/workflow/cadence.ts
- FOUND: src/workflow/cadence.test.ts
- FOUND: src/workflow/inbound-detector.ts
- FOUND: src/workflow/inbound-detector.test.ts
- FOUND: src/workflow/forbidden-phrase-guard.ts
- FOUND: src/workflow/forbidden-phrase-guard.test.ts

**Commits verified:**
- FOUND: 820fe18 (Task 1 — cadence)
- FOUND: d3f3915 (Task 2 — inbound-detector)
- FOUND: c168b70 (Task 3 — forbidden-phrase-guard)

**Tests:** 100/100 GREEN (cadence 48 + inbound-detector 19 + forbidden-phrase-guard 33).

**Pure function check:** grep 결과 0 matches — DB/네트워크/AI imports 없음.

**Interface freeze:** 플랜 `<interfaces_frozen>` 블록과 실제 exports 100% 일치.
