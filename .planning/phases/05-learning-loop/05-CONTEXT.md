# Phase 5: Learning Loop (학습 루프) - Context

**Gathered:** 2026-04-12 (assumptions mode, --auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

매 소통(이메일/통화)의 결과를 자동 추적하고, 대표님의 드래프트 수정 습관을 학습하며, 크로스셀 기회와 경쟁사/시장 정보를 자동 축적하여 봇의 이메일 품질이 시간이 갈수록 개선되는 피드백 루프를 구축한다.

**요구사항:** LRNG-01, LRNG-02, LRNG-03, LRNG-04

**성공 기준 (ROADMAP 원문):**
1. 매 이메일 소통 후 성공/실패 패턴이 email_patterns DB에 자동 기록된다
2. 대표님이 드래프트를 수정한 내용(edit delta)이 학습 신호로 저장되어 향후 드래프트에 반영된다
3. 크로스셀/업셀 트리거 조건 충족 시 추가 서비스 제안 타이밍이 자동 감지된다
4. 소통 과정에서 파악된 경쟁사/시장 정보가 market DB에 자동 축적된다

**범위 밖(Deferred):**
- 자동 A/B 테스트 (이메일 변형 비교) — v2+
- ML 모델 학습 (통계적 패턴 → 자동 가중치 조정) — v2+
- 대시보드 UI (학습 결과 시각화) — v2+
- 외부 CRM 연동 (HubSpot/Salesforce export) — v2+

</domain>

<decisions>
## Implementation Decisions

### 실행 모드 (최상위 제약)

- **D-01:** **Claude Code 모드 유지** — Phase 3/4와 동일. 학습 루프도 대표님이 Claude Code 세션에서 명시적으로 호출해야만 실행. 자동 백그라운드 수집 없음.
- **D-02:** **대표님이 지시한 건만 처리** — 봇이 알아서 이메일을 모니터링하거나 학습을 돌리는 건 없음. "학습 돌려줘" 같은 명시적 요청 시에만 실행.

### LRNG-01: 이메일 성공/실패 패턴 축적

- **D-03:** **email_patterns 테이블 신설** — Drizzle 스키마에 추가. 핵심 필드:
  - `client_id`, `touchpoint_id` (발송한 이메일의 touchpoint 참조)
  - `strategy_used` (v4 ULTRA 전략 A~L 중 어떤 걸 썼는지)
  - `tone_level` (1~5)
  - `context_type` (proposal/contract/meeting_qna 등 Phase 4에서 정의한 6종)
  - `subject_line`, `body_preview` (첫 200자)
  - `sent_at`, `reply_received_at` (답장 수신 시각, null이면 미응답)
  - `outcome`: 'replied' | 'no_reply' | 'positive' | 'negative' | 'pending'
  - `days_to_reply` (계산 필드)
  - `industry` (거래처 업종 — 업종별 패턴 분석용)

- **D-04:** **"성공" 판정 기준** —
  - `replied` = 14일 이내 답장 수신 (inbound 감지 — Phase 4 hasInboundSince 재사용)
  - `positive` = 답장 내용이 다음 단계로 이어짐 (미팅 요청, 견적 요청 등) — AI 자동 분류
  - `negative` = 거절/보류 답장 — AI 자동 분류
  - `no_reply` = 30일 초과 미응답
  - `pending` = 30일 미만 미응답 (아직 판정 불가)

- **D-05:** **패턴 기록 시점** — 대표님이 "학습 돌려줘" 요청 시 한꺼번에 수행. 봇이 Gmail에서 최근 발송 이메일들의 답장 여부를 스캔하고 email_patterns 업데이트. Phase 4의 팔로업 스캔과 유사한 on-demand 배치.

- **D-06:** **패턴 활용 방식** — 새 이메일 작성 시 buildEmailPrompt/buildFollowUpPrompt의 system prompt에 "과거 학습" 섹션을 동적 주입:
  - "이 업종(F&B)에서 전략 E를 쓴 이메일의 평균 답장률은 60%입니다"
  - "이 클라이언트에게 톤 레벨 2를 사용했을 때 답장이 더 빨랐습니다"
  - 최근 3개 성공 패턴을 few-shot 예시로 포함

### LRNG-02: Edit Delta 학습

- **D-07:** **edit_deltas 테이블 신설** — 핵심 필드:
  - `client_id`, `touchpoint_id`
  - `original_body` (봇이 생성한 원본 드래프트)
  - `final_body` (대표님이 수정 후 실제 발송한 최종 본문)
  - `diff_summary` (AI가 생성한 수정 요약: "가격 부분 삭제", "톤을 더 친근하게 변경" 등)
  - `diff_category`: 'tone' | 'content' | 'structure' | 'pricing' | 'greeting' | 'closing'
  - `created_at`

- **D-08:** **edit delta 추출 방식** —
  1. 봇이 드래프트 생성 시 `original_body`를 touchpoint.metadata에 저장 (이미 Phase 2/3/4에서 touchpoint 기록하는 시점에 추가)
  2. 대표님이 "학습 돌려줘" 요청 시, Gmail API로 해당 threadId의 SENT 메시지를 읽어서 `final_body` 확보
  3. original vs final을 비교 → AI가 차이를 요약하고 카테고리 분류
  4. edit_deltas 테이블에 저장

- **D-09:** **edit delta 반영 메커니즘** — 새 이메일 작성 시 system prompt에 주입:
  - "대표님 수정 패턴: 이 클라이언트에게는 가격을 먼저 언급하지 않는 스타일입니다"
  - "대표님 수정 패턴: 공공기관에는 톤 레벨 3~4 선호"
  - 클라이언트별/업종별로 그룹핑하여 가장 최근 3건의 수정 패턴 포함
  - **주의:** 대표님이 수정 안 한 이메일(original === final)은 "이 스타일이 OK"라는 양성 신호로 기록

### LRNG-03: 크로스셀/업셀 트리거 감지

- **D-10:** **v4 ULTRA §17 트리거 매트릭스를 코드화** — `src/workflow/cross-sell-detector.ts` 신규. TRIGGER_MATRIX 상수에 11개 서비스→서비스 연결 + 타이밍 조건 코드화.

- **D-11:** **트리거 체크 시점** — 대표님이 "학습 돌려줘" 또는 "크로스셀 체크해줘" 요청 시 실행. 각 활성 클라이언트에 대해:
  1. touchpoints 타임라인에서 현재 진행 중인 서비스 파악
  2. TRIGGER_MATRIX에서 매칭되는 크로스셀 후보 찾기
  3. 타이밍 조건 충족 여부 판정 (캠페인 N주차, 콘텐츠 N개 확보 등)
  4. 충족 시 보고: "동반성장위원회 — 현재 UGC 진행 중 → 2차 라이선스 + 퍼포먼스 제안 타이밍"

- **D-12:** **제안 화법은 Phase 2 compose.ts를 통해 실행** — 크로스셀 감지 자체는 별도 모듈이지만, 실제 이메일 작성은 기존 Workflow A 파이프라인 재사용. 감지 결과를 "새 문의"처럼 Workflow A에 넘기면 시장조사 → 이메일 → 드래프트 흐름 타기.

### LRNG-04: 경쟁사/시장 정보 자동 축적

- **D-13:** **competitor_intel 테이블 신설** — 핵심 필드:
  - `client_id` (어느 거래처 소통에서 발견했는지)
  - `competitor_name` (경쟁사 이름)
  - `intel_type`: 'pricing' | 'service' | 'strategy' | 'weakness' | 'general'
  - `detail` (구체적 정보 내용)
  - `source`: 'call_analysis' | 'email_reply' | 'market_research'
  - `confidence`: 'confirmed' | 'inferred' | 'rumor'
  - `discovered_at`

- **D-14:** **수집 시점** — Phase 3 call-analyzer + Phase 5 이메일 답장 분석에서 자동 추출. AI가 통화/이메일에서 경쟁사 언급을 감지하면 구조화하여 저장.
  - 예: 통화에서 "다른 업체에서 1500만원에 해준다고 하더라고요" → {competitor_name: "unknown", intel_type: "pricing", detail: "1500만원 견적 제시", confidence: "confirmed"}
  - 예: 이메일에서 "OO마케팅에서도 제안서를 받았는데" → {competitor_name: "OO마케팅", intel_type: "general", detail: "경쟁 입찰 진행 중", confidence: "confirmed"}

- **D-15:** **시장 정보 활용** — 시장조사 시 competitor_intel DB를 참조하여 경쟁사 대비 포지셔닝 강화. "이전에 이 업종 거래처에서 경쟁사 A가 X원에 제안했다는 정보가 있습니다" → 이메일 전략에 반영.

### 학습 실행 진입점

- **D-16:** **"학습 돌려줘" 단일 진입점** — `runLearningLoop(deps)` 함수가:
  1. email_patterns 업데이트 (LRNG-01)
  2. edit delta 추출 + 저장 (LRNG-02)
  3. 크로스셀 트리거 체크 (LRNG-03)
  4. 경쟁사 정보 추출 (LRNG-04)
  를 한 번에 수행하고 종합 보고서 출력.

- **D-17:** **보고서 형식** — Phase 4의 cadence-report 패턴 복제:
  - "이메일 성과: N건 분석, 답장률 X%, 평균 답장 소요 Y일"
  - "수정 패턴: N건 발견 (톤 변경 M건, 내용 수정 K건)"
  - "크로스셀 기회: N건 감지 (거래처별 리스트)"
  - "시장 정보: N건 신규 수집"

### Phase 2/3/4 연동 (후방 호환)

- **D-18:** **Phase 2/3/4 불변** — compose.ts, draft-creator.ts, quality-checker.ts, workflow-a/b/c.ts 수정 금지. 학습 데이터 주입은 prompt builder 레이어(follow-up-composer의 새 함수 or 별도 learning-prompt-injector)에서 처리.

- **D-19:** **touchpoint.metadata 확장** — 기존 Phase 3/4의 touchpoint 기록에 `original_body` 필드를 추가하여 edit delta 추출의 기반 데이터 확보. 이는 Phase 2/3/4 오케스트레이터에 **작은 1줄 추가**로 가능 (createTouchpoint 호출 시 metadata에 body 포함).

### Claude's Discretion

- diff 알고리즘 선택 (텍스트 diff vs HTML diff vs AI 요약 기반)
- email_patterns 통계 쿼리 최적화 (업종별/전략별 집계)
- 크로스셀 타이밍 조건의 "N주차" / "N개 확보" 판정 로직
- competitor_intel 중복 제거 전략 (같은 경쟁사 같은 정보 반복 수집 방지)
- 학습 보고서 시각적 포맷 세부 사항

### Folded Todos

없음.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 핵심 룰
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §17 (lines 931-970) — 크로스셀/업셀 트리거 매트릭스 (11 연계 + 3 화법 패턴)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §10 — 영업 철학 & 암묵지 (학습 맥락)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §13 — 클라이언트 생애주기 (STAGE 기반 학습 세그먼팅)

### 재사용 Phase 1/2/3/4 모듈
- `src/workflow/compose.ts` — composeEmail (수정 금지, prompt 주입은 별도 레이어)
- `src/workflow/follow-up-composer.ts` — prompt builder (함수 추가만 허용)
- `src/workflow/inbound-detector.ts` — Phase 4 hasInboundSince (답장 감지 재사용)
- `src/workflow/cadence-report.ts` — Phase 4 리포트 렌더러 (패턴 복제)
- `src/queries/touchpoints.ts` — Phase 3/4 touchpoint CRUD (metadata 확장)
- `src/queries/clients.ts` — 클라이언트 정보 조회
- `src/workflow/call-analyzer.ts` — Phase 3 통화 분석 (경쟁사 정보 추출 확장)
- `src/db/schema.ts` — Drizzle 스키마 (email_patterns + edit_deltas + competitor_intel 테이블 추가)

### 프로젝트 규칙
- `.planning/PROJECT.md` — LRNG-01~04 요구사항 원문
- `CLAUDE.md` — 소통 규칙
- `.claude/projects/-Users-cyr-Desktop-Code-Sales/memory/feedback_operational_control.md` — 검증 단계 운영 통제권 (대표님 지시 건만 처리)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`hasInboundSince` (Phase 4)** — 답장 수신 감지. LRNG-01의 "답장 여부" 판정에 직접 재사용.
- **`cadence-report.ts` (Phase 4)** — 한국어 보고서 렌더러 패턴. D-17 학습 보고서에 동일 패턴 복제.
- **`call-analyzer.ts` (Phase 3)** — 통화 분석 AI. LRNG-04 경쟁사 정보 추출 시 tool_use 스키마 확장 가능.
- **`thread-loader.ts` (Phase 3)** — Gmail 스레드 읽기. LRNG-02 edit delta에서 SENT 메시지 로드에 재사용.
- **`classifyCadenceContextDeterministic` (Phase 4)** — 키워드 기반 분류기 패턴. LRNG-01 outcome 분류에 참고.

### Established Patterns
- **DI 패턴** — 모든 외부 호출은 optional DI
- **zod 스키마 검증** — AI 응답은 반드시 zod parse
- **TDD** — RED → GREEN → REFACTOR
- **Atomic commits** — 태스크 단위 커밋

### Integration Points
- **touchpoint.metadata** — Phase 3/4가 이미 metadata JSON에 다양한 정보 저장. Phase 5는 `original_body` 필드 추가.
- **Gmail MCP** — SENT 메시지 조회 (edit delta 원본 대비 최종본 비교)
- **Claude Code 세션** — AI 분류(outcome, diff_summary, competitor extraction)는 세션 내에서 직접 수행

</code_context>

<specifics>
## Specific Ideas

- 학습 결과는 "대표님 수정 패턴 카드" 형태로 압축 → 새 이메일 작성 시 system prompt에 3장 이내로 삽입
- 크로스셀 감지 결과는 "기회 알림" 형태로 보고 → 대표님이 "이거 해줘"하면 Workflow A 타기
- 경쟁사 정보는 축적만 하고 자동 대응은 안 함 → 대표님이 판단하여 전략에 반영
- "학습 돌려줘"는 주 1회 정도 → 팔로업과 함께 "팔로업 + 학습 돌려줘" 루틴 가능

</specifics>

<deferred>
## Deferred Ideas

- **A/B 테스트 자동화**: 같은 업종/상황에서 전략 A vs 전략 B를 자동으로 나눠 실행하고 결과 비교 — v2+
- **통계 대시보드**: 업종별/전략별 답장률, 계약 전환율 시각화 — v2+
- **ML 기반 톤 최적화**: 수정 패턴 데이터가 충분히 쌓이면 자동 톤 조정 — v2+
- **외부 CRM 연동**: HubSpot/Salesforce로 데이터 export — 프로젝트 범위 밖
- **실시간 모니터링**: Gmail webhook으로 답장 수신 즉시 감지 — v4+ API 모드 전환 시

</deferred>

---

*Phase: 05-learning-loop*
*Context gathered: 2026-04-12 (assumptions mode, --auto, all auto-resolved)*
