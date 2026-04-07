# Architecture Research

**Domain:** Sales AI Automation (MCP-based, Claude Code runtime)
**Researched:** 2026-04-06
**Confidence:** HIGH

## System Overview

```
+=====================================================================+
|                    HUMAN INTERFACE LAYER                             |
|  +------------------+  +------------------+  +-------------------+  |
|  | CEO (Slack/Chat)  |  | CEO (Email fwd)  |  | CEO (Voice brief) |  |
|  +--------+---------+  +--------+---------+  +--------+----------+  |
|           |                      |                     |            |
+===========|======================|=====================|============+
            v                      v                     v
+=====================================================================+
|                    ORCHESTRATION LAYER (Claude Code)                 |
|                                                                     |
|  +-------------------+  +-------------------+  +-----------------+  |
|  | Workflow Router    |  | Task Scheduler    |  | Approval Gate   |  |
|  | (intent detection, |  | (follow-up cadence|  | (draft -> review|  |
|  |  workflow A/B/C    |  |  tracking, alerts)|  |  -> send)       |  |
|  |  dispatch)         |  |                   |  |                 |  |
|  +--------+----------+  +--------+----------+  +--------+--------+  |
|           |                      |                     |            |
|  +--------v----------+  +-------v-----------+  +------v---------+  |
|  | Research Engine    |  | Email Composer    |  | Learning Loop   |  |
|  | (company lookup,   |  | (v4 ULTRA prompt, |  | (pattern extract|  |
|  |  market analysis)  |  |  tone calibration)|  |  DB update)     |  |
|  +-------------------+  +-------------------+  +----------------+  |
|                                                                     |
+===========|======================|=====================|============+
            v                      v                     v
+=====================================================================+
|                    INTEGRATION LAYER (MCP)                          |
|  +------------------+  +------------------+  +-------------------+  |
|  | Gmail MCP        |  | Slack MCP        |  | Web Search        |  |
|  | (read/draft/send)|  | (read #channel)  |  | (market research) |  |
|  +------------------+  +------------------+  +-------------------+  |
+=====================================================================+
            v                      v                     v
+=====================================================================+
|                    PERSISTENCE LAYER (File System)                  |
|  +------------------+  +------------------+  +-------------------+  |
|  | knowledge/       |  | system/          |  | state/            |  |
|  |   clients/       |  |   v4_ULTRA...    |  |   pipeline.json   |  |
|  |   email_patterns/|  |   persona...     |  |   follow_ups.json |  |
|  |   market/        |  |                  |  |   session_log.md  |  |
|  |   briefings/     |  |                  |  |                   |  |
|  |   services.md    |  |                  |  |                   |  |
|  +------------------+  +------------------+  +-------------------+  |
+=====================================================================+
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Workflow Router** | Detects intent from CEO input, dispatches to correct workflow (A/B/C) | CLAUDE.md instructions + prompt parsing logic |
| **Research Engine** | Gathers company/market intel before composing emails | WebSearch MCP + structured output to `knowledge/market/` |
| **Email Composer** | Generates drafts using v4 ULTRA rules, tone calibration, templates | v4 ULTRA system prompt + knowledge base context |
| **Task Scheduler** | Tracks follow-up cadence (Day 3/7/14/30), surfaces pending actions | `state/follow_ups.json` checked at session start |
| **Approval Gate** | Manages draft lifecycle: create -> CEO review -> modify -> send | Gmail MCP draft creation + explicit send confirmation |
| **Learning Loop** | Extracts patterns from each interaction, updates knowledge DBs | Post-action hook that updates relevant `knowledge/` files |
| **Gmail MCP** | Read emails, create drafts, send emails, manage threads | Existing MCP integration (cyr@puzl.co.kr) |
| **Slack MCP** | Read call summaries from #sales_call_summary channel | Existing MCP integration (read-only) |

## Recommended Project Structure

```
Sales/
+-- system/                      # AI personality & rules (EXISTING)
|   +-- v4_ULTRA_SYSTEM_PROMPT.md  # Master prompt (1188 lines)
|   +-- persona_analysis.md        # Email style analysis
|
+-- knowledge/                   # Knowledge base (EXISTING, expand)
|   +-- clients/                   # Per-client history files
|   +-- email_patterns/            # Success/failure pattern library
|   +-- market/                    # Competitor & market intelligence
|   +-- briefings/                 # CEO call briefing records
|   +-- services.md                # Service catalog & pricing
|
+-- state/                       # NEW: Workflow state persistence
|   +-- pipeline.json              # Active deals pipeline tracker
|   +-- follow_ups.json            # Scheduled follow-up queue
|   +-- session_log.md             # Current session action log
|
+-- workflows/                   # NEW: Workflow definitions
|   +-- A_new_inquiry.md           # Workflow A: New inquiry -> first email
|   +-- B_post_call.md             # Workflow B: Post-call -> follow-up email
|   +-- C_follow_up.md             # Workflow C: Cadence-based follow-up
|   +-- hooks.md                   # Post-action hooks (learning triggers)
|
+-- templates/                   # NEW: Email & document templates
|   +-- first_contact_kr.md        # Korean first contact template
|   +-- first_contact_en.md        # English first contact template
|   +-- follow_up_kr.md            # Korean follow-up template
|   +-- post_call_kr.md            # Post-call email template
|
+-- docs/                        # Documentation (EXISTING)
|   +-- operations_manual.md
|   +-- knowledge_base_structure.md
|
+-- CLAUDE.md                    # Session bootstrap instructions
```

### Structure Rationale

- **system/:** Immutable personality layer. Changes only when CEO gives explicit style feedback. Treated as the "brain" -- never auto-modified by learning loop.
- **knowledge/:** Growing intelligence layer. Updated after every interaction. Each file is a self-contained unit (one client = one file) for easy context injection.
- **state/:** NEW. Ephemeral-ish workflow state. Tracks what needs to happen next. Unlike knowledge (permanent), state changes constantly. JSON for machine-readability across sessions.
- **workflows/:** NEW. Explicit step-by-step workflow definitions. Makes each workflow auditable and modifiable by CEO. Markdown for human readability.
- **templates/:** NEW. Separates email structure from content logic. Templates + v4 ULTRA rules + client context = final draft.

## Architectural Patterns

### Pattern 1: Session-Start State Hydration

**What:** Every Claude Code session begins by reading `state/pipeline.json` and `state/follow_ups.json` to understand pending work, then proactively surfaces actionable items to the CEO.
**When to use:** Every session start, before any CEO instruction.
**Trade-offs:** Adds 2-3 seconds startup time, but prevents missed follow-ups which is catastrophic for sales.

**Example flow:**
```
Session starts
  -> Read state/follow_ups.json
  -> Filter: overdue items (past Day threshold)
  -> Report to CEO: "3 follow-ups overdue: Company A (Day 7), Company B (Day 14)..."
  -> Await CEO instruction or proceed with new task
```

### Pattern 2: Workflow-as-Checklist Execution

**What:** Each workflow (A/B/C) is a linear checklist of steps. The bot executes steps sequentially, writing progress to `state/session_log.md`. If interrupted, progress is recoverable.
**When to use:** All multi-step workflows.
**Trade-offs:** Slightly rigid, but prevents step-skipping which causes quality issues (e.g., sending email without market research).

**Example (Workflow A):**
```
Workflow A: New Inquiry -> First Email
--------------------------------------
[ ] 1. Read inquiry email via Gmail MCP (get sender, subject, body)
[ ] 2. Check knowledge/clients/ for existing client history
[ ] 3. Run market research (WebSearch: company, products, marketing)
[ ] 4. Save research to knowledge/market/{company}.md
[ ] 5. Create/update knowledge/clients/{company}.md
[ ] 6. Compose first email draft (v4 ULTRA rules + research + templates)
[ ] 7. Create Gmail draft (CC: PM@puzl.co.kr, leader@puzl.co.kr)
[ ] 8. Present draft to CEO for approval
[ ] 9. On approval: send email via Gmail MCP
[  ] 10. Update state/pipeline.json (add new deal)
[  ] 11. Schedule follow-up in state/follow_ups.json (Day 3)
[  ] 12. Run learning loop (extract patterns)
```

### Pattern 3: Knowledge-on-Write (Learning Loop)

**What:** After every email send or briefing intake, automatically extract and persist learnings. Never defer learning to a batch process.
**When to use:** Post-action hook after steps 9-12 of any workflow.
**Trade-offs:** Slightly more work per action, but the knowledge base grows organically without requiring dedicated "learning sessions."

**Trigger -> Action mapping:**
```
Email sent successfully    -> Update client DB, check for new patterns
CEO modifies draft         -> Record modification as style feedback
CEO briefing received      -> Create briefing record, update client DB
Deal won/lost              -> Record pattern in email_patterns/
New competitor info found  -> Update market/competitor_intel.md
```

### Pattern 4: Context Budget Management

**What:** The v4 ULTRA prompt is 1188 lines. Loading it plus all knowledge files would exhaust context. Use selective context injection: load only relevant client file, relevant workflow definition, and relevant templates for the current task.
**When to use:** Always. Critical for system viability.
**Trade-offs:** Requires accurate intent detection upfront to load the right context. Wrong context = poor output.

**Context loading strategy:**
```
Always load:  CLAUDE.md bootstrap (small), state files (small)
Per-workflow: Relevant workflow definition
Per-client:   Specific client file from knowledge/clients/
Per-email:    Relevant template, relevant sections of v4 ULTRA (not all 22)
On-demand:    Market intel, email patterns (only when composing)
```

## Data Flow

### Flow 1: New Inquiry (Workflow A)

```
CEO: "Look at this inquiry"
  |
  v
[Gmail MCP] -- read email --> [Workflow Router] -- detect: new inquiry
  |
  v
[Research Engine] -- WebSearch company info --> [knowledge/market/{company}.md]
  |
  v
[Email Composer] -- load v4 ULTRA + client context + research
  |                  + industry playbook + template
  v
[Gmail MCP] -- create draft --> [Approval Gate] -- present to CEO
  |
  v (CEO approves)
[Gmail MCP] -- send email --> [Learning Loop]
  |                              |
  v                              v
[state/pipeline.json]       [knowledge/clients/{company}.md]
  |                          [state/follow_ups.json] (+Day 3)
  v
Done. Next session will surface Day 3 follow-up.
```

### Flow 2: Post-Call Follow-up (Workflow B)

```
CEO: "Check Slack" or pastes briefing text
  |
  v
[Slack MCP] -- read #sales_call_summary --> [Briefing Parser]
  |                                           |
  v                                           v
[knowledge/briefings/{date}_{company}.md]   [Action Item Extraction]
  |
  v
[Gmail MCP] -- read existing thread --> [Email Composer]
  |                                       |
  v                                       v
Merge: briefing + thread context + action items + v4 ULTRA
  |
  v
[Gmail MCP] -- create draft (same threadId) --> [Approval Gate]
  |
  v (CEO approves)
[Gmail MCP] -- send --> [Learning Loop] --> update client DB
```

### Flow 3: Follow-up Cadence (Workflow C)

```
Session start
  |
  v
[state/follow_ups.json] -- check overdue items
  |
  v
Surface to CEO: "Company X: Day 7 follow-up due"
  |
  v (CEO confirms)
[Gmail MCP] -- read last thread --> [Email Composer]
  |                                    |
  v                                    v
Load: client history + follow-up template + cadence rules
  |
  v
[Gmail MCP] -- create draft --> [Approval Gate] --> send
  |
  v
[state/follow_ups.json] -- update next cadence step (Day 14)
```

### State Management

```
state/pipeline.json (source of truth for active deals)
  |
  +-- Per-deal entry:
  |     {
  |       "company": "ABC Beauty",
  |       "contact": "Kim Minji, Team Lead",
  |       "stage": "proposal_sent",    // inquiry|researched|contacted|proposal_sent|negotiating|won|lost
  |       "last_action": "2026-04-06",
  |       "next_action": "2026-04-09",
  |       "next_action_type": "follow_up_day3",
  |       "email_thread_id": "18f2a3b4c5d6e7f8",
  |       "notes": "Budget 10M, serum launch May"
  |     }
  |
  +-- Updated after every workflow execution

state/follow_ups.json (scheduled action queue)
  |
  +-- Per-follow-up entry:
  |     {
  |       "company": "ABC Beauty",
  |       "due_date": "2026-04-09",
  |       "cadence_step": "day3",
  |       "thread_id": "18f2a3b4c5d6e7f8",
  |       "priority": "high",
  |       "auto_draft": true
  |     }
  |
  +-- Checked at every session start
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 active deals | Current file-based approach works perfectly. JSON state files are readable and fast. |
| 10-50 active deals | Context budget becomes the bottleneck. Implement smarter context selection -- only load top 5 relevant clients per session. Consider splitting `pipeline.json` by stage. |
| 50+ active deals | File-based state hits limits. Consider migrating `state/` to a structured DB via MCP (SQLite MCP or similar). Knowledge files still work -- they are accessed individually. |

### Scaling Priorities

1. **First bottleneck: Context window.** The v4 ULTRA prompt (1188 lines) + multiple client files + email threads will hit context limits fast. Mitigation: Extract only relevant SECTIONS from v4 ULTRA per task, not the entire prompt. Build a section index.
2. **Second bottleneck: Follow-up tracking reliability.** File-based JSON works but has no push notifications. CEO must start a Claude Code session to check follow-ups. Mitigation: Consider a daily Slack digest message via Slack MCP (write capability needed) or a cron-triggered session.
3. **Third bottleneck: Knowledge base search.** With 30+ client files, finding the right one requires listing all files. Mitigation: Maintain a `knowledge/clients/_index.json` mapping company names to filenames.

## Anti-Patterns

### Anti-Pattern 1: Monolithic Context Loading

**What people do:** Load the entire v4 ULTRA prompt + all client files + all patterns into every session.
**Why it's wrong:** Exhausts context window within minutes. Claude's output quality degrades with context overload. With 1188-line prompt + 30 client files, you'd hit limits before composing a single email.
**Do this instead:** Selective context injection. Load only the v4 ULTRA sections relevant to the current task (e.g., tone calibration + industry playbook for the specific industry + email structure rules). Map each workflow step to required prompt sections.

### Anti-Pattern 2: Implicit State in Conversation

**What people do:** Rely on conversation history to track follow-ups and pipeline status. "I'll remember to follow up with Company X in 3 days."
**Why it's wrong:** Claude Code sessions are ephemeral. New session = no memory of commitments. Follow-ups get lost. Deals fall through cracks.
**Do this instead:** Write all state to files immediately. `state/follow_ups.json` is the single source of truth. If it's not in the file, it doesn't exist.

### Anti-Pattern 3: Auto-Modifying the System Prompt

**What people do:** Let the learning loop directly edit `v4_ULTRA_SYSTEM_PROMPT.md` based on detected patterns.
**Why it's wrong:** The system prompt is the CEO's personality. Auto-modifications can drift the persona away from the CEO's actual style. Small changes compound into a completely different voice over time.
**Do this instead:** Learning loop writes to `knowledge/email_patterns/` and `knowledge/clients/`. Style feedback from CEO is logged with explicit CEO approval before any prompt modification. Prompt changes are rare, deliberate events.

### Anti-Pattern 4: Skipping Market Research

**What people do:** Jump straight to email composition when a new inquiry arrives, to save time.
**Why it's wrong:** Generic emails without company-specific context make PUZL look like a mass-mailer, not a strategic partner. This directly violates the CEO's sales philosophy.
**Do this instead:** Workflow A enforces research as Step 3 before composition. The research step cannot be skipped -- it's a mandatory checkpoint.

### Anti-Pattern 5: Storing State in Markdown

**What people do:** Use markdown files for structured state data (pipeline, follow-ups).
**Why it's wrong:** Markdown is human-readable but hard to parse programmatically. Updating a specific field in a markdown table is error-prone. JSON is trivially parseable.
**Do this instead:** Use JSON for state files (`state/*.json`), markdown for knowledge files (`knowledge/*.md`). State = machine-first, knowledge = human-first.

## Integration Points

### External Services (MCP)

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gmail MCP | Read/Draft/Send via MCP tool calls | Existing. Thread management via threadId. CC rules enforced by v4 ULTRA. HTML format only. |
| Slack MCP | Read-only from #sales_call_summary | Existing. Read-only. Never write to Slack (unless daily digest feature added later). |
| WebSearch | Market research during Workflow A | Built-in Claude capability. Results saved to `knowledge/market/`. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Workflow Router <-> Workflows | Dispatch by intent detection | Router reads CEO input, matches to Workflow A/B/C patterns |
| Workflows <-> Knowledge Base | File read/write | Each workflow reads relevant knowledge, writes updates post-action |
| Workflows <-> State | JSON read/write | Pipeline and follow-up state updated at workflow completion |
| Email Composer <-> v4 ULTRA | Selective section loading | Composer loads only needed sections, not full 1188 lines |
| Learning Loop <-> Knowledge Base | Append-only writes | Loop never deletes existing knowledge, only adds or updates |

## Build Order (Dependency-Driven)

The architecture has clear dependency chains that dictate build order:

```
Phase 1: State Infrastructure (foundation -- everything depends on this)
   |  - state/ directory + pipeline.json + follow_ups.json schemas
   |  - Session-start hydration logic (Pattern 1)
   |  - CLAUDE.md bootstrap instructions
   |
Phase 2: Workflow Definitions (depends on state infra)
   |  - workflows/ directory + A/B/C workflow checklists
   |  - Workflow Router (intent detection)
   |  - Approval Gate pattern
   |
Phase 3: Research Engine (depends on workflows calling it)
   |  - WebSearch-based company research
   |  - Structured output to knowledge/market/
   |  - Integration with Workflow A step 3-4
   |
Phase 4: Email Composition Pipeline (depends on workflows + research)
   |  - Selective v4 ULTRA section loading (Pattern 4)
   |  - Template system (templates/ directory)
   |  - Gmail draft creation with full rules (CC, HTML, threadId)
   |
Phase 5: Learning Loop (depends on all above being operational)
   |  - Post-action hooks (Pattern 3)
   |  - Knowledge base auto-update logic
   |  - Client DB maintenance
   |
Phase 6: Follow-up Automation (depends on state + workflows + email)
      - Cadence tracking engine
      - Overdue detection + CEO alerting
      - Auto-draft for follow-ups
```

**Rationale:** State must come first because every other component reads/writes state. Workflows come second because they orchestrate everything else. Research and email are the core value-producing components. Learning loop comes after because it needs real interactions to learn from. Follow-up automation is last because it's the most complex (time-based triggers) and requires all other pieces working.

## Sources

- [Anthropic: Advanced tool use patterns](https://www.anthropic.com/engineering/advanced-tool-use)
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [AI Sales System Architecture 2025](https://www.close-o-matic.com/ai-sales-blog/ai-sales-technology-and-performance/ai-sales-system-architecture-2025)
- [Anthropic shows how to scale Claude Code with subagents and MCP](https://winbuzzer.com/2026/03/24/anthropic-claude-code-subagent-mcp-advanced-patterns-xcxwbn/)
- [Claude Code skill chaining workflows](https://www.mindstudio.ai/blog/claude-code-skill-collaboration-chaining-workflows)
- Existing system analysis: v4 ULTRA system prompt, operations manual, knowledge base structure docs

---
*Architecture research for: Sales AI Automation (PUZL Corporation)*
*Researched: 2026-04-06*
