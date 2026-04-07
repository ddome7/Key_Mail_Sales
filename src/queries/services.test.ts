import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { services, serviceRecommendations } from '../db/schema.js';
import { createServiceQueries } from './services.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      base_price INTEGER,
      price_unit TEXT,
      price_note TEXT,
      process_steps TEXT,
      as_policy TEXT
    );

    CREATE TABLE IF NOT EXISTS service_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier INTEGER NOT NULL,
      industry TEXT,
      service_name TEXT NOT NULL,
      priority INTEGER,
      recommended_quantity TEXT,
      recommended_budget TEXT,
      sales_ment TEXT
    );
  `);
  const db = drizzle(sqlite, { schema: { services, serviceRecommendations } });
  return { db, sqlite };
}

describe('Service Queries', () => {
  let queries: ReturnType<typeof createServiceQueries>;

  beforeEach(() => {
    const { db } = createTestDb();
    queries = createServiceQueries(db);

    // Insert test service data
    db.insert(services).values([
      { name: 'UGC 인플루언서 캠페인', category: 'UGC', basePrice: 1000000, priceUnit: '건당' },
      { name: '카페 침투 바이럴', category: '바이럴', basePrice: 65000, priceUnit: '건당' },
      { name: '블로그 체험단', category: 'SEO', basePrice: null, priceUnit: '명당' },
    ]).run();

    // Insert test recommendation data
    db.insert(serviceRecommendations).values([
      { tier: 1, industry: null, serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: '30~40건', recommendedBudget: '195~260만원', salesMent: '소규모 예산으로도 충분히 의미 있는 바이럴이 가능합니다 :D' },
      { tier: 1, industry: null, serviceName: '블로그 체험단', priority: 2, recommendedQuantity: '10~15명', recommendedBudget: '300만원 이하', salesMent: null },
      { tier: 2, industry: null, serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: '나노 5~8명', recommendedBudget: '300~700만원', salesMent: null },
      { tier: 0, industry: '뷰티', serviceName: 'UGC 인플루언서 캠페인', priority: 1, recommendedQuantity: null, recommendedBudget: null, salesMent: '릴스 중심' },
    ]).run();
  });

  it('should get a service by name', () => {
    const result = queries.getServiceByName('UGC 인플루언서 캠페인');
    expect(result).toBeDefined();
    expect(result!.name).toBe('UGC 인플루언서 캠페인');
    expect(result!.category).toBe('UGC');
  });

  it('should return undefined for non-existent service', () => {
    const result = queries.getServiceByName('존재하지않는서비스');
    expect(result).toBeUndefined();
  });

  it('should get service price (recommendation) by name and tier', () => {
    const result = queries.getServicePrice('카페 침투 바이럴', 1);
    expect(result).toBeDefined();
    expect(result!.serviceName).toBe('카페 침투 바이럴');
    expect(result!.tier).toBe(1);
    expect(result!.recommendedQuantity).toBe('30~40건');
  });

  it('should get recommendations by tier', () => {
    const results = queries.getRecommendationsByTier(1);
    expect(results.length).toBe(2);
    expect(results[0].serviceName).toBe('카페 침투 바이럴');
  });

  it('should get recommendations by tier and industry', () => {
    const results = queries.getRecommendationsByTierAndIndustry(0, '뷰티');
    expect(results.length).toBe(1);
    expect(results[0].serviceName).toBe('UGC 인플루언서 캠페인');
    expect(results[0].salesMent).toBe('릴스 중심');
  });
});
