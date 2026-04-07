import { eq } from 'drizzle-orm';
import { clients } from '../db/schema.js';
import type { NewClient } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// Client data for upsert (without auto-generated fields)
export type ClientInput = Omit<NewClient, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Create client query functions bound to a specific DB instance.
 * This pattern allows dependency injection for testing with in-memory DBs.
 */
export function createClientQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * Get a single client by company name.
     * Returns undefined if not found.
     * IMPORTANT: Always returns exactly 0 or 1 result (D-04 cross-contamination prevention).
     */
    getClient(companyName: string) {
      return db.select().from(clients).where(eq(clients.companyName, companyName)).get();
    },

    /**
     * Get a single client by ID.
     */
    getClientById(id: number) {
      return db.select().from(clients).where(eq(clients.id, id)).get();
    },

    /**
     * Upsert a client: insert if not exists, update if exists (by companyName).
     * Always updates the updatedAt timestamp.
     */
    upsertClient(data: ClientInput) {
      const existing = db.select().from(clients).where(eq(clients.companyName, data.companyName)).get();

      if (existing) {
        db.update(clients)
          .set({
            ...data,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(clients.companyName, data.companyName))
          .run();
      } else {
        db.insert(clients)
          .values({
            ...data,
          })
          .run();
      }
    },

    /**
     * Update a specific field on a client by companyName.
     */
    updateClientField(companyName: string, field: string, value: any) {
      db.update(clients)
        .set({
          [field]: value,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(clients.companyName, companyName))
        .run();
    },
  };
}

// NOTE: getAllClients, listClients are intentionally NOT provided.
// This is by design (D-04): single-client queries only to prevent cross-contamination.
