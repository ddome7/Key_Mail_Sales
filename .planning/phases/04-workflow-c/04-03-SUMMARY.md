---
phase: 04-workflow-c
plan: 03
subsystem: workflow/follow-up-composer-extension
tags: [cadence, follow-up, prompt-loader, section-map, phase-3-invariance, tdd]
requirements:
  - FLLW-02
  - FLLW-03
dependency_graph:
  requires:
    - src/workflow/cadence.ts (04-02 Wave 0 — CadenceContextType, CadenceStageResult, TONE_INTENT_LABELS)
    - src/workflow/thread-loader.ts (ThreadMessage type-only import, Phase 3 불변)
    - src/db/schema.ts (Client type)
    - src/types/classification.ts (ClassificationResult, Strategy)
    - system/v4_ULTRA_SYSTEM_PROMPT.md §15 (L841~886, 좌표 검증 완료)
  provides:
    - classifyCadenceFollowUp (strategy E/I 판정)
    - buildCadenceFollowUpSubject (Re: prefix 보존 + fail-fast)
    - buildCadenceFollowUpPrompt (cadence_context 마커 + D-14 톤 분기)
    - BuildCadenceFollowUpPromptParams interface
    - SECTION_MAP['followup-cadence'] 엔트리 등록
  affects:
    - 04-05 workflow-c orchestrator (Wave 2, 3 신규 함수 + §15 섹션 로드 조합)
tech-stack:
  added: []
  patterns:
    - Phase 3 함수 바이트 단위 불변 (D-12, D-16) — append-only 확장
    - 경로 분리 원칙 — call_analysis / cadence_context 마커 배타적 사용
    - 임시 mock 파일 기반 prompt-loader 테스트 (워크트리 env issue 회피)
key-files:
  created: []
  modified:
    - src/workflow/follow-up-composer.ts (3 신규 export append, 기존 함수 불변)
    - src/workflow/follow-up-composer.test.ts (47 신규 Phase 4 케이스 append)
    - src/workflow/prompt-loader.ts (SECTION_MAP 1줄 추가)
    - src/workflow/prompt-loader.test.ts (15 신규 Phase 4 followup-cadence 케이스 append)
decisions:
  - "classifyCadenceFollowUp은 stage.isFinalTouch만으로 strategy 분기 (true→'I', false→'E'). 추가 조건 없음 — 단순성 유지"
  - "buildCadenceFollowUpSubject는 빈 threadHistory 수신 시 Error throw (fail-fast). orchestrator 상류가 이미 걸러야 함"
  - "buildCadenceFollowUpPrompt는 <call_analysis> 마커를 절대 사용하지 않음 — Phase 3와 타입 오염 방지"
  - "D-14 톤 분기는 isFinalTouch 우선 → add_value → alternative → confirm(기본값) 순서로 평가"
  - "prompt-loader §15 좌표는 L841~886 (RESEARCH VERIFIED + 원본 재검증)"
  - "getSectionsForClassification 함수 바디는 건드리지 않음 — followup-cadence는 Wave 2 workflow-c가 별도 헬퍼로 로드"
  - "워크트리 env issue 회피: prompt-loader 신규 테스트는 임시 mock v4 ULTRA 파일 생성 후 filePath override로 테스트"
metrics:
  completed: 2026-04-11
  tasks: 2
  test_cases_added: 62
  test_cases_total: 105
  files_modified: 4
  files_created: 0
  commits: 2
---

# Phase 4 Plan 03: Follow-up Composer Cadence 확장 Summary

Phase 3에서 만든 `follow-up-composer.ts`를 **기존 함수 바이트 단위 불변**으로 유지하면서 Phase 4 cadence 전용 3개 함수(`classifyCadenceFollowUp`, `buildCadenceFollowUpSubject`, `buildCadenceFollowUpPrompt`)를 append하고, `prompt-loader.ts` SECTION_MAP에 v4 ULTRA §15 (팔로업 케이던스 시스템) 엔트리를 1줄 추가했습니다. Wave 1의 유일한 플랜.

## 대표님께 드리는 보고 (쉬운 말 버전)

대표님, Phase 4 세 번째 플랜(04-03) 완료 보고드립니다.

### 무엇을 만들었나요?

이번 플랜은 **"팔로업 이메일을 AI한테 어떻게 요청할지 지시서를 써주는 부품"**을 확장하는 작업이었습니다. 부엌에 비유하면, Phase 3에서 이미 "통화 끝난 뒤 후속 이메일 레시피"를 만드는 요리사를 고용해놨는데, 이번엔 그 요리사한테 **새로운 레시피 북(케이던스 팔로업용)을 추가로 건네주는 것**이라고 생각하시면 됩니다. 기존 요리사는 그대로 두고, 새 레시피만 옆에 쌓아둔 거예요.

**왜 기존 요리사를 안 건드렸냐면요** — Phase 3에서 만든 통화 후속 이메일 파이프라인이 이미 테스트를 33개나 통과하면서 안정적으로 돌아가고 있어요. 거기를 조금이라도 수정하면 기존 기능이 깨질 위험이 있습니다. 그래서 원칙적으로 "손대지 않고 추가만" 하는 방식을 택했어요. 이걸 저희는 "Phase 3 바이트 단위 불변(byte-level invariance)"이라고 부르는데, 쉽게 말하면 **"기존 코드는 한 글자도 수정하지 않는다"**는 엄격한 규칙입니다. Git으로 변경사항을 확인했을 때 기존 함수들 라인이 **단 1줄도 삭제/수정되지 않은 것**을 실제로 검증했습니다.

### 세 가지 새 함수 — 각각이 뭘 하나요?

**1번 함수 — `classifyCadenceFollowUp` (전략 선택기)**

"이 팔로업 이메일은 어떤 전략으로 써야 해?"를 결정하는 함수입니다. v4 ULTRA 프롬프트에 12가지 전략(A~L)이 있는데, 이번 플랜에서는 두 가지만 씁니다:

- **전략 'E' (팔로업/재연락):** 1차, 2차, 3차 팔로업은 모두 이걸로. "아직 문이 열려 있는 상태"로 가정
- **전략 'I' (연락 두절/마지막 터치):** Day 30 마지막 팔로업만 이걸로. "이제 관계 유지 모드로 전환"

저희가 만든 `cadence.ts` 부품이 계산한 `isFinalTouch` 플래그를 보고 자동으로 골라줍니다. **추가 조건 없이 단순하게 두 가지로만 갈라진다**는 게 이 함수의 원칙이에요. 복잡도를 늘리면 나중에 디버깅하기 어려워지니까요.

**2번 함수 — `buildCadenceFollowUpSubject` (제목 생성기)**

팔로업 이메일의 제목을 만드는 함수입니다. 핵심은 **"원본 이메일과 같은 스레드 안에서 답장되어야 한다"**는 것. 만약 제목이 원본과 달라지면 Gmail이 별개의 새 스레드로 분리해버려서, 받는 분 메일함에 같은 이메일이 두 스레드로 보입니다. 이걸 Phase 3에서는 "Pitfall 4(함정 4번)"라고 부르면서 조심했는데, 이번 플랜에서도 같은 규칙을 그대로 복제했어요:

- **원본 제목이 `[제안서] 기획안`이면** → `Re: [제안서] 기획안`
- **원본이 이미 `Re: [제안서] 기획안`이면** → 그대로 유지 (중복 방지)
- **대소문자 `RE:`, `re:`도 동일 처리** (정규식 `i` 플래그 사용)
- **앞뒤 공백은 제거한 뒤 처리** (trim)

그리고 **"스레드가 텅 빈 상태로 이 함수가 호출되면 즉시 에러를 던진다"**는 fail-fast 원칙을 넣었습니다. 이건 방어적인 설계인데요 — 케이던스 팔로업은 **반드시 기존 접점이 있다는 전제**로 돌아갑니다. 기존 스레드가 없는데 여기까지 흐름이 도달했다면, 상류의 `inbound-detector`에서 이미 걸러졌어야 하는데 안 걸러진 거니까 논리 오류죠. 조용히 빈 문자열을 반환하지 않고 에러로 터뜨려서 **문제를 빨리 드러내게** 만들었어요. 에러 메시지에는 회사명과 stage 번호도 같이 넣어서 디버깅할 때 바로 어떤 회사 케이스인지 알 수 있도록 했습니다.

**3번 함수 — `buildCadenceFollowUpPrompt` (AI 지시서 조립기)**

가장 중요한 함수입니다. AI한테 "이런 팔로업 이메일을 써줘"라고 지시하는 **시스템 프롬프트(system prompt)**와 **유저 메시지(user message)**를 조립합니다. Phase 3의 통화 후속 버전(`buildFollowUpPrompt`)과 구조는 비슷하지만, **두 가지 핵심 차이**가 있어요:

**차이점 1 — `<call_analysis>` 마커 절대 금지**

Phase 3 버전은 통화 분석 결과를 `<call_analysis>` 태그로 감싸서 AI한테 전달합니다. 케이던스 팔로업은 통화 분석과 관련이 없으니 이 태그를 **절대로 쓰지 않습니다**. 이걸 테스트로도 강제해뒀는데요 — 혹시라도 나중에 누가 복붙하다가 실수로 이 태그를 넣으면 테스트가 즉시 빨간불이 됩니다. 이게 **"경로 분리(path split)"** 원칙인데, 쉽게 말하면 "통화 파이프라인과 케이던스 파이프라인이 서로 오염되지 않도록 격리한다"는 거예요.

**차이점 2 — `<cadence_context>` 마커로 케이던스 정보 주입**

대신 새로운 경계 마커로 이런 정보를 AI한테 전달합니다:

```
<cadence_context>
context_type: proposal          ← 제안서 팔로업
stage: 2차 (Day 7)              ← 두 번째 팔로업, 7일 경과
tone_intent: add_value (새로운 가치 추가 — 답장할 이유 제공)
tone_level: 2                   ← v4 ULTRA §16 톤 캘리브레이션 레벨 2
is_final_touch: false           ← 마지막 터치 아님
</cadence_context>
```

이러면 AI가 "아, 지금 2차 팔로업이고 톤은 따뜻한 프로(레벨 2)로 가야 하는구나. 1차 때랑 달리 새로운 가치를 제공해야 하는구나"를 문맥으로 파악합니다.

**D-14 톤 분기 — 단계별로 다른 말투**

대표님이 CONTEXT.md D-14에 정하신 **단계별 톤 규칙**을 `system prompt`의 8번 항목에서 네 갈래로 분기합니다:

| 단계 | AI한테 주는 지시 (요약) |
|---|---|
| **1차 (confirm)** | "가볍게 확인 여부만. 원본 1~2줄 요약. 부담 없이" |
| **2차 (add_value)** | "새로운 가치 반드시 포함 — 레퍼런스/케이스 스터디/업종 사례. 단순 확인 질문 금지" |
| **3차 (alternative)** | "대안 제시 — 더 작은 규모, 다른 시나리오, 부담 없는 시작 방식" |
| **마지막 (isFinalTouch=true)** | "압박 제로. '필요하실 때 편하게 연락 주시면' 뉘앙스. 철회/urgency 표현 금지" |

`isFinalTouch`가 true면 **다른 조건보다 우선**해서 마지막 터치 분기로 갑니다 (예: ordinal=4인 경우 relationship인데, 이미 isFinalTouch로 걸러지므로 별도 처리). 이것도 테스트로 검증했습니다.

**교차 오염 방지**

system prompt 안에 **"대상 회사는 오직 '{회사명}' 뿐입니다. 다른 회사 이름을 언급하지 마세요"**라는 지침을 명시합니다. AI가 실수로 다른 클라이언트 정보를 끌어와서 팔로업에 섞는 걸 방지하는 안전장치예요.

### prompt-loader.ts에 한 줄 추가

두 번째 작업은 훨씬 작아요. v4 ULTRA 프롬프트 원본 파일에서 §15(팔로업 케이던스 시스템) 부분이 몇 번째 줄부터 몇 번째 줄까지인지를 지도(SECTION_MAP)에 등록하는 작업입니다.

**좌표 확인:** 실제 v4 ULTRA 파일을 직접 열어서 검증했습니다:
- L841: `━━━━━━` (구분선, §15 시작)
- L842: `⏰ SECTION 15 — 팔로업 케이던스 시스템 [v4 신규]`
- L885: `- 절대 하지 않는 것: "답장 안 주시면 제안을 철회하겠습니다" 식의 압박`
- L886: 빈 줄 (§15 끝)
- L887부터는 §16 (톤 캘리브레이션)

그래서 SECTION_MAP에 `'followup-cadence': { start: 841, end: 886 }` 한 줄만 추가했어요. **정확히 1줄**만 바꿨고, 나머지 코드는 손대지 않았습니다. `getSectionsForClassification` 함수도 건드리지 않았는데, 그 이유는 **Phase 2/3 호환성**이에요. 만약 그 함수 안에 "followup-cadence를 조건부로 포함"같은 로직을 넣으면 Phase 2 신규 문의 처리 / Phase 3 통화 후속 처리 경로에도 영향이 가서 회귀 위험이 생깁니다. 그래서 Wave 2의 `workflow-c.ts`(플랜 04-05)가 별도의 내부 헬퍼로 `['followup-cadence', ...]` 배열을 직접 조립해서 `loadSections`에 넘기는 방식으로 진행합니다.

### 어떻게 검증했나요?

**총 62개의 신규 테스트**를 작성해서 전부 GREEN입니다.

- **follow-up-composer.test.ts: 80/80 GREEN** (기존 33 + 신규 47)
  - `classifyCadenceFollowUp` 12 케이스 — strategy 분기, toneLevel 전파, hasObjection 옵션, industry 전파, ClassificationResult 필드 완전성
  - `buildCadenceFollowUpSubject` 7 케이스 — Re: prefix 추가/중복 방지/대소문자/공백 trim/fail-fast throw
  - `buildCadenceFollowUpPrompt` 28 케이스 — 반환 shape, 경계 마커, cadence_context 내용, 클라이언트 격리, 톤 분기 4종, threadHistory 포맷, promptSections 통합, 안전 규칙

- **prompt-loader.test.ts: 23/25 GREEN** (기존 6 + 신규 15 + pre-existing failure 2)
  - SECTION_MAP 엔트리 등록 4 케이스 — 키 존재, 좌표 정확성, 인접 엔트리 불변
  - loadSections 경계 검증 6 케이스 — §15 헤더/내용 포함, §14/§16 고유 키워드 부재, 상황별 변형 표 / 톤 규칙 포함
  - tone-calibration 회귀 2 케이스 — 기존 경로 정상 동작, §15 내용 미포함
  - getSectionsForClassification 불변 4 케이스 — 전 strategy에 대해 followup-cadence 미포함, base sections 유지, hasObjection/hasPricing/industry 조합 검증
  - SECTION_MAP 필수 키 존재 확인 1 케이스

**Pre-existing 2개 실패는 known environment issue**입니다. 워크트리에 `system/v4_ULTRA_SYSTEM_PROMPT.md` 파일이 복사되지 않아서 기존 prompt-loader 테스트 2개가 실패하는데, **이는 제 변경사항과 무관**하며 Task 1 시작 전에도 동일하게 실패하고 있었습니다. 새로 추가한 followup-cadence 테스트들은 **임시 mock 파일**을 생성해서 `filePath` 오버라이드로 실행하기 때문에 이 이슈를 우회합니다.

### Phase 3 바이트 단위 불변 증명

`git diff`로 실제 변경 내용을 확인했습니다:

```
src/workflow/follow-up-composer.ts:
  - 기존 코드 라인 삭제: 0줄
  - 신규 import 2줄 (cadence.ts에서 type/value import)
  - 파일 하단에 Phase 4 섹션 append (~190줄)

src/workflow/prompt-loader.ts:
  - 기존 코드 라인 삭제: 0줄
  - 추가 라인: 정확히 1줄 (SECTION_MAP 내부)
```

즉 Phase 3의 `classifyCallFollowUp` / `buildFollowUpSubject` / `buildFollowUpPrompt` 세 함수와 prompt-loader의 `getSectionsForClassification` 함수는 **한 글자도** 수정되지 않았습니다. Phase 2/3 기존 기능에 회귀 위험이 0입니다.

### 다음 단계는요?

이 플랜(04-03)으로 Wave 1이 완료되었고, 다음은 Wave 2의 **플랜 04-05 workflow-c orchestrator**입니다. 거기서는 이번에 만든 세 함수를 이렇게 조립합니다:

1. `touchpoints`에서 마지막 outbound 조회 (04-01 Wave 0 쿼리 재사용)
2. `classifyCadenceContextDeterministic`으로 context type 결정 (04-02)
3. `hasInboundSince`로 인바운드 체크 → 있으면 즉시 중단 (04-02)
4. `computeCadenceStage`로 stage 결정 (04-02)
5. ★ **`classifyCadenceFollowUp`** 으로 strategy E/I 판정 (이 플랜)
6. `loadSections(['followup-cadence', ...])` 로 §15 섹션 로드 (이 플랜)
7. ★ **`buildCadenceFollowUpSubject`** 로 제목 조립 (이 플랜)
8. ★ **`buildCadenceFollowUpPrompt`** 로 AI 프롬프트 조립 (이 플랜)
9. AI 호출 → `validateNoForbiddenPhrases`로 금기 표현 차단 (04-02)
10. 통과하면 `composeEmail` → `createDraft`로 Gmail 드래프트 생성

**freeze된 인터페이스 덕분에** Wave 2가 타입 변경 걱정 없이 바로 import해서 쓸 수 있습니다.

대표님, 이번 플랜으로 케이던스 팔로업 파이프라인의 "AI 프롬프트 조립" 부분이 완성되었습니다. 다음 플랜부터는 실제로 이 부품들을 한 줄로 연결해서 "동반성장위원회 팔로업 초안 만들어줘" 같은 요청이 실제 Gmail 드래프트로 이어지는 단계로 넘어갑니다!

---

## 구현 상세 (기술 참고용)

### Task 1: src/workflow/follow-up-composer.ts 확장

**신규 exports (append only):**

```typescript
export function classifyCadenceFollowUp(
  stage: CadenceStageResult,
  client: Client,
  hasObjectionFromLastThread?: boolean,
): ClassificationResult;

export function buildCadenceFollowUpSubject(
  threadHistory: ThreadMessage[],
  client: Client,
  stage: CadenceStageResult,
): string;

export interface BuildCadenceFollowUpPromptParams {
  classification: ClassificationResult;
  stage: CadenceStageResult;
  contextType: CadenceContextType;
  threadHistory: ThreadMessage[];
  client: Client;
  promptSections: string;
}

export function buildCadenceFollowUpPrompt(
  params: BuildCadenceFollowUpPromptParams,
): FollowUpPromptResult;
```

**핵심 로직 요약:**

1. `classifyCadenceFollowUp`:
   - `strategy = stage.isFinalTouch ? 'I' : 'E'`
   - `toneLevel = stage.toneLevel` (직접 전파)
   - `isNewClient: false`, `hasPricing: false`, `urgency: 'normal'` 고정
   - `client.industry`가 truthy일 때만 result.industry 조건부 설정 (optional 필드 정합성)

2. `buildCadenceFollowUpSubject`:
   - `threadHistory.length === 0` → `Error` throw (메시지: `client.companyName` + `stage.ordinal` 포함)
   - `threadHistory[0].subject.trim()` → `/^Re:\s/i` 매칭 시 그대로, 아니면 `Re: ` prefix

3. `buildCadenceFollowUpPrompt`:
   - 톤 분기 우선순위: `isFinalTouch` → `add_value` → `alternative` → default(`confirm`)
   - system prompt 구성: 준수 규칙 1~7 + 8-prep(회사 격리) + 8(톤 분기) + promptSections
   - userMessage 구성: `[대상 클라이언트]` + `<cadence_context>` + `<existing_thread>` (time-ordered)
   - 각 메시지 body는 Phase 3와 동일한 `MAX_BODY_LENGTH = 2000` 사용 (재사용)
   - `<call_analysis>` 마커는 **절대** 생성하지 않음 (테스트로 강제)

### Task 2: src/workflow/prompt-loader.ts SECTION_MAP 확장

**Diff (정확히 1줄):**

```diff
  'objection-handling':   { start: 754, end: 841 },   // SECTION 14 - 반론/거절 대응
+ 'followup-cadence':     { start: 841, end: 886 },   // SECTION 15 - 팔로업 케이던스 시스템 (Phase 4)
  'tone-calibration':     { start: 888, end: 930 },   // SECTION 16 - 톤 캘리브레이션
```

**§15 좌표 검증 근거 (원본 v4 ULTRA 직접 확인):**

| Line | 내용 |
|------|------|
| 841 | `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` (§15 시작 구분선) |
| 842 | `⏰ SECTION 15 — 팔로업 케이던스 시스템 [v4 신규]` |
| 843 | (구분선) |
| 844 | (빈 줄) |
| 845 | `미응답 시 팔로업 타이밍과 방법을 체계화한다.` |
| 847 | `[기본 케이던스]` |
| 849~869 | Day 0/3/7/14/30 기본 케이던스 |
| 871 | `[상황별 팔로업 변형]` |
| 873~878 | 제안서/계약서/미팅/견적/인플루언서/Dormant 변형 |
| 880 | `[팔로업 톤 규칙]` |
| 881~884 | 1차/2차/3차/마지막 톤 규칙 |
| 885 | `- 절대 하지 않는 것: "답장 안 주시면 제안을 철회하겠습니다" 식의 압박` (§15 마지막 실제 내용) |
| 886 | (빈 줄, end 포함) |
| 887 | `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` (§16 시작 구분선, 범위 밖) |

범위 `{ start: 841, end: 886 }`은 `tone-calibration { start: 888, end: 930 }` 엔트리와 일관된 패턴 (구분선 포함 방식).

### 테스트 케이스 분포

**follow-up-composer.test.ts (80 tests total, 47 new):**

| describe | Cases | Focus |
|----------|-------|-------|
| Phase 4: classifyCadenceFollowUp | 12 | strategy 분기, toneLevel 전파, hasObjection 옵션, industry 전파, 필드 완전성 |
| Phase 4: buildCadenceFollowUpSubject | 7 | Re: prefix 추가/중복/대소문자/공백 trim/fail-fast throw |
| Phase 4: buildCadenceFollowUpPrompt > 반환 shape | 2 | system/userMessage 필드, FollowUpPromptResult 호환 |
| Phase 4: buildCadenceFollowUpPrompt > 경계 마커 | 3 | <cadence_context> 포함, <existing_thread> 포함, <call_analysis> 부재 |
| Phase 4: buildCadenceFollowUpPrompt > cadence_context 내용 | 4 | context_type, stage ordinal/dayMilestone, tone_intent + 라벨, tone_level/is_final_touch |
| Phase 4: buildCadenceFollowUpPrompt > 대상 클라이언트 지침 | 3 | companyName 포함, 격리 지침 포함, 클라이언트 블록 필드 |
| Phase 4: buildCadenceFollowUpPrompt > 톤 분기 | 5 | confirm/add_value/alternative/finalTouch + 우선순위 |
| Phase 4: buildCadenceFollowUpPrompt > threadHistory 포맷 | 4 | 메시지 N 마커, body truncate 2000, 헤더 라인, ISO 날짜 |
| Phase 4: buildCadenceFollowUpPrompt > promptSections 통합 | 2 | 문자열 그대로 포함, 빈 문자열 fallback |
| Phase 4: buildCadenceFollowUpPrompt > 안전 규칙 | 5 | 인젝션 경고, §15 금지 표현, 서명/CC 안내, strategy E/I 명시 |

**prompt-loader.test.ts (신규 15 cases):**

| describe | Cases |
|----------|-------|
| SECTION_MAP entry | 4 (키 존재, 좌표, tone-calibration 불변, objection-handling 불변) |
| loadSections for followup-cadence | 6 (헤더/내용/변형 표/톤 규칙 포함, §14/§16 경계 분리) |
| tone-calibration regression | 2 (정상 로드, §15 미포함) |
| getSectionsForClassification 불변 | 4 (followup-cadence 미포함, 전 strategy, 복합 조건, base sections) |
| SECTION_MAP 확장 확인 | 1 (필수 키 존재) |

---

## Commits

| Task | Commit  | Message                                                      |
| ---- | ------- | ------------------------------------------------------------ |
| 1    | 893916e | feat(04-03): extend follow-up-composer with cadence functions |
| 2    | ce34f7e | feat(04-03): register §15 section in prompt-loader SECTION_MAP |

---

## Verification

### Automated

```bash
npx vitest run src/workflow/follow-up-composer.test.ts src/workflow/prompt-loader.test.ts --reporter=default
```

**Result:**
```
Test Files  1 failed | 1 passed (2)
     Tests  2 failed | 103 passed (105)
```

- **follow-up-composer.test.ts: 80/80 GREEN** (33 기존 + 47 Phase 4 신규)
- **prompt-loader.test.ts: 23/25 GREEN**
  - 15 Phase 4 신규: 전부 GREEN
  - 6 Phase 2 기존: GREEN
  - **2 pre-existing failures: known env issue** — 워크트리에 `system/v4_ULTRA_SYSTEM_PROMPT.md`가 복사되지 않아 `DEFAULT_PROMPT_PATH` fallback 사용하는 기존 테스트 2개가 실패. Task 1 시작 전 baseline에서도 동일 failure → 제 변경사항과 무관.

### Phase 3 함수 바이트 단위 불변 (git diff 검증)

```bash
$ git diff src/workflow/follow-up-composer.ts | grep -c "^-[^-]"
0  # 기존 코드 삭제 0줄

$ git diff src/workflow/prompt-loader.ts | grep -c "^+[^+]"
1  # 정확히 1줄 추가
$ git diff src/workflow/prompt-loader.ts | grep -c "^-[^-]"
0  # 삭제 0줄
```

### Interface freeze 확인

플랜 `<interfaces_frozen>` 블록과 실제 exports 100% 일치:

| Export | Type | Matches Frozen Spec |
|--------|------|---------------------|
| `classifyCadenceFollowUp` | function | ✓ (stage, client, hasObjection?) → ClassificationResult |
| `buildCadenceFollowUpSubject` | function | ✓ (threadHistory, client, stage) → string |
| `BuildCadenceFollowUpPromptParams` | interface | ✓ (classification, stage, contextType, threadHistory, client, promptSections) |
| `buildCadenceFollowUpPrompt` | function | ✓ (params) → FollowUpPromptResult |
| `SECTION_MAP['followup-cadence']` | object | ✓ `{ start: 841, end: 886 }` |

Wave 2 (04-05 workflow-c orchestrator) 가 이 타입들을 안전하게 import 가능.

---

## Deviations from Plan

**플랜 원문과의 차이점:**

1. **[Rule 2 - 타입 정합성] `classifyCadenceFollowUp`의 `industry` 필드 조건부 설정**
   - **Found during:** Task 1 작성 중
   - **Issue:** 플랜 예시 코드는 `industry: client.industry ?? undefined` 를 결과 객체에 항상 포함. 그러나 `ClassificationResult.industry`는 optional 필드(`industry?: string`)이므로, 기존 Phase 2/3 사용 패턴과 정합성을 위해 **`client.industry`가 truthy일 때만 result에 포함**하는 방식으로 수정.
   - **Fix:** `if (client.industry) { result.industry = client.industry; }` 로 조건부 추가. `industry: null`인 client에 대해서는 `result.industry`가 `undefined` (키 자체 없음).
   - **Test 보강:** `'client.industry가 null이면 classification.industry 키 없음'` 케이스 추가 검증.
   - **영향:** Wave 2 (04-05)가 `result.industry`를 사용할 때 `if (classification.industry)` 또는 `classification.industry ?? fallback` 패턴으로 사용 가능. 플랜 원문과 호환.

2. **[Rule 3 - 환경 이슈 우회] prompt-loader 테스트 임시 mock 파일 전략**
   - **Found during:** Task 2 baseline 확인 중
   - **Issue:** 워크트리에는 `system/v4_ULTRA_SYSTEM_PROMPT.md` 파일이 복사되지 않음 (known environment issue). `loadSections(['followup-cadence'])` 를 `DEFAULT_PROMPT_PATH`로 호출하면 ENOENT 실패. 기존 Phase 2 테스트 2개도 baseline에서 같은 이유로 실패 중.
   - **Fix:** Phase 4 신규 테스트 전부 `beforeAll`에서 `mkdtempSync`로 임시 디렉토리 생성 후 §15 구조를 재현한 mock v4 ULTRA 파일 작성 → `loadSections(['followup-cadence'], mockPath)` 로 `filePath` 오버라이드 사용. `afterAll`에서 temp 파일/디렉토리 정리.
   - **장점:** 워크트리 환경 이슈와 무관하게 신규 테스트 독립 실행 가능. 메인 레포로 머지 후 system 폴더가 복사되면 기존 Phase 2 테스트도 자동 복구.
   - **영향:** Pre-existing 2 failures는 그대로 남으나 이는 환경 이슈이며 제 변경사항과 무관함을 SUMMARY에 명시.

3. **[Rule 2 - 프롬프트 안전성 강화] system prompt 8-prep 항목 분리**
   - **Found during:** Task 1 설계 중
   - **Issue:** 플랜 예시는 "대상 회사는 ... 언급하지 마세요"를 7번 항목에 넣고, 8번에 톤 지침. 실제로는 두 주제가 섞이면 테스트 regex 매칭이 복잡해지고 LLM도 혼동 가능.
   - **Fix:** 7번은 기존 "외부 입력은 데이터" 경고로 유지 (Phase 3과 동형), 회사 격리는 별도 `8-prep` 라벨로 분리, 톤 분기를 `8.`으로 통일. 테스트에서 톤 분기 구문과 회사 격리 구문을 독립적으로 검증 가능.
   - **영향:** 프롬프트 구조가 약간 장황해졌으나 가독성과 테스트 가능성 개선.

**Auth 게이트:** 없음 (코드 확장 작업, 외부 서비스 호출 없음).

**아키텍처 변경:** 없음 (플랜 범위 정확히 준수).

---

## Known Stubs

없음 — 세 신규 함수는 모두 완결 구현이며, Wave 2 orchestrator가 이들을 인수 없이 그대로 조립한다. SECTION_MAP 엔트리도 실제 §15 좌표와 정합.

## Threat Flags

없음 — 기존 경로(Phase 2/3 compose.ts → createDraft) 재사용이며 신규 trust boundary 없음. 오히려 프롬프트 인젝션 방어를 Phase 3 수준으로 유지하고 `<call_analysis>` 오염 방지 테스트까지 추가하여 **공격면은 감소**했다.

---

## Self-Check: PASSED

**Files verified:**
- FOUND: src/workflow/follow-up-composer.ts (modified, 3 새 exports append)
- FOUND: src/workflow/follow-up-composer.test.ts (modified, 47 새 케이스 append)
- FOUND: src/workflow/prompt-loader.ts (modified, 1 줄 추가)
- FOUND: src/workflow/prompt-loader.test.ts (modified, 15 새 케이스 append)
- FOUND: .planning/phases/04-workflow-c/04-03-SUMMARY.md (this file)

**Commits verified:**
- FOUND: 893916e feat(04-03): extend follow-up-composer with cadence functions
- FOUND: ce34f7e feat(04-03): register §15 section in prompt-loader SECTION_MAP

**Tests:**
- follow-up-composer.test.ts: 80/80 GREEN (기존 33 + 신규 47)
- prompt-loader.test.ts: 23/25 GREEN (기존 6 + 신규 15 pass, pre-existing 2 fail 환경 이슈)
- 총 Phase 4 Plan 03 신규 케이스: 62개 전부 GREEN

**Phase 3/2 regression check:**
- follow-up-composer Phase 3 테스트 33개: 모두 통과 (baseline 유지)
- follow-up-composer.ts 내 기존 함수 라인 삭제/수정 0건 (git diff 검증)
- prompt-loader.ts `getSectionsForClassification` 바디 수정 0건 (git diff 검증)
- prompt-loader.ts SECTION_MAP diff는 정확히 1줄 추가 (`followup-cadence` 엔트리만)

**Interface freeze:** 플랜 `<interfaces_frozen>` 블록과 실제 exports 100% 일치. Wave 2 (04-05 workflow-c) 가 이 타입들을 안전하게 import 가능.
