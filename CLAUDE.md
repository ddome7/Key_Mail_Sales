<!-- GSD:project-start source:PROJECT.md -->
## Project

**최영록 세일즈봇 (PUZL Sales AI)**

퍼즐코퍼레이션 CEO 최영록의 세일즈 분신 AI 시스템. 문의접수부터 이메일 소통, 시장조사, 자료 제작, 팔로업까지 사무적 세일즈 업무를 100% 지원하여, 대표님은 유선통화와 대면 미팅에만 집중할 수 있는 환경을 구축한다. 궁극적으로 휴대폰 하나로 세일즈가 가능한 환경을 만든다.

**Core Value:** 대표님이 문의를 전달하면, 봇이 시장조사 → 맞춤 이메일 작성 → 팔로업까지 자율적으로 처리하고, 대표님은 승인과 대면 소통에만 집중할 수 있어야 한다.

### Constraints

- **MCP 도구 한계**: Gmail/Slack MCP로만 외부 소통 가능. 직접 웹 크롤링이나 전화는 불가
- **승인 필수 (v1)**: 모든 이메일은 대표님 승인 후 발송. 자율 발송은 v4 이후
- **톤/스타일 정합성**: v4 ULTRA 프롬프트의 톤 캘리브레이션, 구조화 기호 규칙, Gmail HTML 인코딩 규칙 100% 준수 필수
- **보안**: 클라이언트 간 내부 정보 교차 노출 금지, 경쟁사 단가 직접 언급 금지
- **슬랙 채널 규칙**: #세일즈_통화요약 채널만 읽기, 다른 채널 절대 조회 금지
- **CC 필수**: 모든 이메일에 PM@puzl.co.kr, leader@puzl.co.kr CC 포함
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
### Scheduling & Job Queue
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| BullMQ | 5.x | Follow-up cadence scheduling | Persistent job queue backed by Redis. Survives process restarts. Cron expressions for Day 3/7/14/30 follow-ups. Retry logic for failed email drafts. Dashboard for monitoring. | HIGH |
| Redis (via Docker or Upstash) | 7.x | BullMQ backing store | Required by BullMQ. Lightweight -- can use Upstash (serverless Redis) to avoid running Docker. | MEDIUM |
### Web Scraping / Company Research
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Playwright | 1.50.x | Browser automation for company research | Cross-browser support, auto-waiting, network interception. Official MCP server available. Handles dynamic JS-heavy sites (e.g., Korean company pages). | HIGH |
| Cheerio | 1.0.x | HTML parsing for static pages | Fast parsing when full browser isn't needed. Company homepages often have static content that Cheerio handles in milliseconds vs seconds for Playwright. | HIGH |
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
### Temporal (Durable execution)
### Custom TypeScript orchestration (Recommended)
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
# Core AI
# Database
# Scheduling
# Web Scraping
# Utilities
# Dev dependencies
## Optional (Phase 2+)
# Agent SDK (when multi-step agent workflows are needed)
# Express (if building approval UI or webhook endpoints)
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
