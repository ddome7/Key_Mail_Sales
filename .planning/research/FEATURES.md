# Feature Research

**Domain:** Sales AI Automation (CEO Sales Assistant Bot for Marketing Agency)
**Researched:** 2026-04-06
**Confidence:** HIGH

## Context

This analysis maps features for PUZL Corporation's Sales AI Bot -- a personal sales assistant for CEO Choi Youngrok. Unlike generic SaaS sales platforms (Outreach, Apollo, SalesLoft), this is a **single-user, high-context, approval-gated AI assistant** that operates through Gmail MCP + Slack MCP. The feature landscape is informed by what the broader sales AI ecosystem offers, but scoped to what matters for a boutique marketing agency CEO who closes deals through personal relationships.

The system already has a strong foundation: v4 ULTRA prompt (22 sections, 508 email analysis), 5-DB knowledge base design, Gmail/Slack MCP integration, and defined workflows A/B/C.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that are non-negotiable for v1. Without these, the bot provides no meaningful value over manual work.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Inquiry Market Research** | CEO needs company intel before first contact; every competitor platform (Apollo, ZoomInfo) auto-enriches leads | MEDIUM | Web search for company profile, products, marketing status, social presence. MCP constraint means using available search tools, not direct crawling |
| **Personalized First-Contact Email** | Generic templates lose deals. 30% of sales AI users use AI for email personalization (SPOTIO data). CEO's existing style demands context-aware emails | MEDIUM | Must integrate market research results + inquiry details + v4 ULTRA tone/structure rules. Not a template fill -- genuine contextual composition |
| **Call Transcript Processing** | Industry standard (Gong, Fireflies, Avoma all do this). CEO already receives Clova Note transcripts in Slack | LOW | Read from #sales_call_summary channel, extract structured action items, key decisions, client preferences, next steps |
| **Post-Call Follow-Up Email** | Natural extension of transcript processing. Outreach/SalesLoft automate this. CEO's Workflow B already defines this | MEDIUM | Must reference existing email thread context + newly extracted action items. Thread continuity is critical |
| **Human-in-the-Loop Approval** | Industry best practice for high-stakes communications. CEO explicitly requires this for v1. All major AI sales platforms support draft-review-send | LOW | Bot generates draft -> CEO reviews/edits -> approves -> send. Three options: approve, edit, reject |
| **Client DB Auto-Update** | Every CRM (HubSpot, Salesforce, Zoho) auto-captures interaction data. Manual CRM entry is the #1 complaint of sales reps (24% adoption for automated CRM entry) | MEDIUM | After every interaction: update client history, budget patterns, preferences, communication style, stage progression |
| **Follow-Up Cadence Automation** | Table stakes in every sales engagement platform (Outreach, SalesLoft, Reply.io). CEO already designed Day 0/3/7/14/30 cadence | LOW | Rule-based scheduling. Track non-responses, trigger reminders at correct intervals. Already well-defined in v4 ULTRA |
| **Email Thread Context Awareness** | Every AI email assistant (Lavender, Superhuman) reads thread history. Without this, replies feel disconnected | MEDIUM | Read previous emails in thread before composing. Maintain conversational continuity, reference prior discussions |

### Differentiators (Competitive Advantage)

Features that make this system uniquely powerful compared to generic sales AI tools. These align with PUZL's specific competitive positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **CEO Style Deep Cloning** | Generic AI writes generic emails. This system replicates a specific person's writing style from 508 analyzed emails -- tone calibration (5 levels), structural preferences (bullet symbols, spacing), Korean/English dual mode. No competitor does per-person style cloning at this depth | LOW (already built) | v4 ULTRA already contains this. The differentiator is maintaining fidelity as the system scales. Every interaction should feel like it came from the CEO personally |
| **Industry-Specific Playbooks** | Generic tools offer one-size-fits-all outreach. PUZL has 6 industry playbooks (F&B, beauty, finance, etc.) with industry-specific pain points, reference cases, and regulatory awareness | LOW (already built) | Pre-loaded in v4 ULTRA. The value compounds as more client interactions refine each playbook |
| **Service Recommendation Matrix** | Automated service matching: 5 budget tiers x 7 industries x 17 services. No generic CRM does domain-specific service matching for a marketing agency | LOW (already built) | Maps client needs to optimal service mix. Enables intelligent cross-sell/upsell suggestions |
| **Email Pattern Learning Loop** | System gets smarter with use. Success/failure pattern extraction from real interactions feeds back into future email quality. Most AI tools learn globally; this learns from CEO's personal success patterns | HIGH | Requires: pattern detection, classification (success/failure), root cause analysis, and feedback integration into future compositions |
| **Objection Handling Playbook** | Pre-built responses for 5 common objection scenarios (budget, timing, competitor comparison, scope questions, trust). Integrated into email composition, not a separate lookup | LOW (already built) | Already in v4 ULTRA. Competitive advantage because responses reflect PUZL's specific philosophy (never disparage competitors) |
| **Cross-Sell/Upsell Trigger Detection** | Automatic detection of expansion opportunities based on client history, budget patterns, and seasonal signals. Proactive rather than reactive selling | MEDIUM | Trigger matrix already designed. Implementation needs: client DB monitoring + signal detection + suggestion generation |
| **Competitive Intelligence Accumulation** | Passively collects competitor pricing, strengths, weaknesses from client conversations. Builds institutional knowledge that informs positioning without explicit competitor bashing | LOW | Data structure exists. Intelligence compounds over time. Used indirectly in positioning, never directly quoted to clients |
| **Bilingual Communication** | Seamless Korean/English email handling with distinct style rules for each language. Most Korean AI sales tools handle Korean only; most global tools handle English only | LOW (already built) | v4 ULTRA already defines Korean vs English email styles. Rare capability for a marketing agency serving both domestic and international clients |

### Anti-Features (Deliberately NOT Building)

Features that seem appealing but conflict with PUZL's philosophy, technical constraints, or quality standards.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Autonomous Email Sending (v1)** | Faster response times, less CEO overhead | High risk of brand damage, tone mismatches, wrong commitments. CEO's personal reputation is on every email. Industry data shows human review catches 15-20% of AI drafts needing changes | Human-in-the-loop approval for all v1 emails. Graduate to autonomous for low-risk templates only in v4 |
| **Multi-Channel Auto-Collection** | Aggregate inquiries from email, web forms, phone, social media automatically | Complex integration, each channel has different data quality. Over-engineering for current volume | CEO manually relays inquiries in v1. Systematize when volume justifies complexity (v4) |
| **AI Voice Calls** | Let the bot make actual phone calls | Technology not reliable for Korean B2B sales context. Personal voice is CEO's core strength. Clients would feel deceived | Bot handles all written communication; CEO owns all verbal communication |
| **Real-Time Chat/Chatbot** | Instant response to website visitors | PUZL doesn't sell through inbound web chat. Their sales model is relationship-driven, not transactional. Would dilute brand positioning | Fast email response (< 30 min) is the speed differentiator |
| **Competitor Comparison Content** | Auto-generate competitive comparison sheets | Directly violates PUZL philosophy: never disparage competitors. Risk of inaccurate claims, legal issues | Focus on PUZL's own strengths. Use competitive intelligence internally for positioning only |
| **Generic Template Library** | Pre-built email templates for common scenarios | CEO's emails are explicitly non-templated. Each email should feel personally crafted. Templates create "mass email" feel that damages premium agency positioning | Context-aware composition using style rules, not fill-in-the-blank templates |
| **Lead Scoring/Qualification** | Automatically score and prioritize leads | Volume too low to justify (boutique agency). CEO knows his pipeline personally. Scoring creates false precision at small scale | Client lifecycle stages (5 stages already defined) provide sufficient prioritization |
| **Complex Analytics Dashboard** | Visualize pipeline, conversion rates, email metrics | Over-engineering for single-user system. CEO wants action, not dashboards. Time spent building dashboards is time not spent improving email quality | Simple status tracking in client DB. Build analytics only if/when team expands |

---

## Feature Dependencies

```
[Market Research on Inquiry]
    └──requires──> [Web Search Capability]
    └──feeds──> [First-Contact Email Composition]
                    └──requires──> [v4 ULTRA Style Engine]
                    └──requires──> [Service Recommendation Matrix]

[Call Transcript Processing]
    └──requires──> [Slack MCP Channel Reading]
    └──feeds──> [Action Item Extraction]
                    └──feeds──> [Post-Call Follow-Up Email]
                                    └──requires──> [Email Thread Context]
                                    └──requires──> [v4 ULTRA Style Engine]

[Client DB Auto-Update]
    └──requires──> [Client DB Structure]
    └──enhanced-by──> [Market Research Results]
    └──enhanced-by──> [Call Transcript Data]
    └──enhanced-by──> [Email Interaction Data]

[Follow-Up Cadence Automation]
    └──requires──> [Client DB] (to track response status)
    └──requires──> [Email Thread Context] (to know what was sent)
    └──triggers──> [Reminder Email Composition]

[Email Pattern Learning]
    └──requires──> [Client DB] (outcome tracking)
    └──requires──> [Email Pattern DB Structure]
    └──feeds──> [Improved Future Compositions]

[Cross-Sell/Upsell Detection]
    └──requires──> [Client DB] (history + budget patterns)
    └──requires──> [Service Matrix] (service catalog)
    └──enhanced-by──> [Market Intelligence DB]

[Human Approval Flow]
    └──required-by──> [ALL email sending features]
    └──feeds──> [Email Pattern Learning] (CEO edits = learning signal)
```

### Dependency Notes

- **Market Research requires Web Search**: The MCP environment limits how market research is performed. Must use available search tools, not direct web crawling.
- **First-Contact Email requires both Market Research AND Style Engine**: Neither alone is sufficient. Research without style = generic. Style without research = uninformed.
- **Client DB is the central hub**: Almost every feature reads from or writes to it. Must be implemented early and robustly.
- **Approval Flow is a gateway**: All outbound emails must pass through it. Simple to build but must be reliable.
- **Email Pattern Learning requires outcome data**: Can only start learning once sufficient emails have been sent and outcomes tracked. Bootstrapped with existing 508-email analysis.
- **CEO edits are a learning signal**: When CEO modifies a draft before approval, that delta is the most valuable training data for style refinement.

---

## MVP Definition

### Launch With (v1 Core)

Minimum viable system that delivers real daily value to the CEO.

- [ ] **Market Research on New Inquiry** -- the single highest-value automation (saves 30-60 min per inquiry)
- [ ] **First-Contact Email Composition** -- with market research integration + v4 ULTRA style + industry playbook selection
- [ ] **Call Transcript Processing** -- Slack channel reading + action item extraction + structured summary
- [ ] **Post-Call Follow-Up Email** -- action item-based + thread-aware + tone-calibrated
- [ ] **Human Approval Flow** -- draft -> review -> approve/edit/reject -> send via Gmail MCP
- [ ] **Client DB Auto-Update** -- auto-capture after every interaction (new client creation + existing client update)

### Add After Validation (v1.x)

Features to add once core workflows A/B are running smoothly.

- [ ] **Follow-Up Cadence Automation** -- trigger: CEO reports missing follow-ups or asks "who haven't I heard back from?"
- [ ] **Email Pattern Learning** -- trigger: 20+ emails sent through system, enough data to detect patterns
- [ ] **Cross-Sell/Upsell Suggestions** -- trigger: 10+ clients in DB with sufficient history
- [ ] **Competitive Intelligence Auto-Capture** -- trigger: conversations naturally contain competitor mentions

### Future Consideration (v2+)

Features to defer until v1 is running and proving value.

- [ ] **Document Hub (proposals, quotes, portfolios)** -- defer because document generation rules are not yet defined
- [ ] **Auto-Quote Generation** -- defer because pricing logic needs real-world validation first
- [ ] **One-Page Proposal Generation** -- defer because template structure needs CEO iteration
- [ ] **Creator Listup Samples** -- defer because requires separate data source integration
- [ ] **Proactive Seasonal Outreach** -- defer because requires sufficient client history + market trend DB
- [ ] **Autonomous Email Sending** -- defer until CEO modification rate drops below 5%

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Market Research on Inquiry | HIGH | MEDIUM | P1 |
| First-Contact Email (Workflow A) | HIGH | MEDIUM | P1 |
| Call Transcript Processing | HIGH | LOW | P1 |
| Post-Call Follow-Up Email (Workflow B) | HIGH | MEDIUM | P1 |
| Human Approval Flow | HIGH | LOW | P1 |
| Client DB Auto-Update | HIGH | MEDIUM | P1 |
| Follow-Up Cadence (Workflow C) | MEDIUM | LOW | P2 |
| Email Pattern Learning | MEDIUM | HIGH | P2 |
| Cross-Sell/Upsell Detection | MEDIUM | MEDIUM | P2 |
| Competitive Intel Capture | LOW | LOW | P3 |
| Document Hub | MEDIUM | HIGH | P3 |
| Auto-Quote Generation | MEDIUM | HIGH | P3 |
| Proactive Seasonal Outreach | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- enables Workflow A (new inquiry) and Workflow B (post-call)
- P2: Should have -- enables Workflow C (follow-up) and system learning
- P3: Nice to have -- v2+ features requiring established foundation

---

## Competitor Feature Analysis

| Feature | Generic AI Sales Platforms (Outreach, Apollo) | Korean CRM AI (Recatch, SellDay) | PUZL Sales Bot Approach |
|---------|----------------------------------------------|-----------------------------------|------------------------|
| Email Composition | Template-based with variable insertion, generic tone | Korean business email templates, formal tone only | Deep personal style cloning from 508 emails, 5 tone levels, bilingual |
| Market Research | Firmographic data enrichment (company size, revenue, tech stack) | Korean business registry + Remember card integration | Web search for marketing-specific intel (social presence, current campaigns, brand positioning) |
| Follow-Up | Sequence-based (same cadence for all) | Basic reminder scheduling | Context-aware cadence with different approaches per client lifecycle stage |
| Learning | Global model improvements, no per-user learning | Limited local learning | Per-CEO style learning from every edit, success/failure pattern DB |
| Approval Flow | Optional review step, designed for team workflows | Manager approval chains | Single-user review (CEO only), every email reviewed, edit delta captured as learning signal |
| Industry Knowledge | Generic B2B sales playbooks | Korean market data integration | 6 custom industry playbooks for marketing services (F&B, beauty, etc.) + 17-service recommendation matrix |
| CRM Integration | Deep integration with Salesforce, HubSpot, etc. | Native Korean CRM features | Lightweight file-based DB (markdown), no external CRM dependency, perfectly suited for single-user scale |
| Pricing | $50-200/user/month for sales engagement; $1,200+/user/year for enterprise | Varies, typically per-seat pricing | Zero marginal cost (Claude + MCP tools), scales with usage not seats |

**Key Insight:** The competitive advantage is not in matching feature parity with enterprise platforms. It is in **depth of personalization for a single power user** -- something no multi-tenant SaaS can replicate. The bot knows PUZL's 17 services, the CEO's writing quirks, each client's budget patterns, and the competitive landscape, all tailored to one person's workflow.

---

## Sources

- [AI for CRM: Best AI CRM Software & Sales Assistants for 2026](https://www.cirrusinsight.com/blog/ai-crm)
- [Best AI sales engagement platforms in 2026](https://www.amplemarket.com/blog/best-ai-sales-engagement-platforms-2026)
- [Best AI Email Assistants for Sales Teams](https://aisdr.com/blog/best-ai-email-assistant/)
- [Best AI-Powered CRM Software Benefits and Use Cases for 2026](https://monday.com/blog/crm-and-sales/crm-with-ai/)
- [How AI Makes Sales Call Transcripts Actionable](https://www.sybill.ai/blogs/sales-call-transcripts)
- [Human-in-the-Loop AI Agents: Approval Workflows](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)
- [Best AI Sales Tools for Field Teams 2026 Adoption Data](https://spotio.com/blog/ai-sales-tools/)
- [Automate sales follow-up with AI](https://www.outreach.io/resources/blog/automate-sales-follow-up-with-ai-step-by-step-guide)
- [AI Sales Assistant Software Market](https://www.precedenceresearch.com/insights/ai-sales-assistant-software-modern-sales-transformation)
- [Korean AI CRM - Recatch](https://www.recatch.cc/ko/blog/why-crm-sales-is-so-difficult/)
- [2026 AI Sales Predictions - NextUnicorn](https://www.nextunicorn.kr/insight/bae934bdbf1c2635)

---
*Feature research for: PUZL Sales AI Bot (CEO Sales Assistant)*
*Researched: 2026-04-06*
