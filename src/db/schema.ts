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
    type: text('type', { enum: ['email', 'call', 'stage_change'] }).notNull(),
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
