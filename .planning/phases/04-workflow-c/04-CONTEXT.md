# Phase 4: Workflow C (팔로업 자동화) - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

이메일/통화 후 클라이언트 응답이 일정 기간 없을 때, 봇이 v4 ULTRA §15 케이던스 룰(Day 3/7/14/30)에 따라 팔로업 드래프트를 자동 작성해 대표님이 승인만 하면 발송 가능한 상태로 만드는 파이프라인. 30일 이상 응답이 없는 딜은 STAGE 5(Dormant)로 전환을 제안한다.

**요구사항:** FLLW-01, FLLW-02, FLLW-03, FLLW-04

**성공 기준 (ROADMAP 원문):**
1. 미응답 시 Day 3/7/14/30에 맞춰 팔로업 드래프트가 자동 생성된다
2. 상황별(제안서 후/계약서 후/미팅 후 등) 팔로업 변형이 올바르게 적용된다
3. 팔로업 톤이 단계별(확인 → 가치추가 → 대안제시 → 관계유지)로 자연스럽게 변화한다
4. 30일 미응답 클라이언트가 자동으로 STAGE 5(Dormant)로 전환된다

**범위 밖(Deferred):**
- 학습 루프(패턴 기록, edit delta) — Phase 5
- 크로스셀/업셀 트리거 감지 — Phase 5
- 시장 정보 자동 축적 — Phase 5
- 완전 자율 백그라운드 실행(cron 또는 주기 실행 API) — v4+ 이후

</domain>

<decisions>
## Implementation Decisions

### 실행 모드 (최상위 제약)

- **D-01:** **Claude Code 모드 유지** — cron / 주기 실행 API(타이머/스케줄러 류) / BullMQ 등 백그라운드 스케줄러 도구는 사용하지 않는다. 팔로업 파이프라인은 대표님이 Claude Code 세션에서 "팔로업 돌려줘" 요청 시 on-demand로 실행된다. Phase 3에서 확정된 원칙을 Phase 4에도 동일 적용.
  - *출처*: `.claude/projects/-Users-cyr-Desktop-Code-Sales/memory/project_phase3_claude_code_mode.md`
  - *이유*: 대표님은 이미 Claude Code 구독 중이라 API 추가 결제 불필요, 승인 제약과 정합성 높음, v1~v3 기간 동안 충분.

### 팔로업 트리거 판정 (Gray Area 1 → C)

- **D-02:** **하이브리드 판정 방식** — `touchpoints` 테이블에 `last_outbound_at` 컬럼(또는 기존 occurredAt + type 조합)을 기준으로 "마지막 아웃바운드 시점"을 추적한다. 팔로업 필요 여부 판정 시:
  1. touchpoints에서 해당 클라이언트의 마지막 outbound(email 또는 call) 시점 조회
  2. 해당 시점 이후로 inbound(클라이언트 답장)이 있는지 Gmail API로 on-demand 확인
  3. 경과 일수 계산 → 케이던스 단계 판정
- **D-03:** 답장 수신 감지 범위는 "**해당 threadId의 inbound 메시지**"로 한정한다. 다른 스레드의 inbound는 별개 건으로 취급(여러 딜이 병행될 수 있으므로).
- **D-04:** touchpoints에 type='email_sent', 'email_received' 구분 추가. Phase 3는 type='email'(단일)이었으나 Phase 4에서 방향성 구분 필요. 기존 데이터 마이그레이션 최소화(default 'email_sent').

### 실행 진입점 (Gray Area 2 → C)

- **D-05:** **두 모드 모두 지원**:
  - **모드 A (전수 스캔):** `runWorkflowC()` — 모든 활성 클라이언트(stage ≠ Dormant) 스캔, 케이던스 도래 건을 모아 한 번에 드래프트 생성. 주 1회 루틴용.
  - **모드 B (특정 클라이언트):** `runWorkflowC({ companyName: '동반성장위원회' })` — 1건만 분석하여 드래프트 생성. 특정 딜 집중용.
- **D-06:** 모드 A 실행 시 리포트 출력 형식 — 회사별로 (회사명, 마지막 발송일, 경과 일수, 다음 케이던스, 드래프트 ID)를 표 형태로 제공.
- **D-07:** 전수 스캔 결과가 많을 때를 대비해, 한 번 실행에 처리하는 드래프트 수 상한을 설정(기본 10건, 파라미터로 조정 가능). 초과 시 "추가 N건 대기 중 — 재실행 필요" 안내.

### 케이던스 기준일 (Gray Area 3 → C)

- **D-08:** **"마지막 접점 기준"** 으로 케이던스 카운트한다. 이메일 발송, 전화 통화, 미팅 등 touchpoints에 기록되는 모든 outbound 접점이 기준일을 리셋한다.
  - 예: 04-01 이메일 발송 → 04-05 통화 → 04-05 기준 Day 3 계산 시작 (04-08이 1차 팔로업 대상일)
- **D-09:** 이 규칙은 대표님의 실제 업무 흐름과 일치한다 — 통화로 새 약속을 잡았다면 기존 이메일 기준 D+7 팔로업은 의미 없기 때문.
- **D-10:** touchpoints가 비어 있는 기존 클라이언트(Phase 1/2 시절 데이터)는 `clients.lastContactDate`를 fallback으로 사용.

### 상황(context) 감지 (Gray Area 4 → B)

- **D-11:** **AI 자동 분류** — 팔로업 드래프트 작성 전, Claude Code 세션이 마지막 outbound 이메일의 본문을 읽고 아래 5가지 타입 중 하나로 자동 분류:
  1. `proposal` (제안서 발송 후)
  2. `contract` (계약서 발송 후)
  3. `meeting_qna` (미팅 후 QnA 이메일)
  4. `quote_revision` (견적 수정안 발송 후)
  5. `influencer_outreach` (인플루언서 아웃리치)
  6. `general` (위 어디에도 속하지 않는 일반)
- **D-12:** 각 타입별 케이던스 간격은 v4 ULTRA §15의 [상황별 팔로업 변형] 표 따름:
  - proposal: Day 3 → 7 → 14 → 30 (표준)
  - contract: Day 2 → 5 (빠르게)
  - meeting_qna: Day 2 → 5 (모멘텀 유지)
  - quote_revision: Day 3 → 7
  - influencer_outreach: Day 2 → 5 → 10 (짧은 주기)
  - general: Day 3 → 7 → 14 → 30
- **D-13:** 분류 결과는 briefing/touchpoint의 metadata에 기록하여 다음 케이던스 판정 시 재사용(재분류 비용 절감).

### 팔로업 톤 규칙 (FLLW-03 직접 구현)

- **D-14:** 케이던스 단계별 톤을 v4 ULTRA §15 [팔로업 톤 규칙] 그대로 따른다:
  - **1차(첫 팔로업):** "확인 여부만 물어보기" — 가볍게, 톤 레벨 2(따뜻한 프로)
  - **2차:** "새로운 가치 추가" — 관련 레퍼런스/케이스 스터디 제시, 톤 레벨 2~3
  - **3차:** "대안 제시" — 다른 시나리오/더 작은 규모 제안, 톤 레벨 3
  - **마지막(Day 30):** "관계 유지 전환" — 압박 제로, 톤 레벨 2로 부드럽게
- **D-15:** **절대 금지 표현**: "답장 안 주시면 제안을 철회하겠습니다" 식의 압박 문구. v4 ULTRA §15 명시 규칙.
- **D-16:** Phase 3의 `follow-up-composer`를 확장하여 `buildCadenceFollowUpPrompt(stage, tone_level, callAnalysis?)` 함수 추가. 기존 Phase 3 코드는 통화 기반, Phase 4는 케이던스 기반 — 경로 분리하여 D-12(Phase 2 불변) 원칙 유지.

### 휴면 전환 (Gray Area 5 → B)

- **D-17:** **"마지막 터치 드래프트 + 대표님 확인"** 방식으로 STAGE 5 전환.
  - 30일 경과 감지 → "Day 30 마지막 터치" 이메일 드래프트 자동 생성 (톤: 관계 유지 전환)
  - 동시에 대표님에게 보고: "해당 클라이언트 Dormant 전환 예정, 마지막 터치 드래프트 ID=XXX"
  - 대표님이 "전환해" 또는 "유지해" 응답 → 상태 업데이트
- **D-18:** Dormant 전환 시 `pipeline.ts`의 `updateDealStage(dealId, 'DORMANT')` 호출. Phase 1 인프라 재사용, 새 함수 추가하지 않음.
- **D-19:** Dormant 전환 후 해당 클라이언트는 향후 전수 스캔(D-05 모드 A)에서 **자동 제외**된다. v4 ULTRA §15의 "Dormant 리마인드: 분기 1회(90일 주기)"는 Phase 5+ 별도 구현.

### 답장 수신 감지 범위 (Gray Area 6 → C)

- **D-20:** **자동 감지 + 수동 차단** 2중 구조:
  - **자동 차단**: 이메일 inbound(해당 threadId 내) OR 통화 outbound(touchpoints에 새 call 기록) 감지 시 해당 클라이언트 케이던스 자동 중단
  - **수동 차단**: 대표님이 "이 딜은 팔로업 더 안 해" 요청 시 `clients` 테이블의 별도 플래그(예: `followup_paused: true`) 설정. Dormant와 구분됨 — 진행 중이지만 자동 팔로업 제외.
- **D-21:** 수동 차단 해제는 대표님이 "다시 팔로업 시작" 요청 시 플래그 제거. 명시적 요청이 없는 한 유지.

### Claude's Discretion (구현 디테일)

- 팔로업 드래프트의 구체적 문장 구성 (v4 ULTRA §15 예시 문장은 가이드, 상황에 맞춰 변형 허용)
- Day N 경과 판정의 경계 케이스 (정확히 N일 vs N일 이상) — 표준: "≥N일 경과" 기준
- 전수 스캔 시 정렬 순서 — 권장: 경과 일수 내림차순(오래된 것부터) + 유사 케이던스 묶기
- Gmail API 호출 최적화 (캐싱, 배치 조회)
- 모드 A/B 공통 코드 재사용 구조

### Folded Todos

없음 — Phase 4 스코프는 ROADMAP에 명시된 FLLW-01~04 범위 내.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4 핵심 룰
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §15 — 팔로업 케이던스 시스템 (Day 3/7/14/30 + 상황별 변형 + 톤 규칙 + 절대 금지 표현)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §13 — 클라이언트 생애주기 관리 (STAGE 1~5, Dormant 정의)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §16 — 톤 캘리브레이션 5단계 (팔로업 톤 레벨 참조)

### 재사용 Phase 1/2/3 모듈
- `src/workflow/compose.ts` — composeEmail (수정 금지, 재사용만)
- `src/workflow/draft-creator.ts` — createDraft (수정 금지, 재사용만)
- `src/workflow/quality-checker.ts` — validateQualityChecklist (수정 금지, 재사용만)
- `src/workflow/prompt-loader.ts` — v4 ULTRA 선택적 섹션 로더 (재사용, §15 섹션 추가 로드)
- `src/workflow/follow-up-composer.ts` — Phase 3 follow-up-composer (함수 추가만 허용, 기존 함수 수정 금지)
- `src/queries/clients.ts` — 클라이언트 조회/업데이트 (기존 API 재사용)
- `src/queries/touchpoints.ts` — Phase 3 touchpoints (컬럼 확장 허용: type enum 추가)
- `src/state/pipeline.ts` — STAGE 전환 로직 (updateDealStage 재사용)
- `src/db/schema.ts` — Drizzle 스키마 (touchpoints type enum 확장, clients 에 followup_paused 추가)

### Phase 3 CONTEXT 연결
- `.planning/phases/03-workflow-b/03-CONTEXT.md` — Phase 3 Workflow B 결정 사항 (touchpoints 구조, 브리핑 저장 방식)
- `.planning/phases/03-workflow-b/03-UAT.md` — Phase 3 운영 검증 결과 및 Claude Code 모드 최종 확정 근거

### 프로젝트 규칙
- `.planning/PROJECT.md` — FLLW-01~04 요구사항 원문
- `.planning/REQUIREMENTS.md` — 요구사항 매핑 상태
- `CLAUDE.md` — 소통 규칙 (대표님 비개발자, 쉽게 설명 필수)
- `.claude/projects/-Users-cyr-Desktop-Code-Sales/memory/project_phase3_claude_code_mode.md` — v1~v3 Claude Code 모드 고정

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`follow-up-composer.ts` (Phase 3)** — 이메일 스레드 로드 + 프롬프트 빌드 + subject 보존 로직 이미 있음. Phase 4는 `buildCadenceFollowUpPrompt` 함수만 추가.
- **`touchpoints` 테이블 + createTouchpoint** — 접점 타임라인 이미 존재. type 컬럼 확장(enum에 'email_sent'/'email_received' 추가)만 필요.
- **`classify.ts` (Phase 2)** — 상황 분류 엔진 패턴 재사용 가능. Phase 4의 D-11 AI 자동 분류는 이 패턴 참고.
- **`thread-loader.ts` (Phase 3)** — Gmail 스레드 읽기 DI 래퍼 재사용. 답장 감지에 그대로 사용.
- **`pipeline.ts` (Phase 1)** — STAGE 전환 함수 `updateDealStage`. Dormant 전환에 재사용.
- **`prompt-loader.ts` (Phase 2)** — 선택적 섹션 로더. Phase 4는 §15 섹션 추가.

### Established Patterns

- **DI 패턴** — 모든 쿼리 모듈은 `createXxxQueries(db)` 팩토리. Phase 4도 동일 유지.
- **zod 스키마 검증** — 외부 입력과 AI 응답은 zod로 검증 후 사용. Phase 4의 상황 분류 결과도 zod로.
- **경로 분리(Path split)** — Phase 2 = 신규 문의, Phase 3 = 통화 후속, Phase 4 = 케이던스 팔로업. 각각 별도 composer 함수, 공통 compose.ts는 불변.
- **테스트 스타일** — vitest + 인메모리 DB + 픽스처 기반. Phase 4도 동일.
- **안전 게이트** — cross-contamination → price-validator → quality-checker 순서. Phase 4 draft 생성 직전에도 동일 순서 적용.

### Integration Points

- **Gmail MCP (`mcp__claude_ai_Gmail__*`)** — 스레드 조회, 답장 수신 감지, 드래프트 생성. Phase 3와 동일.
- **Slack MCP** — Phase 4는 슬랙 직접 호출 없음. 다만 대표님 요청이 슬랙 통화 브리핑 후 자연스럽게 이어질 수 있음.
- **Claude Code 세션(Agent tool)** — AI 분류 및 프롬프트 실행 레이어. Anthropic API 호출 없음.
- **`data/sales.db` SQLite** — 모든 DB 읽기/쓰기. 신규 마이그레이션 필요(touchpoints type 확장 + clients.followup_paused 추가).

</code_context>

<specifics>
## Specific Ideas

- "팔로업은 압박이 아니라 대표님의 따뜻한 리마인드"라는 톤 철학이 일관되게 유지되어야 한다. v4 ULTRA §15의 "절대 금지 표현" 규칙은 하드코딩 블랙리스트로 관리.
- 전수 스캔 모드(A)는 대표님이 "월요일 아침 루틴"처럼 사용할 것을 염두에 두고 리포트 가독성을 높인다.
- 특정 회사 모드(B)는 대표님이 "아 그 건 팔로업 필요하지" 떠올랐을 때 한 문장으로 시작할 수 있도록.
- Dormant 전환 확인 단계(D-17)는 "잃어버리는 딜 없이 안전하게 은퇴시키는" 감성. 자동 삭제 금지.

</specifics>

<deferred>
## Deferred Ideas

- **Dormant 리마인드(분기 1회)**: v4 ULTRA §15 말미의 "Dormant 리마인드: 분기 1회(90일 주기)"는 별도 파이프라인. Phase 5+ 또는 별도 작은 phase.
- **답장 감정 분석**: 클라이언트 답장의 tone/urgency 파악하여 다음 팔로업 조정 — Phase 5 학습 루프와 묶어서 구현.
- **크로스셀/업셀 타이밍 감지**: 팔로업 중 새 서비스 제안 기회 자동 감지 (LRNG-03) — Phase 5.
- **수정 학습(edit delta)**: 대표님이 드래프트 수정한 내용을 학습 신호로 축적 (LRNG-02) — Phase 5.
- **완전 자율 백그라운드 실행**: cron / 주기 실행 API 기반 자동 실행 — v4+ Anthropic API 모드 도입 시점.
- **멀티 테넌트 지원**: 여러 사용자/계정 지원 — 프로젝트 범위 밖.

</deferred>

---

*Phase: 04-workflow-c*
*Context gathered: 2026-04-12 (discuss mode, 6 gray areas, all CEO-approved per recommendations)*
