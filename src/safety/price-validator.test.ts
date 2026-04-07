import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { services, serviceRecommendations } from '../db/schema.js';
import { createServiceQueries } from '../queries/services.js';
import { extractPricesFromText, validatePrices } from './price-validator.js';

describe('Price Validator', () => {
  describe('extractPricesFromText', () => {
    it('should extract comma-separated won amounts', () => {
      const result = extractPricesFromText('건당 650,000원');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(650000);
      expect(result[0].originalText).toContain('650,000원');
    });

    it('should extract 만원 amounts', () => {
      const result = extractPricesFromText('월 300만원');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(3000000);
      expect(result[0].originalText).toContain('300만원');
    });

    it('should extract 억 amounts', () => {
      const result = extractPricesFromText('연간 1.5억');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(150000000);
      expect(result[0].originalText).toContain('1.5억');
    });

    it('should extract multiple prices from text', () => {
      const result = extractPricesFromText('카페 바이럴 650,000원, 블로그 체험단 300만원');
      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(650000);
      expect(result[1].amount).toBe(3000000);
    });

    it('should extract simple won amounts without commas', () => {
      const result = extractPricesFromText('500원짜리');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500);
    });

    it('should return empty array for text without prices', () => {
      const result = extractPricesFromText('안녕하세요, 서비스 문의드립니다.');
      expect(result).toHaveLength(0);
    });

    it('should handle 만 without 원', () => {
      const result = extractPricesFromText('예산 500만 정도');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(5000000);
    });
  });

  describe('validatePrices', () => {
    let db: ReturnType<typeof drizzle>;
    let sqlite: InstanceType<typeof Database>;
    let serviceQueries: ReturnType<typeof createServiceQueries>;

    beforeEach(() => {
      sqlite = new Database(':memory:');
      sqlite.exec(`
        CREATE TABLE services (
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
        CREATE TABLE service_recommendations (
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
      db = drizzle(sqlite);
      serviceQueries = createServiceQueries(db);

      // Seed test services
      db.insert(services).values({
        name: '카페 바이럴',
        category: '바이럴',
        basePrice: 650000,
        priceUnit: '건당',
      }).run();

      db.insert(services).values({
        name: '블로그 체험단',
        category: '체험단',
        basePrice: 300000,
        priceUnit: '건당',
      }).run();

      // Seed tier-specific recommendations
      db.insert(serviceRecommendations).values({
        tier: 3,
        serviceName: '카페 바이럴',
        priority: 1,
        recommendedBudget: '500만~1000만',
      }).run();
    });

    it('should validate prices matching DB', () => {
      const emailText = '카페 바이럴 서비스를 건당 650,000원에 제안드립니다.';
      const result = validatePrices(emailText, serviceQueries);
      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should detect price mismatches', () => {
      const emailText = '카페 바이럴 서비스를 건당 500,000원에 제안드립니다.';
      const result = validatePrices(emailText, serviceQueries);
      expect(result.valid).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
      expect(result.mismatches[0]).toContain('카페 바이럴');
    });

    it('should pass when no prices are mentioned', () => {
      const emailText = '안녕하세요, 서비스 관련 문의드립니다.';
      const result = validatePrices(emailText, serviceQueries);
      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should include warning message format', () => {
      const emailText = '카페 바이럴 건당 999,999원';
      const result = validatePrices(emailText, serviceQueries);
      expect(result.valid).toBe(false);
      // Warning should include the service name, email amount, and DB amount
      expect(result.mismatches[0]).toContain('단가 확인 필요');
    });
  });
});
