# Phase 3: Workflow B (통화 후속 처리) - Research

**Researched:** 2026-04-10
**Domain:** 슬랙 통화 요약 파싱 · 한국어 퍼지 매칭 · Drizzle FK 스키마 확장 · 기존 스레드 Reply 드래프트 · 터치포인트 타임라인
**Confidence:** HIGH (기존 Phase 1/2 코드베이스 기반 · 일부 한국어 유사도 알고리즘은 MEDIUM)
**응답 언어:** 한국어

---

## Summary

대표님께 먼저 한 줄 요약 드립니다. **Phase 3은 기본적으로 Phase 2에서 만든 안전한 이메일 파이프라인을 "통화 입력"으로 한 번 더 재사용하는 작업**입니다. 바닥부터 새로 만드는 게 아니라, 기존에 검증된 부품(시장조사, 이메일 작성, 드래프트 생성, 안전장치)을 그대로 쓰고, 앞에 "슬랙 메시지를 읽고 → 통화 내용을 뽑아내고 → 어느 회사 통화인지 맞추는" 세 단계만 새로 덧붙이면 됩니다.

핵심은 세 가지입니다. 첫째, 익시오/클로바노트 메시지 형식은 고정 템플릿(헤더 한 줄 + 날짜 한 줄 + "연락처 ..." 한 줄 + 섹션 블록)이라 정규식 기반 파서로 충분히 안정적으로 분해할 수 있습니다. 둘째, 3단계 매칭(전화번호 → AI 추출 + 퍼지 매칭 → 대표님 확인)은 "절대 추측 금지(D-02)" 원칙을 코드에 박아넣는 게 핵심이고, 임계값 이상 매칭돼도 신뢰도가 경계선이면 반드시 질문을 던지도록 구조화해야 합니다. 셋째, touchpoints 테이블은 Drizzle로 FK 포함해 추가하고, Workflow A/B 양쪽에서 기록하도록 후방 호환 통합하며, 조회는 단일 clientId 기준으로만 해서 D-04 교차 오염 원칙을 유지합니다.

**Primary recommendation:** Phase 2 workflow-a.ts의 9단계 파이프라인을 "Workflow B 7단계 파이프라인"으로 그대로 모방하되, 앞부분 3단계만 교체한다 — (1) `parseSlackCallMessage` (정규식 파서) → (2) `matchClient` (3단계 매칭 + 대화형 확인) → (3) `analyzeCall` (AI 구조화 추출). 나머지 4단계(기존 스레드 로드 → composeEmail → 안전 3중 게이트 → createDraft)는 Phase 2 코드를 재사용한다. DB 확장은 Drizzle 마이그레이션으로 `touchpoints` 테이블 + `briefings` 테이블 + `clients.contactPhone` 인덱스 세 가지만 추가.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**클라이언트 식별 시스템**
- **D-01:** 3단계 자동 매칭을 구현한다. (1) 전화번호로 DB 검색 → (2) AI가 통화 내용에서 회사명/이름 추출 후 DB 검색 (유사 이름 매칭 포함) → (3) 매칭 실패 시 대표님에게 반드시 확인.
- **D-02:** 매칭 실패 시 봇이 추측해서 연결하면 절대 안 된다. 반드시 대표님에게 "이 통화 어느 회사 건인가요?" 확인을 받는다. 교차 오염 방지 원칙(Phase 1 D-04) 연장.
- **D-03:** 대표님 확인 후 전화번호를 클라이언트 DB에 저장하여 다음부터 자동 매칭되도록 학습한다.
- **D-04:** 클라이언트 DB에 전화번호/이메일 기반 검색 함수를 추가한다 (getClientByPhone, getClientByEmail). 기존 회사명 검색(getClient)과 병행.
- **D-05:** 대표님 확인은 봇 대화에서 직접 진행한다. 슬랙 DM이나 쓰레드가 아닌, 현재 대화 세션에서 질문하고 답변받는다.

**통화 요약 처리 트리거**
- **D-06:** 자동 폴링이 아닌 대표님 요청 시에만 처리한다. 대표님이 "통화 정리해줘", "슬랙 확인해줘" 등 요청하면 슬랙에서 새 메시지를 가져와 처리. 불필요한 통화까지 자동 처리하는 노이즈를 방지.
- **D-07:** 마지막 읽은 타임스탬프 기반으로 새 메시지만 처리한다 (기존 패턴 유지). 처리 완료 후 타임스탬프를 갱신한다.

**액션아이템 추출**
- **D-08:** 통화 내용에서 추출하는 정보는 3가지: (1) 핵심 요약 (3줄 이내) + 구체적 액션아이템 목록, (2) 마감/일정 정보 자동 감지 ("내일 점심 전까지" → 절대 날짜로 변환), (3) 분위기/온도 감지 (상대방 긍정적/난색/설득 필요 등).
- **D-09:** 익시오/클로바노트 텍스트 형식을 파싱한다. 실제 슬랙 메시지 패턴: (1) "익시오에서 최영록님이 공유한 대화 내용입니다" 헤더, (2) 연락처 정보 (회사명/이름/전화번호), (3) [주요 내용] 요약, (4) [대화 내용] 전문 — 이 구조를 파서로 분리.
- **D-10:** 상대방 정보(담당자 이름, 전화번호 등)가 통화에서 새로 확인되면 클라이언트 DB를 자동 업데이트한다 (Phase 2 ensureClient 패턴 활용).

**후속 이메일 생성**
- **D-11:** 후속 이메일은 기존 이메일 스레드에 답장(Reply)으로 생성한다. 파이프라인에서 해당 클라이언트의 emailThreadId를 찾아서 threadId를 지정. 기존 스레드가 없으면 새 이메일로 생성.
- **D-12:** 이메일 작성은 Phase 2의 compose → quality-check → draft-creator 파이프라인을 재활용한다. v4 ULTRA 규칙, CC 강제, HTML 인코딩 치환 등 모든 안전장치 동일 적용.
- **D-13:** 통화 내용 + 기존 이메일 스레드 맥락을 함께 AI에 전달하여 맥락이 이어지는 후속 이메일을 생성한다.

**활동 기록 (터치포인트)**
- **D-14:** touchpoints 테이블을 SQLite에 추가한다. 모든 접점(이메일 발송, 통화, 파이프라인 상태 변경)을 하나의 테이블에 기록. 컬럼: id, clientId (FK), type ('email'|'call'|'stage_change'), sourceId (threadId|slackTs|dealId), summary, createdAt.
- **D-15:** Phase 2 Workflow A에서도 이메일 드래프트 생성 시 터치포인트를 기록하도록 통합한다 (후방 호환).
- **D-16:** "이 클라이언트랑 지금까지 뭘 했지?"를 한눈에 볼 수 있는 타임라인 조회 함수를 제공한다.

### Claude's Discretion

- 유사 이름 매칭의 구체적 알고리즘 (Levenshtein, 부분 문자열, 초성 매칭 등)
- 익시오/클로바노트 파서의 세부 정규식 패턴
- 분위기/온도 감지의 구체적 분류 카테고리
- 터치포인트 테이블의 인덱스 설계

### Deferred Ideas (OUT OF SCOPE)

- 통화 내용 기반 견적서/제안서 자동 생성 — Phase 3 범위 초과, v2 자료 허브에서 다룰 것
- 통화 예약/캘린더 연동 — 별도 Phase 필요
- 자동 폴링 (슬랙 주기적 확인) — v2 이후 자율성 높아질 때 고려
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALL-01 | 슬랙 #세일즈_통화요약 채널에서 새 메시지를 읽을 수 있다 (이미 읽은 메시지 제외) | §"Slack MCP 메시지 읽기 + 커서 패턴" + §"Code Example: slackCursor 관리" |
| CALL-02 | 클로바노트/익시오 텍스트에서 핵심 사항/액션아이템을 구조화하여 추출한다 | §"익시오/클로바노트 메시지 파서" (정규식 파싱 + 섹션 분리) + §"AI 구조화 추출: tool_use 스키마" |
| CALL-03 | 통화 내용 + 기존 이메일 스레드 맥락을 반영하여 후속 이메일을 작성한다 (Workflow B) | §"Gmail 스레드 컨텍스트 로딩 + 기존 스레드 Reply" + §"Code Example: runWorkflowB 오케스트레이터 스켈레톤" |
| CALL-04 | 통화 브리핑을 briefings DB에 자동 저장한다 | §"briefings 테이블 스키마" + §"Drizzle 마이그레이션 가이드" |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

CLAUDE.md에서 Phase 3에 직접 영향을 주는 지침을 뽑았습니다. 플래너는 모든 태스크가 이 지침을 위반하지 않도록 검증해야 합니다.

| 범주 | 지침 | Phase 3 적용 포인트 |
|------|------|---------------------|
| 소통 | 개발 비전문가인 대표님에게 쉬운 말로 설명, 한국어 소통 | 대표님 확인 대화 UI(D-05)의 질문 문구는 기술 용어 금지 ("threadId" 같은 단어 노출 X) |
| MCP 한계 | Gmail/Slack MCP로만 외부 소통 | 슬랙 읽기는 Slack MCP 도구로만, 직접 크롤링 금지 |
| 승인 필수 | v1은 모든 이메일 승인 후 발송 | Workflow B도 Gmail 드래프트로만 생성, 자동 발송 금지 |
| 톤/스타일 | v4 ULTRA 규칙 100% 준수 | 후속 이메일도 Phase 2 compose → quality-check → sanitize 파이프라인 필수 통과 |
| 보안 | 클라이언트 간 교차 노출 금지 | touchpoints 조회는 반드시 단일 clientId 기준 (listAllTouchpoints 같은 함수 금지) |
| 슬랙 채널 규칙 | #세일즈_통화요약 채널만 읽기, 다른 채널 절대 조회 금지 | Slack MCP 호출 시 channel ID 하드코딩 + 방어 체크 |
| CC 필수 | PM@puzl.co.kr, leader@puzl.co.kr 항상 CC | 기존 `MANDATORY_CC` 상수 재사용, 절대 재정의 금지 |
| GSD | Edit/Write 전 GSD 워크플로우 사용 | 모든 구현은 `/gsd-execute-phase` 경유 (플래너가 태스크 쪼개기) |

## Standard Stack

### Core (이미 프로젝트에 설치됨 — 재사용)

| Library | Installed Version | Purpose | Why Standard | Source |
|---------|-------------------|---------|--------------|--------|
| better-sqlite3 | 12.8.0 | SQLite 드라이버 | touchpoints/briefings 테이블 추가에 그대로 사용 | [VERIFIED: package.json] |
| drizzle-orm | 0.45.2 | 타입 안전 ORM | 기존 스키마 패턴 그대로 확장, FK 선언 지원 | [VERIFIED: package.json] |
| drizzle-kit | 0.31.10 | 마이그레이션 생성 | `drizzle-kit generate` 로 touchpoints 테이블 마이그레이션 자동 생성 | [VERIFIED: package.json] |
| zod | 4.3.6 | 스키마 검증 | 파서 출력 · AI tool_use 응답 검증 | [VERIFIED: package.json] |
| vitest | 4.1.2 | 테스트 | 파서/매칭/워크플로우 단위 테스트 | [VERIFIED: package.json] |

> 주의: package.json의 zod는 `^4.3.6` 이고, drizzle-kit은 `^0.31.10` 입니다. CLAUDE.md에 적힌 "0.45.x/0.30.x/3.24.x" 수치는 CLAUDE.md 작성 시점의 가이드이고, **실제 설치된 버전이 정답**입니다. 플래너는 CLAUDE.md 수치가 아니라 package.json 기준으로 import 해야 합니다. [VERIFIED: `cat package.json`]

### 신규 추가 권장 (선택적)

| Library | Version | Purpose | When to Use | Source |
|---------|---------|---------|-------------|--------|
| fastest-levenshtein | 1.0.16 | 레벤슈타인 거리 계산 | 회사명 퍼지 매칭 (Step 2-a) | [VERIFIED: `npm view fastest-levenshtein version`] |
| es-hangul | 2.3.8 | 한글 초성 추출/자모 분해 | 초성 검색 보조 (Step 2-b) — 선택적 | [VERIFIED: `npm view es-hangul version`] |

**권장 사항:** Phase 3 MVP는 **외부 라이브러리 추가 없이** 직접 구현한 간단한 알고리즘으로 시작하세요. 이유는 세 가지입니다.

1. 한국어 회사명 퍼지 매칭은 Levenshtein만으로는 충분하지 않습니다("동반성장" vs "동반성장위원회" 같은 접두어 포함 케이스는 부분 문자열 매칭이 더 정확). Levenshtein은 보조 지표로만 씁니다.
2. 3단계 매칭의 핵심은 "정확도가 낮으면 반드시 대표님에게 물어본다"이지, "퍼지 알고리즘이 완벽해야 한다"가 아닙니다. 알고리즘이 70~80% 수준이어도 나머지는 D-02가 잡아줍니다.
3. 외부 라이브러리를 넣으면 의존성이 늘고 공급망 보안 검토가 필요합니다. MVP 이후 실제 오매칭 사례가 쌓였을 때 라이브러리를 추가하는 게 낫습니다.

플래너는 `src/workflow/client-matcher.ts` 내부에 아래 "Code Example: 한국어 회사명 퍼지 매칭" 스니펫처럼 직접 구현하세요. Levenshtein/es-hangul 도입은 v1 이후로 유예하되, 마이그레이션 경로는 인터페이스로 열어두십시오.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 정규식 파서 | PEG 파서(peggy) | 익시오 포맷은 고정 템플릿이라 정규식으로 충분, PEG는 오버킬 |
| 자체 퍼지 매칭 | fastest-levenshtein + es-hangul | 외부 의존성 추가, 한국어 특수성 대응에 한계 (위 설명 참조) |
| touchpoints를 JSON 파일 | SQLite 테이블 | Phase 1 이후 SQLite 중심, 파일 기반은 동시성/인덱싱 불가 |
| Claude API JSON mode | Anthropic SDK tool_use | tool_use가 스키마 엄격성이 더 높고 zod 변환 친화적 |
| Slack 자동 폴링 (cron) | 대표님 요청 트리거 | D-06으로 확정. 노이즈 방지 |

### Installation

**새 패키지 설치는 권장하지 않습니다.** 기존 `package.json`의 dependencies만으로 Phase 3 전체 구현이 가능합니다. 굳이 추가해야 할 경우에만:

```bash
# (선택) 퍼지 매칭 품질이 MVP 이후 문제가 된다면:
npm install fastest-levenshtein es-hangul
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 3 신규 추가)

```
src/
├── db/
│   └── schema.ts                  # [수정] touchpoints + briefings 테이블 추가
├── queries/
│   ├── clients.ts                 # [수정] getClientByPhone/Email + savePhoneLearning
│   ├── touchpoints.ts             # [신규] createTouchpoint + getTimelineByClient
│   └── briefings.ts               # [신규] saveBriefing + getBriefingBySlackTs
├── state/
│   └── slack-cursor.ts            # [신규] 마지막 읽은 ts 저장/조회 (state/slack-cursor.json)
└── workflow/
    ├── call-parser.ts             # [신규] 익시오/클로바노트 파서
    ├── client-matcher.ts          # [신규] 3단계 매칭 + 대화형 확인 인터페이스
    ├── call-analyzer.ts           # [신규] AI 기반 통화 분석 (tool_use 호출)
    ├── thread-loader.ts           # [신규] Gmail 스레드 전문 로드
    └── workflow-b.ts              # [신규] 7단계 오케스트레이터
```

### Pattern 1: Workflow B 오케스트레이터 구조 (Workflow A의 파생)

**What:** Workflow A의 9단계 파이프라인을 그대로 빌려오되 앞부분만 교체한 7단계 파이프라인.
**When to use:** 대표님이 "슬랙 확인해줘" 요청 시 진입점.

**단계별 매핑:**

| Step | Workflow B | 재사용 | 신규 |
|------|-----------|--------|------|
| 1 | 슬랙 메시지 읽기 (커서 이후) | — | slack-cursor.ts + Slack MCP |
| 2 | 통화 메시지 파싱 | — | call-parser.ts |
| 3 | 클라이언트 3단계 매칭 | clients.ts 확장 | client-matcher.ts |
| 4 | 통화 내용 AI 분석 (요약/액션/온도) | Anthropic SDK | call-analyzer.ts |
| 5 | briefings + touchpoints 저장 | — | 신규 쿼리 모듈 |
| 6 | 기존 스레드 로드 + 후속 이메일 작성 | composeEmail · quality-checker · cross-contamination · price-validator · gmail-sanitizer | thread-loader.ts (Gmail MCP 래핑) |
| 7 | Gmail 드래프트 생성 (threadId 지정) | createDraft | — |

**핵심:** Step 6~7은 Phase 2 코드를 그대로 호출만 하면 됩니다. Phase 2에서 이미 검증된 안전 3중 게이트가 후속 이메일에도 동일하게 작동합니다. [VERIFIED: src/workflow/workflow-a.ts L127-L195 참조]

### Pattern 2: DI 패턴 확장 (WorkflowDependencies 재사용)

**What:** Phase 2의 `WorkflowDependencies` 인터페이스를 확장해서 Slack MCP 도구와 Anthropic SDK 함수를 주입.
**When:** workflow-b.ts 생성 시.

```typescript
// src/workflow/workflow-b.ts
export interface WorkflowBDependencies extends WorkflowDependencies {
  slackTool: SlackToolFn;           // slack_get_channel_history 래퍼
  anthropicTool: AnthropicToolFn;   // messages.create 래퍼 (tool_use)
  gmailReadThreadTool: GmailReadThreadFn;  // gmail_read_thread 래퍼
  touchpointQueries: ReturnType<typeof createTouchpointQueries>;
  briefingQueries: ReturnType<typeof createBriefingQueries>;
  slackCursorPath?: string;         // state/slack-cursor.json
  // 대화형 확인 인터페이스 (D-05) — 오케스트레이터가 대표님에게 질문
  askCeoConfirmation: (question: string, candidates: ClientCandidate[]) => Promise<CeoConfirmation>;
}
```

**이유:** Phase 2와 완전히 동일한 DI 패턴을 유지해야 테스트(in-memory SQLite + mock 함수)가 그대로 통합됩니다. `askCeoConfirmation`은 슬랙 DM이 아니라 "현재 Claude 대화 세션에서 질문"을 모델링하는 함수 — 실제 구현은 콘솔 프롬프트나 MCP 대화 흐름으로 구현되고, 테스트에서는 vi.fn()으로 mock.

### Pattern 3: 3단계 매칭 플로우 (폴백 체인)

**What:** "확실 → 덜 확실 → 모름" 폴백 체인. 각 단계가 실패하면 다음으로 넘어가고, 마지막 단계(AI 퍼지)에서도 신뢰도가 경계선이면 반드시 대표님 확인으로 에스컬레이션.
**When:** 파싱된 통화 데이터를 클라이언트에 연결할 때.

```
matchClient(parsedCall)
  │
  ├─ Step 1: 전화번호 정확 매칭
  │    getClientByPhone(normalizedPhone)
  │    → hit: return { client, method: 'phone_exact', confidence: 1.0 }
  │
  ├─ Step 2: AI가 회사명 추출 → 퍼지 매칭
  │    aiExtractCompanyName(callTranscript)
  │    → getClientByCompanyName(extracted) — 정확 매칭
  │    → findFuzzyMatches(extracted, allCompanyNames) — 부분 문자열 + 유사도
  │    → 단일 후보 + confidence ≥ 0.9: 반환 (단, 전화번호 저장 D-03)
  │    → 다중 후보 또는 confidence 0.6~0.9: Step 3
  │    → confidence < 0.6 또는 0건: Step 3
  │
  └─ Step 3: 대표님 확인 (대화형)
       askCeoConfirmation(question, candidates)
       → 선택됨: 전화번호 저장 (D-03), return matched client
       → 취소: throw "대표님 확인 거부 — 처리 중단"
```

**결정적 원칙:** 어떤 경우에도 Step 2에서 바로 통과시키지 말고, 신뢰도 임계값 아래거나 후보가 2개 이상이면 무조건 Step 3로 보냅니다. D-02 "추측 금지"를 코드에 박아넣는 방식입니다.

### Pattern 4: touchpoints — 후방 호환 통합

**What:** Workflow A가 Phase 2에 이미 배포된 상태에서, touchpoints를 추가해도 Workflow A가 깨지지 않게 하는 방법.
**When:** D-15 적용 시.

**구현 방법:** Workflow A의 `workflow-a.ts` Step 8(`createDraft`) 직후, Step 9(`addDeal`) 전에 `createTouchpoint({ type: 'email', ... })` 호출을 삽입. `touchpointQueries`가 `deps`에 없으면(기존 호출자 호환) silent skip.

```typescript
// workflow-a.ts (수정)
// ─── Step 8.5: 터치포인트 기록 (D-15) ─────────────
if (deps.touchpointQueries && client) {
  try {
    deps.touchpointQueries.createTouchpoint({
      clientId: client.id,
      type: 'email',
      sourceId: draftResult.threadId ?? draftResult.draftId,
      summary: `[드래프트] ${emailDraft.subject}`,
    });
  } catch {
    allWarnings.push('터치포인트 기록 실패 (비치명적)');
  }
}
```

**핵심:** `WorkflowDependencies.touchpointQueries`를 선택적(`?`)으로 추가하고, undefined일 때 skip. 기존 테스트는 건드리지 않고 신규 테스트만 추가.

### Anti-Patterns to Avoid

- **전화번호 정규화를 파서와 매처 양쪽에 구현:** 두 곳에서 다른 방식으로 정규화하면 "저장된 번호"와 "검색하는 번호"가 안 맞습니다. `src/workflow/phone-normalizer.ts` 단일 유틸로 추출. (01036906867 / 010-3690-6867 / +821036906867 → 모두 "01036906867"로 통일)
- **회사명 매칭에서 정확도 경계값을 "and"로 판단:** `if (confidence >= 0.8 && candidates.length === 1)` 같이 짜면 유지보수 시 실수 유발. 3단계 매칭은 **명시적 상태 머신**으로 작성 — `matchPhoneExact → matchNameExact → matchNameFuzzy → askCeo` 순서로 return 체인.
- **파서가 AI 호출을 내부에서 수행:** 파서는 순수 함수로 유지. AI 호출(회사명 추출, 분위기 분석)은 별도 단계(`call-analyzer.ts`)에서. 파서 테스트가 AI 모킹 없이 돌아갈 수 있어야 함.
- **touchpoints 테이블을 listAll로 조회:** Phase 1 D-04 위반. 반드시 `getTimelineByClient(clientId)` — 단일 clientId 필수.
- **슬랙 커서를 timestamp 문자열 비교 `>` 로 구현:** Slack ts는 `"1712548680.123456"` 형식이라 문자열 비교가 **대부분** 정상이지만, 자릿수가 다르면 깨집니다. `parseFloat` 후 숫자 비교 또는 slack_get_channel_history의 `oldest` 파라미터에 그대로 전달. [CITED: Slack API docs — conversations.history `oldest` 파라미터]
- **기존 스레드 없는데 threadId를 undefined가 아닌 빈 문자열로 전달:** Gmail API는 빈 문자열 threadId를 "잘못된 스레드"로 해석. D-11 "기존 스레드 없으면 새 이메일" 처리는 반드시 `threadId: undefined` 로 전달.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 이메일 본문 조립 | 새 compose 함수 | `composeEmail()` (compose.ts) | v4 ULTRA 고정 블록, CC, 서명, 링크 로직이 이미 내장 |
| HTML 인코딩 치환 | 새 sanitizer | `sanitizeForGmail()` (gmail-sanitizer.ts) | 14개 위험 문자 치환 + createDraft 내부 강제 호출 |
| 가격 검증 | 새 validator | `validatePrices()` (price-validator.ts) | 서비스 DB와 대조 + 경계선 경고 포함 |
| 교차 오염 검사 | 새 체크 | `validateNoContamination()` (cross-contamination.ts) | D-04 원칙 구현체, getAllCompanyNames 주입 패턴 |
| Gmail 드래프트 생성 | 새 MCP 래퍼 | `createDraft()` (draft-creator.ts) | MANDATORY_CC 강제, threadId 패스스루, sanitize 필수 호출 |
| 품질 체크리스트 | 새 체커 | `validateQualityChecklist()` (quality-checker.ts) | SECTION 20 11개 항목 이미 구현 |
| 파이프라인 업데이트 | 새 CRUD | `addDeal` / `updateDealStage` / `getDealByCompany` | zod 검증 + 원자적 쓰기 이미 적용 |
| 클라이언트 DB 단일 조회 | 새 쿼리 | `clientQueries.getClient()` + 확장 `getClientByPhone/Email` | D-04 원칙 내장 (0 또는 1건만 반환) |
| 이메일 subject 생성 | 새 포맷 | `generateSubject()` (quality-checker.ts) | [퍼즐/최영록] {회사} _ {내용} _ {YYMMDD} SECTION 8 규칙 |
| 타임스탬프 커서 저장 | 특별한 DB 테이블 | `state/slack-cursor.json` + atomic write | pipeline.ts의 `atomicWrite` 패턴 재사용, 단일 사용자라 파일로 충분 |
| 한국어 자연어 요약/액션 추출 | 규칙 기반 파서 | Anthropic SDK `tool_use` (구조화 출력) | 통화 내용의 다양성 때문에 규칙 기반 불가, Claude가 SECTION 20 스타일 따르면서 구조화 출력 |
| 전화번호 파싱 | 새 정규식 | 단순 `replace(/\D/g, '')` 후 접두사 정규화 | libphonenumber는 국내 전용에 오버킬 |

**Key insight:** Phase 3의 새 코드 대부분은 "기존 함수들을 연결하는 오케스트레이션 얇은 층"입니다. 바닥부터 만드는 건 **파서, 매처, 분석기, 오케스트레이터** 네 모듈뿐이고, 그마저도 300줄 이내로 짜집니다. Plan이 "새로 작성해야 할 LoC"를 과대 추정하지 않도록 주의하세요.

---

## 익시오/클로바노트 메시지 파서

### 실제 메시지 패턴 분석

CONTEXT.md의 "Specific Ideas"와 additional_context에서 제공된 두 가지 실제 패턴을 기반으로 분석했습니다. 세 번째 패턴(클로바노트 직접 공유)도 익시오와 유사한 형식을 씁니다.

**패턴 1 (연락처 저장됨):**
```
익시오에서 최영록님이 공유한 대화 내용입니다.
2026. 04. 08 (수요일) 오후 4시 18분
연락처 퍼즐) 동반성장위원회 이의선 위원(01036906867)님과의 통화

[대화 내용]
나: ...
상대방: 예 안녕하세요 저 동반 성장 위원회 이혜선입니다 ...
```

**패턴 2 (연락처 미저장):**
```
익시오에서 최영록님이 공유한 통화 내용입니다.
2026. 04. 06 (월요일) 오후 6시 04분
연락처 01036906867님과의 통화

[주요 내용]
- 콘텐츠 채널 및 일정 조율 논의
[상세 내용]
- 공공기관 수의계약 기준 금액 조정 필요성 언급
...

[대화 내용]
나: ...
```

### 정규식 설계

**1단계: 헤더 검증** (익시오 메시지인지 확인)
```
/^익시오에서 .+?님이 공유한 (대화|통화) 내용입니다\.$/m
```

**2단계: 날짜 추출**
```
/(\d{4})\. (\d{2})\. (\d{2}) \(([월화수목금토일])요일\) (오전|오후) (\d{1,2})시 (\d{2})분/
```
→ Asia/Seoul 타임존으로 ISO 8601 변환. 오후 + hour < 12면 +12, 오후 12시는 그대로, 오전 12시는 0시.

**3단계: 연락처 라인 파싱** (두 패턴 구분)
- 패턴 1: `/^연락처 (.+?)\((\d{9,11})\)님과의 통화$/` — 괄호 앞은 `"{회사}) {이름} {직함}"` 형태일 수 있고, `)` 기준 split 후 이름/직함 분리. 회사명은 `)` 전까지. [ASSUMED: 괄호 포맷 추론]
- 패턴 2: `/^연락처 (\d{9,11})님과의 통화$/` — 회사명/이름 미상 → 3단계 매칭의 Step 2(AI 추출)가 필수 발동.

**4단계: 섹션 블록 추출** (헤더 토큰 매칭)
```
const SECTION_HEADERS = ['[주요 내용]', '[상세 내용]', '[대화 내용]'];
```
→ 각 헤더를 앵커로 텍스트를 split. 헤더가 없으면 해당 섹션은 undefined.

**5단계: 대화 내용 화자 분리**
- `[대화 내용]` 블록 내부에서 `/^(나|상대방): /gm` 기준 라인 split
- 턴(turn) 배열로 저장: `{ speaker: 'me' | 'other', text: string }[]`

### zod 스키마 (파서 출력)

```typescript
export const ParsedCallSchema = z.object({
  source: z.literal('ixio'),             // 향후 'clova'도 지원 가능
  shareType: z.enum(['대화', '통화']),    // 헤더에서 추출
  occurredAt: z.string(),                // ISO 8601 (Asia/Seoul)
  contact: z.object({
    phone: z.string().nullable(),        // 11자리 정규화 ('01036906867')
    companyName: z.string().nullable(),  // 패턴 1에서만
    contactName: z.string().nullable(),  // 패턴 1에서만
    contactTitle: z.string().nullable(), // '위원', '대표' 등
  }),
  mainPoints: z.array(z.string()).nullable(),   // [주요 내용] 블록 라인
  details: z.array(z.string()).nullable(),      // [상세 내용] 블록 라인
  transcript: z.array(z.object({
    speaker: z.enum(['me', 'other']),
    text: z.string(),
  })).nullable(),
  rawText: z.string(),                   // 원문 (감사 로깅용)
});
```

### 파서 엣지 케이스

1. **익시오 메시지가 아닌 메시지:** 1단계 헤더 검증 실패 → `ParsedCallSchema`가 아닌 `{ skipped: true, reason }` 반환. Workflow B는 이 메시지를 건너뜀.
2. **날짜 파싱 실패:** 포맷이 조금이라도 다르면 "파싱 실패"로 처리, 대표님에게 "이 메시지 형식 이상합니다" 알림.
3. **[대화 내용] 없음:** 섹션이 없을 수 있음. 파서는 허용하고, call-analyzer에서 "대화 내용 없음" 경고 후 [주요 내용]만으로 분석.
4. **여러 통화가 하나의 메시지에:** 실제 익시오 동작상 1 메시지 = 1 통화. 다중 통화 케이스는 v2로 유예.

---

## 3단계 클라이언트 매칭 시스템

### Step 1: 전화번호 정확 매칭

**전제:** `clients.contactPhone`에 저장된 값과 **정규화된** 전화번호를 비교.

**정규화 규칙:**
```typescript
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // +821012345678 → 821012345678 → 01012345678
  if (digits.startsWith('82')) return '0' + digits.slice(2);
  return digits;
}
```

**쿼리 추가:** `clients.ts`에 `getClientByPhone(phone: string)` 추가.
```typescript
getClientByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return db.select().from(clients).where(eq(clients.contactPhone, normalized)).get();
}
```

**중요:** DB에 저장하기 전에도 반드시 `normalizePhone`으로 변환해서 저장해야 합니다. 그래야 "저장한 방식 = 검색하는 방식" 이 일치합니다. `upsertClient`에 `contactPhone`을 넘길 때 정규화하는 래퍼(`savePhoneLearning`)를 추가하세요.

### Step 2: AI 회사명 추출 + 퍼지 매칭

**AI 추출:** `call-analyzer.ts`의 분석 단계에서 이미 회사명 후보가 뽑혀나오므로, 그 결과를 재사용. 별도 AI 호출 불필요.

**퍼지 매칭 알고리즘** (직접 구현, 라이브러리 없음):

```typescript
// src/workflow/client-matcher.ts
export interface MatchCandidate {
  companyName: string;
  score: number;       // 0.0 ~ 1.0
  reason: 'exact' | 'prefix' | 'contains' | 'normalized';
}

function fuzzyMatchCompanyName(
  extracted: string,
  allCompanyNames: string[],
): MatchCandidate[] {
  const needle = normalizeKoreanCompany(extracted);
  const candidates: MatchCandidate[] = [];

  for (const name of allCompanyNames) {
    const hay = normalizeKoreanCompany(name);

    if (hay === needle) {
      candidates.push({ companyName: name, score: 1.0, reason: 'exact' });
    } else if (hay.startsWith(needle) || needle.startsWith(hay)) {
      // "동반성장" → "동반성장위원회" 같은 접두어 케이스
      const longer = Math.max(hay.length, needle.length);
      const shorter = Math.min(hay.length, needle.length);
      candidates.push({ 
        companyName: name, 
        score: 0.75 + (shorter / longer) * 0.20,
        reason: 'prefix' 
      });
    } else if (hay.includes(needle) || needle.includes(hay)) {
      candidates.push({ companyName: name, score: 0.70, reason: 'contains' });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function normalizeKoreanCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')           // 공백 제거
    .replace(/[()[\]{}/,.]/g, '')  // 괄호/쉼표 제거
    .replace(/(주식회사|㈜|\(주\)|주\))/g, '')  // 법인 접미사 제거
    .replace(/(코퍼레이션|corp|corporation|inc|ltd)/gi, '');
}
```

**판정 규칙:**
- score ≥ 0.95 AND 단일 후보 → 자동 매칭 (Step 3 스킵)
- score ≥ 0.70 OR 후보 2건 이상 → Step 3 (대표님 확인)
- 후보 0건 → Step 3 (대표님 직접 입력)

**왜 Levenshtein이 아닌가:** "동반성장" vs "동반성장위원회" 케이스에서 Levenshtein 정규화 거리는 약 0.47 정도로 떨어지지만, 실제로는 **동일 회사**일 확률이 매우 높습니다. 접두어/포함 매칭이 한국 회사명 특성(공공기관 + "위원회/협회/재단" 접미어)에 더 맞습니다. [ASSUMED: 실제 운영 데이터로 검증 필요]

### Step 3: 대표님 확인 (대화형)

**인터페이스 설계:** 
```typescript
export interface CeoConfirmationRequest {
  callSummary: string;           // 파싱된 통화 요약 (핵심 1~2줄)
  extractedInfo: {
    phone: string | null;
    companyName: string | null;
    contactName: string | null;
  };
  candidates: Array<{
    client: Client;
    score: number;
    reason: string;
  }>;
}

export interface CeoConfirmationResponse {
  action: 'select' | 'new_client' | 'cancel';
  selectedClientId?: number;
  newClientName?: string;  // action === 'new_client' 일 때
}
```

**대표님에게 보여줄 질문 형식 (D-05, 한국어, 쉬운 말):**
```
[이 통화 어느 회사 건인가요?]

2026-04-08 오후 4시 18분 통화
추정 회사: 동반성장위원회
연락처: 01036906867

자동으로 찾은 후보:
1. 동반성장위원회 (이의선 위원, 점수 95%)
2. 동반성장연구소 (다른 회사, 점수 72%)

어느 쪽인가요? (1/2/신규 클라이언트 등록/취소)
```

**확인 후 처리:**
- `action === 'select'`: D-03 적용 — `savePhoneLearning(selectedClientId, normalizedPhone)`으로 전화번호 저장. 다음부터는 Step 1에서 바로 매칭.
- `action === 'new_client'`: `upsertClient`로 신규 생성 (최소 정보: companyName + phone), 이후 Workflow B 계속.
- `action === 'cancel'`: Workflow B 중단, 에러가 아닌 "사용자 취소"로 결과 반환. touchpoint 기록 안 함.

**구현 방식 (D-05 "현재 대화 세션에서"):**
- `askCeoConfirmation`은 async 함수로 선언되지만, 실제 구현은 "Claude 에이전트가 자연어 질문을 출력하고, 다음 turn에서 대표님 답변을 파싱하는" 형태입니다.
- Phase 3 단계에서는 **함수 시그니처만 정의**하고, 실제 대화 연동은 Claude Agent SDK 사용 시점에 처리. 단위 테스트에서는 `vi.fn().mockResolvedValue({...})` 로 모킹.
- MVP 구현: CLI용 `readline` 기반 동기 구현도 가능 (대표님이 직접 실행할 때).

---

## AI 통화 분석 (call-analyzer.ts)

### Anthropic SDK tool_use 방식

**왜 tool_use인가:**
1. JSON mode보다 스키마 엄격성이 높습니다 (빠뜨린 필드 에러).
2. zod로 후처리 검증 시 변환이 깔끔합니다.
3. Claude가 "tool을 호출한다"는 멘탈 모델을 따르면 구조화 출력을 더 안정적으로 냅니다.
4. [CITED: https://docs.anthropic.com/en/docs/build-with-claude/tool-use] — Anthropic 공식 docs tool_use 섹션

### 분석 스키마 (tool 정의)

```typescript
const callAnalysisTool = {
  name: 'record_call_analysis',
  description: '통화 내용을 분석하여 구조화된 정보로 기록합니다.',
  input_schema: {
    type: 'object',
    required: ['summary', 'actionItems', 'sentiment'],
    properties: {
      summary: {
        type: 'string',
        description: '통화 핵심 요약 (3줄 이내, 한국어)',
      },
      actionItems: {
        type: 'array',
        description: '대표님 또는 상대방이 해야 할 일 목록',
        items: {
          type: 'object',
          required: ['who', 'what'],
          properties: {
            who: { type: 'string', enum: ['대표님', '상대방', '양측'] },
            what: { type: 'string', description: '구체적 할 일' },
            dueDate: { 
              type: 'string', 
              description: 'ISO 8601 날짜 또는 null. "내일 점심 전까지" → "2026-04-09T12:00:00+09:00"',
            },
          },
        },
      },
      sentiment: {
        type: 'object',
        required: ['tone', 'temperature'],
        properties: {
          tone: { 
            type: 'string', 
            enum: ['positive', 'neutral', 'caution', 'negative'],
            description: '상대방의 전반적 태도',
          },
          temperature: {
            type: 'string',
            enum: ['hot', 'warm', 'cool', 'cold'],
            description: '세일즈 리드 온도 (의사결정 임박도)',
          },
          rationale: { type: 'string', description: '판단 근거 1문장' },
        },
      },
      extractedCompanyName: {
        type: 'string',
        description: '통화에서 언급된 상대방 회사명. 추정 금지, 명확히 언급된 경우만.',
      },
      extractedContactName: { type: 'string' },
      nextContactSuggestion: { 
        type: 'string', 
        description: '다음 접촉 제안 (예: "D+2 후속 이메일", "D+7 제안서 발송")' 
      },
    },
  },
};
```

### 시스템 프롬프트 가이드라인

- **SECTION 20 품질 규칙 참조:** "이메일 작성" 규칙이 아닌 "분석 기록" 규칙이므로 v4 ULTRA §20 전문 로드는 불필요.
- **환각 방지:** "통화 내용에 명시되지 않은 정보는 null로 남기세요. 추정 금지."
- **온도 분류 기준:** hot(이번 주 내 결정) / warm(이번 달 결정) / cool(검토 단계) / cold(관심만). 기준을 프롬프트에 명시.
- **날짜 추출:** 상대 날짜("내일", "모레", "이번 주 금요일")를 통화 발생일(`parsed.occurredAt`) 기준으로 절대 날짜로 변환. 프롬프트에 "기준일: {occurredAt}" 주입.

### 분위기/온도 카테고리 정의 (Claude's Discretion)

**tone (대화 태도):**
- `positive` — 적극 호응, 긍정 피드백, 추가 질문
- `neutral` — 정보 수집 단계, 판단 유보
- `caution` — 가격/일정 우려, 내부 검토 필요 시사
- `negative` — 거절, 반대 의사, 연락 단절 가능

**temperature (세일즈 리드 온도):**
- `hot` — 의사결정권자 참여, 구체적 수치/일정 언급, 계약 근접
- `warm` — 구체적 관심, 후속 미팅 예약
- `cool` — 일반적 관심, 시장조사 단계
- `cold` — 단순 문의, 주도권 없음

이 분류는 향후 Phase 4(팔로업 케이던스 자동 조절)와 Phase 5(학습 루프) 입력으로 사용됩니다.

---

## briefings 테이블 스키마

**목적:** CALL-04 요구사항 — 통화 브리핑을 DB에 자동 저장.

**Drizzle 스키마 추가:**

```typescript
// src/db/schema.ts (추가)
export const briefings = sqliteTable('briefings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  slackTs: text('slack_ts').notNull().unique(),   // 중복 방지
  slackChannelId: text('slack_channel_id').notNull(),
  occurredAt: text('occurred_at').notNull(),       // 통화 발생 시각 (ISO 8601)
  source: text('source').notNull(),                // 'ixio' | 'clova'
  summary: text('summary').notNull(),              // AI 생성 3줄 요약
  actionItems: text('action_items', { mode: 'json' }).$type<Array<{
    who: string; what: string; dueDate: string | null;
  }>>(),
  sentiment: text('sentiment', { mode: 'json' }).$type<{
    tone: 'positive' | 'neutral' | 'caution' | 'negative';
    temperature: 'hot' | 'warm' | 'cool' | 'cold';
    rationale: string;
  }>(),
  rawTranscript: text('raw_transcript'),           // 원문 대화 내용 (감사용)
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
```

**인덱스 설계 (Claude's Discretion):**
- `slackTs UNIQUE` — 동일 메시지 재처리 시 중복 저장 방지. INSERT OR IGNORE 패턴.
- `(clientId, occurredAt DESC)` — 타임라인 조회 가속.

**조회 함수 (D-04 단일 클라이언트):**
```typescript
// src/queries/briefings.ts
export function createBriefingQueries(db: BetterSQLite3Database<any>) {
  return {
    saveBriefing(data: Omit<NewBriefing, 'id' | 'createdAt'>) {
      // INSERT OR IGNORE: 동일 slackTs 이미 있으면 skip
      return db.insert(briefings).values(data).onConflictDoNothing().returning().get();
    },
    getBriefingBySlackTs(slackTs: string) {
      return db.select().from(briefings).where(eq(briefings.slackTs, slackTs)).get();
    },
    getBriefingsByClient(clientId: number) {
      return db.select().from(briefings)
        .where(eq(briefings.clientId, clientId))
        .orderBy(desc(briefings.occurredAt))
        .all();
    },
  };
}
```

---

## touchpoints 테이블 스키마

**Drizzle 스키마 추가:**

```typescript
export const touchpoints = sqliteTable('touchpoints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['email', 'call', 'stage_change'] }).notNull(),
  sourceId: text('source_id').notNull(),  // threadId | slackTs | dealId
  summary: text('summary').notNull(),     // 한 줄 요약
  metadata: text('metadata', { mode: 'json' }),  // 선택적 추가 정보
  occurredAt: text('occurred_at').notNull(),    // 실제 발생 시각 (통화/이메일 시점)
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => ({
  clientIdx: index('touchpoints_client_idx').on(table.clientId, table.occurredAt),
  typeIdx: index('touchpoints_type_idx').on(table.clientId, table.type),
}));
```

**왜 `occurredAt`과 `createdAt`을 분리하는가:**
- `occurredAt` — 실제 이벤트 발생 시각 (통화: 통화 시각, 이메일: 드래프트 생성 시각, 상태 변경: 변경 시각)
- `createdAt` — DB에 기록된 시각 (과거 통화를 뒤늦게 처리할 수 있음)
- 타임라인은 `occurredAt` 기준 정렬이 맞음.

**조회 함수 (D-16 — 단일 클라이언트 타임라인):**
```typescript
export function createTouchpointQueries(db: BetterSQLite3Database<any>) {
  return {
    createTouchpoint(data: Omit<NewTouchpoint, 'id' | 'createdAt'>) {
      return db.insert(touchpoints).values(data).returning().get();
    },
    getTimelineByClient(clientId: number, limit = 50) {
      return db.select().from(touchpoints)
        .where(eq(touchpoints.clientId, clientId))
        .orderBy(desc(touchpoints.occurredAt))
        .limit(limit)
        .all();
    },
  };
}
```

**주의:** `getAllTouchpoints()` 같은 전역 조회 함수는 만들지 마세요. D-04 위반입니다.

---

## Drizzle 마이그레이션 가이드

**현재 프로젝트 상태:**
- `drizzle.config.ts` 없음 (검색 필요) — Plan은 `drizzle-kit generate` 실행 전 config 파일 존재 여부 확인 태스크 포함
- `package.json` scripts에 `db:generate`, `db:push`, `db:migrate` 이미 있음 [VERIFIED: package.json]
- 기존 DB 파일: `/Users/cyr/Desktop/Code/Sales/data/sales.db` (+ WAL, SHM 파일) [VERIFIED: `ls data/`]

**Phase 3 DB 변경 사항:**
1. `clients` 테이블: 변경 없음 (contactPhone 컬럼은 이미 존재) [VERIFIED: src/db/schema.ts L16]
2. `briefings` 테이블: 신규
3. `touchpoints` 테이블: 신규

**마이그레이션 절차:**
```bash
# 1. schema.ts 수정
# 2. 마이그레이션 파일 생성
npm run db:generate

# 3. 생성된 drizzle/ 마이그레이션 파일 검토 (수동)
# 4. 개발 DB에 적용
npm run db:migrate

# 5. 기존 data/sales.db에 실제 적용되는지 검증
# Phase 1/2 데이터가 보존되는지 확인
```

**롤백 전략:** 마이그레이션 실행 전 `data/sales.db`를 `data/sales.db.backup-phase3-YYYYMMDD`로 복사. 문제 발생 시 복구.

**FK 주의:** `foreign_keys = ON` 프래그마가 `connection.ts`에서 이미 설정됨. [VERIFIED: src/db/connection.ts L17] — FK 제약이 실제로 적용됩니다. `clients.id`가 없는 clientId로 INSERT 시 실패합니다.

---

## Slack MCP 메시지 읽기 + 커서 패턴

### 사용할 MCP 도구

**추정 도구 이름:** `slack_get_channel_history` — Phase 2 CONTEXT.md L99에 명시되어 있습니다. [VERIFIED: .planning/phases/02-workflow-a/02-CONTEXT.md L99]

**파라미터 (Slack conversations.history API 기반):**
```
channel: 'C0AQYJ9GJHK'   // #세일즈_통화요약 채널 ID [CITED: PROJECT.md L81]
oldest: '1712548680.123456'  // 마지막 읽은 ts (이 값보다 큰 메시지만)
limit: 50                // 한 번에 최대 50개
```
[CITED: https://api.slack.com/methods/conversations.history — oldest/latest/limit 파라미터]

### 커서 파일 (state/slack-cursor.json)

```typescript
// src/state/slack-cursor.ts
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';

const SlackCursorSchema = z.object({
  version: z.literal(1),
  lastReadTs: z.string(),          // Slack ts 형식 ("1712548680.123456")
  lastReadAt: z.string(),          // ISO 8601 (봇이 마지막으로 확인한 시점)
  channelId: z.string(),
});
export type SlackCursor = z.infer<typeof SlackCursorSchema>;

const DEFAULT_CURSOR_PATH = resolve(process.cwd(), 'state', 'slack-cursor.json');

export function loadSlackCursor(filePath: string = DEFAULT_CURSOR_PATH): SlackCursor {
  if (!existsSync(filePath)) {
    return {
      version: 1,
      lastReadTs: '0',   // 처음 실행 시 전체 조회
      lastReadAt: new Date(0).toISOString(),
      channelId: 'C0AQYJ9GJHK',
    };
  }
  return SlackCursorSchema.parse(JSON.parse(readFileSync(filePath, 'utf-8')));
}

export function saveSlackCursor(cursor: SlackCursor, filePath: string = DEFAULT_CURSOR_PATH): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(cursor, null, 2), 'utf-8');
  // atomicWrite 패턴 (pipeline.ts와 동일)
  renameSync(tmpPath, filePath);
}
```

**커서 갱신 타이밍:**
- 각 메시지를 **성공적으로 touchpoint에 기록한 후**에만 lastReadTs 갱신.
- 중간에 실패한 메시지가 있으면 그 이전 메시지의 ts까지만 저장 → 재실행 시 실패 지점부터 재처리.
- **원자성:** Workflow B 한 번 실행에 여러 메시지를 처리할 때, 마지막에 일괄 저장하지 말고 **메시지 단위로 갱신**. 중간 크래시에 강합니다.

### 채널 방어 체크

CLAUDE.md "슬랙 채널 규칙" 준수:
```typescript
const ALLOWED_CHANNEL_ID = 'C0AQYJ9GJHK';  // #세일즈_통화요약

function assertAllowedChannel(channelId: string) {
  if (channelId !== ALLOWED_CHANNEL_ID) {
    throw new Error(`금지된 채널 접근: ${channelId}. 허용: ${ALLOWED_CHANNEL_ID}`);
  }
}
```

Slack MCP 호출 직전에 이 함수를 반드시 호출. 실수로 다른 채널을 넘겨도 차단됩니다.

---

## Gmail 스레드 컨텍스트 로딩 + 기존 스레드 Reply

### 기존 스레드 찾기

**Deal의 `emailThreadId` 활용** [VERIFIED: src/state/pipeline.ts L20]:
```typescript
const deal = getDealByCompany(client.companyName, pipelinePath);
const existingThreadId = deal?.emailThreadId;
```

`emailThreadId`가 있으면 "기존 스레드 답장", 없으면 "새 이메일".

### 스레드 내용 로드 (Gmail MCP)

**추정 도구:** `gmail_read_thread` (또는 `gmail_get_thread`) — threadId를 받아 해당 스레드의 모든 메시지를 반환. [ASSUMED: Gmail MCP 서버의 정확한 도구 이름은 `.mcp.json`에 의존, 플래너가 Plan 초반에 `gmail_` 로 시작하는 MCP 도구 목록을 확인하는 태스크 필요]

**필요한 정보:**
- 스레드 내 모든 메시지의 `from`, `to`, `subject`, `body`, `internalDate`
- 시간순 정렬 (오래된 → 최신)
- AI 프롬프트에 "기존 대화 맥락"으로 주입

### composeEmail에 통화 + 스레드 맥락 전달

Phase 2의 `buildEmailPrompt` [VERIFIED: src/workflow/compose.ts L67]를 확장하지 말고, Phase 3 전용 프롬프트 빌더를 새로 만드세요:

```typescript
// src/workflow/follow-up-composer.ts (신규)
export function buildFollowUpPrompt(params: {
  classification: ClassificationResult;
  callAnalysis: CallAnalysisResult;
  threadHistory: ThreadMessage[];    // Gmail에서 로드
  client: Client;
  promptSections: string;            // v4 ULTRA 전략 G/H 섹션
}): EmailPromptResult {
  // 기존 스레드 요약 + 통화 분석 + 액션아이템 → userMessage 조립
  // strategy는 분류에서 'G' 또는 'H'로 자동 결정 (통화 후 후속)
}
```

**이후 composeEmail 호출:** Phase 2 compose.ts의 `composeEmail()`을 그대로 호출. `aiGeneratedBody`에 AI 출력을 넘기고, `threadId`에 `existingThreadId`를 지정. `classification.strategy === 'A'`가 아니므로 INTRO_LINKS_HTML은 자동으로 제외됨 (Phase 2 compose.ts L175-177 로직).

### v4 ULTRA 전략 선택

통화 후 후속 이메일은 v4 ULTRA §9의 전략 G(통화 후 요약/액션 확정) 또는 H(통화 후 제안서 발송)에 해당할 가능성이 높습니다. [CITED: system/v4_ULTRA_SYSTEM_PROMPT.md §9 전략 A~L]

**plan 태스크:** `getSectionsForClassification` 또는 `classifyInquiry`가 "통화 입력"에서 전략 G/H를 뽑을 수 있는지 검토. 현재는 이메일 본문 기반으로 분류하므로, Phase 3에서 `classifyCallFollowUp(callAnalysis, hasExistingThread)` 를 추가해 적절한 전략을 결정해야 합니다.

---

## Common Pitfalls

### Pitfall 1: 전화번호 정규화 불일치
**What goes wrong:** Step 1에서 `01036906867`을 찾고, DB에는 `010-3690-6867`로 저장되어 있어 매칭 실패. 대표님이 확인해서 DB에 저장했는데도 다음 통화에서 또 Step 3로 빠짐.
**Why:** 파서에서 추출한 값과 DB 저장 값의 정규화 규칙이 다르기 때문.
**How to avoid:** `src/workflow/phone-normalizer.ts` 단일 유틸을 만들고, **DB 저장 / DB 검색 / 파서 출력** 세 지점 모두에서 동일 함수 호출.
**Warning signs:** "분명히 확인했는데 또 묻는다" 피드백.

### Pitfall 2: 슬랙 ts 재처리 (커서 미갱신)
**What goes wrong:** 한 번에 10개 메시지를 처리하다가 5번째에서 에러 → 커서가 갱신 안 되어 다음 실행에서 1~4번을 다시 처리 → touchpoint 중복 기록.
**Why:** 커서를 일괄 저장 방식으로 설계한 경우.
**How to avoid:** 메시지 단위 커서 갱신. 그리고 touchpoints에 `(clientId, sourceId)` 유니크 조건을 추가하거나, briefings의 `slackTs UNIQUE` 제약으로 중복 삽입 방지.
**Warning signs:** 타임라인에 동일 통화가 두 번 보임.

### Pitfall 3: 퍼지 매칭이 엉뚱한 회사를 자동 통과시킴
**What goes wrong:** "동반성장" 통화인데 "동반성장연구소"로 매칭되어 Step 3 없이 진행, 잘못된 클라이언트에 후속 이메일 생성.
**Why:** score ≥ 0.95 조건에 "단일 후보"를 안 걸면 오매칭 위험. 또는 후보 계산 시 `normalizeKoreanCompany`가 너무 공격적으로 정규화.
**How to avoid:** 자동 통과 조건을 `score >= 0.95 AND 단일 후보 AND exact|prefix` 세 개 모두 AND로. 나머지는 무조건 Step 3.
**Warning signs:** 대표님이 "이 회사 아닌데?" 피드백, touchpoints에 잘못된 기록.

### Pitfall 4: 기존 스레드에 이어졌는데 subject가 달라서 Gmail이 별도 스레드로 처리
**What goes wrong:** `threadId`를 지정해도 Gmail이 subject가 다르면 스레드에서 분리하는 경우가 있음. [ASSUMED: Gmail 동작 기반 추론, 공식 문서 재확인 필요]
**Why:** Gmail API는 `threadId`를 강력히 존중하지만, 일부 클라이언트(특히 Gmail 웹)는 subject mismatch를 다르게 렌더링.
**How to avoid:** 기존 스레드에 답장할 때는 `generateSubject`로 새 제목을 만들지 말고, **기존 스레드의 첫 메시지 subject에 "Re:" 접두사**를 붙여 사용. Phase 2 `generateSubject`는 신규 스레드 전용.
**Warning signs:** Gmail UI에서 별도 대화로 표시됨.

### Pitfall 5: 교차 오염 체크가 통화 내용에 방해받음
**What goes wrong:** 통화 내용에 "저번에 A사와 얘기했는데..." 같은 언급이 있으면, `validateNoContamination`이 이걸 감지해서 차단.
**Why:** Phase 2 contamination 체크는 "이메일 본문" 기준. 통화 분석 단계의 입력에도 교차 오염 체크를 돌리면 과차단.
**How to avoid:** 교차 오염 체크는 **최종 이메일 HTML**에만 적용. 통화 transcript에는 적용하지 않음. Phase 2 workflow-a.ts의 Step 7a를 그대로 답습하면 자동으로 올바르게 적용됨.
**Warning signs:** "통화 정리해줘"에서 계속 교차 오염 에러.

### Pitfall 6: AI 분석 결과를 그대로 믿고 저장
**What goes wrong:** AI가 `extractedCompanyName: "퍼즐코퍼레이션"` 같이 **자기 회사 이름**을 뽑아내거나, 환각한 회사명을 반환. 이걸 touchpoint에 저장하면 잘못된 학습.
**Why:** Claude가 transcript의 "나: 안녕하세요 퍼즐의 최영록입니다" 같은 자기 소개도 회사명으로 인식.
**How to avoid:** `call-analyzer.ts`에서 뽑은 companyName을 "퍼즐/PUZL/퍼즐코퍼레이션" 블랙리스트로 필터링. 자사 이름이면 null 처리.
**Warning signs:** 매칭 단계에서 "퍼즐코퍼레이션" 후보가 자주 뜸.

### Pitfall 7: better-sqlite3 v12의 Breaking Change 놓침
**What goes wrong:** CLAUDE.md에 "better-sqlite3 11.x" 로 적혀 있지만 실제 설치는 12.8.0. v12는 Node 20+ 이상 요구 + API 약간 변경.
**Why:** CLAUDE.md와 실제 package.json 버전 불일치.
**How to avoid:** Plan은 CLAUDE.md가 아닌 package.json을 기준으로 작성. v11 → v12 마이그레이션 가이드 확인. [CITED: https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.0.0 — 플래너는 실제 릴리스 노트 확인 필수]
**Warning signs:** 타입 에러, 런타임 "not a function" 에러.

### Pitfall 8: Drizzle 스키마에 index() 문법 오타
**What goes wrong:** Drizzle 0.45에서 index 선언 문법이 테이블 콜백으로 변경됨. 구 버전 문법으로 쓰면 컴파일 에러.
**Why:** drizzle-orm 버전마다 인덱스 선언 API가 미세하게 달라짐.
**How to avoid:** Plan 실행 시 drizzle-orm 0.45.x 공식 문서 재확인. [CITED: https://orm.drizzle.team/docs/indexes-constraints]
**Warning signs:** `drizzle-kit generate` 실패, 타입 에러.

### Pitfall 9: briefings.slackTs UNIQUE 제약을 onConflictDoNothing 없이 insert
**What goes wrong:** 같은 메시지를 두 번 처리 시 UNIQUE violation 예외로 Workflow B 전체 실패.
**Why:** Drizzle 기본 insert는 conflict 시 throw.
**How to avoid:** `db.insert(briefings).values(data).onConflictDoNothing().returning().get()` 패턴. [CITED: https://orm.drizzle.team/docs/insert#on-conflict-do-nothing]
**Warning signs:** 재처리 시 크래시.

### Pitfall 10: 대표님 확인(askCeoConfirmation) 응답 파싱 누락
**What goes wrong:** 대표님이 "1번"이 아니라 "동반성장위원회로"라고 답하면 파싱 실패.
**Why:** Step 3 UI가 숫자 선택만 기대.
**How to avoid:** 응답 파서를 느슨하게: 숫자 / 회사명 부분 일치 / "취소|아님|아니요" 키워드 모두 수용. 애매하면 재질문.
**Warning signs:** "몇 번인지 명확히 말씀해주세요" 반복.

---

## Code Examples

### Code Example 1: 익시오 메시지 파서 스켈레톤

```typescript
// src/workflow/call-parser.ts
import { z } from 'zod';

export const ParsedCallSchema = z.object({
  source: z.literal('ixio'),
  shareType: z.enum(['대화', '통화']),
  occurredAt: z.string(),
  contact: z.object({
    phone: z.string().nullable(),
    companyName: z.string().nullable(),
    contactName: z.string().nullable(),
    contactTitle: z.string().nullable(),
  }),
  mainPoints: z.array(z.string()).nullable(),
  details: z.array(z.string()).nullable(),
  transcript: z.array(z.object({
    speaker: z.enum(['me', 'other']),
    text: z.string(),
  })).nullable(),
  rawText: z.string(),
});
export type ParsedCall = z.infer<typeof ParsedCallSchema>;

export type ParseResult =
  | { success: true; data: ParsedCall }
  | { success: false; reason: string };

const HEADER_RE = /^익시오에서 .+?님이 공유한 (대화|통화) 내용입니다\.$/m;
const DATE_RE = /(\d{4})\. (\d{2})\. (\d{2}) \([월화수목금토일]요일\) (오전|오후) (\d{1,2})시 (\d{2})분/;
const CONTACT_WITH_NAME_RE = /^연락처 (.+?)\((\d{9,11})\)님과의 (통화|대화)$/m;
const CONTACT_PHONE_ONLY_RE = /^연락처 (\d{9,11})님과의 (통화|대화)$/m;

export function parseSlackCallMessage(text: string): ParseResult {
  const headerMatch = text.match(HEADER_RE);
  if (!headerMatch) return { success: false, reason: 'not an ixio message' };
  const shareType = headerMatch[1] as '대화' | '통화';

  const dateMatch = text.match(DATE_RE);
  if (!dateMatch) return { success: false, reason: 'date format unrecognized' };
  const occurredAt = buildIsoDate(dateMatch);

  const contact = parseContact(text);
  const sections = splitSections(text);

  const parsed: ParsedCall = {
    source: 'ixio',
    shareType,
    occurredAt,
    contact,
    mainPoints: sections['[주요 내용]'] ?? null,
    details: sections['[상세 내용]'] ?? null,
    transcript: sections['[대화 내용]'] 
      ? parseTranscript(sections['[대화 내용]'].join('\n'))
      : null,
    rawText: text,
  };

  return { success: true, data: ParsedCallSchema.parse(parsed) };
}

function buildIsoDate(m: RegExpMatchArray): string {
  const [, year, month, day, period, hourStr, minute] = m;
  let hour = parseInt(hourStr, 10);
  if (period === '오후' && hour < 12) hour += 12;
  if (period === '오전' && hour === 12) hour = 0;
  // Asia/Seoul offset +09:00
  return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`;
}

function parseContact(text: string): ParsedCall['contact'] {
  const named = text.match(CONTACT_WITH_NAME_RE);
  if (named) {
    // "퍼즐) 동반성장위원회 이의선 위원" → company/name/title 분리
    // ')' 이후를 " "로 split
    const [companyPart, rest] = named[1].includes(')')
      ? named[1].split(')').map(s => s.trim())
      : ['', named[1]];
    const words = rest.split(/\s+/);
    const title = words.length > 2 ? words[words.length - 1] : null;
    const contactName = words.length > 2 ? words.slice(1, -1).join(' ') : words[words.length - 1];
    const companyName = words.length > 2 ? words[0] : null;
    return {
      phone: normalizePhone(named[2]),
      companyName: companyName ?? companyPart ?? null,
      contactName: contactName ?? null,
      contactTitle: title,
    };
  }
  const phoneOnly = text.match(CONTACT_PHONE_ONLY_RE);
  if (phoneOnly) {
    return {
      phone: normalizePhone(phoneOnly[1]),
      companyName: null,
      contactName: null,
      contactTitle: null,
    };
  }
  return { phone: null, companyName: null, contactName: null, contactTitle: null };
}

function splitSections(text: string): Record<string, string[]> {
  const headers = ['[주요 내용]', '[상세 내용]', '[대화 내용]'];
  const result: Record<string, string[]> = {};
  for (const header of headers) {
    const idx = text.indexOf(header);
    if (idx === -1) continue;
    const nextHeaderIdx = headers
      .filter(h => h !== header)
      .map(h => text.indexOf(h, idx + header.length))
      .filter(i => i !== -1)
      .sort((a, b) => a - b)[0] ?? text.length;
    const block = text.slice(idx + header.length, nextHeaderIdx).trim();
    result[header] = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }
  return result;
}

function parseTranscript(text: string): Array<{ speaker: 'me' | 'other'; text: string }> {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const turns: Array<{ speaker: 'me' | 'other'; text: string }> = [];
  for (const line of lines) {
    const match = line.match(/^(나|상대방):\s*(.*)$/);
    if (match) {
      turns.push({
        speaker: match[1] === '나' ? 'me' : 'other',
        text: match[2],
      });
    } else if (turns.length > 0) {
      // 이어지는 줄은 이전 턴에 추가
      turns[turns.length - 1].text += ' ' + line;
    }
  }
  return turns;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('82')) return '0' + digits.slice(2);
  return digits;
}
```

### Code Example 2: 3단계 매칭 상태 머신

```typescript
// src/workflow/client-matcher.ts
import type { ParsedCall } from './call-parser.js';
import type { Client } from '../db/schema.js';
import type { createClientQueries } from '../queries/clients.js';
import { normalizePhone } from './call-parser.js';

export type MatchResult =
  | { status: 'matched'; client: Client; method: 'phone_exact' | 'name_exact' | 'name_fuzzy' | 'ceo_select'; confidence: number }
  | { status: 'new_client'; client: Client; method: 'ceo_new' }
  | { status: 'cancelled' };

export interface ClientMatcherDeps {
  clientQueries: ReturnType<typeof createClientQueries>;
  getAllCompanyNames: () => string[];
  askCeoConfirmation: (req: CeoConfirmationRequest) => Promise<CeoConfirmationResponse>;
}

export async function matchClient(
  parsed: ParsedCall,
  deps: ClientMatcherDeps,
  extractedCompanyName: string | null,  // call-analyzer 결과
): Promise<MatchResult> {
  // ─ Step 1: 전화번호 정확 매칭
  if (parsed.contact.phone) {
    const byPhone = deps.clientQueries.getClientByPhone?.(parsed.contact.phone);
    if (byPhone) {
      return { status: 'matched', client: byPhone, method: 'phone_exact', confidence: 1.0 };
    }
  }

  // ─ Step 2: 회사명 기반 매칭
  const nameToMatch = parsed.contact.companyName ?? extractedCompanyName;
  if (nameToMatch) {
    // 2a. 정확 매칭
    const exact = deps.clientQueries.getClient(nameToMatch);
    if (exact) {
      // D-03: 전화번호 학습
      if (parsed.contact.phone) {
        deps.clientQueries.updateClientField(exact.companyName, 'contactPhone', normalizePhone(parsed.contact.phone));
      }
      return { status: 'matched', client: exact, method: 'name_exact', confidence: 1.0 };
    }

    // 2b. 퍼지 매칭
    const allNames = deps.getAllCompanyNames();
    const candidates = fuzzyMatchCompanyName(nameToMatch, allNames);
    const topCandidate = candidates[0];

    if (topCandidate && topCandidate.score >= 0.95 && candidates.length === 1) {
      const client = deps.clientQueries.getClient(topCandidate.companyName);
      if (client) {
        if (parsed.contact.phone) {
          deps.clientQueries.updateClientField(client.companyName, 'contactPhone', normalizePhone(parsed.contact.phone));
        }
        return { status: 'matched', client, method: 'name_fuzzy', confidence: topCandidate.score };
      }
    }

    // 경계선 신뢰도 또는 다중 후보 → Step 3
  }

  // ─ Step 3: 대표님 확인
  const candidatesForCeo = nameToMatch
    ? fuzzyMatchCompanyName(nameToMatch, deps.getAllCompanyNames())
        .slice(0, 5)
        .map(c => ({
          client: deps.clientQueries.getClient(c.companyName)!,
          score: c.score,
          reason: c.reason,
        }))
        .filter(c => c.client)
    : [];

  const response = await deps.askCeoConfirmation({
    callSummary: (parsed.mainPoints ?? []).slice(0, 2).join(' / ') || '요약 없음',
    extractedInfo: {
      phone: parsed.contact.phone,
      companyName: nameToMatch,
      contactName: parsed.contact.contactName,
    },
    candidates: candidatesForCeo,
  });

  if (response.action === 'cancel') {
    return { status: 'cancelled' };
  }

  if (response.action === 'select' && response.selectedClientId != null) {
    const client = deps.clientQueries.getClientById(response.selectedClientId);
    if (!client) throw new Error(`선택된 클라이언트 ID가 존재하지 않음: ${response.selectedClientId}`);
    // D-03
    if (parsed.contact.phone) {
      deps.clientQueries.updateClientField(client.companyName, 'contactPhone', normalizePhone(parsed.contact.phone));
    }
    return { status: 'matched', client, method: 'ceo_select', confidence: 1.0 };
  }

  if (response.action === 'new_client' && response.newClientName) {
    deps.clientQueries.upsertClient({
      companyName: response.newClientName,
      contactName: parsed.contact.contactName,
      contactPhone: parsed.contact.phone ? normalizePhone(parsed.contact.phone) : null,
      contactEmail: null,
      industry: null,
      history: null,
      budgetPattern: null,
      budgetTier: null,
      preferredServices: null,
      notes: `Phase 3 통화로부터 자동 생성 (${parsed.occurredAt})`,
      nextOpportunity: null,
      communicationStyle: null,
      stage: 'PROSPECT',
      lastContactDate: parsed.occurredAt.slice(0, 10),
    });
    const newClient = deps.clientQueries.getClient(response.newClientName)!;
    return { status: 'new_client', client: newClient, method: 'ceo_new' };
  }

  throw new Error('대표님 응답 파싱 실패');
}
```

### Code Example 3: runWorkflowB 오케스트레이터 스켈레톤

```typescript
// src/workflow/workflow-b.ts
import { parseSlackCallMessage } from './call-parser.js';
import { matchClient } from './client-matcher.js';
import { analyzeCall } from './call-analyzer.js';
import { composeEmail } from './compose.js';
import { createDraft } from './draft-creator.js';
import { validateNoContamination } from '../safety/cross-contamination.js';
import { validatePrices } from '../safety/price-validator.js';
import { validateQualityChecklist } from './quality-checker.js';
import { getDealByCompany, updateDealStage } from '../state/pipeline.js';
import { loadSlackCursor, saveSlackCursor } from '../state/slack-cursor.js';
import { buildFollowUpPrompt } from './follow-up-composer.js';

export async function runWorkflowB(
  deps: WorkflowBDependencies,
  options: { maxMessages?: number } = {},
): Promise<WorkflowBResult> {
  const results: ProcessedMessage[] = [];
  const cursor = loadSlackCursor(deps.slackCursorPath);

  // ─ Step 1: 슬랙 메시지 읽기
  const messages = await deps.slackTool({
    channel: cursor.channelId,
    oldest: cursor.lastReadTs,
    limit: options.maxMessages ?? 20,
  });

  for (const msg of messages) {
    // ─ Step 2: 파싱
    const parseResult = parseSlackCallMessage(msg.text);
    if (!parseResult.success) {
      results.push({ ts: msg.ts, status: 'skipped', reason: parseResult.reason });
      // 커서는 skipped도 진행 (다시 처리할 가치 없음)
      saveSlackCursor({ ...cursor, lastReadTs: msg.ts, lastReadAt: new Date().toISOString() }, deps.slackCursorPath);
      continue;
    }
    const parsed = parseResult.data;

    // ─ Step 3: 통화 분석 (AI)
    const analysis = await analyzeCall(parsed, deps.anthropicTool);

    // ─ Step 4: 클라이언트 매칭
    const matchResult = await matchClient(parsed, {
      clientQueries: deps.clientQueries,
      getAllCompanyNames: deps.getAllCompanyNames,
      askCeoConfirmation: deps.askCeoConfirmation,
    }, analysis.extractedCompanyName);

    if (matchResult.status === 'cancelled') {
      results.push({ ts: msg.ts, status: 'cancelled' });
      // 커서 갱신 안 함 → 재처리 가능
      continue;
    }
    const client = matchResult.client;

    // ─ Step 5: briefings + touchpoints 저장
    deps.briefingQueries.saveBriefing({
      clientId: client.id,
      slackTs: msg.ts,
      slackChannelId: cursor.channelId,
      occurredAt: parsed.occurredAt,
      source: 'ixio',
      summary: analysis.summary,
      actionItems: analysis.actionItems,
      sentiment: analysis.sentiment,
      rawTranscript: parsed.rawText,
    });
    deps.touchpointQueries.createTouchpoint({
      clientId: client.id,
      type: 'call',
      sourceId: msg.ts,
      summary: analysis.summary,
      metadata: { temperature: analysis.sentiment.temperature },
      occurredAt: parsed.occurredAt,
    });

    // ─ Step 6: 기존 스레드 + 후속 이메일 작성
    const deal = getDealByCompany(client.companyName, deps.pipelinePath);
    const existingThreadId = deal?.emailThreadId;
    const threadHistory = existingThreadId 
      ? await deps.gmailReadThreadTool({ threadId: existingThreadId })
      : [];

    const classification = classifyCallFollowUp(analysis, !!existingThreadId);
    // ... buildFollowUpPrompt + AI 호출 → aiGeneratedBody
    const emailDraft = composeEmail({
      classification,
      client,
      inquiryContext: analysis.summary,
      promptSections: '',  // v4 ULTRA 전략 G/H 섹션
      aiGeneratedBody,
      companyName: client.companyName,
      recipientEmail: client.contactEmail ?? '',
      threadId: existingThreadId,
      contentSummary: '통화 후속',
    });

    // ─ Step 6.5: 안전 3중 게이트 (Phase 2와 동일)
    const allNames = deps.getAllCompanyNames();
    const cont = validateNoContamination(emailDraft.htmlBody, client.companyName, allNames);
    if (!cont.safe) { /* skip + 에러 기록 */ continue; }

    const priceCheck = validatePrices(emailDraft.htmlBody, deps.serviceQueries);
    const qualityCheck = validateQualityChecklist(emailDraft.htmlBody, emailDraft.subject, classification);
    if (!qualityCheck.passed) { /* skip + 에러 기록 */ continue; }

    // ─ Step 7: 드래프트 생성
    const draftResult = await createDraft(emailDraft, deps.gmailTool);

    // 추가 터치포인트 (이메일 드래프트)
    deps.touchpointQueries.createTouchpoint({
      clientId: client.id,
      type: 'email',
      sourceId: draftResult.threadId ?? draftResult.draftId,
      summary: `[드래프트] ${emailDraft.subject}`,
      metadata: { draftId: draftResult.draftId, revision: false },
      occurredAt: new Date().toISOString(),
    });

    results.push({ ts: msg.ts, status: 'success', draftId: draftResult.draftId, clientName: client.companyName });

    // 커서 갱신 (성공 시에만)
    saveSlackCursor({ ...cursor, lastReadTs: msg.ts, lastReadAt: new Date().toISOString() }, deps.slackCursorPath);
  }

  return { processed: results.length, results };
}
```

### Code Example 4: touchpoints 조회 (타임라인)

```typescript
// 사용 예: "동반성장위원회랑 지금까지 뭘 했지?"
const client = clientQueries.getClient('동반성장위원회');
if (client) {
  const timeline = touchpointQueries.getTimelineByClient(client.id, 20);
  for (const tp of timeline) {
    console.log(`[${tp.occurredAt}] ${tp.type}: ${tp.summary}`);
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 통화 수동 정리 | Workflow B 자동화 | Phase 3 (현재) | 대표님 세일즈 시간 절약 |
| 클라이언트 히스토리 = notes 필드에 누적 | touchpoints 타임라인 테이블 | Phase 3 | 타입별 조회, 시간순 정렬, 데이터 분리 |
| 전화번호는 clients.contactPhone에 저장만 | 전화번호 기반 검색 인덱스 | Phase 3 | O(log n) 매칭 가능, 매 통화마다 학습 |
| 이메일 드래프트 = pipeline.emailThreadId만 추적 | 모든 접점 touchpoints에 통합 | Phase 3 | Workflow A/B 공통 감사 로그 |

**Deprecated/outdated:**
- CLAUDE.md에 적힌 Drizzle 버전(0.45.x)과 실제 설치 버전(0.45.2)은 일치 — OK.
- CLAUDE.md의 better-sqlite3 "11.x" 표기는 실제 12.8.0과 불일치 — Phase 3에서는 12.x 기준으로 진행.
- CLAUDE.md의 zod "3.24.x" 표기는 실제 4.3.6과 불일치 — zod v4는 v3 대비 일부 API 변경 있음. [CITED: https://zod.dev/v4 — v4 changelog 확인 필수]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 익시오 패턴 1에서 "연락처 퍼즐) 동반성장위원회 이의선 위원(01036906867)" 포맷의 괄호 구조 | 익시오 파서 §4단계 | 파서가 회사명/이름/직함 분리 실패 → Step 2 AI 추출로 폴백 (치명적이지 않음) |
| A2 | 한국어 회사명 퍼지 매칭에서 prefix/contains가 Levenshtein보다 정확 | 퍼지 매칭 §Step 2 | 실제 운영 데이터로 검증 전까지는 가설. 오매칭 발생 시 알고리즘 교체 필요 |
| A3 | Gmail 클라이언트가 threadId 지정 + 다른 subject일 때 별도 스레드로 분리 | Pitfall 4 | 확실하지 않음. 플래너는 실제 Gmail 동작 테스트 필수. "Re:" 접두사 전략은 안전한 기본값 |
| A4 | `gmail_read_thread` MCP 도구 이름 | Gmail 스레드 로딩 | MCP 서버별로 도구명이 다를 수 있음. 플래너는 Plan 초기에 사용 가능한 MCP 도구 목록 확인 태스크 포함 필수 |
| A5 | `slack_get_channel_history` MCP 도구 파라미터가 Slack API conversations.history와 1:1 대응 | Slack MCP §파라미터 | MCP 서버 구현이 다르면 파라미터 이름 다를 수 있음. 플래너는 실제 도구 스펙 확인 필수 |
| A6 | 자사 이름 블랙리스트 ("퍼즐", "PUZL", "퍼즐코퍼레이션")로 AI 추출 환각 방지 | Pitfall 6 | AI가 다른 변형("Puzzle", "퍼즐 코퍼레이션") 사용하면 누락. 실제 실행에서 추가 필요 |
| A7 | 분위기/온도 4단계 분류가 Phase 4/5에 적합 | Sentiment §Claude's Discretion | 세분화 정도는 실제 사용 패턴으로 재조정 가능 |
| A8 | tone과 temperature는 Claude API tool_use로 충분히 일관성 있게 추출 가능 | AI 분석 | tool_use는 schema 준수는 보장하지만 분류 정확도는 프롬프트 품질에 의존 |
| A9 | drizzle-orm 0.45.2의 onConflictDoNothing() API가 현재 구문과 일치 | briefings.saveBriefing | Drizzle 마이너 버전마다 API 미세 변경 가능. 플래너는 실제 사용 시 docs 재확인 |
| A10 | 익시오 외 다른 형식(클로바노트 직접 공유 등)은 Phase 3 범위 외 | 파서 엣지 케이스 | CONTEXT.md가 익시오 패턴만 명시. 클로바노트 전용 파서는 Phase 3 이후 별도 |

**⚠️ 이 Assumptions Log는 플래너와 대표님이 실행 전 확인해야 하는 항목입니다.** 특히 A3, A4, A5는 실제 MCP/Gmail 동작에 직접 의존하므로 Plan 초기 검증 태스크가 반드시 필요합니다.

---

## Open Questions

1. **`gmail_read_thread` MCP 도구 정확한 이름과 반환 형식**
   - What we know: Phase 2에서 이미 `gmail_create_draft`, `gmail_read_message`, `gmail_search_messages` 사용 [VERIFIED: 02-CONTEXT.md L114]
   - What's unclear: 스레드 전문 조회 도구 이름 (read_thread vs get_thread vs list_thread_messages)
   - Recommendation: Plan Wave 0에 "사용 가능한 MCP 도구 스캔" 태스크 포함. `src/workflow/thread-loader.ts` 구현 전에 실제 도구 호출 샘플 확보.

2. **askCeoConfirmation의 구체적 구현 레이어**
   - What we know: D-05 — 현재 대화 세션에서 직접 질문
   - What's unclear: CLI 모드(`readline`)인지, 혹은 Claude Agent SDK의 대화 스트림으로 구현할지
   - Recommendation: MVP는 테스트 가능한 인터페이스만 정의. 실제 CLI/Agent 구현은 Phase 3 말미 또는 Phase 3 후속 작업.

3. **통화 발생일 타임존 표준화**
   - What we know: 익시오는 한국 시간으로 표시
   - What's unclear: DB 저장 시 UTC로 변환할지 KST로 유지할지
   - Recommendation: ISO 8601 + offset(`+09:00`)으로 저장. SQLite text 필드이므로 손실 없이 보존.

4. **v4 ULTRA의 "통화 후속 전략"이 §9의 어느 항목인가**
   - What we know: §9에 전략 A~L 존재 [CITED: 02-CONTEXT.md L66]
   - What's unclear: 전략 G/H라는 추측은 필자의 가정. 실제 섹션 내용 확인 필요
   - Recommendation: Plan에 "v4 ULTRA §9 전략 A~L 실제 내용 파악 후 통화 후속에 해당하는 전략 ID 확정" 태스크 포함.

5. **기존 Workflow A의 Client 타입에 id 필드 활용**
   - What we know: `clients` 테이블에 `id` PK 존재 [VERIFIED: schema.ts L12]
   - What's unclear: Phase 2 workflow-a.ts 코드에서 `client.id` 기반 작업이 없음 → Phase 3에서 touchpoint 기록 시 client.id를 반드시 사용해야 하는데, 기존 코드가 companyName 중심이라 정합성 확인 필요
   - Recommendation: Plan Wave 0 태스크: "Phase 2 ensureClient가 반환하는 Client 객체에 id가 포함되는지 검증". getClient는 id 포함 (schema.ts 전체 select). [VERIFIED: clients.ts L21]

6. **자사 이름 블랙리스트 범위**
   - What we know: 자사 = 퍼즐코퍼레이션
   - What's unclear: 영문 이름, 약어, 부서명 등 어디까지 차단할지
   - Recommendation: 초기 블랙리스트: `["퍼즐", "puzl", "퍼즐코퍼레이션", "puzzle corporation"]`. 대소문자 무시. 운영 중 추가.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 모든 코드 | ✓ | (추정) 22+ | — |
| better-sqlite3 | DB 확장 | ✓ | 12.8.0 | — |
| drizzle-orm | 스키마 마이그레이션 | ✓ | 0.45.2 | — |
| drizzle-kit | `db:generate` 실행 | ✓ | 0.31.10 | 수동 SQL 마이그레이션 작성 |
| zod | 스키마 검증 | ✓ | 4.3.6 | — |
| vitest | 단위 테스트 | ✓ | 4.1.2 | — |
| `data/sales.db` | 기존 clients/services 테이블 | ✓ | — | 없음 (필수) |
| Slack MCP 도구 | CALL-01 (슬랙 읽기) | ? | — | MCP 설정 필요, 블로킹 |
| Gmail MCP 도구 | CALL-03 (드래프트/스레드 로드) | ? | — | Phase 2에서 이미 사용 중이므로 확실시 |
| Anthropic SDK | CALL-02 (AI 분석) | ? | — | 설치 여부 package.json 재확인 필요 |

**Missing dependencies with no fallback:**
- Anthropic SDK (`@anthropic-ai/sdk`) — **package.json dependencies에 없음** [VERIFIED: `cat package.json`]. CLAUDE.md 권장 스택에는 있으나 실제 설치 안 됨. Phase 3 시작 시 `npm install @anthropic-ai/sdk` 필요. 플래너는 Wave 0 설치 태스크 포함 필수.
- Slack MCP 연결 — `.mcp.json` 파일 없음 [VERIFIED: `cat .mcp.json` 실패]. 그러나 Claude Code 환경의 MCP 설정은 프로젝트 루트 밖에 있을 수 있음. Phase 2가 Gmail MCP를 사용하는 걸로 보아 MCP 자체는 활성 상태.

**Missing dependencies with fallback:**
- `fastest-levenshtein`, `es-hangul` — 설치 안 함, 직접 구현으로 대체 (권장)

**검증 완료:**
- `data/sales.db` 존재 및 WAL 모드 [VERIFIED: `ls data/` → sales.db, sales.db-shm, sales.db-wal]
- `drizzle/` 디렉토리 없음 [VERIFIED: `ls drizzle/` 실패] → `drizzle-kit generate` 첫 실행 시 자동 생성

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` 또는 `package.json` scripts (현재는 scripts에 `test` 정의) |
| Quick run command | `npm test -- --run src/workflow/call-parser.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | Slack 메시지 커서 기반 읽기 (중복 skip) | unit | `npm test -- src/state/slack-cursor.test.ts` | ❌ Wave 0 |
| CALL-01 | Workflow B 오케스트레이터: 커서 갱신 | integration | `npm test -- src/workflow/workflow-b.test.ts` | ❌ Wave 0 |
| CALL-02 | 익시오 패턴 1 파싱 (연락처 저장됨) | unit | `npm test -- src/workflow/call-parser.test.ts -t "패턴 1"` | ❌ Wave 0 |
| CALL-02 | 익시오 패턴 2 파싱 (연락처 미저장) | unit | `npm test -- src/workflow/call-parser.test.ts -t "패턴 2"` | ❌ Wave 0 |
| CALL-02 | 전화번호 정규화 | unit | `npm test -- src/workflow/call-parser.test.ts -t "normalizePhone"` | ❌ Wave 0 |
| CALL-02 | 파서 엣지 케이스 (헤더 없음, 날짜 실패) | unit | `npm test -- src/workflow/call-parser.test.ts -t "edge"` | ❌ Wave 0 |
| CALL-02 | AI 분석: tool_use 응답 zod 검증 | unit (mock AI) | `npm test -- src/workflow/call-analyzer.test.ts` | ❌ Wave 0 |
| CALL-02 | 3단계 매칭: Step 1 전화번호 hit | unit | `npm test -- src/workflow/client-matcher.test.ts -t "Step 1"` | ❌ Wave 0 |
| CALL-02 | 3단계 매칭: Step 2 퍼지 매칭 후보 정렬 | unit | `npm test -- src/workflow/client-matcher.test.ts -t "퍼지"` | ❌ Wave 0 |
| CALL-02 | 3단계 매칭: Step 3 대표님 확인 호출 | unit | `npm test -- src/workflow/client-matcher.test.ts -t "Step 3"` | ❌ Wave 0 |
| CALL-03 | 기존 스레드 threadId 지정 전달 | integration | `npm test -- src/workflow/workflow-b.test.ts -t "existing thread"` | ❌ Wave 0 |
| CALL-03 | 신규 스레드 (emailThreadId 없음) 처리 | integration | `npm test -- src/workflow/workflow-b.test.ts -t "new thread"` | ❌ Wave 0 |
| CALL-03 | 안전 3중 게이트 작동 (교차 오염 차단) | integration | `npm test -- src/workflow/workflow-b.test.ts -t "contamination"` | ❌ Wave 0 |
| CALL-03 | Phase 2 composeEmail 재사용 검증 | integration | `npm test -- src/workflow/workflow-b.test.ts -t "compose reuse"` | ❌ Wave 0 |
| CALL-04 | briefings.saveBriefing 기본 동작 | unit | `npm test -- src/queries/briefings.test.ts` | ❌ Wave 0 |
| CALL-04 | briefings.slackTs UNIQUE 제약 (중복 skip) | unit | `npm test -- src/queries/briefings.test.ts -t "UNIQUE"` | ❌ Wave 0 |
| CALL-04 | touchpoints.createTouchpoint 기본 동작 | unit | `npm test -- src/queries/touchpoints.test.ts` | ❌ Wave 0 |
| CALL-04 | getTimelineByClient 정렬 | unit | `npm test -- src/queries/touchpoints.test.ts -t "timeline"` | ❌ Wave 0 |
| D-15 | Workflow A에서 touchpoint 기록 (후방 호환) | integration | `npm test -- src/workflow/workflow-a.test.ts -t "touchpoint"` | ❌ Wave 0 (기존 test 수정) |

### Sampling Rate

- **Per task commit:** 해당 파일의 `npm test -- --run src/{module}.test.ts` (< 5초)
- **Per wave merge:** `npm test` (전체, < 30초 추정)
- **Phase gate:** `/gsd-verify-work` 전 full suite green

### Wave 0 Gaps

Phase 3은 **전부 신규 모듈**이라 Wave 0에서 테스트 파일 생성이 가장 많은 작업입니다:

- [ ] `src/workflow/call-parser.test.ts` — 익시오 파서 단위 테스트 (패턴 1/2, 엣지)
- [ ] `src/workflow/client-matcher.test.ts` — 3단계 매칭 상태 머신 테스트
- [ ] `src/workflow/call-analyzer.test.ts` — AI 분석 모킹 + zod 검증
- [ ] `src/workflow/workflow-b.test.ts` — 오케스트레이터 통합 테스트
- [ ] `src/state/slack-cursor.test.ts` — 커서 저장/로드 + atomic write
- [ ] `src/queries/briefings.test.ts` — briefings CRUD + UNIQUE 제약
- [ ] `src/queries/touchpoints.test.ts` — touchpoints CRUD + 단일 클라이언트 조회
- [ ] `src/queries/clients.test.ts` (기존) — getClientByPhone / getClientByEmail 테스트 추가
- [ ] `src/workflow/workflow-a.test.ts` (기존) — touchpoint 기록 후방 호환 테스트 추가
- [ ] 공유 fixture: `tests/fixtures/ixio-samples.ts` — 패턴 1/2 실제 슬랙 메시지 샘플

**Wave 0 불필요:**
- Framework install: vitest 4.1.2 이미 설치됨 [VERIFIED: package.json]
- vitest.config: 현재 없지만 `package.json scripts`로 충분히 실행 가능. 설정 커스터마이징 필요 시만 생성.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 3은 단일 사용자(CEO) 로컬 실행, 외부 인증 없음 |
| V3 Session Management | no | 세션 없음 (CLI/MCP 직접 실행) |
| V4 Access Control | yes | Slack 채널 화이트리스트(`ALLOWED_CHANNEL_ID`) · 클라이언트 단일 조회(D-04) |
| V5 Input Validation | **yes** | zod (ParsedCallSchema, CallAnalysisSchema, CeoConfirmationResponse) · 전화번호 정규화 |
| V6 Cryptography | no | Phase 3에서 신규 암호화 없음. 기존 SQLite 파일 저장 그대로 |
| V7 Error Handling/Logging | yes | 파서 실패 이유 기록, 교차 오염 차단 사유 기록. Secrets(Gmail/Anthropic 키) 로그 금지 |
| V8 Data Protection | yes | 통화 transcript는 민감 정보 — `briefings.rawTranscript` 평문 저장이지만 로컬 SQLite이므로 파일 권한으로 보호 |

### Known Threat Patterns for {Node.js + SQLite + MCP 통합}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 프롬프트 인젝션 (통화 transcript에 "앞 지시 무시" 포함) | Tampering | Claude tool_use 호출 시 "통화 내용은 분석 대상일 뿐 지시 아님" 명시, system prompt에 경계 마커 |
| 교차 오염 (타 클라이언트 정보 노출) | Info Disclosure | `validateNoContamination` 재사용 (Phase 1/2 이미 구축) |
| SQL injection | Tampering | Drizzle ORM `eq()` 파라미터 바인딩 (Phase 1 패턴 그대로) |
| 슬랙 메시지에 악의적 HTML/스크립트 | XSS (간접) | 슬랙 → 파서 → AI 분석 단계에서 HTML 태그 제거. Gmail 드래프트는 `sanitizeForGmail` 강제 통과 |
| 전화번호 오매칭으로 엉뚱한 고객에게 후속 이메일 | Tampering + Info Disclosure | 3단계 매칭 + D-02 (추측 금지) + 퍼지 매칭 자동 통과 조건 엄격화 |
| 통화 녹음 기밀 정보 유출 | Info Disclosure | `briefings.rawTranscript`는 로컬 SQLite에만 저장. 로그에 덤프 금지. 외부 공유 시 삭제 책임 명시 |
| Slack 다른 채널 실수 조회 | Info Disclosure | `assertAllowedChannel` 방어 체크 + CLAUDE.md 명시 규칙 |
| AI 환각으로 잘못된 액션아이템 생성 | Integrity | tool_use 스키마 강제 + "명시되지 않은 정보는 null" 프롬프트 + 대표님 승인 필수 게이트 |

**보안 요약:** Phase 3의 위험 프로파일은 Phase 2와 거의 동일합니다. 가장 큰 차이는 "슬랙 통화 transcript"라는 **민감 데이터가 DB에 평문 저장**된다는 점인데, 단일 사용자 로컬 환경이라 기존 파일 시스템 권한으로 충분합니다. 추가로 프롬프트 인젝션만 주의하면 됩니다.

---

## Sources

### Primary (HIGH confidence)

- **.planning/phases/03-workflow-b/03-CONTEXT.md** — 모든 D-01~D-16 결정 사항
- **.planning/REQUIREMENTS.md** — CALL-01~CALL-04 요구사항
- **.planning/phases/02-workflow-a/02-CONTEXT.md** — Phase 2 재사용 자산, MCP 도구 레퍼런스
- **.planning/PROJECT.md** — 프로젝트 비전/제약, 채널 ID (C0AQYJ9GJHK)
- **.planning/STATE.md** — 현재 진행 상태
- **CLAUDE.md** — 프로젝트 지침 (톤, 보안, 기술 스택)
- **src/db/schema.ts** — clients 테이블 (contactPhone, contactEmail 확인)
- **src/queries/clients.ts** — DI 패턴, getClient, upsertClient, updateClientField 시그니처
- **src/state/pipeline.ts** — Deal 스키마 (emailThreadId), atomicWrite 패턴
- **src/workflow/workflow-a.ts** — 9단계 파이프라인 구조 (L69-L195), WorkflowDependencies 인터페이스
- **src/workflow/compose.ts** — composeEmail 파라미터, EMAIL_SIGNATURE_HTML, INTRO_LINKS_HTML 재사용
- **src/workflow/draft-creator.ts** — createDraft의 MANDATORY_CC 강제 + sanitize 강제 로직
- **src/workflow/quality-checker.ts** — MANDATORY_CC, generateSubject, 품질 체크리스트 위치
- **src/workflow/research.ts** — ensureClient 패턴 (D-16/D-17)
- **src/db/connection.ts** — WAL + foreign_keys ON 설정 확인
- **package.json** — 실제 설치 버전 (better-sqlite3 12.8.0, drizzle-orm 0.45.2, zod 4.3.6, vitest 4.1.2)
- **data/sales.db** — 기존 DB 파일 존재 확인
- **`npm view fastest-levenshtein version`** — 1.0.16
- **`npm view es-hangul version`** — 2.3.8

### Secondary (MEDIUM confidence — 공식 문서 기반 추론)

- **Anthropic tool_use docs** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use (스키마 엄격성 이유)
- **Drizzle ORM insert/onConflict** — https://orm.drizzle.team/docs/insert (onConflictDoNothing 문법)
- **Drizzle indexes** — https://orm.drizzle.team/docs/indexes-constraints
- **Slack conversations.history** — https://api.slack.com/methods/conversations.history (oldest/limit 파라미터)
- **better-sqlite3 v12 release** — https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.0.0
- **zod v4 changelog** — https://zod.dev/v4 (v3→v4 마이그레이션 주의)

### Tertiary (LOW confidence — 가정 / 검증 필요)

- 익시오 메시지 패턴 1의 괄호 포맷 (`연락처 퍼즐) 동반성장위원회 이의선 위원(...)`)이 모든 케이스에 일관적인지
- Gmail API가 threadId + 다른 subject일 때 별도 스레드로 분리하는 동작 (Pitfall 4)
- `gmail_read_thread` / `slack_get_channel_history` MCP 도구의 정확한 파라미터 스펙
- Anthropic SDK가 package.json에 없다는 사실 (CLAUDE.md 권장과 불일치 — 실제 미설치)

---

## Metadata

**Confidence breakdown:**
- Standard stack (실제 설치 버전): HIGH — package.json, `npm view` 직접 확인
- Architecture (Workflow B 구조): HIGH — Phase 2 workflow-a.ts 코드 직접 검증
- 익시오 파서 설계: MEDIUM — 실제 2가지 샘플 기반, 엣지 케이스는 운영에서 드러날 것
- 퍼지 매칭 알고리즘: MEDIUM — 한국어 회사명 특성에 맞췄으나 운영 데이터 검증 필요
- touchpoints/briefings 스키마: HIGH — Drizzle 공식 패턴
- Slack MCP/Gmail MCP 통합: MEDIUM — 파라미터 스펙은 Phase 2 사용 이력 + Slack 공식 API 기반 추론
- 보안 도메인: HIGH — Phase 1/2에서 이미 검증된 패턴 재사용
- 테스트 커버리지 계획: HIGH — vitest 이미 설치됨, 기존 테스트 구조 그대로 따름

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30일, 안정적인 도메인 — Phase 2 코드베이스가 바뀌지 않는 한 유효)

---

*Phase 3 리서치 완료. 플래너는 이 문서를 기반으로 Wave 구조를 설계할 수 있습니다.*
*권장 Wave 구조 힌트: Wave 0 (DB 스키마 + 테스트 인프라) → Wave 1 (파서 + 매처 + 쿼리) → Wave 2 (AI 분석 + 후속 이메일 빌더) → Wave 3 (오케스트레이터 + Workflow A 후방 호환 통합).*
