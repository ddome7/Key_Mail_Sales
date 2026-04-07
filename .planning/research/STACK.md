# Technology Stack

**Project:** PUZL Sales AI Bot (세일즈 AI 봇)
**Researched:** 2026-04-06
**Overall Confidence:** MEDIUM-HIGH

## Recommended Stack

### Runtime & Language
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 22 LTS | Runtime | Already required for Claude Agent SDK. LTS for stability. | HIGH |
| TypeScript | 5.7+ | Language | Type safety for complex workflow logic, Drizzle ORM type inference, Claude SDK native support. | HIGH |

### AI / LLM Layer
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | 0.82.x | Claude API access | Direct API calls with tool use (function calling) for structured workflows. The core AI backbone. | HIGH |
| @anthropic-ai/claude-agent-sdk | latest | Agent orchestration | For complex multi-step tasks (market research + email composition). Provides agent loop, subagent spawning, MCP server connections. Use for Workflow B/C where multiple tools chain. | MEDIUM |

**Why NOT OpenAI / other LLMs:** The entire v4 ULTRA system prompt (22 sections) is built for Claude. Switching LLM means rewriting the prompt and losing calibrated tone/style. Claude's extended thinking is ideal for the multi-step sales reasoning this bot requires.

### MCP Integrations (Already Existing)
| Technology | Purpose | Notes |
|------------|---------|-------|
| Gmail MCP Server | Email read/draft/send | Already connected. cyr@puzl.co.kr. Draft-then-approve flow. |
| Slack MCP Server | Call transcript reading | Already connected. #세일즈_통화요약 channel only. |
| Playwright MCP Server | Web scraping for market research | NEW - Add for company research automation. Microsoft's official MCP server lets Claude control a browser. |

### Database & ORM
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| SQLite (better-sqlite3) | 11.x | Client DB, email patterns, market intel | Zero-infrastructure. Single-user system (only CEO uses it). No concurrent writes needed. File-based = easy backup, portable. | HIGH |
| Drizzle ORM | 0.45.x | Type-safe database access | Lightweight (7.4kb), zero dependencies, SQL-like syntax. Full TypeScript type inference from schema. Migration support via drizzle-kit. | HIGH |
| drizzle-kit | 0.30.x | Migrations | Generate and run schema migrations. Store in version control. | HIGH |

**Why SQLite over PostgreSQL:** This is a single-user system (one CEO, one bot). There are no concurrent writes, no multi-tenant needs, no heavy read loads. SQLite eliminates infrastructure complexity (no Docker, no managed DB, no connection pooling). If the system grows to v4 (autonomous multi-agent), migrate to PostgreSQL then -- Drizzle ORM makes this a schema-level swap, not a rewrite.

**Why Drizzle over Prisma:** Drizzle is SQL-native (no query engine binary), lighter, faster cold starts, and the TypeScript inference is superior. Prisma's client generation step adds friction to the dev cycle. For a small schema (5 tables), Drizzle's simplicity wins.

### Scheduling & Job Queue
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| BullMQ | 5.x | Follow-up cadence scheduling | Persistent job queue backed by Redis. Survives process restarts. Cron expressions for Day 3/7/14/30 follow-ups. Retry logic for failed email drafts. Dashboard for monitoring. | HIGH |
| Redis (via Docker or Upstash) | 7.x | BullMQ backing store | Required by BullMQ. Lightweight -- can use Upstash (serverless Redis) to avoid running Docker. | MEDIUM |

**Why NOT node-cron:** node-cron loses all jobs on crash/restart. For a follow-up cadence system where missing Day 7 means losing a deal, persistence is non-negotiable. BullMQ stores jobs in Redis, guarantees execution, and supports delayed jobs natively.

**Alternative (simpler, if Redis is too heavy):** Use `bree` (worker-thread-based scheduler with persistence via SQLite). This eliminates Redis but sacrifices BullMQ's monitoring dashboard and distributed job features. For v1 single-process, Bree is a viable simpler option.

### Web Scraping / Company Research
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Playwright | 1.50.x | Browser automation for company research | Cross-browser support, auto-waiting, network interception. Official MCP server available. Handles dynamic JS-heavy sites (e.g., Korean company pages). | HIGH |
| Cheerio | 1.0.x | HTML parsing for static pages | Fast parsing when full browser isn't needed. Company homepages often have static content that Cheerio handles in milliseconds vs seconds for Playwright. | HIGH |

**Strategy:** Use Cheerio first (fast, lightweight). Fall back to Playwright only for JS-rendered pages. This 2-tier approach keeps research fast while handling edge cases.

**Why NOT Crawlee:** Overkill for targeted company research (we're scraping 1-3 pages per inquiry, not crawling entire sites). Adds unnecessary abstraction.

### Project Structure & Build
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| tsx | 4.x | TypeScript execution | Run .ts files directly without compile step. Fast iteration. | HIGH |
| tsup | 8.x | Build/bundle | Fast ESBuild-based bundler for production builds. | MEDIUM |
| Vitest | 3.x | Testing | Fast, TypeScript-native, good DX. | HIGH |
| dotenv | 16.x | Environment config | API keys, Redis URL, DB path. | HIGH |
| zod | 3.24.x | Schema validation | Validate Claude API responses, incoming webhook data, config. Integrates with Drizzle for shared types. | HIGH |

### Monitoring & Observability
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pino | 9.x | Structured logging | Fast JSON logger. Log every workflow execution, email draft, approval status. Critical for debugging and learning loop. | HIGH |
| Bull Board | 6.x | BullMQ dashboard | Visual monitoring of scheduled follow-ups. See pending/failed/completed jobs. | MEDIUM |

## Architecture Decision: Why NOT n8n / Temporal

### n8n (Low-code workflow)
**Why NOT:** The v4 ULTRA system prompt is 500+ lines of nuanced sales logic. This logic lives in code, not drag-and-drop nodes. n8n's AI nodes use LangChain abstractions that add a layer between Claude and the carefully crafted prompt. The approval flow (CEO reviews draft before send) requires custom UI logic n8n doesn't handle well. Also, n8n's visual editor gives zero benefit when the "workflow designer" is the developer.

### Temporal (Durable execution)
**Why NOT for v1:** Temporal requires 4+ containers, 4GB RAM minimum. It's designed for distributed microservices with thousands of workflows/second. This bot handles ~10-20 workflows/day. Temporal is the right move if/when the system scales to v4 (autonomous multi-agent), but for v1-v2 it's massive overengineering.

### Custom TypeScript orchestration (Recommended)
**Why YES:** Simple async functions with BullMQ for scheduling. The Claude Agent SDK already provides the agent loop. The workflow logic IS the business logic (prompt engineering + tool orchestration). Custom code gives full control over the nuanced sales reasoning chain.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM | Claude (Anthropic SDK) | OpenAI GPT-4o | v4 ULTRA prompt is Claude-native; 22 sections would need rewrite |
| DB | SQLite + Drizzle | PostgreSQL + Prisma | Over-provisioned for single-user; Prisma has heavier runtime |
| Scheduler | BullMQ + Redis | node-cron | No persistence; lost jobs = lost deals |
| Scheduler (alt) | BullMQ + Redis | Bree | Viable for v1 if Redis too heavy; lacks dashboard |
| Scraping | Playwright + Cheerio | Crawlee | Overkill for 1-3 pages per inquiry |
| Workflow | Custom TS + Agent SDK | n8n | Can't express v4 ULTRA prompt logic in visual nodes |
| Workflow | Custom TS + Agent SDK | Temporal | 4-container minimum; overkill for ~10 workflows/day |
| ORM | Drizzle | Prisma | Lighter, faster, better TS inference for small schema |
| ORM | Drizzle | Kysely | Drizzle has better migration tooling and schema declaration |

## Installation

```bash
# Core AI
npm install @anthropic-ai/sdk zod

# Database
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3

# Scheduling
npm install bullmq ioredis

# Web Scraping
npm install cheerio
npm install playwright  # also run: npx playwright install chromium

# Utilities
npm install pino dotenv

# Dev dependencies
npm install -D typescript tsx tsup vitest @types/node
npm install -D @bull-board/api @bull-board/express
```

## Optional (Phase 2+)

```bash
# Agent SDK (when multi-step agent workflows are needed)
npm install @anthropic-ai/claude-agent-sdk

# Express (if building approval UI or webhook endpoints)
npm install express
npm install -D @types/express
```

## Key Version Constraints

| Package | Min Version | Reason |
|---------|------------|--------|
| Node.js | 22.x | Required by Claude Agent SDK; LTS stability |
| TypeScript | 5.7+ | Satisfies keyword, better type narrowing |
| better-sqlite3 | 11.x | Node 22 native addon compatibility |

## Sources

- [Anthropic SDK TypeScript - npm](https://www.npmjs.com/package/@anthropic-ai/sdk) - v0.82.0 confirmed
- [Claude Agent SDK - npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) 
- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Drizzle ORM - npm](https://www.npmjs.com/package/drizzle-orm) - v0.45.2 confirmed
- [Drizzle ORM SQLite Guide](https://orm.drizzle.team/docs/get-started-sqlite)
- [BullMQ Documentation](https://bullmq.io/)
- [BullMQ Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable)
- [Better Stack: Node.js Schedulers Comparison](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [Playwright Web Scraping Guide](https://brightdata.com/blog/how-tos/playwright-web-scraping)
- [ZenRows: JS Scraping Libraries](https://www.zenrows.com/blog/javascript-nodejs-web-scraping-libraries)
- [n8n vs Temporal Comparison](https://www.zenml.io/blog/n8n-vs-temporal)
- [Temporal vs n8n Self-Hosted](https://earezki.com/ai-news/2026-03-12-temporal-vs-n8n-which-should-you-self-host/)
