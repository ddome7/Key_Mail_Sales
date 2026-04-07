import { eq, and } from 'drizzle-orm';
import { services, serviceRecommendations } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * Create service query functions bound to a specific DB instance.
 * This pattern allows dependency injection for testing with in-memory DBs.
 */
export function createServiceQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * Get a service by its exact name.
     */
    getServiceByName(name: string) {
      return db.select().from(services).where(eq(services.name, name)).get();
    },

    /**
     * Get service recommendation (price/quantity info) by service name and budget tier.
     * Used for price validation and recommendation generation.
     */
    getServicePrice(serviceName: string, tier: number) {
      return db.select()
        .from(serviceRecommendations)
        .where(
          and(
            eq(serviceRecommendations.serviceName, serviceName),
            eq(serviceRecommendations.tier, tier),
          )
        )
        .get();
    },

    /**
     * Get all service recommendations for a specific budget tier.
     * Returns recommendations sorted by priority.
     */
    getRecommendationsByTier(tier: number) {
      return db.select()
        .from(serviceRecommendations)
        .where(eq(serviceRecommendations.tier, tier))
        .all();
    },

    /**
     * Get recommendations filtered by both tier and industry.
     * Industry-specific recommendations use tier=0 as a convention.
     */
    getRecommendationsByTierAndIndustry(tier: number, industry: string) {
      return db.select()
        .from(serviceRecommendations)
        .where(
          and(
            eq(serviceRecommendations.tier, tier),
            eq(serviceRecommendations.industry, industry),
          )
        )
        .all();
    },
  };
}
