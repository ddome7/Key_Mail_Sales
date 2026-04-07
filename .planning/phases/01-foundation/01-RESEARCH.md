# Phase 1: Foundation - Research

**Researched:** 2026-04-07
**Domain:** SQLite CRM database, pipeline state management, Gmail encoding safety
**Confidence:** HIGH

## Summary

Phase 1 establishes the data infrastructure that every subsequent phase depends on. The core deliverables are: (1) a SQLite database with clients and services tables, (2) a pipeline state tracker in JSON, (3) safety functions for cross-contamination prevention, price validation, and Gmail character encoding. The system runs entirely locally on the CEO's machine with no external database dependencies.

The technology stack is well-established -- SQLite with better-sqlite3 and Drizzle ORM is a mature, well-documented combination. The primary complexity is not in the technology but in the data modeling: correctly translating the v4 ULTRA system prompt's 17 services, 5 budget tiers, 7 industry categories, and 5 lifecycle stages into a normalized schema that supports fast single-client queries.

**Primary recommendation:** Use Drizzle ORM with better-sqlite3 for type-safe schema management. Keep the schema simple and flat -- avoid over-normalization. Services and budget tiers can be seeded from v4 ULTRA SECTION 2 and SECTION 12 data. Pipeline state stays in JSON files as decided.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** SQLite local database (`data/sales.db`). Single file for clients, services, pipeline. Single-client queries to minimize token usage and prevent cross-contamination.
- **D-02:** Client table with company/contact/industry/history/budget patterns/preferred services/notes/next opportunity columns. Based on knowledge base structure design.
- **D-03:** Service table with 17 services x 5 budget tiers. Data from v4 ULTRA SECTION 2 and SECTION 12.
- **D-04:** Cross-contamination prevention via single-client queries only.
- **D-05:** Price validation against service DB before email send.
- **D-06:** Gmail HTML encoding safe character substitution function.
- **D-07:** Pipeline state tracking in `state/pipeline.json` with 5-stage lifecycle (PROSPECT/LEAD/CLIENT/RETENTION/DORMANT).
- **D-08:** Session-start pipeline state loading for follow-up detection.
- **D-09:** Keep existing `knowledge/` markdown as reference; use SQLite for runtime queries.

### Claude's Discretion
- File encoding and format details
- Error handling approach
- `state/` directory structure details
- Utility function naming conventions

### Deferred Ideas (OUT OF SCOPE)
None -- all discussion stayed within Phase 1 scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Client DB with company/contact/industry/history/budget/preferences storage and retrieval | SQLite schema with Drizzle ORM; `clients` table design with text columns for Korean data |
| FOUND-02 | Service & pricing DB with 17 services and 5 budget tiers | `services` table + `service_recommendations` table; seed data from v4 ULTRA SECTION 2 & 12 |
| FOUND-03 | Cross-contamination prevention (no other client data in email context) | Single-client query pattern; Drizzle `eq()` filter enforced in all query functions |
| FOUND-04 | Auto-validate email prices against service DB | Price validation utility; query service DB, compare amounts, flag mismatches |
| FOUND-05 | Gmail unsafe character auto-substitution | Character mapping table + sanitizer function; covers box drawing, arrows, extended Unicode |
| FOUND-06 | Pipeline state tracking across sessions (5-stage lifecycle) | `state/pipeline.json` schema with Zod validation; session-start hydration pattern |

</phase_requirements>

## Standard Stack

### Core (Phase 1 only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite driver | Synchronous API, zero-config, Node 22 compatible native addon [VERIFIED: npm registry] |
| drizzle-orm | 0.45.2 | Type-safe ORM | SQL-like syntax, 7.4kb, full TypeScript inference from schema [VERIFIED: npm registry] |
| drizzle-kit | 0.31.10 | Schema migrations | Generate/run migrations, version-controlled schema changes [VERIFIED: npm registry] |
| zod | 4.3.6 | Schema validation | Validate pipeline JSON, API responses, config files [VERIFIED: npm registry] |
| tsx | 4.21.0 | TypeScript execution | Run .ts scripts directly without compile step [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | latest | Type definitions | Always -- required for TypeScript compilation [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Raw better-sqlite3 SQL | Less typing, but loses type safety and migration tooling |
| Drizzle ORM | Kysely | Drizzle has better migration tooling and schema declaration syntax |
| JSON pipeline file | SQLite pipeline table | JSON is simpler for 10-30 deals, matches D-07 decision |

**Installation (Phase 1 only):**
```bash
npm init -y
npm install better-sqlite3 drizzle-orm zod
npm install -D drizzle-kit @types/better-sqlite3 typescript tsx @types/node
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 additions)
```
Sales/
  src/
    db/
      schema.ts          # Drizzle schema definitions (clients, services)
      connection.ts      # Database connection singleton
      seed.ts            # Seed services/tiers from v4 ULTRA data
      migrate.ts         # Run migrations
    queries/
      clients.ts         # Client CRUD (always single-client)
      services.ts        # Service/pricing lookups
    safety/
      cross-contamination.ts  # Single-client query enforcement
      price-validator.ts      # Compare email prices vs service DB
      gmail-sanitizer.ts      # Unsafe char -> safe char substitution
    state/
      pipeline.ts        # Pipeline JSON read/write + Zod schema
      session-loader.ts  # Session-start state hydration
  data/
    sales.db             # SQLite database file (gitignored)
  state/
    pipeline.json        # Pipeline state (tracked in git)
  drizzle/
    migrations/          # Auto-generated migration SQL files
  drizzle.config.ts      # Drizzle Kit configuration
  tsconfig.json          # TypeScript configuration
```

### Pattern 1: Single-Client Query Enforcement (FOUND-03)
**What:** All client query functions accept exactly one client identifier and return exactly one client record. No list-all or multi-client queries are exposed to the email composition layer.
**When to use:** Every time client data is needed for email drafting or context loading.
**Example:**
```typescript
// Source: Drizzle ORM SQLite docs (orm.drizzle.team/docs/get-started-sqlite)
import { eq } from 'drizzle-orm';
import { db } from './connection';
import { clients } from './schema';

// CORRECT: Single client by ID or company name
export function getClient(companyName: string) {
  return db.select().from(clients).where(eq(clients.companyName, companyName)).get();
}

// FORBIDDEN: Never expose this to email workflows
// export function getAllClients() { ... }
```
[VERIFIED: Drizzle ORM official docs]

### Pattern 2: Service Price Lookup with Tier (FOUND-04)
**What:** Query service DB to get the canonical price for a service at a specific tier. Compare against prices mentioned in email drafts.
**When to use:** Before any email containing prices is finalized.
**Example:**
```typescript
import { eq, and } from 'drizzle-orm';

export function getServicePrice(serviceName: string, tierLevel: number) {
  return db.select()
    .from(services)
    .where(and(
      eq(services.name, serviceName),
      eq(services.tier, tierLevel)
    ))
    .get();
}

export function validatePrices(
  emailContent: string,
  clientTier: number
): { valid: boolean; mismatches: string[] } {
  // Extract price mentions from email text
  // Compare each against service DB
  // Return mismatches with warning messages
}
```
[ASSUMED]

### Pattern 3: Gmail Character Sanitizer (FOUND-05)
**What:** A mapping table of unsafe characters and their safe replacements, applied to all email HTML content before sending.
**When to use:** As the last step before Gmail draft creation.
**Example:**
```typescript
const UNSAFE_CHAR_MAP: Record<string, string> = {
  '\u2514': '-',     // └ (box drawing) -> dash
  '\u2192': '',      // → (arrow) -> remove, rewrite as text
  '\u251C': '-',     // ├ (box drawing) -> dash  
  '\u2500': '-',     // ─ (horizontal line) -> dash
  '\u2502': '|',     // │ (vertical line) -> pipe
  '\u2510': '',      // ┐ -> remove
  '\u2518': '',      // ┘ -> remove
  '\u250C': '',      // ┌ -> remove
  '\u2013': '-',     // – (en dash) -> regular dash
  '\u2014': '-',     // — (em dash) -> regular dash  
  '\u2018': "'",     // ' (left single quote) -> apostrophe
  '\u2019': "'",     // ' (right single quote) -> apostrophe
  '\u201C': '"',     // " (left double quote) -> quote
  '\u201D': '"',     // " (right double quote) -> quote
};

// Characters confirmed SAFE in Gmail: ■ ● ◎ ※ ★ ① ② ③
const SAFE_CHARS = ['■', '●', '◎', '※', '★', '①', '②', '③', '✅', ':D', ':)'];

export function sanitizeForGmail(html: string): string {
  let result = html;
  for (const [unsafe, safe] of Object.entries(UNSAFE_CHAR_MAP)) {
    result = result.replaceAll(unsafe, safe);
  }
  return result;
}
```
[VERIFIED: Gmail encoding issue confirmed in project docs + Gmail API community reports]

### Anti-Patterns to Avoid
- **Loading multiple clients for "comparison":** Even if the CEO asks to compare two clients, load them sequentially in separate queries, never in the same context. This prevents any cross-contamination in generated text.
- **Storing prices as numbers in email templates:** Always format prices as strings with proper Korean won formatting (e.g., "650,000원") at the display layer, not in the DB. DB stores integers (in won units).
- **Using the └ character in email output:** v4 ULTRA SECTION 6 line 285 says to use └ for sub-items, BUT line 330 says └ breaks in Gmail. The sanitizer resolves this contradiction by auto-replacing └ with safe alternatives in final HTML output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database schema management | Manual CREATE TABLE SQL | Drizzle ORM schema + drizzle-kit migrations | Schema changes tracked in version control, type-safe queries |
| JSON validation | Manual type checks | Zod schemas | Runtime validation with TypeScript type inference |
| SQLite connection management | Raw better-sqlite3 calls | Drizzle ORM connection wrapper | Consistent API, prepared statements, type safety |
| Character encoding detection | Custom Unicode analysis | Static mapping table (known-bad chars) | The set of problematic characters is finite and well-documented from CEO's real email experience |

**Key insight:** The complexity in this phase is data modeling and safety logic, not infrastructure. The libraries handle the infrastructure; the effort should go into correct schema design and comprehensive safety rules.

## Common Pitfalls

### Pitfall 1: Korean Text Sorting in SQLite
**What goes wrong:** SQLite's default collation (BINARY) sorts Korean text by Unicode codepoint, not by Korean phonetic order (가나다순). "사과" sorts after "바나나" correctly, but edge cases with mixed Hangul/English can surprise.
**Why it happens:** SQLite has no built-in Korean collation. ICU extension exists but adds complexity.
**How to avoid:** For Phase 1, do not rely on ORDER BY for Korean text display. Sort in application code if needed. For v1 with ~30 clients, this is a non-issue.
**Warning signs:** Client lists appearing in unexpected order.
[ASSUMED]

### Pitfall 2: SQLite WAL Mode for Concurrent Access
**What goes wrong:** Default journal mode can cause "database is locked" errors if Claude Code session reads while a migration writes.
**Why it happens:** SQLite default journal mode blocks readers during writes.
**How to avoid:** Enable WAL mode on connection: `sqlite.pragma('journal_mode = WAL')`. This allows concurrent reads and writes.
**Warning signs:** Intermittent "SQLITE_BUSY" errors.
[VERIFIED: SQLite official docs on WAL mode]

### Pitfall 3: v4 ULTRA SECTION 6 Contradictions on └ Character
**What goes wrong:** The system prompt says to USE └ for sub-items (line 285) but also says └ breaks in Gmail (line 330). Bot generates └ in email content because it follows the structural rules.
**Why it happens:** The v4 ULTRA prompt was written before the Gmail encoding issue was discovered.
**How to avoid:** The Gmail sanitizer function is the resolution. The bot can use └ in its internal representation, and the sanitizer replaces it with "&nbsp;&nbsp;&nbsp;&nbsp;- " before Gmail draft creation. This preserves the visual intent while ensuring safe rendering.
**Warning signs:** Emails with ◆◆ characters where └ should be.
[VERIFIED: project file `knowledge/email_patterns/실전_Gmail_인코딩_주의.md`]

### Pitfall 4: Service Data Staleness
**What goes wrong:** v4 ULTRA prompt has service data hardcoded. If prices change, both the DB AND the prompt have stale data. The bot might use the prompt's price (old) instead of the DB's price (current).
**Why it happens:** Two sources of truth for the same data.
**How to avoid:** The service DB is the single source of truth for prices. The price validator (FOUND-04) checks email content against the DB, not the prompt. When prices change, update the DB and log a reminder to update the prompt.
**Warning signs:** Price validation passing but CEO reporting wrong prices.
[ASSUMED]

### Pitfall 5: Pipeline JSON Corruption
**What goes wrong:** If a Claude Code session crashes mid-write to `state/pipeline.json`, the file can be corrupted (partial JSON).
**Why it happens:** File writes are not atomic by default.
**How to avoid:** Write to a temp file first, then rename (atomic on most filesystems). Or use a write-then-verify pattern: write, read back, validate with Zod schema.
**Warning signs:** Session start fails to load pipeline state; Zod validation errors on pipeline.json.
[ASSUMED]

## Code Examples

### Database Schema Definition
```typescript
// src/db/schema.ts
// Source: Drizzle ORM SQLite column types (orm.drizzle.team/docs/column-types/sqlite)

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),       // 회사명
  contactName: text('contact_name'),                  // 담당자
  contactEmail: text('contact_email'),                // 이메일
  contactPhone: text('contact_phone'),                // 전화
  industry: text('industry'),                          // 업종 (F&B, 뷰티, 주류, IT, 패션, 대기업, 해외)
  history: text('history', { mode: 'json' }).$type<HistoryEntry[]>(), // 소통 히스토리
  budgetPattern: text('budget_pattern'),               // 예산 패턴 설명
  budgetTier: integer('budget_tier'),                  // 예산 티어 (1-5)
  preferredServices: text('preferred_services', { mode: 'json' }).$type<string[]>(), // 선호 서비스
  notes: text('notes'),                                // 주의사항
  nextOpportunity: text('next_opportunity'),           // 다음 기회
  communicationStyle: text('communication_style'),     // 소통 특성
  stage: text('stage').default('PROSPECT'),            // 생애주기 단계
  lastContactDate: text('last_contact_date'),          // 마지막 소통일 (YYYY-MM-DD)
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                        // 서비스명
  category: text('category'),                          // 카테고리
  description: text('description'),                    // 설명
  basePrice: integer('base_price'),                    // 기본 단가 (원)
  priceUnit: text('price_unit'),                       // 단위 (건당, 월, 등)
  priceNote: text('price_note'),                       // 단가 참고사항
  processSteps: text('process_steps'),                 // 프로세스 설명
  asPolicy: text('as_policy'),                         // A/S 기준
});

export const serviceRecommendations = sqliteTable('service_recommendations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tier: integer('tier').notNull(),                     // 예산 티어 (1-5)
  industry: text('industry'),                          // 업종 (null = 범용)
  serviceName: text('service_name').notNull(),         // 서비스명
  priority: integer('priority'),                       // 추천 우선순위 (1=최우선)
  recommendedQuantity: text('recommended_quantity'),   // 추천 수량/구성
  recommendedBudget: text('recommended_budget'),       // 예산 범위
  salesMent: text('sales_ment'),                       // 추천 멘트
});

// Type for history entries
interface HistoryEntry {
  date: string;        // YYYY.MM
  description: string; // 내용
  status?: string;     // 완료/진행중/보류
}
```
[VERIFIED: Drizzle ORM column types from official docs]

### Database Connection Setup
```typescript
// src/db/connection.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { resolve } from 'path';

const DB_PATH = resolve(process.cwd(), 'data', 'sales.db');

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
```
[VERIFIED: Drizzle ORM official docs + better-sqlite3 WAL mode docs]

### Pipeline State Schema (Zod)
```typescript
// src/state/pipeline.ts
import { z } from 'zod';

const StageEnum = z.enum(['PROSPECT', 'LEAD', 'CLIENT', 'RETENTION', 'DORMANT']);

const DealSchema = z.object({
  id: z.string(),                    // UUID or slug
  companyName: z.string(),
  contactName: z.string().optional(),
  stage: StageEnum,
  lastActionDate: z.string(),        // YYYY-MM-DD
  nextActionDate: z.string().optional(),
  nextActionType: z.string().optional(),
  emailThreadId: z.string().optional(),
  notes: z.string().optional(),
});

export const PipelineSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.string(),
  deals: z.array(DealSchema),
});

export type Deal = z.infer<typeof DealSchema>;
export type Pipeline = z.infer<typeof PipelineSchema>;
```
[ASSUMED: Zod schema design based on architecture research state management pattern]

### Drizzle Config
```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/sales.db',
  },
});
```
[VERIFIED: Drizzle Kit official config format]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drizzle `new BetterSqlite3Database()` | `drizzle({ client: sqlite })` | Drizzle 0.30+ | New connection API; old still works but deprecated |
| `drizzle-kit push:sqlite` | `drizzle-kit push` | drizzle-kit 0.30+ | Simplified CLI commands, no dialect suffix |
| better-sqlite3 v9 | better-sqlite3 v12 | 2024-2025 | Node 22 native addon compatibility |
| Zod v3 | Zod v4 | 2025 | New API surface; v3 still widely used |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Korean text sorting in SQLite is not critical for ~30 clients | Pitfall 1 | Low -- can add application-level sort later |
| A2 | Pipeline JSON corruption risk requires atomic write pattern | Pitfall 5 | Medium -- data loss if crash during write |
| A3 | Price validation can extract amounts from email text via regex | Pattern 2 | Medium -- Korean price formats may need complex parsing |
| A4 | Service data staleness between DB and prompt is manageable | Pitfall 4 | Low -- price validator catches discrepancies |
| A5 | Zod v4 API is compatible with project patterns | State of the Art | Low -- can use Zod v3 (3.24.x) if v4 has breaking changes |

## Open Questions

1. **Zod v4 vs v3 compatibility**
   - What we know: Zod v4 (4.3.6) is latest on npm. Stack research references 3.24.x.
   - What's unclear: Whether v4 has breaking changes that affect Drizzle integration.
   - Recommendation: Use whatever version installs with `npm install zod`. Both work for validation. If issues arise, pin to 3.24.x.

2. **Service data seeding: manual or automated?**
   - What we know: 17 services with detailed info in v4 ULTRA SECTION 2, plus recommendation matrix in SECTION 12.
   - What's unclear: Whether to manually write seed data or parse it from the markdown.
   - Recommendation: Manually write a seed script (`src/db/seed.ts`). The v4 ULTRA data has inconsistent formatting that makes parsing error-prone. Manual entry ensures accuracy for 17 services.

3. **Pipeline JSON vs SQLite table for deals**
   - What we know: D-07 specifies JSON. Architecture research also recommends JSON for state.
   - What's unclear: At what scale JSON becomes unwieldy.
   - Recommendation: Follow D-07 (JSON). For 10-30 deals this is fine. Migration to SQLite table is straightforward if needed later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.20.0 | -- |
| npm | Package management | Yes | 10.9.3 | -- |
| sqlite3 CLI | Debug/inspection | Yes | 3.39.5 | Use better-sqlite3 REPL via tsx |
| TypeScript | Type checking | -- | Will install | -- |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None -- all required tools are available.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | None -- Wave 0 task to create `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Client CRUD operations (insert, read by name, update) | unit | `npx vitest run src/queries/clients.test.ts -t "client"` | Wave 0 |
| FOUND-02 | Service lookup by name + tier, all 17 services seeded | unit | `npx vitest run src/queries/services.test.ts -t "service"` | Wave 0 |
| FOUND-03 | No multi-client query exists; single-client returns 1 record | unit | `npx vitest run src/safety/cross-contamination.test.ts` | Wave 0 |
| FOUND-04 | Price in email matches service DB; mismatch flagged | unit | `npx vitest run src/safety/price-validator.test.ts` | Wave 0 |
| FOUND-05 | All unsafe chars replaced; safe chars preserved | unit | `npx vitest run src/safety/gmail-sanitizer.test.ts` | Wave 0 |
| FOUND-06 | Pipeline JSON loads, validates, updates, persists | unit | `npx vitest run src/state/pipeline.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- framework configuration
- [ ] `tsconfig.json` -- TypeScript configuration
- [ ] `src/queries/clients.test.ts` -- covers FOUND-01, FOUND-03
- [ ] `src/queries/services.test.ts` -- covers FOUND-02
- [ ] `src/safety/cross-contamination.test.ts` -- covers FOUND-03
- [ ] `src/safety/price-validator.test.ts` -- covers FOUND-04
- [ ] `src/safety/gmail-sanitizer.test.ts` -- covers FOUND-05
- [ ] `src/state/pipeline.test.ts` -- covers FOUND-06
- [ ] Framework install: `npm install -D vitest`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local system, no auth needed |
| V3 Session Management | No | File-based, no HTTP sessions |
| V4 Access Control | Yes (data isolation) | Single-client query pattern prevents cross-contamination |
| V5 Input Validation | Yes | Zod schemas for pipeline JSON; parameterized SQL via Drizzle ORM |
| V6 Cryptography | No | No secrets stored in DB; API keys in .env (not in scope) |

### Known Threat Patterns for SQLite + TypeScript

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via client name | Tampering | Drizzle ORM parameterized queries (never raw SQL with interpolation) |
| Cross-contamination (client A data in client B email) | Information Disclosure | Single-client query functions; no multi-client context loading |
| Price hallucination (wrong amount in email) | Tampering | Price validator checks email amounts against service DB |
| Pipeline JSON tampering | Tampering | Zod schema validation on every read; atomic writes |

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM - SQLite Getting Started](https://orm.drizzle.team/docs/get-started-sqlite) -- connection setup, schema API
- [Drizzle ORM - SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) -- text/integer/json mode options
- npm registry -- better-sqlite3 12.8.0, drizzle-orm 0.45.2, drizzle-kit 0.31.10, zod 4.3.6, tsx 4.21.0, vitest 4.1.2
- Project file: `system/v4_ULTRA_SYSTEM_PROMPT.md` SECTION 2, 6, 12, 13 -- service data, email rules, budget tiers, lifecycle
- Project file: `docs/지식베이스_구조.md` -- knowledge base design with 5 DB areas
- Project file: `knowledge/email_patterns/실전_Gmail_인코딩_주의.md` -- confirmed broken chars
- Project file: `knowledge/clients/오아름_뷰티브랜드.md` -- client file structure example

### Secondary (MEDIUM confidence)
- [Gmail API UTF-8 character issues](https://community.latenode.com/t/special-utf-8-characters-turning-into-question-marks-when-sending-html-emails-through-gmail-api/21471) -- Gmail replaces extended Unicode with ? marks
- [Gmail API HTML message encoding](https://discuss.google.dev/t/gmail-api-html-message-with-utf-8-character-set-extended-characters/188232) -- confirmed encoding issues with special chars
- [Email On Acid - Content-Type encoding guide](https://www.emailonacid.com/blog/article/email-development/the-importance-of-content-type-character-encoding-in-html-emails/) -- HTML entity best practices

### Tertiary (LOW confidence)
- [Bleeping Computer - Unicode glitch characters](https://www.bleepingcomputer.com/news/technology/why-certain-characters-glitch-gmail-youtube-and-twitter/) -- "magic Unicode" characters that behave strangely

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm, well-established libraries
- Architecture: HIGH -- schema patterns verified against Drizzle ORM docs, project structure follows existing conventions
- Pitfalls: MEDIUM -- Gmail encoding issues verified, but comprehensive unsafe character list may be incomplete
- Safety logic: MEDIUM -- patterns are sound but price extraction regex needs real-world validation

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable domain, 30-day validity)
