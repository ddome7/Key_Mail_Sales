# Phase 5 Research — Learning Loop (학습 루프)

**Date:** 2026-04-12
**For:** gsd-planner, Phase 5
**Status:** Complete
**Domain:** 이메일 성과 패턴 축적 / edit delta 학습 / 크로스셀 트리거 감지 / 경쟁사 정보 수집
**Confidence:** HIGH (Phase 1-4 코드베이스 전수 조사 완료, v4 ULTRA §17 원문 확인)
**Response language:** 한국어 (유저 섹션) + English (코드/시그니처)

---

## Executive Summary

대표님께 한 줄로 말씀드립니다. **Phase 5는 "봇이 갈수록 똑똑해지는 피드백 루프"를 만드는 단계**입니다. Phase 2/3/4에서 이메일 작성 → 승인 → 팔로업까지의 파이프라인이 완성되었고, Phase 5는 그 파이프라인의 **결과를 수집하고 학습하여 다음번 이메일을 더 잘 쓰게** 만듭니다.

구체적으로 4가지를 합니다: (1) 보낸 이메일에 답장이 왔는지 추적하여 "어떤 전략이 잘 먹히는지" 패턴 DB에 기록, (2) 대표님이 봇의 드래프트를 수정한 내용을 분석하여 "대표님 스타일"을 학습, (3) v4 ULTRA §17의 크로스셀 트리거 매트릭스를 코드화하여 추가 서비스 제안 타이밍을 자동 감지, (4) 통화/이메일에서 경쟁사 정보를 자동 추출하여 시장정보 DB에 축적.

**핵심 기술 리스크 3가지:**
1. **Gmail SENT 메시지 조회** — edit delta를 위해 대표님이 실제 발송한 최종본을 가져와야 함. 기존 `thread-loader.ts`의 `loadThreadHistory`로 threadId 기반 조회하면 SENT 메시지도 포함됨 → 추가 개발 불필요. [VERIFIED: src/workflow/thread-loader.ts L89-118]
2. **Phase 2/3/4 불변 원칙 (D-18)** — compose.ts, workflow-a/b/c.ts를 수정하지 않고 학습 데이터를 주입해야 함. 해법: `learning-prompt-injector.ts` 신규 모듈이 system prompt에 학습 컨텍스트를 append하는 래퍼 제공.
3. **touchpoint.metadata에 original_body 추가 (D-19)** — Phase 2/3/4 오케스트레이터의 `createTouchpoint` 호출에 1줄씩 추가 필요. 이것은 D-18 "수정 금지" 범위의 예외(CONTEXT.md D-19에서 명시적 허용).

**Primary recommendation:** 6개 플랜으로 분할. Wave 0에서 DB 스키마 + touchpoint metadata 확장(D-19), Wave 1에서 4가지 학습 모듈 병렬 개발, Wave 2에서 오케스트레이터 + CLI + 보고서.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**실행 모드 (최상위 제약)**
- **D-01:** Claude Code 모드 유지. 학습 루프도 대표님이 Claude Code 세션에서 명시적으로 호출해야만 실행. 자동 백그라운드 수집 없음.
- **D-02:** 대표님이 지시한 건만 처리. "학습 돌려줘" 같은 명시적 요청 시에만 실행.

**LRNG-01: 이메일 성공/실패 패턴 축적**
- **D-03:** email_patterns 테이블 신설 (client_id, touchpoint_id, strategy_used, tone_level, context_type, subject_line, body_preview, sent_at, reply_received_at, outcome, days_to_reply, industry)
- **D-04:** 성공 판정 기준 — replied=14일 이내 답장, positive=다음 단계 이어짐(AI 분류), negative=거절/보류(AI 분류), no_reply=30일 초과, pending=30일 미만
- **D-05:** 패턴 기록 시점 — "학습 돌려줘" 요청 시 배치 수행
- **D-06:** 패턴 활용 방식 — system prompt에 "과거 학습" 섹션 동적 주입

**LRNG-02: Edit Delta 학습**
- **D-07:** edit_deltas 테이블 신설 (client_id, touchpoint_id, original_body, final_body, diff_summary, diff_category, created_at)
- **D-08:** edit delta 추출 방식 — original_body는 touchpoint.metadata에서, final_body는 Gmail SENT에서
- **D-09:** edit delta 반영 메커니즘 — system prompt에 수정 패턴 주입

**LRNG-03: 크로스셀/업셀 트리거 감지**
- **D-10:** v4 ULTRA §17 트리거 매트릭스를 `cross-sell-detector.ts`에 코드화
- **D-11:** 트리거 체크 시점 — "학습 돌려줘" 또는 "크로스셀 체크해줘" 시 실행
- **D-12:** 제안 화법은 Phase 2 compose.ts를 통해 실행 (감지 결과를 Workflow A에 넘김)

**LRNG-04: 경쟁사/시장 정보 자동 축적**
- **D-13:** competitor_intel 테이블 신설 (client_id, competitor_name, intel_type, detail, source, confidence, discovered_at)
- **D-14:** 수집 시점 — Phase 3 call-analyzer + Phase 5 이메일 답장 분석에서 자동 추출
- **D-15:** 시장 정보 활용 — 시장조사 시 competitor_intel DB 참조

**학습 실행 진입점**
- **D-16:** "학습 돌려줘" 단일 진입점 — runLearningLoop(deps)
- **D-17:** 보고서 형식 — cadence-report 패턴 복제

**Phase 2/3/4 연동 (후방 호환)**
- **D-18:** Phase 2/3/4 불변 — compose.ts, draft-creator.ts, quality-checker.ts, workflow-a/b/c.ts 수정 금지
- **D-19:** touchpoint.metadata 확장 — 기존 Phase 3/4의 touchpoint 기록에 original_body 필드 추가 (작은 1줄 추가)

### Claude's Discretion

- diff 알고리즘 선택 (텍스트 diff vs HTML diff vs AI 요약 기반)
- email_patterns 통계 쿼리 최적화 (업종별/전략별 집계)
- 크로스셀 타이밍 조건의 "N주차" / "N개 확보" 판정 로직
- competitor_intel 중복 제거 전략
- 학습 보고서 시각적 포맷 세부 사항

### Deferred Ideas (OUT OF SCOPE)

- A/B 테스트 자동화 — v2+
- 통계 대시보드 — v2+
- ML 기반 톤 최적화 — v2+
- 외부 CRM 연동 — 프로젝트 범위 밖
- 실시간 모니터링 (Gmail webhook) — v4+
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LRNG-01 | 매 이메일 소통 후 성공/실패 패턴이 email_patterns DB에 자동 기록된다 | §1 Gmail SENT 조회 + §2 email_patterns 스키마 + §9 Outcome 분류 |
| LRNG-02 | 대표님이 드래프트를 수정한 내용(edit delta)이 학습 신호로 저장되어 향후 드래프트에 반영된다 | §1 Gmail SENT 조회 + §3 Edit Delta Diff 전략 + §4 Learning Prompt Injection |
| LRNG-03 | 크로스셀/업셀 트리거 조건 충족 시 추가 서비스 제안 타이밍이 자동 감지된다 | §5 Cross-sell Trigger Matrix 코드화 |
| LRNG-04 | 소통 과정에서 파악된 경쟁사/시장 정보가 market DB에 자동 축적된다 | §6 Competitor Intel 추출 |
</phase_requirements>

---

## Reuse Map (Phase 1-4 재사용 자산)

| 모듈 | 파일 | 재사용 방식 | Phase 5 확장 |
|------|------|-------------|-------------|
| **thread-loader** | `src/workflow/thread-loader.ts` | loadThreadHistory(threadId)로 SENT 메시지 포함 전체 스레드 로드 | 없음 (그대로 사용) |
| **inbound-detector** | `src/workflow/inbound-detector.ts` | hasInboundSince로 답장 수신 감지 | 없음 (LRNG-01에서 직접 호출) |
| **touchpoints** | `src/queries/touchpoints.ts` | createTouchpoint, getTimelineByClient | metadata에 original_body 추가 (D-19) |
| **clients** | `src/queries/clients.ts` | getClient, getClientById, getActiveFollowupClients | 없음 |
| **cadence-report** | `src/workflow/cadence-report.ts` | 보고서 렌더러 패턴 복제 (D-17) | learning-report.ts 신규 (구조만 참조) |
| **workflow-c** | `src/workflow/workflow-c.ts` | 오케스트레이터 패턴 복제 (D-16) | learning-loop.ts 신규 |
| **call-analyzer** | `src/workflow/call-analyzer.ts` | tool_use 패턴 참조 + competitor extraction 확장 가능성 | 별도 pass 추가 (§6 참조) |
| **follow-up-composer** | `src/workflow/follow-up-composer.ts` | prompt builder 패턴 | learning-prompt-injector.ts로 래핑 (D-06/D-09) |
| **run-workflow-c.ts** | `scripts/run-workflow-c.ts` | CLI 패턴 복제 | run-learning-loop.ts 신규 |
| **compose.ts** | `src/workflow/compose.ts` | **수정 금지** (D-18) | 없음 |
| **schema.ts** | `src/db/schema.ts` | Drizzle 스키마 확장 | 3개 테이블 추가 |

---

## Net-New Components

| # | 파일 | 목적 | Wave |
|---|------|------|------|
| 1 | `src/db/schema.ts` (수정) | email_patterns, edit_deltas, competitor_intel 테이블 추가 | 0 |
| 2 | `src/queries/email-patterns.ts` | email_patterns CRUD + 통계 집계 쿼리 | 0 |
| 3 | `src/queries/edit-deltas.ts` | edit_deltas CRUD | 0 |
| 4 | `src/queries/competitor-intel.ts` | competitor_intel CRUD + 중복 방지 | 0 |
| 5 | `src/workflow/pattern-tracker.ts` | LRNG-01: 이메일 성과 패턴 추적 (배치 스캔 + outcome 분류) | 1 |
| 6 | `src/workflow/edit-delta-extractor.ts` | LRNG-02: original vs final 비교 + AI diff 요약 | 1 |
| 7 | `src/workflow/cross-sell-detector.ts` | LRNG-03: TRIGGER_MATRIX + 타이밍 판정 | 1 |
| 8 | `src/workflow/competitor-extractor.ts` | LRNG-04: 이메일 답장에서 경쟁사 정보 추출 | 1 |
| 9 | `src/workflow/learning-prompt-injector.ts` | D-06/D-09: 학습 데이터를 system prompt에 주입하는 래퍼 | 1 |
| 10 | `src/workflow/learning-loop.ts` | D-16: runLearningLoop 오케스트레이터 | 2 |
| 11 | `src/workflow/learning-report.ts` | D-17: 학습 보고서 렌더러 | 2 |
| 12 | `scripts/run-learning-loop.ts` | CLI 진입점 | 2 |

---

## Research Findings

### 1. Gmail SENT 메시지 조회 (Primary Q1)

**결론: 기존 thread-loader.ts로 충분. 추가 개발 불필요.**

`loadThreadHistory(threadId, gmailReadThreadTool)`은 Gmail MCP의 스레드 전체를 읽어옵니다. 스레드에는 발신(SENT)과 수신(INBOX) 메시지가 모두 포함됩니다. [VERIFIED: src/workflow/thread-loader.ts L89-118]

edit delta를 위한 `final_body` 확보 흐름:
1. touchpoint 기록에서 `sourceId`(=threadId)를 가져옴
2. `loadThreadHistory(threadId, gmailReadThreadTool)`로 전체 스레드 로드
3. `isOwnMessage(msg)` [VERIFIED: src/workflow/inbound-detector.ts L47-51]로 자사 발신 메시지 필터
4. 가장 최근 자사 발신 메시지의 `body`가 `final_body`

**핵심 포인트:** ThreadMessage의 `body` 필드는 Gmail raw(plain text 또는 HTML)로 제공됩니다. [VERIFIED: src/workflow/thread-loader.ts L38] original_body도 HTML이므로 직접 비교 가능합니다.

**주의:** Gmail MCP가 Claude Code 세션에서만 사용 가능하므로, CLI 단독 실행 시에는 Phase 4와 동일하게 stub 주입. [VERIFIED: scripts/run-workflow-c.ts L132-145]

### 2. email_patterns 스키마 설계 (Primary Q2)

**D-03 기반 설계. touchpoint_id FK 참조 + 업종/전략 복합 인덱스.**

```typescript
// src/db/schema.ts — 추가
export const emailPatterns = sqliteTable(
  'email_patterns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    touchpointId: integer('touchpoint_id')
      .references(() => touchpoints.id, { onDelete: 'set null' }),
    strategyUsed: text('strategy_used'),          // 'A'~'L'
    toneLevel: integer('tone_level'),              // 1~5
    contextType: text('context_type'),             // proposal | contract | ...
    subjectLine: text('subject_line'),
    bodyPreview: text('body_preview'),             // 첫 200자
    sentAt: text('sent_at'),                       // ISO 8601
    replyReceivedAt: text('reply_received_at'),    // null = 미응답
    outcome: text('outcome', {
      enum: ['replied', 'no_reply', 'positive', 'negative', 'pending'],
    }).notNull().default('pending'),
    daysToReply: integer('days_to_reply'),          // 계산 필드
    industry: text('industry'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    clientIdx: index('email_patterns_client_idx').on(table.clientId),
    industryStrategyIdx: index('email_patterns_industry_strategy_idx')
      .on(table.industry, table.strategyUsed),
    outcomeIdx: index('email_patterns_outcome_idx').on(table.outcome),
    touchpointIdx: index('email_patterns_touchpoint_idx').on(table.touchpointId),
  }),
);
```

**인덱스 설계 근거:**
- `(industry, strategyUsed)` — D-06 "이 업종에서 전략 E를 쓴 이메일의 평균 답장률" 집계 쿼리 최적화
- `(outcome)` — pending 건 배치 업데이트 시 빠른 필터
- `(touchpointId)` — 중복 방지 (동일 touchpoint에 대해 이미 패턴 기록 여부 체크)
- `(clientId)` — 클라이언트별 이력 조회

**touchpoint 연결:** touchpoint.sourceId에 threadId가 저장되어 있고 [VERIFIED: src/db/schema.ts L124], email_patterns.touchpointId로 FK 참조하면 "어떤 이메일 발송에 대한 결과인지" 추적 가능합니다.

[VERIFIED: 기존 touchpoints 테이블 구조 — src/db/schema.ts L101-134]

### 3. Edit Delta Diff 전략 (Primary Q3)

**추천: AI 요약 기반 (option b). 텍스트 diff는 보조 정보로만 사용.**

트레이드오프 분석:

| 방식 | 장점 | 단점 |
|------|------|------|
| (a) HTML 스트립 → 텍스트 diff | 정확한 변경 위치 파악 | HTML 태그 노이즈, 한국어 형태소 경계에서 노이즈, diff 라이브러리 의존성 추가 필요 |
| (b) AI 요약 | "톤을 더 친근하게 변경", "가격 부분 삭제" 같은 사람이 이해 가능한 요약 | AI 호출 비용, 분류 정확도는 모델 의존 |
| (c) 둘 다 | 정확성 + 가독성 | 복잡도 증가, 저장 공간 증가 |

**AI 요약 기반을 추천하는 이유:**
1. D-07의 `diff_summary`와 `diff_category`가 이미 "AI가 생성한 수정 요약"을 명시하고 있음
2. D-09의 "대표님 수정 패턴: 이 클라이언트에게는 가격을 먼저 언급하지 않는 스타일입니다" — 이런 인사이트는 텍스트 diff로는 추출 불가능
3. 이 프로젝트는 이미 Claude API를 호출하는 구조이므로 추가 AI 호출의 한계 비용이 낮음
4. **외부 diff 라이브러리 의존성을 추가하지 않아도 됨** — 프로젝트 기존 스택에 diff 라이브러리 없음 [VERIFIED: package.json에 diff 관련 패키지 없음]

**구현 흐름:**
1. `original_body`(touchpoint.metadata)와 `final_body`(Gmail SENT) 비교
2. 두 본문이 동일하면 → "수정 없음" 양성 신호 기록 (D-09 명시)
3. 다르면 → Claude tool_use로 `{ diff_summary, diff_category }` 추출
4. diff_category enum: `'tone' | 'content' | 'structure' | 'pricing' | 'greeting' | 'closing'` (D-07)

**HTML 스트립 간소화:** AI에 보낼 때 `<p>`, `<br>` 정도만 유지하고 나머지 태그는 스트립. 정규식으로 충분 (별도 라이브러리 불필요).

```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
```

[ASSUMED — stripHtml 로직은 일반적인 HTML 정리 패턴. 프로젝트의 이메일 HTML 구조에 맞게 조정 필요할 수 있음]

### 4. Learning Prompt Injection 아키텍처 (Primary Q4)

**D-18 준수 설계: compose.ts / follow-up-composer.ts를 수정하지 않고, 호출 이전에 system prompt를 감싸는 래퍼.**

**문제:** D-06/D-09는 "새 이메일 작성 시 system prompt에 학습 데이터를 주입"하라고 요구합니다. 그러나 D-18은 compose.ts, follow-up-composer.ts 수정을 금지합니다.

**해법:** `learning-prompt-injector.ts` 신규 모듈

```typescript
// src/workflow/learning-prompt-injector.ts

export interface LearningContext {
  patternInsights: string[];    // "F&B 업종 전략 E: 답장률 60%"
  editPatterns: string[];       // "대표님 수정: 공공기관은 톤 레벨 3~4 선호"
  competitorNotes: string[];    // "이 업종에서 경쟁사 A가 X원 제안 이력"
}

/**
 * 기존 system prompt 뒤에 학습 컨텍스트를 append.
 * compose.ts / follow-up-composer.ts의 system prompt는 수정하지 않음 (D-18).
 * 이 함수는 오케스트레이터(workflow-a/b/c)가 AI를 호출하기 직전에
 * system prompt를 감싸서 호출하는 방식.
 */
export function injectLearningContext(
  systemPrompt: string,
  context: LearningContext,
): string {
  const sections: string[] = [];
  
  if (context.patternInsights.length > 0) {
    sections.push(
      '[과거 이메일 성과 학습]',
      ...context.patternInsights.map(p => `- ${p}`),
    );
  }
  
  if (context.editPatterns.length > 0) {
    sections.push(
      '',
      '[대표님 수정 패턴 학습]',
      ...context.editPatterns.map(p => `- ${p}`),
    );
  }
  
  if (context.competitorNotes.length > 0) {
    sections.push(
      '',
      '[시장/경쟁사 참고 정보]',
      ...context.competitorNotes.map(p => `- ${p}`),
    );
  }
  
  if (sections.length === 0) return systemPrompt;
  return systemPrompt + '\n\n' + sections.join('\n');
}
```

**적용 지점:** Phase 2/3/4의 오케스트레이터는 수정 금지이므로, 학습 데이터 주입은 **Phase 5 이후 새 버전의 오케스트레이터가 호출될 때** 또는 **대표님이 직접 세션에서 학습 데이터를 로드한 후 이메일을 쓸 때** 적용됩니다. 즉:
- Phase 5에서는 `injectLearningContext` 함수만 제공하고
- 실제 주입은 Claude Code 세션에서 AI 호출 시점에 수동으로 적용
- 향후 오케스트레이터 업데이트 시(v2) 자동 주입으로 전환

**이것이 D-18을 완벽히 준수하면서도 D-06/D-09를 달성하는 유일한 방법입니다.**

[VERIFIED: buildEmailPrompt (compose.ts L27-28), buildFollowUpPrompt (follow-up-composer.ts L142-255), buildCadenceFollowUpPrompt (follow-up-composer.ts L359-441) — 모두 system string을 반환하며, 호출자가 이 string을 AI에 전달하기 전에 수정 가능]

### 5. Cross-sell Trigger Matrix 코드화 (Primary Q5)

**v4 ULTRA §17 원문에서 11개 연결을 구조화.**

```typescript
// src/workflow/cross-sell-detector.ts

export interface TriggerRule {
  fromService: string;           // 현재 진행 중인 서비스
  toService: string;             // 크로스셀 제안 서비스
  timingCondition: string;       // 사람이 읽을 수 있는 타이밍 설명
  timingCheck: (ctx: ClientServiceContext) => boolean;  // 프로그래밍 판정
  speechPattern: 1 | 2 | 3;     // §17의 3가지 제안 화법 중
}

export interface ClientServiceContext {
  currentServices: string[];     // 진행 중인 서비스 목록
  weeksElapsed: number;          // 캠페인 시작 후 경과 주
  contentCount: number;          // 확보된 콘텐츠 수
  campaignCount: number;         // 누적 캠페인 횟수
  engagementTrend: 'up' | 'flat' | 'down';  // 인게이지먼트 추세
}

export const TRIGGER_MATRIX: TriggerRule[] = [
  {
    fromService: '카페 바이럴',
    toService: '블로그 체험단',
    timingCondition: '캠페인 2주차 (키워드 데이터 나올 때)',
    timingCheck: (ctx) => ctx.weeksElapsed >= 2,
    speechPattern: 1,  // 데이터 기반 제안
  },
  {
    fromService: '카페 바이럴',
    toService: '카페 모니터링',
    timingCondition: '캠페인 종료 시',
    timingCheck: (ctx) => ctx.weeksElapsed >= 4,  // 일반적 캠페인 기간
    speechPattern: 3,  // 시즌 연계 제안
  },
  {
    fromService: '드랍 캠페인',
    toService: '퍼포먼스 DA',
    timingCondition: '콘텐츠 5개 이상 확보 시',
    timingCheck: (ctx) => ctx.contentCount >= 5,
    speechPattern: 2,  // OSMU 연계 제안
  },
  // ... (총 11개 — 나머지는 구현 시 추가)
];
```

[VERIFIED: v4 ULTRA §17 원문 L939-951 — 11개 트리거 + 3개 화법 패턴]

**타이밍 조건 판정의 제한:**
- `weeksElapsed`와 `contentCount`는 touchpoints 타임라인에서 **추정**해야 합니다.
- `weeksElapsed`: 해당 서비스와 관련된 첫 touchpoint의 occurredAt부터 현재까지 주 단위 계산
- `contentCount`: touchpoints에서 해당 서비스 관련 email_sent 카운트 (근사치)
- `campaignCount`: 동일 클라이언트의 email_sent touchpoint 중 서로 다른 전략/서비스에 대한 카운트
- `engagementTrend`: v1에서는 판정 불가 — 항상 `'flat'`으로 기본값. v2에서 퍼포먼스 데이터 연동 시 실제 판정.

[ASSUMED — 타이밍 조건의 정확한 판정은 운영 데이터에 의존. 보수적으로 간단한 경과 시간/카운트 기반 판정 사용]

### 6. Competitor Intel 추출 (Primary Q6)

**별도 분석 pass 추천. call-analyzer의 기존 tool_use 스키마는 수정하지 않음.**

**이유:**
1. call-analyzer.ts의 `CALL_ANALYSIS_TOOL_DEFINITION`은 이미 freeze된 인터페이스 [VERIFIED: src/workflow/call-analyzer.ts L68-142]
2. D-14에 따르면 수집 시점이 2곳: (a) Phase 3 call-analyzer, (b) Phase 5 이메일 답장 분석
3. call-analyzer에 필드를 추가하면 기존 응답 shape이 변경되어 Phase 3 workflow-b에 영향

**설계:**

```typescript
// src/workflow/competitor-extractor.ts

export const COMPETITOR_EXTRACTION_TOOL_NAME = 'extract_competitor_intel';

export const CompetitorIntelSchema = z.array(z.object({
  competitorName: z.string(),
  intelType: z.enum(['pricing', 'service', 'strategy', 'weakness', 'general']),
  detail: z.string(),
  confidence: z.enum(['confirmed', 'inferred', 'rumor']),
}));

// 통화 transcript에서 추출
export async function extractCompetitorFromCall(
  transcript: string,
  anthropicTool: AnthropicToolFn,
): Promise<z.infer<typeof CompetitorIntelSchema>>;

// 이메일 답장에서 추출
export async function extractCompetitorFromEmail(
  emailBody: string,
  anthropicTool: AnthropicToolFn,
): Promise<z.infer<typeof CompetitorIntelSchema>>;
```

**중복 방지 전략 (Claude's Discretion):**
- `(client_id, competitor_name, intel_type, detail)` 조합으로 유사도 체크
- 정확히 동일한 조합이면 skip (INSERT 전 SELECT로 확인)
- 유사하지만 다른 정보면 추가 (예: 같은 경쟁사의 다른 가격 정보)

[VERIFIED: D-14 원문 — "Phase 3 call-analyzer + Phase 5 이메일 답장 분석에서 자동 추출"]

### 7. "학습 돌려줘" 오케스트레이터 구조 (Primary Q7)

**workflow-c.ts 패턴 복제. 4개 서브 루틴을 순차 실행.**

```typescript
// src/workflow/learning-loop.ts

export interface LearningLoopDependencies {
  clientQueries: ReturnType<typeof createClientQueries>;
  touchpointQueries: ReturnType<typeof createTouchpointQueries>;
  emailPatternQueries: ReturnType<typeof createEmailPatternQueries>;
  editDeltaQueries: ReturnType<typeof createEditDeltaQueries>;
  competitorIntelQueries: ReturnType<typeof createCompetitorIntelQueries>;
  gmailReadThreadTool: GmailReadThreadFn;
  
  // AI DI (optional — 미주입 시 placeholder/skip)
  classifyOutcome?: (emailBody: string) => Promise<'positive' | 'negative'>;
  summarizeDiff?: (original: string, final: string) => Promise<{ summary: string; category: string }>;
  extractCompetitor?: (text: string) => Promise<CompetitorIntel[]>;
  
  now?: () => Date;
}

export interface LearningLoopResult {
  patternsUpdated: number;
  patternsNew: number;
  editDeltasFound: number;
  editDeltasUnchanged: number;  // D-09: "수정 안 한 이메일 = 양성 신호"
  crossSellOpportunities: CrossSellOpportunity[];
  competitorIntelNew: number;
}

export async function runLearningLoop(
  deps: LearningLoopDependencies,
): Promise<LearningLoopResult>;
```

**배치 처리 흐름:**
1. **email_patterns 업데이트 (LRNG-01)**
   - `getActiveFollowupClients()`로 활성 클라이언트 목록
   - 각 클라이언트의 `email_sent` touchpoints 중 email_patterns에 아직 없는 건 조회
   - Gmail 스레드 로드 → `hasInboundSince`로 답장 여부 판정
   - outcome 업데이트: pending → replied/no_reply, 답장 있으면 AI로 positive/negative 분류
   - 기존 pending 건의 30일 초과 여부 재판정

2. **edit delta 추출 (LRNG-02)**
   - touchpoint.metadata.original_body가 있는 건 대상
   - Gmail SENT 메시지에서 final_body 확보
   - original === final → "수정 없음" 양성 신호 기록
   - 다르면 → AI diff 요약 요청

3. **크로스셀 트리거 체크 (LRNG-03)**
   - 각 활성 클라이언트에 대해 TRIGGER_MATRIX 순회
   - touchpoints 타임라인에서 현재 서비스 파악 + 경과 시간/콘텐츠 수 추정
   - 매칭되면 `CrossSellOpportunity`로 기록

4. **경쟁사 정보 추출 (LRNG-04)**
   - 최근 답장(inbound) 이메일들에서 AI로 경쟁사 언급 추출
   - competitor_intel 테이블에 저장 (중복 방지)

**보고서 출력 (D-17):**
```
## 학습 루프 실행 결과 — 2026-04-12

### 이메일 성과 (LRNG-01)
- 분석: N건 / 답장: M건 / 무응답: K건
- 평균 답장 소요: X일
- 업종별 답장률: F&B 60%, 뷰티 45%, ...

### 수정 패턴 (LRNG-02)
- 발견: N건 (톤 변경 M건, 내용 수정 K건, 수정 없음 J건)
- 주요 패턴: "공공기관 이메일에서 가격 먼저 언급 삭제"

### 크로스셀 기회 (LRNG-03)
| 거래처 | 현재 서비스 | 제안 서비스 | 타이밍 |
|--------|-------------|-------------|--------|
| A사 | UGC 인플루언서 | 2차 라이선스 + 퍼포먼스 | 콘텐츠 업로드 완료 |

### 시장 정보 (LRNG-04)
- 신규 수집: N건
```

[VERIFIED: cadence-report.ts 패턴 — src/workflow/cadence-report.ts L108-165]
[VERIFIED: workflow-c.ts 오케스트레이터 패턴 — src/workflow/workflow-c.ts L312-565]

### 8. Touchpoint Metadata 확장 (Primary Q8)

**D-19: 최소 침습적 1줄 추가.**

Phase 2/3/4의 오케스트레이터에서 `createTouchpoint`을 호출하는 지점을 찾아 metadata에 `original_body`를 추가합니다.

**영향 범위 조사:**

| 파일 | 함수 | touchpoint 생성 위치 | 수정 내용 |
|------|------|---------------------|-----------|
| `src/workflow/workflow-c.ts` | runWorkflowCForClient | L498-519 | metadata 객체에 `originalBody: aiGeneratedBody` 추가 |
| workflow-b.ts | (Phase 3 오케스트레이터) | touchpoint 기록 지점 | metadata에 `originalBody` 추가 |
| workflow-a.ts | (Phase 2 오케스트레이터) | touchpoint 기록 지점 | metadata에 `originalBody` 추가 |

[VERIFIED: workflow-c.ts L498-519 — createTouchpoint 호출에 metadata 객체가 이미 존재]

**주의:** D-18은 "compose.ts, draft-creator.ts, quality-checker.ts, workflow-a/b/c.ts 수정 금지"라고 명시합니다. 그러나 D-19는 "touchpoint.metadata 확장"을 명시적으로 허용합니다. 이 두 결정이 충돌합니다.

**해석:** D-19가 D-18의 특수 예외로 해석합니다. "workflow-a/b/c.ts의 로직을 변경하지 않되, touchpoint 기록 시 metadata 객체에 1줄을 추가하는 것은 허용"이라는 의미입니다. metadata는 JSON 자유 형식 필드이므로 스키마 변경 없이 가능합니다. [VERIFIED: src/db/schema.ts L126 — `metadata: text('metadata', { mode: 'json' })`]

**대안 (D-18 엄격 해석 시):** workflow-a/b/c.ts를 수정하지 않고, 학습 루프 실행 시점에 touchpoint의 sourceId(threadId)로 Gmail 스레드를 로드하여 자사 발신 메시지 중 해당 시점의 것을 original_body로 추정. 그러나 이 방식은 "대표님이 수정하기 전의 원본"이 아니라 "수정 후 발송된 본문"만 확보할 수 있어 edit delta의 의미가 없어짐. **따라서 D-19 특수 예외를 사용하는 것이 유일한 정상 경로.**

### 9. Outcome 분류 정확도 (Secondary Q9)

**AI 기반 분류를 추천. 키워드 기반은 한국어 비즈니스 이메일에서 부정확.**

한국어 비즈니스 이메일의 특성:
- "검토 중입니다" — positive? 또는 정중한 거절?
- "다음에 기회가 되면" — negative (정중한 거절 패턴)
- "좋은 제안 감사합니다" — positive? 또는 관심 없음의 인사?

키워드 기반은 이러한 뉘앙스를 잡지 못합니다. Claude tool_use로 분류하면:
1. `positive` — 미팅 요청, 견적 요청, 추가 질문, 구체적 협업 논의
2. `negative` — 예산 없음, 시기 안 맞음, 다른 업체 선정, 내부 검토 후 거절

**D-04의 5단계 판정은 2단계로 나뉩니다:**
- 기계적 판정 (AI 불필요): `pending` (30일 미만), `no_reply` (30일 초과), `replied` (답장 있음)
- AI 판정 (답장 있을 때만): `replied` → `positive` 또는 `negative`

이 2단계 분리로 AI 호출 횟수를 최소화합니다.

[ASSUMED — 한국어 비즈니스 이메일의 뉘앙스 분석은 Claude의 강점이지만, 정확도는 운영 시 검증 필요]

### 10. Privacy / 데이터 보존 (Secondary Q10)

**edit_deltas에 전체 이메일 본문 저장 시 DB 크기 우려는 미미.**

계산:
- 평균 이메일 본문: ~2KB (HTML)
- original + final = ~4KB per edit_delta 레코드
- 월 발송량 추정: ~50건 (주 1-2회 × 평균 5 클라이언트)
- 연간: 600건 × 4KB = ~2.4MB
- SQLite 한계: 수 GB까지 문제 없음

**권장:** TTL 없이 전체 보존. 학습 데이터는 축적될수록 가치가 커집니다. DB 크기가 100MB를 넘기까지 최소 수년이 걸립니다.

**보안 고려:** email_patterns.body_preview는 200자로 제한 (D-03 명시). edit_deltas의 original_body/final_body는 전문이지만, 이 DB 자체가 대표님의 로컬 머신에만 존재하므로 (single-user system) 추가 암호화 불필요. [VERIFIED: CLAUDE.md — "Single-user system (only CEO uses it)"]

---

## Pitfalls & Safety

### Pitfall 1: original_body 누락 — edit delta 불가
**What goes wrong:** D-19의 touchpoint.metadata.original_body 추가가 안 되면 edit delta 비교가 불가능.
**Prevention:** Wave 0에서 touchpoint metadata 확장을 최우선 처리. 이후 발송되는 모든 이메일에 original_body가 기록되어야 함.
**Detection:** edit delta 추출 시 original_body가 null인 touchpoint는 skip하고 warning 기록.

### Pitfall 2: Gmail SENT 메시지와 original_body의 HTML 형식 불일치
**What goes wrong:** compose.ts가 서명/CC를 자동 추가하므로, original_body(AI 생성 본문)과 final_body(Gmail SENT)의 HTML 구조가 다름.
**Prevention:** diff 비교 전에 **서명 블록을 스트립**하고 본문 영역만 비교. compose.ts의 `EMAIL_SIGNATURE_HTML` 패턴으로 서명 위치를 식별. [VERIFIED: src/workflow/compose.ts 에서 EMAIL_SIGNATURE_HTML import — L18-22]
**Detection:** diff_summary에 "서명 변경" 카테고리가 나오면 false positive 의심.

### Pitfall 3: touchpoint.metadata.cadence 정보 기반 strategy 추출
**What goes wrong:** email_patterns.strategy_used를 채우려면 해당 이메일이 어떤 전략(A~L)으로 생성되었는지 알아야 함. 그런데 이 정보가 touchpoint.metadata에 항상 저장되어 있지 않을 수 있음.
**Prevention:** workflow-c는 이미 `metadata.cadence.contextType`을 저장함 [VERIFIED: workflow-c.ts L506-514]. Phase 2/3도 유사한 metadata를 기록하는지 확인 필요. 없으면 strategy_used는 null 허용.

### Pitfall 4: 크로스셀 타이밍 조건의 부정확성
**What goes wrong:** `weeksElapsed`나 `contentCount`를 touchpoints에서 추정하지만, touchpoints에 기록되지 않은 활동(대면 미팅, 비공식 소통)은 반영 불가.
**Prevention:** 크로스셀 감지는 **제안**일 뿐 자동 실행되지 않음 (D-12). 대표님이 보고서를 보고 판단. 오탐은 괜찮음.

### Pitfall 5: D-18 불변 원칙 vs D-19 metadata 확장 충돌
**What goes wrong:** D-18을 엄격 해석하면 workflow-a/b/c.ts에 1줄도 추가 불가.
**Prevention:** CONTEXT.md에서 D-19가 D-18 이후에 명시적으로 "작은 1줄 추가로 가능"이라고 기술 → D-19가 D-18의 특수 예외. 이 해석을 플랜에 명시.

### Pitfall 6: concurrent learning loop 실행
**What goes wrong:** 대표님이 실수로 "학습 돌려줘"를 두 번 호출하면 중복 기록.
**Prevention:** email_patterns.touchpointId unique constraint 또는 INSERT 전 existence check.

---

## Recommended Plan Breakdown

### Wave 0: Infrastructure (병렬 실행 불가 — Wave 1의 전제)

**Plan 05-01: DB 스키마 + 쿼리 모듈 + Touchpoint metadata 확장**
- email_patterns, edit_deltas, competitor_intel 테이블 Drizzle 스키마 추가
- 3개 쿼리 모듈 신규 (createEmailPatternQueries, createEditDeltaQueries, createCompetitorIntelQueries)
- Phase 2/3/4 오케스트레이터의 createTouchpoint 호출에 original_body 1줄 추가 (D-19)
- drizzle-kit migration 생성 및 적용
- 테스트: 각 쿼리 모듈 단위 테스트

### Wave 1: 4개 학습 모듈 (병렬 실행 가능)

**Plan 05-02: Pattern Tracker (LRNG-01)**
- `src/workflow/pattern-tracker.ts` 신규
- 배치 스캔: pending touchpoints → Gmail 스레드 로드 → 답장 판정 → outcome 업데이트
- AI outcome 분류 (positive/negative) — tool_use 패턴 (call-analyzer 참조)
- 통계 집계 함수 (업종별/전략별 답장률)

**Plan 05-03: Edit Delta Extractor (LRNG-02)**
- `src/workflow/edit-delta-extractor.ts` 신규
- original_body(metadata) vs final_body(Gmail SENT) 비교
- HTML 스트립 + AI diff 요약 (tool_use)
- "수정 없음" 양성 신호 기록

**Plan 05-04: Cross-sell Detector (LRNG-03) + Competitor Extractor (LRNG-04)**
- `src/workflow/cross-sell-detector.ts` 신규 — TRIGGER_MATRIX + 타이밍 판정
- `src/workflow/competitor-extractor.ts` 신규 — AI 경쟁사 정보 추출
- 크로스셀은 순수 함수 (AI 불필요), 경쟁사 추출은 tool_use

**Plan 05-05: Learning Prompt Injector (D-06/D-09)**
- `src/workflow/learning-prompt-injector.ts` 신규
- email_patterns → 업종/전략별 인사이트 생성
- edit_deltas → 수정 패턴 요약 생성
- competitor_intel → 시장 참고 정보 생성
- injectLearningContext(systemPrompt, context) 함수

### Wave 2: 조립 (Wave 0 + Wave 1 완료 후)

**Plan 05-06: Orchestrator + Report + CLI**
- `src/workflow/learning-loop.ts` — runLearningLoop 오케스트레이터
- `src/workflow/learning-report.ts` — 학습 보고서 렌더러 (cadence-report 패턴)
- `scripts/run-learning-loop.ts` — CLI 진입점 (run-workflow-c 패턴)
- 통합 테스트

---

## Test Strategy

### Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | vitest.config.ts (기존) |
| Quick run | `npx vitest run src/workflow/pattern-tracker.test.ts -x` |
| Full suite | `npx vitest run` |

[VERIFIED: vitest 4.1.2 설치 확인]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| LRNG-01 | email_patterns에 성과 기록 | unit | `npx vitest run src/workflow/pattern-tracker.test.ts -x` |
| LRNG-01 | outcome 분류 (replied/no_reply/positive/negative/pending) | unit | 위와 동일 |
| LRNG-02 | edit delta 추출 + AI diff 요약 | unit | `npx vitest run src/workflow/edit-delta-extractor.test.ts -x` |
| LRNG-02 | "수정 없음" 양성 신호 | unit | 위와 동일 |
| LRNG-03 | TRIGGER_MATRIX 11개 규칙 검증 | unit | `npx vitest run src/workflow/cross-sell-detector.test.ts -x` |
| LRNG-03 | 타이밍 조건 판정 | unit | 위와 동일 |
| LRNG-04 | competitor_intel 추출 + 중복 방지 | unit | `npx vitest run src/workflow/competitor-extractor.test.ts -x` |
| ALL | runLearningLoop 통합 | integration | `npx vitest run src/workflow/learning-loop.test.ts -x` |

### Wave 0 Gaps
- [ ] `src/queries/email-patterns.test.ts` — email_patterns CRUD 테스트
- [ ] `src/queries/edit-deltas.test.ts` — edit_deltas CRUD 테스트
- [ ] `src/queries/competitor-intel.test.ts` — competitor_intel CRUD 테스트

---

## Open Questions for Planner

1. **D-19 적용 범위:** workflow-a.ts와 workflow-b.ts에서 createTouchpoint 호출 지점의 정확한 라인 번호를 플랜 작성 시 확인 필요. (이 리서치에서는 workflow-c.ts만 확인함 — L498-519)

2. **strategy_used 추출:** Phase 2 workflow-a의 touchpoint.metadata에 strategy 정보가 포함되어 있는지 확인 필요. 없으면 email_patterns.strategy_used는 null 허용하되, Phase 5 이후 발송분부터 기록.

3. **AI 호출 비용 최적화:** 학습 루프 1회 실행 시 AI 호출 횟수 추정:
   - outcome 분류: 답장 있는 이메일 × 1회 (replied 건만)
   - edit delta 요약: 수정된 이메일 × 1회
   - 경쟁사 추출: 답장 이메일 × 1회
   - 예상: 주 1회 실행 시 ~10-20회 AI 호출 → 비용 무시 가능

4. **크로스셀 감지 후 흐름:** D-12는 "Workflow A에 넘기면 된다"고 하지만, Phase 5에서 자동으로 Workflow A를 트리거하는 것은 D-02(대표님 지시 건만 처리)와 충돌. 보고서에 "이거 해줘" 가능하도록 안내만 하는 것이 맞음.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HTML 스트립 정규식으로 이메일 본문 정리가 충분하다 | §3 Edit Delta Diff | 복잡한 HTML 구조에서 정리 실패 시 diff 노이즈 → AI 요약에 의존하므로 낮은 리스크 |
| A2 | 크로스셀 타이밍 조건을 touchpoint 데이터만으로 추정 가능하다 | §5 Cross-sell | 실제 캠페인 진행 상황과 차이 → 보수적 타이밍(늦게 감지)으로 대응, 대표님 판단이 최종 |
| A3 | 한국어 비즈니스 이메일의 positive/negative 분류를 Claude가 정확히 수행한다 | §9 Outcome 분류 | 오분류 시 패턴 데이터 왜곡 → outcome은 참고 지표이므로 낮은 리스크 |
| A4 | 월 이메일 발송량이 ~50건 수준이다 | §10 데이터 보존 | 실제 발송량이 크게 다르면 DB 크기 재계산 필요 → 어차피 SQLite에서 GB 단위까지 문제없음 |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.20.0 | — |
| vitest | Testing | Yes | 4.1.2 | — |
| drizzle-orm | DB schema | Yes | (installed) | — |
| better-sqlite3 | DB | Yes | (installed) | — |
| Gmail MCP | SENT 메시지 조회 | Claude Code 세션에서만 | — | stub 주입 |

**Missing dependencies:** 없음. 외부 라이브러리 추가 불필요 (diff 라이브러리 불필요 — AI 요약 방식 채택).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | D-04 교차 오염 방지 — 클라이언트별 격리 쿼리 유지 |
| V5 Input Validation | yes | zod 스키마 검증 (AI 응답), touchpoint metadata 타입 체크 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 교차 클라이언트 데이터 노출 (email_patterns 집계 시) | Information Disclosure | 집계 쿼리는 업종/전략 단위만 허용, 개별 클라이언트 본문은 노출 금지 |
| competitor_intel 악용 (경쟁사 단가 직접 언급) | Information Disclosure | CLAUDE.md 보안 규칙 — 경쟁사 단가 직접 언급 금지. learning-prompt-injector가 가격 정보를 "참고" 수준으로만 주입 |
| Prompt injection via email reply body | Tampering | competitor-extractor에 경계 마커 사용 (call-analyzer 패턴 복제) [VERIFIED: call-analyzer.ts L239 `<call_transcript>` 마커] |

---

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` — 현재 Drizzle 스키마 (clients, touchpoints, briefings)
- `src/queries/touchpoints.ts` — touchpoint CRUD + getLastOutbound/getLastInbound
- `src/workflow/thread-loader.ts` — Gmail 스레드 로드 DI 인터페이스
- `src/workflow/inbound-detector.ts` — isOwnMessage, hasInboundSince
- `src/workflow/workflow-c.ts` — 19단계 오케스트레이터 패턴
- `src/workflow/cadence-report.ts` — 보고서 렌더러 패턴
- `src/workflow/call-analyzer.ts` — tool_use AI 분석 패턴
- `src/workflow/follow-up-composer.ts` — prompt builder 패턴
- `src/workflow/compose.ts` — composeEmail 인터페이스 (수정 금지)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §17 L931-970 — 크로스셀 트리거 매트릭스
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §10 L476-515 — 영업 철학
- `.planning/phases/05-learning-loop/05-CONTEXT.md` — 19개 locked decisions

### Secondary (MEDIUM confidence)
- Phase 4 RESEARCH.md, SUMMARY 문서들 — 아키텍처 패턴 참조

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 모든 라이브러리가 Phase 1-4에서 이미 검증됨, 신규 의존성 0
- Architecture: HIGH — Phase 4 오케스트레이터/보고서/CLI 패턴을 그대로 복제
- Pitfalls: HIGH — 코드베이스 전수 조사로 충돌 지점 식별 완료

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (안정적 — 외부 의존성 변경 없음)
