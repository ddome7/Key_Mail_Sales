# Phase 3: Workflow B (통화 후속 처리) - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

슬랙 #세일즈_통화요약 채널의 통화 요약을 대표님 요청 시 분석하여, 클라이언트를 자동 식별하고, 핵심 내용/액션아이템을 추출하며, 기존 이메일 스레드에 이어지는 후속 이메일 드래프트를 생성한다. 모든 접점(이메일/통화/상태변경)을 하나의 타임라인으로 통합하는 터치포인트 시스템도 함께 구축한다.

</domain>

<decisions>
## Implementation Decisions

### 클라이언트 식별 시스템
- **D-01:** 3단계 자동 매칭을 구현한다. (1) 전화번호로 DB 검색 → (2) AI가 통화 내용에서 회사명/이름 추출 후 DB 검색 (유사 이름 매칭 포함) → (3) 매칭 실패 시 대표님에게 반드시 확인.
- **D-02:** 매칭 실패 시 봇이 추측해서 연결하면 절대 안 된다. 반드시 대표님에게 "이 통화 어느 회사 건인가요?" 확인을 받는다. 교차 오염 방지 원칙(Phase 1 D-04) 연장.
- **D-03:** 대표님 확인 후 전화번호를 클라이언트 DB에 저장하여 다음부터 자동 매칭되도록 학습한다.
- **D-04:** 클라이언트 DB에 전화번호/이메일 기반 검색 함수를 추가한다 (getClientByPhone, getClientByEmail). 기존 회사명 검색(getClient)과 병행.
- **D-05:** 대표님 확인은 봇 대화에서 직접 진행한다. 슬랙 DM이나 쓰레드가 아닌, 현재 대화 세션에서 질문하고 답변받는다.

### 통화 요약 처리 트리거
- **D-06:** 자동 폴링이 아닌 대표님 요청 시에만 처리한다. 대표님이 "통화 정리해줘", "슬랙 확인해줘" 등 요청하면 슬랙에서 새 메시지를 가져와 처리. 불필요한 통화까지 자동 처리하는 노이즈를 방지.
- **D-07:** 마지막 읽은 타임스탬프 기반으로 새 메시지만 처리한다 (기존 패턴 유지). 처리 완료 후 타임스탬프를 갱신한다.

### 액션아이템 추출
- **D-08:** 통화 내용에서 추출하는 정보는 3가지: (1) 핵심 요약 (3줄 이내) + 구체적 액션아이템 목록, (2) 마감/일정 정보 자동 감지 ("내일 점심 전까지" → 절대 날짜로 변환), (3) 분위기/온도 감지 (상대방 긍정적/난색/설득 필요 등).
- **D-09:** 익시오/클로바노트 텍스트 형식을 파싱한다. 실제 슬랙 메시지 패턴: (1) "익시오에서 최영록님이 공유한 대화 내용입니다" 헤더, (2) 연락처 정보 (회사명/이름/전화번호), (3) [주요 내용] 요약, (4) [대화 내용] 전문 — 이 구조를 파서로 분리.
- **D-10:** 상대방 정보(담당자 이름, 전화번호 등)가 통화에서 새로 확인되면 클라이언트 DB를 자동 업데이트한다 (Phase 2 ensureClient 패턴 활용).

### 후속 이메일 생성
- **D-11:** 후속 이메일은 기존 이메일 스레드에 답장(Reply)으로 생성한다. 파이프라인에서 해당 클라이언트의 emailThreadId를 찾아서 threadId를 지정. 기존 스레드가 없으면 새 이메일로 생성.
- **D-12:** 이메일 작성은 Phase 2의 compose → quality-check → draft-creator 파이프라인을 재활용한다. v4 ULTRA 규칙, CC 강제, HTML 인코딩 치환 등 모든 안전장치 동일 적용.
- **D-13:** 통화 내용 + 기존 이메일 스레드 맥락을 함께 AI에 전달하여 맥락이 이어지는 후속 이메일을 생성한다.

### 활동 기록 (터치포인트)
- **D-14:** touchpoints 테이블을 SQLite에 추가한다. 모든 접점(이메일 발송, 통화, 파이프라인 상태 변경)을 하나의 테이블에 기록. 컬럼: id, clientId (FK), type ('email'|'call'|'stage_change'), sourceId (threadId|slackTs|dealId), summary, createdAt.
- **D-15:** Phase 2 Workflow A에서도 이메일 드래프트 생성 시 터치포인트를 기록하도록 통합한다 (후방 호환).
- **D-16:** "이 클라이언트랑 지금까지 뭘 했지?"를 한눈에 볼 수 있는 타임라인 조회 함수를 제공한다.

### Claude's Discretion
- 유사 이름 매칭의 구체적 알고리즘 (Levenshtein, 부분 문자열, 초성 매칭 등)
- 익시오/클로바노트 파서의 세부 정규식 패턴
- 분위기/온도 감지의 구체적 분류 카테고리
- 터치포인트 테이블의 인덱스 설계

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 코드 — 클라이언트 DB & 쿼리
- `src/db/schema.ts` — clients 테이블 스키마 (contactPhone, contactEmail 컬럼 존재하나 검색 미구현)
- `src/queries/clients.ts` — getClient(companyName), upsertClient 등 기존 쿼리 패턴 (DI 패턴)

### 기존 코드 — 파이프라인 & 이메일
- `src/state/pipeline.ts` — Deal 스키마 (emailThreadId 포함), getDealByCompany
- `src/workflow/workflow-a.ts` — Workflow A 오케스트레이터 (9단계 파이프라인, WorkflowDependencies DI 패턴)
- `src/workflow/compose.ts` — composeEmail 함수 (이메일 본문 조립)
- `src/workflow/draft-creator.ts` — createDraft, createRevisionDraft (Gmail MCP 드래프트 생성)
- `src/workflow/quality-checker.ts` — validateQualityChecklist (품질 검증)

### 안전장치
- `src/safety/cross-contamination.ts` — validateNoContamination (교차 오염 방지)
- `src/safety/gmail-sanitizer.ts` — sanitizeForGmail (HTML 인코딩 치환)

### v4 ULTRA 프롬프트
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §6 — Gmail 실발송 형식 규칙
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §9 — 상황별 전략 A~L (통화 후 후속 이메일 = 전략 G/H 해당 가능)

### 슬랙 메시지 실제 형식
- 슬랙 #세일즈_통화요약 채널 메시지 패턴 참조 (익시오 앱 형식)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createClientQueries(db)` — DI 패턴 클라이언트 쿼리. getClientByPhone/getClientByEmail 추가 시 같은 패턴으로 확장.
- `composeEmail()` — 이메일 본문 조립. 통화 후속 이메일에도 동일 구조 재활용 가능.
- `createDraft()` — Gmail MCP 드래프트 생성. threadId 지정으로 기존 스레드 답장 지원.
- `validateNoContamination()` — 교차 오염 방지. getAllCompanyNames() 주입 패턴.
- `WorkflowDependencies` 인터페이스 — DI 패턴으로 테스트 가능한 의존성 주입.

### Established Patterns
- **DI 패턴**: 모든 모듈이 DB/도구를 파라미터로 받아 테스트 용이 (in-memory SQLite).
- **단일 클라이언트 쿼리**: D-04 원칙 — 한 번에 1건만 조회하여 교차 오염 차단.
- **파이프라인 JSON**: state/pipeline.json에 딜 정보 저장. companyName + emailThreadId로 연결.
- **안전 게이트 3중 구조**: contamination(block) → prices(warn) → quality(block) 순서.

### Integration Points
- `src/db/schema.ts` — touchpoints 테이블 추가 필요
- `src/queries/clients.ts` — getClientByPhone, getClientByEmail 추가 필요
- `src/workflow/workflow-a.ts` — 터치포인트 기록 연동 (후방 호환)
- Slack MCP — `slack_get_channel_history` 도구로 메시지 읽기 (이미 사용 중)

</code_context>

<specifics>
## Specific Ideas

- 어제(4/8) 동반성장위원회 통화를 수동으로 처리한 실제 경험을 기반으로 설계. 실제 슬랙 메시지 형식, 통화 패턴, 이메일 흐름을 참조.
- 익시오 앱 메시지 형식: 헤더("익시오에서 최영록님이 공유한...") + 연락처("연락처 퍼즐) 동반성장위원회 이의선 위원(01036906867)") + 대화 내용
- 전화번호가 연락처에 저장되지 않은 경우: "연락처 01036906867님과의 통화" 형식으로 올라옴 — 이 경우 3단계 매칭의 2단계(AI 추출)가 핵심.

</specifics>

<deferred>
## Deferred Ideas

- 통화 내용 기반 견적서/제안서 자동 생성 — Phase 3 범위 초과, v2 자료 허브에서 다룰 것
- 통화 예약/캘린더 연동 — 별도 Phase 필요
- 자동 폴링 (슬랙 주기적 확인) — v2 이후 자율성 높아질 때 고려

</deferred>

---

*Phase: 03-workflow-b*
*Context gathered: 2026-04-10*
