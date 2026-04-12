import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Type for history entries
export interface HistoryEntry {
  date: string;        // YYYY.MM.DD
  description: string; // 내용
  status?: string;     // 완료/진행중/보류
}

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  industry: text('industry'),  // 'F&B'|'뷰티'|'주류'|'IT'|'패션'|'대기업'|'해외' 등
  history: text('history', { mode: 'json' }).$type<HistoryEntry[]>(),
  budgetPattern: text('budget_pattern'),
  budgetTier: integer('budget_tier'),   // 1-5
  preferredServices: text('preferred_services', { mode: 'json' }).$type<string[]>(),
  notes: text('notes'),
  nextOpportunity: text('next_opportunity'),
  communicationStyle: text('communication_style'),
  stage: text('stage').default('PROSPECT'),
  lastContactDate: text('last_contact_date'),
  // ─── Phase 4 (D-20/D-21) ─────────────────────────────────────
  // 수동 차단 플래그: 대표님이 "이 딜은 팔로업 더 안 해"라고 지시한 클라이언트.
  // Dormant와 구분 — 딜은 진행 중이지만 자동 팔로업에서 제외한다.
  // mode:'boolean'은 Drizzle이 SQLite integer 0/1 ↔ JS boolean을 자동 변환한다.
  followupPaused: integer('followup_paused', { mode: 'boolean' }).notNull().default(false),
  followupPausedReason: text('followup_paused_reason'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  basePrice: integer('base_price'),     // 원 단위
  priceUnit: text('price_unit'),        // 건당, 월, 등
  priceNote: text('price_note'),
  processSteps: text('process_steps'),
  asPolicy: text('as_policy'),
});

export const serviceRecommendations = sqliteTable('service_recommendations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tier: integer('tier').notNull(),       // 예산 티어 (1-5)
  industry: text('industry'),            // 업종 (null = 범용)
  serviceName: text('service_name').notNull(),
  priority: integer('priority'),         // 추천 우선순위 (1=최우선)
  recommendedQuantity: text('recommended_quantity'),
  recommendedBudget: text('recommended_budget'),
  salesMent: text('sales_ment'),
});

// ─── briefings (CALL-04 통화 브리핑) ──────────────────
// 슬랙 #세일즈_통화요약 채널의 통화 요약을 AI로 분석한 결과.
// occurredAt(실제 통화 시각)와 createdAt(DB 저장 시각)을 분리하여 과거 통화도 지원.
export const briefings = sqliteTable(
  'briefings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    slackTs: text('slack_ts').notNull(), // Slack ts 문자열 "1712548680.123456"
    slackChannelId: text('slack_channel_id').notNull(),
    occurredAt: text('occurred_at').notNull(), // ISO 8601 (+09:00 Asia/Seoul)
    source: text('source').notNull(), // 'ixio' | 'clova'
    summary: text('summary').notNull(),
    actionItems: text('action_items', { mode: 'json' }).$type<
      Array<{
        who: '대표님' | '상대방' | '양측';
        what: string;
        dueDate: string | null;
      }>
    >(),
    sentiment: text('sentiment', { mode: 'json' }).$type<{
      tone: 'positive' | 'neutral' | 'caution' | 'negative';
      temperature: 'hot' | 'warm' | 'cool' | 'cold';
      rationale: string;
    }>(),
    rawTranscript: text('raw_transcript'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    // Pitfall 9 방지: 동일 슬랙 메시지를 두 번 저장해도 onConflictDoNothing으로 조용히 skip.
    slackTsUnique: uniqueIndex('briefings_slack_ts_unique').on(table.slackTs),
    // 클라이언트별 타임라인 조회 최적화 (occurredAt 내림차순 쿼리).
    clientIdx: index('briefings_client_idx').on(table.clientId, table.occurredAt),
  }),
);

// ─── touchpoints (D-14 통합 타임라인) ─────────────────
// 이메일/통화/상태변경 등 모든 접점을 하나의 테이블에 기록.
// "이 클라이언트와 지금까지 뭘 했는지"를 한눈에 보기 위함 (D-16).
export const touchpoints = sqliteTable(
  'touchpoints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // ─── Phase 4 (D-04) enum 확장 ────────────────────────────
    // Phase 3까지는 'email' 단일 값만 사용했으나, Phase 4는 팔로업 케이던스
    // 판정을 위해 이메일의 방향성(발신/수신)을 명시적으로 구분해야 한다.
    // 기존 'email' 값은 D-04 후방 호환을 위해 **반드시 보존** — Phase 3 운영 DB에
    // 쌓인 레거시 레코드는 모두 outbound 드래프트 기록이므로 getLastOutbound 조회 시
    // 'email_sent'/'call'과 동일하게 취급된다.
    type: text('type', {
      enum: [
        'email', // LEGACY: Phase 3 기록 보존용 (D-04 후방 호환, outbound로 간주)
        'email_sent', // D-04: outbound 이메일 (발신)
        'email_received', // D-04: inbound 이메일 (수신)
        'call', // 통화 (outbound로 간주)
        'stage_change', // 파이프라인 상태 변경
        'manual_pause', // D-20: 수동 차단 audit 기록
      ],
    }).notNull(),
    sourceId: text('source_id').notNull(), // threadId | slackTs | dealId
    summary: text('summary').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    occurredAt: text('occurred_at').notNull(), // 실제 발생 시각 (과거 통화 대응)
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    clientIdx: index('touchpoints_client_idx').on(table.clientId, table.occurredAt),
    typeIdx: index('touchpoints_type_idx').on(table.clientId, table.type),
  }),
);

// ─── email_patterns (D-03 이메일 성공/실패 패턴) ─────────────
// 매 이메일 소통의 결과(답장/미응답/긍정/부정)를 기록하여
// 업종별/전략별 답장률 통계를 축적한다. Phase 5 학습 루프의 핵심 테이블.
export const emailPatterns = sqliteTable(
  'email_patterns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    touchpointId: integer('touchpoint_id').references(() => touchpoints.id, {
      onDelete: 'set null',
    }),
    strategyUsed: text('strategy_used'), // 'A'~'L'
    toneLevel: integer('tone_level'), // 1~5
    contextType: text('context_type'), // proposal | contract | ...
    subjectLine: text('subject_line'),
    bodyPreview: text('body_preview'), // 첫 200자
    sentAt: text('sent_at'), // ISO 8601
    replyReceivedAt: text('reply_received_at'), // null = 미응답
    outcome: text('outcome', {
      enum: ['replied', 'no_reply', 'positive', 'negative', 'pending'],
    })
      .notNull()
      .default('pending'),
    daysToReply: integer('days_to_reply'),
    industry: text('industry'),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    clientIdx: index('email_patterns_client_idx').on(table.clientId),
    industryStrategyIdx: index('email_patterns_industry_strategy_idx').on(
      table.industry,
      table.strategyUsed,
    ),
    outcomeIdx: index('email_patterns_outcome_idx').on(table.outcome),
    touchpointIdx: index('email_patterns_touchpoint_idx').on(
      table.touchpointId,
    ),
  }),
);

// ─── edit_deltas (D-07 대표님 수정 패턴 학습) ────────────────
// 봇이 생성한 드래프트 원본과 대표님이 수정한 최종본을 비교하여
// 수정 습관(톤 변경, 가격 삭제 등)을 학습 신호로 저장한다.
export const editDeltas = sqliteTable(
  'edit_deltas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    touchpointId: integer('touchpoint_id').references(() => touchpoints.id, {
      onDelete: 'set null',
    }),
    originalBody: text('original_body'),
    finalBody: text('final_body'),
    diffSummary: text('diff_summary'),
    diffCategory: text('diff_category', {
      enum: [
        'tone',
        'content',
        'structure',
        'pricing',
        'greeting',
        'closing',
        'none',
      ],
    }),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    clientIdx: index('edit_deltas_client_idx').on(table.clientId),
    touchpointIdx: index('edit_deltas_touchpoint_idx').on(table.touchpointId),
  }),
);

// ─── competitor_intel (D-13 경쟁사/시장 정보 축적) ────────────
// 통화/이메일에서 감지된 경쟁사 정보(가격, 서비스, 전략 등)를 구조화하여
// 시장 조사 시 경쟁사 대비 포지셔닝 강화에 활용한다.
export const competitorIntel = sqliteTable(
  'competitor_intel',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    competitorName: text('competitor_name').notNull(),
    intelType: text('intel_type', {
      enum: ['pricing', 'service', 'strategy', 'weakness', 'general'],
    }).notNull(),
    detail: text('detail').notNull(),
    source: text('source', {
      enum: ['call_analysis', 'email_reply', 'market_research'],
    }).notNull(),
    confidence: text('confidence', {
      enum: ['confirmed', 'inferred', 'rumor'],
    }).notNull(),
    discoveredAt: text('discovered_at').default(sql`(datetime('now'))`),
  },
  (table) => ({
    clientIdx: index('competitor_intel_client_idx').on(table.clientId),
    nameTypeIdx: index('competitor_intel_name_type_idx').on(
      table.clientId,
      table.competitorName,
      table.intelType,
    ),
  }),
);

// Insert types
export type NewClient = typeof clients.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewServiceRecommendation = typeof serviceRecommendations.$inferInsert;
export type ServiceRecommendation = typeof serviceRecommendations.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
export type Briefing = typeof briefings.$inferSelect;
export type NewTouchpoint = typeof touchpoints.$inferInsert;
export type Touchpoint = typeof touchpoints.$inferSelect;
export type NewEmailPattern = typeof emailPatterns.$inferInsert;
export type EmailPattern = typeof emailPatterns.$inferSelect;
export type NewEditDelta = typeof editDeltas.$inferInsert;
export type EditDelta = typeof editDeltas.$inferSelect;
export type NewCompetitorIntel = typeof competitorIntel.$inferInsert;
export type CompetitorIntel = typeof competitorIntel.$inferSelect;
