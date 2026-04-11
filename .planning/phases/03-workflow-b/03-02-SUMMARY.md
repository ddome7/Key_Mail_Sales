---
phase: 03-workflow-b
plan: 02
subsystem: workflow-b-call-parser-and-matcher
tags: [parser, client-matching, fuzzy-match, state-machine, phone-normalization, zod, tdd]
requirements: [CALL-01, CALL-02]
dependency-graph:
  requires:
    - "Plan 01: tests/fixtures/ixio-samples.ts (IXIO_SAMPLE_PATTERN_1/2)"
    - "Plan 01/이전 Phase: src/db/schema.ts (clients 테이블), src/queries/clients.ts (createClientQueries 기존 4개 메서드)"
  provides:
    - "normalizePhone 단일 정규화 유틸 (모든 경로가 이 함수만 경유)"
    - "parseSlackCallMessage 순수 함수 + ParsedCallSchema + ParseResult 타입"
    - "createClientQueries 확장: getClientByPhone, getClientByEmail, savePhoneLearning, getAllCompanyNames"
    - "matchClient 3단계 매칭 상태 머신 + MatchResult 타입"
    - "fuzzyMatchCompanyName + normalizeKoreanCompany + COMPANY_BLACKLIST"
    - "CeoConfirmationRequest/Response 인터페이스 (Plan 05 오케스트레이터 인수인계용)"
  affects:
    - "src/queries/clients.ts (기존 4개 메서드 시그니처 보존, 4개 메서드 추가)"
tech-stack:
  added: []
  patterns:
    - "순수 함수 파서 (AI/DB/네트워크 의존성 0)"
    - "Result 타입 ({success:true,data} | {success:false,reason}) — throw 없이 실패 격리"
    - "zod 최종 재검증 (방어 계층)"
    - "DI (ClientMatcherDeps: clientQueries + askCeoConfirmation)"
    - "엄격 AND 자동 통과 조건 (3-AND) — Pitfall 3 방지"
    - "vi.fn() 기반 상태 머신 분기별 mock 테스트"
key-files:
  created:
    - src/workflow/phone-normalizer.ts
    - src/workflow/phone-normalizer.test.ts
    - src/workflow/call-parser.ts
    - src/workflow/call-parser.test.ts
    - src/workflow/client-matcher.ts
    - src/workflow/client-matcher.test.ts
    - .planning/phases/03-workflow-b/03-02-SUMMARY.md
  modified:
    - src/queries/clients.ts
    - src/queries/clients.test.ts
decisions:
  - "normalizeKoreanCompany 접미사 제거를 괄호 제거보다 먼저 수행 — (주)/㈜ 패턴이 구두점 제거에 의해 훼손되지 않도록 순서 고정"
  - "prefix 퍼지 매칭 자동 통과는 사실상 exact-after-normalize 케이스만 성립 — shorter/longer<1이면 score가 0.95를 넘기지 못하도록 수학적으로 보장되어 Pitfall 3가 코드 수준에서 강제됨"
  - "getClientByEmail은 Drizzle sql 템플릿으로 `lower(contact_email) = ?` 조회 — 기존 Phase 1/2 저장 로직이 lowercase를 강제하는지 확인 없이도 안전"
  - "savePhoneLearning에서 존재하지 않는 회사명은 throw가 아닌 조용한 no-op — 오케스트레이터가 매칭 성공 후 호출하는 것이 전제이며, 상위 레이어 리그레션을 방지"
metrics:
  duration: "약 18분"
  completed: "2026-04-11T14:17:30Z"
  tests_added: 54
  tests_passing: 73
  files_created: 6
  files_modified: 2
---

# Phase 3 Plan 02: 익시오 메시지 파서 + 3단계 클라이언트 매칭 Summary

**한 줄 요약:** 익시오 슬랙 메시지를 구조화된 데이터로 파싱하고, 전화번호 → 회사명 → 대표님 확인 3단계로 클라이언트를 식별하는 엔진 완성. 추측 금지 원칙(D-02)을 코드 수준에서 강제하는 엄격 AND 자동 통과 조건이 핵심.

## 대표님께 드리는 보고 (쉬운 설명)

대표님, Phase 3 Workflow B의 **핵심 엔진 두 개**를 완성했습니다. 하나는 "통화 내용 읽어들이는 기계", 다른 하나는 "이 통화가 어느 회사 통화인지 알아내는 기계"입니다. 지금까지 한 일을 천천히 말씀드릴게요.

### 1. 익시오 메시지 파서 (통화 기록 읽어들이는 기계)

익시오 앱이 슬랙에 올리는 통화 메시지는 대략 이런 모양입니다:

```
익시오에서 최영록님이 공유한 대화 내용입니다.
2026. 04. 08 (수요일) 오후 4시 18분
연락처 퍼즐) 동반성장위원회 이의선 위원(01036906867)님과의 통화

[대화 내용]
나: 안녕하세요, 최영록입니다.
상대방: 네 안녕하세요...
```

사람이 보면 바로 이해되지만, 컴퓨터는 저 텍스트 덩어리에서 "회사명은 뭔지, 이름은 뭔지, 언제 통화했는지, 누가 무슨 말 했는지"를 자동으로 알 수가 없습니다. 그래서 **정규식(정해진 패턴 찾기 규칙)**을 이용해서 쪼갠 후, 구조화된 데이터로 변환해주는 기계를 만들었어요.

**파서가 처리하는 2가지 메시지 형태:**

| 패턴 | 설명 | 예시 |
|------|------|------|
| **패턴 1** | 연락처가 휴대폰에 저장되어 있어 회사명/이름이 함께 나옴 | `연락처 퍼즐) 동반성장위원회 이의선 위원(01036906867)` |
| **패턴 2** | 모르는 번호라 전화번호만 표시됨 | `연락처 01036906867님과의 통화` |

**파서가 자동으로 뽑아내는 정보:**
- **언제**: `오후 4시 18분` → `2026-04-08T16:18:00+09:00` (한국 표준시 ISO 형식)
- **전화번호**: `01036906867` (아래에 설명할 "전화번호 정규화" 거침)
- **회사명**: `동반성장위원회` (앞의 "퍼즐)" 접두사를 자동 제거)
- **이름/직함**: `이의선 / 위원`
- **대화 내용**: 화자별로 분리 — `[{speaker:'me', text:'안녕하세요...'}, {speaker:'other', text:'네 안녕하세요...'}, ...]`
- **주요 내용/상세 내용**: 패턴 2에만 있는 `[주요 내용]`, `[상세 내용]` 블록 리스트

**실패해도 안전한 설계:**  
혹시 익시오가 메시지 포맷을 바꾸거나 이상한 값이 들어오면, 프로그램이 **에러로 죽지 않고** `{success: false, reason: "왜 실패했는지"}` 를 조용히 반환합니다. 그래야 오케스트레이터가 "이 메시지는 건너뛰자" 판단할 수 있어요. (위협 모델 T-03-09 대응)

### 2. 전화번호 정규화 엔진 — 단일 유틸 원칙

세일즈 현장에서 전화번호는 진짜 다양한 모습으로 나타납니다:
- `010-3690-6867`
- `01036906867`
- `010 3690 6867`
- `+82 10-3690-6867`
- `+821036906867`
- `82-10-3690-6867`
- `(010) 3690-6867`

이게 전부 **같은 사람의 전화번호**인데, 표기가 달라서 DB에 저장된 것과 못 찾는 일이 생깁니다(=**Pitfall 1**). 그래서 `normalizePhone()` 이라는 **딱 하나의 함수**를 만들어서, 전화번호를 만지는 **모든 경로**가 이 함수를 통과하도록 강제했습니다.

**변환 규칙:**
1. 숫자가 아닌 문자는 모두 제거 (하이픈, 공백, 괄호, + 등)
2. `82`로 시작하면 국가코드로 간주해서 `0`으로 교체

**결과:** 위 7가지 모든 입력이 전부 `01036906867`로 통일됩니다.

**단일 유틸 원칙 검증:**  
혹시라도 다른 파일에서 실수로 `replace(/\D/g, '')`를 또 쓰는 걸 방지하기 위해, 코드 전체를 검색했고 **오직 `phone-normalizer.ts` 한 곳에서만** 발견됩니다. (파서 / DB 조회 / 학습 저장 / 매처 모두 이 함수를 import해서 씁니다.)

### 3. clients DB 조회 기능 확장 (기존 기능 안 건드리고 추가만!)

Phase 1/2에서 이미 만들어둔 `createClientQueries` 함수는 4개 메서드가 있었습니다:
- `getClient(companyName)` — 회사명으로 조회
- `getClientById(id)`
- `upsertClient(data)` — 신규/업데이트
- `updateClientField(name, field, value)` — 특정 필드만 변경

여기에 **4개를 추가**했습니다. (기존 4개는 전혀 건드리지 않아서 Phase 1/2 리그레션 위험 0):

| 새 메서드 | 역할 |
|----------|------|
| `getClientByPhone(phone)` | 전화번호로 단건 조회. 내부에서 `normalizePhone()` 자동 호출 — `010-3690-6867`로 입력해도 DB의 `01036906867`과 매칭 |
| `getClientByEmail(email)` | 이메일로 단건 조회. 대문자/소문자 무시 (SQLite `lower()` 함수 사용) |
| `savePhoneLearning(companyName, phone)` | **D-03 학습**: 통화로 확인된 전화번호를 기존 client에 저장 |
| `getAllCompanyNames()` | **문자열 배열만** 반환 (퍼지 매칭 전용). Client 객체 전체를 반환하지 않음 — 교차 정보 노출 방지 |

**교차 오염 방지 철학 (D-04) 유지:**  
`getAllCompanyNames()`는 예외적으로 "전체 목록"을 반환하지만, **회사명 문자열만** 반환합니다. Client 객체 전체가 아니라서, 이 목록으로 이메일/메모/단가 같은 민감 정보가 새어 나갈 수 없습니다. 매처는 회사명 매칭 후 다시 `getClient(name)`으로 단건 조회하는 방식으로 작동합니다.

### 4. 3단계 클라이언트 매칭 상태 머신 (이번 플랜의 핵심!)

이게 이번 플랜에서 **가장 중요한 부분**입니다. 대표님이 통화하신 상대가 "누구"인지를 자동으로 찾아내는 로직인데, **잘못 매칭되면 엉뚱한 회사의 이메일이 나갈 수 있어서 절대 추측으로 가면 안 됩니다(D-02).**

그래서 **3단계 상태 머신**(순서대로 거치는 관문 시스템)으로 구현했습니다:

```
┌────────────────────────────────────────────────────────────┐
│  Step 1: 전화번호 정확 매칭 (phone_exact)                   │
│   → 확신 100%, 대표님 확인 스킵                             │
└─────────────┬──────────────────────────────────────────────┘
              │ miss
              ▼
┌────────────────────────────────────────────────────────────┐
│  Step 2a: 회사명 정확 매칭 (name_exact)                     │
│   → 확신 100% + D-03 전화번호 학습                          │
└─────────────┬──────────────────────────────────────────────┘
              │ miss
              ▼
┌────────────────────────────────────────────────────────────┐
│  Step 2b: 엄격한 퍼지 매칭 자동 통과 (name_fuzzy)           │
│   → 3-AND 조건 (아래 설명) 전부 충족 시에만 자동 진행       │
└─────────────┬──────────────────────────────────────────────┘
              │ 자동 통과 조건 미달
              ▼
┌────────────────────────────────────────────────────────────┐
│  Step 3: 대표님 확인 (askCeoConfirmation)                   │
│   → select / new_client / cancel 중 선택                    │
└────────────────────────────────────────────────────────────┘
```

**Step 2b 자동 통과 3-AND 조건 (Pitfall 3 방지의 핵심):**

퍼지 매칭은 점수 기반입니다:
- `exact` (정규화 후 완전 일치) → **score 1.0**
- `prefix` (한쪽이 다른 쪽의 앞부분) → **score 0.75 ~ 0.95** (길이 비율에 따라)
- `contains` (부분 문자열 포함) → **score 0.70**

자동 통과하려면 **다음 3가지 조건을 전부 만족해야 합니다**:

1. `score >= 0.95` (아주 강한 확신)
2. `candidates.length === 1` (비슷한 후보가 1개뿐)
3. `reason === 'exact' || reason === 'prefix'` (contains는 자동 통과 절대 금지)

**왜 이렇게 엄격하냐면**, "동반성장" 으로 검색했을 때 DB에 "동반성장위원회"와 "동반성장연구소" 두 개가 있으면 점수가 높아도 **어느 쪽인지 확신할 수 없기 때문**입니다. 이럴 땐 반드시 대표님에게 물어봐야 합니다.

**수학적으로 강제되는 안전장치:**  
prefix 점수 공식은 `0.75 + (shorter/longer) * 0.20`입니다. score가 0.95를 넘으려면 `shorter/longer >= 1.0`이어야 하는데, 이는 두 문자열 길이가 같을 때만 가능합니다. 즉 **prefix 자동 통과는 사실상 "정규화 후 완전 일치"인 exact 케이스에서만 성립**합니다. 코드 구조가 원리적으로 Pitfall 3를 막아버리는 셈이에요.

**자사 이름 블랙리스트 (Pitfall 6):**

혹시 AI가 통화 내용에서 "퍼즐"이나 "퍼즐코퍼레이션"을 회사명으로 뽑아냈다면, 그건 **자기 회사 이름**이니까 매칭 대상에서 무조건 제외해야 합니다. 그렇지 않으면 "자기 자신한테 이메일 보내는" 사고가 납니다.

```typescript
export const COMPANY_BLACKLIST = [
  '퍼즐', 'puzl', '퍼즐코퍼레이션', 'puzzle corporation'
];
```

이 목록에 들어가는 이름은 매처 진입 시점에서 `nameToMatch = null` 처리되어 Step 2를 건너뛰고 바로 Step 3로 갑니다. 실제로 테스트로 검증되었어요.

**D-03 전화번호 학습:**  
Step 2a (`name_exact`), Step 2b (`name_fuzzy`), Step 3 (`ceo_select`) 어디서 매칭이 되든, **phone이 있고 기존 DB에 저장 안 되어 있으면 자동으로 학습 저장**됩니다. 다음번에 같은 사람이 전화하면 Step 1에서 즉시 매칭되겠죠.

**Step 3 대표님 응답 3가지:**

| action | 의미 | 결과 |
|--------|------|------|
| `select` | 후보 중 하나 선택 | matched + method:`ceo_select` + 전화번호 학습 |
| `new_client` | 신규 고객 등록 | `upsertClient` 호출 후 status:`new_client` |
| `cancel` | 대표님이 결정 미루기 | status:`cancelled`, throw 없음, 커서 갱신은 오케스트레이터 책임 |

**cancel은 에러가 아닙니다.** "지금 당장 판단 못 하겠어, 나중에 다시 보여줘"라는 뜻입니다. 그래서 throw하지 않고 얌전히 `'cancelled'`를 리턴합니다.

### 5. 테스트 — 73개 전부 green

- `phone-normalizer.test.ts`: **9건** (국내/국외/하이픈/공백/+82/괄호/빈 입력)
- `call-parser.test.ts`: **17건** (패턴 1 6건 + 패턴 2 5건 + 엣지 케이스 6건)
- `clients.test.ts`: **22건** (기존 6건 + 신규 16건 — getClientByPhone 5 + getClientByEmail 5 + savePhoneLearning 4 + getAllCompanyNames 2)
- `client-matcher.test.ts`: **25건**
  - normalizeKoreanCompany 1건
  - fuzzyMatchCompanyName 6건
  - Step 1 2건
  - Step 2a 3건
  - Step 2b 자동 통과 경계 4건 (score=1.0 / prefix / 2개 후보 / 0.80 / contains)
  - Step 3 분기 4건 (cancel / select / new_client / 페이로드 검증)
  - 자사 블랙리스트 2건
  - 엣지 케이스 2건

**합계: 73/73 green. 리그레션 0.**

## 생성/수정된 파일 요약

| 분류 | 파일 | 역할 |
|------|------|------|
| 유틸 | `src/workflow/phone-normalizer.ts` (신규) | `normalizePhone` 단일 함수 |
| 유틸 | `src/workflow/phone-normalizer.test.ts` (신규) | 9건 |
| 파서 | `src/workflow/call-parser.ts` (신규) | 순수 함수 파서 + zod 스키마 |
| 파서 | `src/workflow/call-parser.test.ts` (신규) | 17건 |
| DB | `src/queries/clients.ts` (수정) | 기존 4개 + 신규 4개 메서드 |
| DB | `src/queries/clients.test.ts` (수정) | 기존 6건 + 신규 16건 |
| 매처 | `src/workflow/client-matcher.ts` (신규) | 3단계 상태 머신 + 퍼지 매칭 |
| 매처 | `src/workflow/client-matcher.test.ts` (신규) | 25건 |

## 커밋 히스토리

| # | 해시 | 설명 |
|---|------|------|
| 1 | `7876e9b` | phone-normalizer + call-parser + 26건 테스트 |
| 2 | `a1f508e` | clients 쿼리 확장 4개 메서드 + 16건 테스트 |
| 3 | `f76c3a9` | client-matcher 3단계 상태 머신 + 25건 테스트 |

## Plan 03/04/05가 import해서 쓸 수 있는 export 목록

```typescript
// ─ Plan 03 (call-analyzer) — AI 분석기
import { parseSlackCallMessage, ParsedCallSchema } from '../workflow/call-parser.js';
import type { ParsedCall, ParseResult } from '../workflow/call-parser.js';

// ─ Plan 03/05 — 클라이언트 매칭
import {
  matchClient,
  fuzzyMatchCompanyName,
  normalizeKoreanCompany,
  COMPANY_BLACKLIST,
} from '../workflow/client-matcher.js';
import type {
  MatchResult,
  MatchCandidate,
  ClientMatcherDeps,
  CeoConfirmationRequest,
  CeoConfirmationResponse,
} from '../workflow/client-matcher.js';

// ─ 어디서든 전화번호를 다룰 때
import { normalizePhone } from '../workflow/phone-normalizer.js';

// ─ clients 확장 메서드 (Plan 03 + Plan 05)
// createClientQueries(db) 반환 객체에 이미 포함됨:
//   .getClientByPhone(phone) .getClientByEmail(email)
//   .savePhoneLearning(name, phone) .getAllCompanyNames()
```

## Pitfall 대응 내역

### Pitfall 1: 전화번호 정규화 중복 정의
**대응:** 단일 `normalizePhone` 유틸을 `src/workflow/phone-normalizer.ts`에 정의하고, 파서/매처/clients 쿼리(학습/조회) 4곳이 모두 이 함수를 import. 정적 검사(`grep "replace(/\\D/g"`)로 중복 재정의 없음 확인.

### Pitfall 3: 퍼지 매칭 자동 통과 느슨화
**대응:** 자동 통과 조건을 **3-AND**로 고정 (`score >= 0.95 AND candidates.length === 1 AND reason in [exact, prefix]`). 4건의 경계 테스트로 검증:
1. score=1.0 단일 후보 → 통과 ✅
2. score~0.807 단일 후보 (prefix) → 차단, Step 3 ✅
3. score~0.921 (후보 2개) → 차단, Step 3 ✅
4. contains 0.70 → 차단, Step 3 ✅

prefix 수학: `0.75 + (shorter/longer)*0.20 >= 0.95` ⟺ `shorter/longer >= 1.0` ⟺ 사실상 exact.

### Pitfall 6: 자사 이름이 매칭 후보로 등장
**대응:** `COMPANY_BLACKLIST` 상수를 export하고, `isBlacklisted()` 헬퍼가 2곳에서 호출됨:
1. `fuzzyMatchCompanyName` 내부 — 후보 목록에서 자사명 제외
2. `matchClient` Step 2 진입 직전 — `nameToMatch`가 자사이면 null 처리

전용 테스트로 `extractedCompanyName='퍼즐'` 시 Step 2 진입이 차단되고 Step 3로 직행함을 확인.

## 위협 모델 대응 (threat_model에서 정의된 항목)

| ID | 대응 위치 |
|----|----------|
| T-03-09 (입력 검증/DoS 방지) | `parseSlackCallMessage`는 throw 없이 `{success:false, reason}` 반환. zod 최종 재검증. |
| T-03-10 (전화번호 오매칭) | Step 1 정확 매칭 + Step 2b 3-AND 엄격 조건 + 경계선 Step 3로 강제 |
| T-03-11 (회사명 전체 노출 위험) | `getAllCompanyNames`는 문자열 배열만 반환. Client 객체 전체 노출 없음 |
| T-03-12 (정규화 불일치) | 단일 `normalizePhone` + 정적 grep 검증 |
| T-03-13 (자사 이름 매칭) | `COMPANY_BLACKLIST` + `isBlacklisted` 2곳 체크 |
| T-03-14 (askCeoConfirmation 페이로드 과다) | callSummary(최대 2줄) + extractedInfo 3필드 + candidates 상위 5개로 제한 |
| T-03-15 (savePhoneLearning 경로 분기 누락) | 매칭 경로별 단위 테스트에서 호출/미호출 명시적 검증 (phone null일 때 미호출 포함) |
| T-03-16 (익시오 포맷 변경으로 파서 전체 실패) | Result 타입 격리 — accept |

## Deviations from Plan

### [Rule 1 - Bug] normalizeKoreanCompany 접미사 제거 순서

**언제 발견:** Task 3 RED → GREEN 단계에서 `(주) 동반성장 위원회` 입력이 `'주동반성장위원회'`로 정규화되어 DB의 `'동반성장위원회'`와 매칭 실패.

**원인:** 플랜의 초기 코드 스니펫이 구두점 제거(`[()[\]{}/,.\-]`)를 법인 접미사 제거(`(주)`, `주식회사`)보다 먼저 수행하고 있었습니다. 괄호가 먼저 제거되면 `(주)` 패턴이 `주`로 바뀌어 접미사 매칭에서 누락됩니다.

**수정:** normalizeKoreanCompany 내부 순서를 뒤집어 **법인 접미사 제거 → 공백 제거 → 구두점 제거** 순으로 변경. 또한 `corp`/`inc`/`ltd`는 영어 단어 경계(`\b`)를 사용해서 오인식을 방지했습니다.

**영향받은 파일:** `src/workflow/client-matcher.ts` (normalizeKoreanCompany 함수만)  
**검증:** Task 3 테스트가 모두 green으로 복구됨 (25/25).  
**커밋:** 최종 Task 3 커밋(`f76c3a9`)에 포함됨.

이 수정은 플랜이 명시한 **"legal suffix 제거"** 기능의 의도를 살리기 위한 버그 수정입니다. 플랜의 전체 설계 방향은 그대로 유지되었습니다.

## Deferred Issues

**없음.** Plan 02 범위 안의 모든 task가 완수되었습니다. 알려진 워크트리 격리 이슈(prompt-loader.test.ts 2건)는 `.planning/phases/03-workflow-b/deferred-items.md`에 이미 Plan 01에서 기록되어 있으며, 본 플랜과 무관합니다.

## Known Stubs

**없음.** 파서/매처/쿼리 확장 모두 실제 동작하는 완전한 구현입니다. `askCeoConfirmation`은 의도적으로 DI 인터페이스로 두었으며 (Plan 05 오케스트레이터가 실제 구현체를 주입), 이는 **stub이 아니라 설계 상의 ports-and-adapters 경계**입니다.

## 다음 단계 (Plan 03~05 인수인계)

**Plan 03 (call-analyzer — AI 브리핑 생성기):**
- `parseSlackCallMessage(slackText)` → `{success:true, data: ParsedCall}` 획득.
- `data.transcript` 를 Anthropic SDK에 전달 → summary + actionItems + sentiment 추출.
- 결과를 `createBriefingQueries.saveBriefing()`으로 저장 (Plan 01 제공).
- `data.contact.companyName` 또는 AI 추출 회사명을 Plan 02의 `matchClient`에 전달하여 client를 확정한 후, 그 client.id를 briefing에 기록.

**Plan 05 (workflow-b 오케스트레이터):**
```typescript
// 대략적인 흐름
const cursor = loadSlackCursor();
assertAllowedChannel(ALLOWED_CHANNEL_ID);
const messages = await slackMcp.conversations_history({ channel: ALLOWED_CHANNEL_ID, oldest: cursor.lastReadTs });

for (const msg of messages) {
  const parsed = parseSlackCallMessage(msg.text);
  if (!parsed.success) continue; // 익시오 아님 → skip

  const briefing = await analyzeCall(parsed.data); // Plan 03 AI 분석
  const match = await matchClient(parsed.data, { clientQueries, askCeoConfirmation }, briefing.extractedCompanyName);

  if (match.status === 'cancelled') continue; // 대표님 미정 → 커서 갱신 X

  saveBriefing({ clientId: match.client.id, slackTs: msg.ts, ... });
  createTouchpoint({ clientId: match.client.id, type: 'call', sourceId: msg.ts, ... });
  saveSlackCursor({ lastReadTs: msg.ts, ... });
}
```

**askCeoConfirmation 구현 힌트 (Plan 05):**  
CLI 방식이면 `readline`으로 대표님에게 질문 → 선택지 숫자 입력. 웹 방식이면 대기 중인 confirmation을 DB에 저장하고 Slack DM으로 알림 → 대표님이 링크 클릭 → 선택 → promise resolve.

## Self-Check: PASSED

**파일 존재 확인:**
- [x] `src/workflow/phone-normalizer.ts`
- [x] `src/workflow/phone-normalizer.test.ts`
- [x] `src/workflow/call-parser.ts`
- [x] `src/workflow/call-parser.test.ts`
- [x] `src/queries/clients.ts` (수정됨, 4개 메서드 추가)
- [x] `src/queries/clients.test.ts` (수정됨, 16건 추가)
- [x] `src/workflow/client-matcher.ts`
- [x] `src/workflow/client-matcher.test.ts`

**커밋 해시 확인:**
- [x] `7876e9b` (Task 1: phone-normalizer + call-parser)
- [x] `a1f508e` (Task 2: clients 쿼리 확장)
- [x] `f76c3a9` (Task 3: client-matcher 상태 머신)

**테스트 통과:**
- [x] `phone-normalizer.test.ts`: 9/9 green
- [x] `call-parser.test.ts`: 17/17 green
- [x] `clients.test.ts`: 22/22 green (기존 6 + 신규 16, 리그레션 없음)
- [x] `client-matcher.test.ts`: 25/25 green
- [x] **총 73/73 green**

**정적 검증:**
- [x] `/\D/g`는 `phone-normalizer.ts` 한 곳에서만 발견 (Pitfall 1 방지)
- [x] CommonJS 로더(r-e-q-u-i-r-e 호출)는 이번 플랜의 4개 src 파일 어디에도 없음 — ESM `import`만 사용
- [x] 기존 `createClientQueries` 4개 메서드(getClient/getClientById/upsertClient/updateClientField) 시그니처 및 동작 보존

**수동 검증:**
- [x] Pitfall 3 3-AND 조건이 코드에 명시적으로 존재 (`src/workflow/client-matcher.ts` autoPassOk 변수)
- [x] Pitfall 6 블랙리스트가 `fuzzyMatchCompanyName` + `matchClient` 두 곳에서 체크됨
- [x] D-03 학습이 `name_exact` / `name_fuzzy` / `ceo_select` 세 경로 모두에서 호출됨 (테스트로 검증)

Plan 02 완료. 다음 Wave 3(Plan 03)가 `parseSlackCallMessage`와 `matchClient`를 받아 AI 분석 단계를 이어갈 준비가 완료되었습니다.
