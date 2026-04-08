# Phase 2: Workflow A (신규 문의 처리) - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

대표님이 신규 문의를 전달하면 봇이 시장조사 → 맞춤 1차 이메일 작성 → 승인까지 end-to-end로 처리하여, 대표님은 최종 확인만 하면 된다. Phase 1에서 구축한 SQLite DB, 안전장치, 파이프라인을 활용한다.

</domain>

<decisions>
## Implementation Decisions

### 시장조사 방식
- **D-01:** WebSearch 도구를 사용하여 문의 회사를 조사한다. 조사 항목: ① 회사 개요(업종, 규모) ② 주요 상품/서비스 ③ 현재 마케팅 활동(SNS, 블로그, 광고) ④ 실존 여부 확인.
- **D-02:** 시장조사 결과를 구조화된 마크다운 형태로 정리한다. 이메일 작성 시 이 결과를 참조하여 맞춤 내용을 생성한다.
- **D-03:** 조사 결과는 클라이언트 DB에 자동 저장하여 재조사 없이 재활용할 수 있게 한다.

### v4 ULTRA 프롬프트 적용 방식
- **D-04:** v4 ULTRA 전체(1188줄)를 매번 로드하지 않는다. 이메일 작성 시 필요한 섹션만 선택적으로 로드한다.
  - 필수 로드: SECTION 1(페르소나), SECTION 6(이메일 규칙 한국어), SECTION 8(제목 형식), SECTION 20(품질 체크리스트)
  - 상황별 로드: SECTION 9(상황별 전략 A~L 중 해당 전략만), SECTION 11(분류 엔진), SECTION 12(서비스 추천), SECTION 16(톤 캘리브레이션)
  - 업종별 로드: SECTION 18(업종별 플레이북 중 해당 업종만)
- **D-05:** 이메일 자동 분류 엔진(SECTION 11)의 4단계 판단 트리를 먼저 실행하여 상대방/상황/언어/긴급도를 판단하고, 그 결과에 따라 필요한 섹션을 동적으로 로드한다.

### 이메일 작성 규칙
- **D-06:** 이메일은 반드시 HTML 형식(text/html)으로 Gmail 드래프트를 생성한다. CC에 PM@puzl.co.kr, leader@puzl.co.kr를 자동 포함한다.
- **D-07:** 구조화 기호 규칙(■●★◎※)과 서명(감사합니다. / 퍼즐코퍼레이션 / 최 영 록 / 드림.) 그리고 소개 자료 링크를 하이퍼링크로 처리한다. gmail-sanitizer.ts를 발송 전 반드시 적용한다.
- **D-08:** 기존 이메일 스레드에 답장할 때는 Gmail MCP의 threadId를 정확히 지정한다. 신규 문의는 새 스레드로 생성한다.
- **D-09:** 발송 전 품질 체크리스트(SECTION 20) 11개 필수 항목을 자동 검증한다. 미통과 항목이 있으면 수정 후 재생성한다.

### 승인 플로우
- **D-10:** 봇이 작성한 이메일은 Gmail 임시저장(Draft)으로 생성한다. 대표님이 Gmail에서 직접 확인하고 발송한다.
- **D-11:** 이메일에 금액/견적이 포함된 경우 "⚠️ 금액 포함 — 반드시 확인해주세요" 경고를 표시한다. price-validator.ts를 적용한다.
- **D-12:** 대표님이 수정 요청 시 수정 사항을 반영하여 새 드래프트를 생성한다. 기존 드래프트를 덮어쓰지 않고 새로 만든다.

### 반론 대응 & 서비스 추천
- **D-13:** 반론/거절 대응 플레이북(SECTION 14, 5대 시나리오)을 상황 감지 시 자동 적용한다.
- **D-14:** 클라이언트 생애주기(SECTION 13, STAGE 1~5)에 따라 톤 레벨과 전략을 자동 조절한다. pipeline.ts의 현재 stage 값을 참조한다.
- **D-15:** 서비스 추천 매트릭스(SECTION 12)를 활용하여 예산 티어 + 업종에 맞는 최적 믹스안을 자동 제안한다. services.ts의 DB 쿼리 결과를 사용한다.

### 클라이언트 DB 자동 업데이트
- **D-16:** 매 소통 후 클라이언트 DB를 자동 업데이트한다. 새 정보(담당자 변경, 예산 확인, 선호 서비스 등)가 발견되면 clients.ts의 upsertClient 함수로 저장한다.
- **D-17:** 신규 문의 시 클라이언트가 DB에 없으면 자동 생성한다. 시장조사 결과를 기본 정보로 채운다.

### Claude's Discretion
- 시장조사 검색 쿼리 최적화 방법
- v4 ULTRA 섹션 로드 시 토큰 최적화 세부 전략
- 에러 핸들링 및 재시도 로직
- 이메일 작성 프롬프트의 구체적 구조

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v4 ULTRA 이메일 규칙
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §1 — 페르소나 (나는 누구인가)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §6 — 이메일 작성 규칙 한국어 (인사/오프닝/말투/구조화 기호/클로징/서명/Gmail HTML)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §7 — 이메일 작성 규칙 영문
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §8 — 이메일 제목 형식
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §9 — 상황별 응대 전략 A~L
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §11 — 이메일 자동 분류 엔진 (4단계 판단 트리)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §12 — 서비스 추천 매트릭스
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §13 — 클라이언트 생애주기 관리
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §14 — 반론/거절 대응 플레이북
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §16 — 톤 캘리브레이션 5단계
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §18 — 업종별 플레이북 6종
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §19 — 제안서 이메일 구조 템플릿
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §20 — 발송 전 품질 체크리스트

### 페르소나 & 스타일
- `system/페르소나_분석.md` — 한/영 이메일 스타일, 서명 형식, 톤 특성

### Phase 1 코드 (재사용)
- `src/queries/clients.ts` — getClient, upsertClient (D-04 교차 오염 방지 내장)
- `src/queries/services.ts` — getServiceByName, getRecommendationsByIndustryAndTier
- `src/safety/cross-contamination.ts` — loadClientContext, validateNoContamination
- `src/safety/price-validator.ts` — extractPricesFromText, validatePrices
- `src/safety/gmail-sanitizer.ts` — sanitizeForGmail
- `src/state/pipeline.ts` — addDeal, updateDealStage, getDealByCompany
- `src/state/session-loader.ts` — loadSessionState, getDealsNeedingFollowup

### 운영 워크플로우
- `docs/세일즈봇_운영매뉴얼.md` §2A — 신규 문의 → 1차 이메일 워크플로우
- `docs/지식베이스_구조.md` — 학습 루프 설계, 트리거 정의

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/queries/clients.ts` — getClient/upsertClient: 클라이언트 조회/생성 (D-04 교차 오염 방지 내장)
- `src/queries/services.ts` — 서비스/추천 조회: 예산 티어 + 업종별 매트릭스 쿼리
- `src/safety/cross-contamination.ts` — 이메일 본문에서 다른 클라이언트 이름 감지
- `src/safety/price-validator.ts` — 이메일 금액과 DB 단가 대조 검증
- `src/safety/gmail-sanitizer.ts` — 14개 위험 문자 자동 치환
- `src/state/pipeline.ts` — 딜 CRUD + 5단계 생애주기
- `src/state/session-loader.ts` — 세션 시작 시 현황 로드

### Established Patterns
- Drizzle ORM eq() 쿼리 패턴 (SQL injection 방지)
- DI 패턴: createClientQueries/createServiceQueries 팩토리 함수
- Zod 스키마 검증 (pipeline.ts)
- TDD RED-GREEN 개발 플로우
- Vitest 테스트 프레임워크

### Integration Points
- Gmail MCP — gmail_create_draft, gmail_read_message, gmail_search_messages
- Slack MCP — slack_get_channel_history (Phase 3에서 사용, 여기선 미사용)
- WebSearch — 시장조사용 웹 검색
- SQLite DB — data/sales.db (Phase 1에서 구축)

</code_context>

<specifics>
## Specific Ideas

- 대표님이 "너한테 맡길게"로 전체 위임 — 최선의 판단으로 결정
- v4 ULTRA 전체 로드 대신 선택적 섹션 로드로 토큰 절약 (대표님이 토큰 소모 민감)
- Phase 1의 모든 안전장치(교차 오염/가격 검증/인코딩)를 이메일 생성 파이프라인에 통합

</specifics>

<deferred>
## Deferred Ideas

None — 논의가 Phase 2 범위 내에서 진행됨

</deferred>

---

*Phase: 02-workflow-a*
*Context gathered: 2026-04-08*
