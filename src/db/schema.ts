import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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

// Insert types
export type NewClient = typeof clients.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewServiceRecommendation = typeof serviceRecommendations.$inferInsert;
export type ServiceRecommendation = typeof serviceRecommendations.$inferSelect;
