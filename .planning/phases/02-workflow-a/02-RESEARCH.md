# Phase 2: Workflow A (신규 문의 처리) - Research

**Researched:** 2026-04-08
**Domain:** Sales Email Automation Pipeline (Market Research + Email Composition + Approval Flow)
**Confidence:** HIGH

## Summary

Phase 2 builds the core value-producing workflow: when the CEO receives a new inquiry, the bot researches the company, composes a personalized first-contact email using v4 ULTRA rules, runs safety checks, and creates a Gmail draft for CEO approval. This phase integrates Phase 1's foundation modules (clients.ts, services.ts, safety/*.ts, pipeline.ts) into an end-to-end automated pipeline.

The primary technical challenges are: (1) selective loading of v4 ULTRA sections to stay within token budgets, (2) structuring the market research → classification → composition → safety check → draft creation pipeline, (3) proper Gmail MCP integration with HTML format, CC rules, and threadId handling, and (4) implementing the 4-stage classification engine (SECTION 11) that dynamically determines which strategy/tone/sections to apply.

**Primary recommendation:** Build the workflow as a linear pipeline of pure TypeScript functions chained together: `classifyInquiry() → researchCompany() → loadPromptSections() → composeEmail() → runSafetyChecks() → createGmailDraft()`. Each function is independently testable with Vitest. Use the `@anthropic-ai/sdk` for Claude API calls with tool use, not the Agent SDK (unnecessary complexity for this linear flow).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** WebSearch 도구를 사용하여 문의 회사를 조사한다. 조사 항목: 회사 개요(업종, 규모), 주요 상품/서비스, 현재 마케팅 활동(SNS, 블로그, 광고), 실존 여부 확인.
- **D-02:** 시장조사 결과를 구조화된 마크다운 형태로 정리한다. 이메일 작성 시 이 결과를 참조하여 맞춤 내용을 생성한다.
- **D-03:** 조사 결과는 클라이언트 DB에 자동 저장하여 재조사 없이 재활용할 수 있게 한다.
- **D-04:** v4 ULTRA 전체(1188줄)를 매번 로드하지 않는다. 이메일 작성 시 필요한 섹션만 선택적으로 로드한다. 필수 로드: SECTION 1(페르소나), SECTION 6(이메일 규칙 한국어), SECTION 8(제목 형식), SECTION 20(품질 체크리스트). 상황별 로드: SECTION 9(해당 전략만), SECTION 11(분류 엔진), SECTION 12(서비스 추천), SECTION 16(톤 캘리브레이션). 업종별 로드: SECTION 18(해당 업종만).
- **D-05:** 이메일 자동 분류 엔진(SECTION 11)의 4단계 판단 트리를 먼저 실행하여 상대방/상황/언어/긴급도를 판단하고, 그 결과에 따라 필요한 섹션을 동적으로 로드한다.
- **D-06:** 이메일은 반드시 HTML 형식(text/html)으로 Gmail 드래프트를 생성한다. CC에 PM@puzl.co.kr, leader@puzl.co.kr를 자동 포함한다.
- **D-07:** 구조화 기호 규칙(■●★◎※)과 서명(감사합니다. / 퍼즐코퍼레이션 / 최 영 록 / 드림.) 그리고 소개 자료 링크를 하이퍼링크로 처리한다. gmail-sanitizer.ts를 발송 전 반드시 적용한다.
- **D-08:** 기존 이메일 스레드에 답장할 때는 Gmail MCP의 threadId를 정확히 지정한다. 신규 문의는 새 스레드로 생성한다.
- **D-09:** 발송 전 품질 체크리스트(SECTION 20) 11개 필수 항목을 자동 검증한다. 미통과 항목이 있으면 수정 후 재생성한다.
- **D-10:** 봇이 작성한 이메일은 Gmail 임시저장(Draft)으로 생성한다. 대표님이 Gmail에서 직접 확인하고 발송한다.
- **D-11:** 이메일에 금액/견적이 포함된 경우 경고를 표시한다. price-validator.ts를 적용한다.
- **D-12:** 대표님이 수정 요청 시 수정 사항을 반영하여 새 드래프트를 생성한다. 기존 드래프트를 덮어쓰지 않고 새로 만든다.
- **D-13:** 반론/거절 대응 플레이북(SECTION 14, 5대 시나리오)을 상황 감지 시 자동 적용한다.
- **D-14:** 클라이언트 생애주기(SECTION 13, STAGE 1~5)에 따라 톤 레벨과 전략을 자동 조절한다. pipeline.ts의 현재 stage 값을 참조한다.
- **D-15:** 서비스 추천 매트릭스(SECTION 12)를 활용하여 예산 티어 + 업종에 맞는 최적 믹스안을 자동 제안한다. services.ts의 DB 쿼리 결과를 사용한다.
- **D-16:** 매 소통 후 클라이언트 DB를 자동 업데이트한다. 새 정보가 발견되면 clients.ts의 upsertClient 함수로 저장한다.
- **D-17:** 신규 문의 시 클라이언트가 DB에 없으면 자동 생성한다. 시장조사 결과를 기본 정보로 채운다.

### Claude's Discretion
- 시장조사 검색 쿼리 최적화 방법
- v4 ULTRA 섹션 로드 시 토큰 최적화 세부 전략
- 에러 핸들링 및 재시도 로직
- 이메일 작성 프롬프트의 구체적 구조

### Deferred Ideas (OUT OF SCOPE)
None -- 논의가 Phase 2 범위 내에서 진행됨
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-07 | 매 소통 후 클라이언트 DB를 자동 업데이트한다 | clients.ts `upsertClient` 함수 + updateClientField 함수 이미 구현됨. 시장조사 결과 → ClientInput 매핑 구현 필요 |
| RSCH-01 | 문의 회사의 업종/주요 상품/서비스를 웹 검색으로 조사 | WebSearch tool + 한국어 쿼리 전략 (Architecture Pattern 1) |
| RSCH-02 | 문의 회사가 실존하는 회사인지 확인 | WebSearch 결과에서 공식 사이트/사업자등록 정보 존재 여부 확인 |
| RSCH-03 | 문의 회사의 현재 마케팅 활동(SNS, 블로그, 광고)을 조사 | WebSearch + SNS 플랫폼별 검색 쿼리 |
| RSCH-04 | 시장조사 결과를 구조화된 형태로 정리 | Zod 스키마로 MarketResearchResult 타입 정의 |
| EMAIL-01 | 시장조사 + 문의 내용을 반영하여 맞춤 1차 이메일 작성 | 파이프라인: classify → research → loadSections → compose → validate |
| EMAIL-02 | v4 ULTRA 분류 엔진(4단계 판단 트리) 적용 | SECTION 11 구현 — classifyInquiry() 함수 |
| EMAIL-03 | 톤 캘리브레이션 5단계 자동 적용 | SECTION 16 로드 + pipeline.ts stage 참조 |
| EMAIL-04 | 업종별 플레이북 자동 적용 | SECTION 18에서 해당 업종만 추출 |
| EMAIL-05 | 상황별 이메일 제목 형식 생성 | SECTION 8 규칙 + 날짜 포맷 (YYMMDD) |
| EMAIL-06 | 구조화 기호 규칙(■●★◎※) 정확 적용 | SECTION 6 구조화 기호 규칙 → 프롬프트에 포함 |
| EMAIL-07 | 서명 정확히 포함 | 고정 HTML 블록으로 분리 (AI 생성 대상 아님) |
| EMAIL-08 | Gmail HTML 드래프트 + CC 자동 포함 | gmail_create_draft MCP 호출 + CC 파라미터 |
| EMAIL-09 | 기존 스레드 답장 시 threadId 지정 | gmail_read_message로 threadId 추출 → draft에 전달 |
| EMAIL-10 | 소개 자료 링크 하이퍼링크 처리 | 고정 HTML 블록 (SECTION 6 소개 자료 링크 섹션) |
| EMAIL-11 | 발송 전 품질 체크리스트 11개 항목 자동 검증 | SECTION 20 → validateQualityChecklist() 함수 |
| APPR-01 | Gmail 임시저장으로 생성 | gmail_create_draft MCP |
| APPR-02 | 수정 요청 시 새 드래프트 생성 | 기존 드래프트 ID 보존, 새 draft 생성 |
| APPR-03 | 금액 포함 시 HIGH 리스크 표시 | price-validator.ts의 extractPricesFromText + 경고 메시지 |
| OBJC-01 | 반론/거절 대응 플레이북 자동 적용 | SECTION 14 동적 로드 |
| OBJC-02 | 생애주기에 따른 톤/전략 조절 | pipeline.ts getDealByCompany → stage → SECTION 13/16 매핑 |
| OBJC-03 | 서비스 추천 매트릭스 활용 | services.ts getRecommendationsByTierAndIndustry → SECTION 12 |
</phase_requirements>

## Standard Stack

### Core (Phase 1에서 이미 설치됨)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.82.x (to install) | Claude API with tool use | v4 ULTRA 프롬프트 처리, 이메일 작성 AI backbone | [VERIFIED: package.json에 미설치, STACK.md 권장] |
| drizzle-orm | 0.45.2 | DB 쿼리 | Phase 1에서 구축 완료 | [VERIFIED: package.json] |
| better-sqlite3 | 12.8.0 | SQLite runtime | Phase 1에서 구축 완료 | [VERIFIED: package.json] |
| zod | 4.3.6 | Schema validation | 시장조사 결과/이메일 분류 결과 타입 검증 | [VERIFIED: package.json] |
| vitest | 4.1.2 | Testing | Phase 1 패턴 계승 | [VERIFIED: package.json] |

### Phase 2 신규 설치 필요
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @anthropic-ai/sdk | latest | Claude API calls with tool use | 이메일 작성 프롬프트 실행, 시장조사 결과 구조화 |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/
├── db/                    # Phase 1 (existing)
├── queries/               # Phase 1 (existing)
├── safety/                # Phase 1 (existing)
├── state/                 # Phase 1 (existing)
├── workflow/              # NEW: Phase 2
│   ├── classify.ts            # SECTION 11 분류 엔진 구현
│   ├── research.ts            # 시장조사 파이프라인
│   ├── prompt-loader.ts       # v4 ULTRA 섹션 선택적 로더
│   ├── compose.ts             # 이메일 작성 파이프라인
│   ├── quality-checker.ts     # SECTION 20 품질 체크리스트
│   ├── draft-creator.ts       # Gmail MCP 드래프트 생성
│   └── workflow-a.ts          # Workflow A 오케스트레이터
├── types/                 # NEW: 공유 타입
│   ├── classification.ts     # ClassificationResult 타입
│   ├── research.ts            # MarketResearchResult 타입
│   └── email.ts               # EmailDraft, QualityCheckResult 타입
```

### Pattern 1: v4 ULTRA Selective Section Loader

**What:** v4 ULTRA 프롬프트(1187줄)에서 필요한 섹션만 추출하여 토큰 예산을 관리하는 파일 파서. [VERIFIED: codebase analysis]

**When to use:** 모든 이메일 작성 시 -- 전체 프롬프트 로드 대신 선택적 로드.

**Section Line Map (verified from file):**
```typescript
// Source: system/v4_ULTRA_SYSTEM_PROMPT.md line number analysis
const SECTION_RANGES: Record<number, [number, number]> = {
  1:  [15, 36],     // 페르소나 (~22 lines)
  2:  [37, 139],    // 서비스 카탈로그 (~103 lines) - 필요시만
  6:  [231, 343],   // 이메일 규칙 한국어 (~113 lines) - 필수
  7:  [344, 368],   // 이메일 규칙 영문 (~25 lines) - 영문일 때만
  8:  [369, 379],   // 제목 형식 (~11 lines) - 필수
  9:  [380, 475],   // 상황별 전략 A~L (~96 lines) - 해당 전략만 추출
  11: [554, 598],   // 분류 엔진 (~45 lines) - 분류 시
  12: [599, 684],   // 서비스 추천 (~86 lines) - 추천 시
  13: [685, 753],   // 생애주기 (~69 lines) - 톤 조절 시
  14: [754, 841],   // 반론 대응 (~88 lines) - 반론 감지 시
  16: [888, 930],   // 톤 캘리브레이션 (~43 lines) - 필수
  18: [973, 1018],  // 업종별 플레이북 (~46 lines) - 해당 업종만
  19: [1019, 1073], // 제안서 템플릿 (~55 lines) - 제안서 시
  20: [1074, 1113], // 품질 체크리스트 (~40 lines) - 필수
};
```

**Token budget estimation:**
- 필수 섹션 (S1+S6+S8+S16+S20): ~229 lines = ~3,400 tokens
- 신규 문의 추가 (S9-A only + S11): ~55 lines = ~800 tokens
- 총 기본 프롬프트: ~4,200 tokens (전체 1187줄 = ~17,800 tokens 대비 76% 절약)

**Implementation approach:**
```typescript
// Source: codebase analysis + D-04 decision
import { readFileSync } from 'fs';

interface SectionRange {
  start: number;
  end: number;
}

const SECTION_MAP: Record<string, SectionRange> = {
  'persona': { start: 15, end: 36 },
  'email-rules-kr': { start: 231, end: 343 },
  'subject-format': { start: 369, end: 379 },
  'strategy-A': { start: 383, end: 391 },  // 신규 문의 전략만
  'classification': { start: 554, end: 598 },
  'tone-calibration': { start: 888, end: 930 },
  'quality-checklist': { start: 1074, end: 1113 },
  // ... more sections
};

export function loadSections(sectionIds: string[], filePath: string): string {
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  const sections: string[] = [];
  
  for (const id of sectionIds) {
    const range = SECTION_MAP[id];
    if (range) {
      sections.push(lines.slice(range.start - 1, range.end).join('\n'));
    }
  }
  
  return sections.join('\n\n---\n\n');
}
```

### Pattern 2: Classification-Driven Section Loading

**What:** SECTION 11 분류 엔진의 4단계 판단 결과에 따라 필요한 섹션을 동적으로 결정한다. [VERIFIED: SECTION 11 analysis]

**Classification output structure:**
```typescript
interface ClassificationResult {
  strategy: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';
  language: 'korean' | 'english' | 'bilingual';
  toneLevel: 1 | 2 | 3 | 4 | 5;
  urgency: 'ASAP' | 'normal' | 'low';
  isNewClient: boolean;
  industry?: string;
  hasPricing: boolean;
}
```

**Section loading logic based on classification:**
```typescript
function getSectionsForClassification(result: ClassificationResult): string[] {
  // Always load
  const sections = ['persona', 'email-rules-kr', 'subject-format', 'tone-calibration', 'quality-checklist'];
  
  // Strategy-specific
  sections.push(`strategy-${result.strategy}`);
  
  // Language
  if (result.language !== 'korean') {
    sections.push('email-rules-en');
  }
  
  // Industry playbook
  if (result.industry) {
    sections.push(`industry-${result.industry}`);
  }
  
  // Pricing
  if (result.hasPricing) {
    sections.push('service-recommendation');
  }
  
  return sections;
}
```

### Pattern 3: Market Research Pipeline

**What:** WebSearch를 사용한 한국 회사 조사 파이프라인. [ASSUMED - query strategy based on training knowledge]

**Research query strategy for Korean companies:**
```typescript
// Query templates for comprehensive company research
function buildSearchQueries(companyName: string): string[] {
  return [
    // 1. 회사 기본 정보 (업종, 규모, 실존 확인)
    `"${companyName}" 회사 소개`,
    `"${companyName}" 사업자등록`,
    
    // 2. 주요 상품/서비스
    `"${companyName}" 제품 서비스`,
    
    // 3. 마케팅 활동
    `"${companyName}" 인스타그램 OR 블로그 OR 유튜브 OR 마케팅`,
    
    // 4. 최근 뉴스/동향
    `"${companyName}" site:news.naver.com OR site:news.google.com`,
  ];
}
```

**Structured result schema:**
```typescript
const MarketResearchResultSchema = z.object({
  companyName: z.string(),
  verified: z.boolean(),             // 실존 확인 여부
  industry: z.string().optional(),   // 업종
  mainProducts: z.array(z.string()), // 주요 상품/서비스
  companySize: z.string().optional(), // 규모 (스타트업/중소/대기업 등)
  marketingActivity: z.object({
    instagram: z.string().optional(),
    blog: z.string().optional(),
    youtube: z.string().optional(),
    advertising: z.string().optional(),
    other: z.string().optional(),
  }),
  websiteUrl: z.string().optional(),
  recentNews: z.array(z.string()).optional(),
  rawNotes: z.string(),             // 구조화 전 원본 노트
  researchedAt: z.string(),         // ISO date
});
```

### Pattern 4: Email Composition Pipeline (End-to-End)

**What:** 분류 → 조사 → 섹션 로드 → 작성 → 안전 검사 → 드래프트의 6단계 파이프라인. [VERIFIED: codebase + CONTEXT.md decisions]

```typescript
// Workflow A: 신규 문의 → 1차 이메일
async function workflowA(input: InquiryInput): Promise<WorkflowResult> {
  // Step 1: Classify the inquiry (SECTION 11)
  const classification = await classifyInquiry(input);
  
  // Step 2: Research the company (WebSearch)
  const research = await researchCompany(input.companyName);
  
  // Step 3: Check/create client in DB
  const client = await ensureClient(input.companyName, research);
  
  // Step 4: Load relevant v4 ULTRA sections
  const promptSections = loadSections(
    getSectionsForClassification(classification)
  );
  
  // Step 5: Get service recommendations if applicable
  const recommendations = client.budgetTier && client.industry
    ? serviceQueries.getRecommendationsByTierAndIndustry(client.budgetTier, client.industry)
    : [];
  
  // Step 6: Compose email via Claude API
  const emailDraft = await composeEmail({
    classification,
    research,
    client,
    recommendations,
    promptSections,
    inquiryContext: input.emailBody,
  });
  
  // Step 7: Run safety checks
  const sanitized = sanitizeForGmail(emailDraft.htmlBody);
  const contaminationCheck = validateNoContamination(sanitized, input.companyName, allCompanies);
  const priceCheck = validatePrices(sanitized, serviceQueries);
  const qualityCheck = await validateQualityChecklist(sanitized, classification);
  
  // Step 8: Create Gmail draft
  if (contaminationCheck.safe && qualityCheck.passed) {
    const draft = await createGmailDraft({
      to: input.recipientEmail,
      cc: ['PM@puzl.co.kr', 'leader@puzl.co.kr'],
      subject: emailDraft.subject,
      htmlBody: sanitized,
      threadId: input.threadId, // null for new thread
    });
    
    // Step 9: Update pipeline
    addDeal({
      companyName: input.companyName,
      contactName: input.contactName,
      stage: 'PROSPECT',
      lastActionDate: new Date().toISOString().split('T')[0],
      emailThreadId: draft.threadId,
    });
    
    return { success: true, draftId: draft.id, warnings: priceCheck.warnings };
  }
  
  return { success: false, errors: [...contaminationCheck.contaminations, ...qualityCheck.failures] };
}
```

### Pattern 5: Gmail MCP Draft Creation

**What:** Gmail MCP 도구를 사용한 HTML 드래프트 생성. [VERIFIED: CONTEXT.md D-06, D-08]

```typescript
// Gmail MCP tool call pattern
// Tool name: gmail_create_draft (from CONTEXT.md code_context)
interface GmailDraftParams {
  to: string[];
  cc: string[];        // 필수: ['PM@puzl.co.kr', 'leader@puzl.co.kr']
  subject: string;
  body: string;        // HTML content
  threadId?: string;   // 기존 스레드 답장 시 필수
  isHtml?: boolean;    // true
}

// Fixed signature HTML block (never AI-generated)
const SIGNATURE_HTML = `
<p>감사합니다.</p>
<br>
<p>퍼즐코퍼레이션</p>
<p>최 영 록</p>
<p>드림.</p>
`;

// Fixed introduction links HTML block
const INTRO_LINKS_HTML = `
<p>● <a href="https://featpaper.com/v/VfX2kIoM">회사 소개서</a></p>
<p>● <a href="https://featpaper.com/v/4H1Jxn">UGC/바이럴 마케팅 소개서</a></p>
<p>● <a href="https://featpaper.com/v/j0XXxA0n">콘텐츠팀 소개서</a></p>
`;
```

### Anti-Patterns to Avoid
- **Monolithic prompt loading:** Loading all 1187 lines of v4 ULTRA into every request. Use selective section loader (Pattern 1). [VERIFIED: ARCHITECTURE.md Anti-Pattern 1]
- **AI-generated signature:** The signature block (`감사합니다. / 퍼즐코퍼레이션 / 최 영 록 / 드림.`) must be a fixed HTML template, never generated by AI. [VERIFIED: PITFALLS.md Integration Gotchas]
- **Missing CC validation:** Every draft must include CC. Build a pre-send validator that rejects drafts without CC. [VERIFIED: PITFALLS.md "Looks Done But Isn't"]
- **Loading multiple client contexts:** Only load target client's data via loadClientContext(). Never query multiple clients simultaneously. [VERIFIED: cross-contamination.ts design]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gmail 인코딩 치환 | 자체 인코딩 로직 | `gmail-sanitizer.ts` (Phase 1) | 14개 위험 문자 이미 매핑 완료 |
| 교차 오염 검증 | 자체 검증 | `cross-contamination.ts` (Phase 1) | DI 패턴 + 단일 클라이언트 격리 이미 구현 |
| 가격 추출/검증 | 자체 파서 | `price-validator.ts` (Phase 1) | 한국어 금액 패턴 4종(억/만원/콤마/단순) 이미 구현 |
| 파이프라인 CRUD | 자체 상태 관리 | `pipeline.ts` (Phase 1) | Zod 검증 + atomic write 이미 구현 |
| 클라이언트 DB CRUD | 자체 DB 로직 | `clients.ts` (Phase 1) | upsertClient + 교차 오염 방지 설계 |
| 서비스 추천 조회 | 자체 매트릭스 | `services.ts` (Phase 1) | tier + industry 필터링 이미 구현 |

**Key insight:** Phase 1에서 구축한 모든 모듈이 DI 패턴(팩토리 함수)으로 설계되어 있어, Phase 2에서 그대로 import하여 사용할 수 있다. 새로 만들어야 할 것은 워크플로우 오케스트레이션 코드뿐이다.

## Common Pitfalls

### Pitfall 1: 전체 v4 ULTRA 로드로 토큰 폭발
**What goes wrong:** 1187줄 전체를 시스템 프롬프트에 넣으면 ~17,800 tokens 소모. 시장조사 결과 + 클라이언트 데이터 + 이메일 본문까지 합치면 input tokens이 과도하게 증가.
**Why it happens:** 선택적 로딩 구현이 번거로워 전체 파일을 읽는 유혹.
**How to avoid:** Pattern 1의 섹션 로더를 Wave 0에서 먼저 구현. 라인 번호 기반 추출로 정확한 섹션만 로드.
**Warning signs:** Claude API 호출당 비용이 예상보다 3-4배 높음.

### Pitfall 2: Gmail HTML에서 구조화 기호 깨짐
**What goes wrong:** `└`, `→` 등이 Gmail에서 깨져서 `◆◆`나 `?`로 표시됨. [VERIFIED: gmail-sanitizer.ts + PITFALLS.md Pitfall 4]
**Why it happens:** UTF-8 확장 문자의 Gmail HTML 렌더링 불일치.
**How to avoid:** `sanitizeForGmail()` 를 드래프트 생성 직전에 반드시 호출. SAFE_CHARS(■●◎※★①②③✅)만 허용.
**Warning signs:** 드래프트에 `└`, `→`, `─`, `│` 등 박스 드로잉 문자가 포함됨.

### Pitfall 3: 시장조사 결과가 빈약하거나 잘못된 회사 정보
**What goes wrong:** WebSearch가 동명이인 회사를 반환하거나, 폐업한 회사 정보를 반환하거나, 결과가 너무 적음.
**Why it happens:** 한국 회사명은 동명이 많음 (예: "퍼즐" → 여러 회사). 영문명만으로 검색하면 한국 회사가 안 잡힘.
**How to avoid:** 검색 쿼리에 업종/지역/대표자명 등 추가 컨텍스트 포함. 최소 2개 이상 검색 결과가 일치해야 "verified" 판정. 결과가 불충분하면 `verified: false`로 표시하고 대표님에게 알림. [ASSUMED]
**Warning signs:** MarketResearchResult.verified가 false인데 이메일에 회사 정보를 확정적으로 언급.

### Pitfall 4: threadId 누락으로 스레드 분리
**What goes wrong:** 기존 문의 이메일에 답장하는데 threadId를 지정하지 않아 새 스레드가 생성됨. 클라이언트 입장에서 대화 맥락이 끊김. [VERIFIED: PITFALLS.md Pitfall 6 + Integration Gotchas]
**Why it happens:** Gmail MCP에서 이메일을 읽을 때 threadId를 추출하는 단계를 빠뜨림.
**How to avoid:** 이메일 읽기 단계에서 threadId를 항상 추출하여 파이프라인 컨텍스트에 포함. 신규 문의인 경우 명시적으로 `threadId: undefined`로 설정.
**Warning signs:** 같은 클라이언트에 대해 Gmail에서 여러 스레드가 존재.

### Pitfall 5: 품질 체크리스트 검증 우회
**What goes wrong:** 이메일 작성 후 SECTION 20의 11개 체크 항목을 건너뛰고 바로 드래프트 생성.
**Why it happens:** 검증 로직이 선택적이거나, 실패 시 재생성 루프가 없음.
**How to avoid:** `validateQualityChecklist()`를 `createGmailDraft()` 전에 필수 게이트로 배치. 실패 시 최대 2회 재생성 시도 후 대표님에게 수동 확인 요청.
**Warning signs:** 서명 누락, 인사 형식 불일치, 다음 액션 미제시 등이 발송된 이메일에서 발견됨.

## Code Examples

### Example 1: Quality Checklist Validator
```typescript
// Source: SECTION 20 analysis + existing safety module patterns
interface QualityCheckResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export function validateQualityChecklist(
  htmlBody: string,
  subject: string,
  classification: ClassificationResult,
): QualityCheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  
  // 1. 인사가 2줄 고정인가?
  // 2. 오프닝에 감사 인사가 있는가?
  // 3. 상대방 이름/직함이 정확한가? (requires context)
  // 4. 회사명이 정확한가? (requires context)
  
  // 5. 서명 체크
  const signaturePattern = /감사합니다[\s\S]*퍼즐코퍼레이션[\s\S]*최\s*영\s*록[\s\S]*드림\./;
  if (!signaturePattern.test(htmlBody)) {
    failures.push('서명이 누락되었거나 형식이 틀렸습니다');
  }
  
  // 6. 다음 액션이 명확한가?
  const actionKeywords = ['문의주시면', '전달해주세요', '확인해주시면', '미팅', '통화', '컨펌', '검토'];
  const hasAction = actionKeywords.some(kw => htmlBody.includes(kw));
  if (!hasAction) {
    failures.push('다음 액션이 명확하지 않습니다');
  }
  
  // 7. 구조화 기호 규칙
  if (htmlBody.includes('└') || htmlBody.includes('→')) {
    failures.push('위험 문자(└, →)가 포함되어 있습니다 — sanitizer를 적용하세요');
  }
  
  // 8. 금액 포함 시 경고
  if (/\d+만\s*원|\d{1,3}(,\d{3})+\s*원|\d+억/.test(htmlBody)) {
    warnings.push('⚠️ 금액 포함 — 반드시 확인해주세요');
  }
  
  // 9. 제목 형식 체크
  if (classification.strategy === 'A' && !subject.includes('[퍼즐/최영록]')) {
    warnings.push('제목에 [퍼즐/최영록] 프리픽스가 없습니다');
  }
  
  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
```

### Example 2: Market Research to Client DB Mapping
```typescript
// Source: clients.ts ClientInput type + D-17 decision
import type { ClientInput } from '../queries/clients.js';

export function researchToClientInput(
  research: MarketResearchResult,
  contactName?: string,
  contactEmail?: string,
): ClientInput {
  return {
    companyName: research.companyName,
    contactName: contactName ?? null,
    contactEmail: contactEmail ?? null,
    contactPhone: null,
    industry: research.industry ?? null,
    history: null,
    budgetPattern: null,
    budgetTier: null,
    preferredServices: null,
    notes: research.rawNotes,
    nextOpportunity: null,
    communicationStyle: null,
    stage: 'PROSPECT',
    lastContactDate: new Date().toISOString().split('T')[0],
  };
}
```

### Example 3: Fixed HTML Blocks (Never AI-Generated)
```typescript
// Source: SECTION 6 + 페르소나_분석.md section 6
// These are FIXED templates — AI fills the body, not the structural elements

export const EMAIL_SIGNATURE_HTML = `<br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>`;

export const INTRO_LINKS_HTML = `
<p>● <a href="https://featpaper.com/v/VfX2kIoM">회사 소개서</a></p>
<p>● <a href="https://featpaper.com/v/4H1Jxn">UGC/바이럴 마케팅 소개서</a></p>
<p>● <a href="https://featpaper.com/v/j0XXxA0n">콘텐츠팀 소개서</a></p>
`;

export const MANDATORY_CC = ['PM@puzl.co.kr', 'leader@puzl.co.kr'];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 전체 시스템 프롬프트 로드 | 선택적 섹션 로드 (D-04) | Phase 2 도입 | ~76% 토큰 절약 |
| 수동 이메일 작성 | AI 파이프라인 + 안전장치 | Phase 2 도입 | 1차 이메일 작성 자동화 |
| 시장조사 없이 일반 이메일 | 시장조사 기반 맞춤 이메일 | Phase 2 도입 | 회신 품질 확보 |
| JSON 파일 기반 지식베이스 | SQLite DB (Phase 1) + 시장조사 자동 저장 | Phase 1→2 전환 | 구조화된 데이터 관리 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WebSearch 한국어 쿼리에 큰따옴표 정확 검색이 효과적 | Pattern 3 (Market Research) | 검색 결과 부정확 → 잘못된 회사 정보로 이메일 작성 |
| A2 | Gmail MCP의 gmail_create_draft가 isHtml 파라미터를 지원 | Pattern 5 | HTML 형식 드래프트 생성 불가 → 대안 필요 |
| A3 | Claude API tool use로 시장조사 결과를 구조화된 JSON으로 받을 수 있음 | Pattern 3 | 비구조화된 텍스트만 반환 → 별도 파싱 필요 |
| A4 | @anthropic-ai/sdk 최신 버전이 tool use (function calling) 지원 | Standard Stack | SDK가 tool use 미지원 시 직접 API 호출 필요 |

## Open Questions

1. **Gmail MCP 도구의 정확한 파라미터 시그니처**
   - What we know: `gmail_create_draft`, `gmail_read_message`, `gmail_search_messages` 도구가 존재 (CONTEXT.md code_context)
   - What's unclear: 각 도구의 정확한 파라미터명 (특히 isHtml/content_type, threadId 파라미터명)
   - Recommendation: Phase 2 Wave 0에서 MCP 도구 스키마를 확인하는 탐색 테스트 수행. 또는 Claude Code 환경에서 MCP 서버 도구 목록 조회.

2. **시장조사 검색 결과의 품질과 깊이**
   - What we know: WebSearch tool이 존재하고 사용 가능
   - What's unclear: 한국 회사에 대한 WebSearch 결과의 커버리지와 정확도. 소규모 스타트업이나 비공개 회사는 정보가 부족할 수 있음.
   - Recommendation: 결과가 부족하면 `verified: false` + 대표님에게 추가 정보 요청. 실패해도 이메일은 생성 가능하도록 fallback 경로 구현.

3. **@anthropic-ai/sdk 설치 필요 여부**
   - What we know: package.json에 미설치. Claude Code 환경에서는 자체 Claude 호출이 가능할 수 있음.
   - What's unclear: 이 프로젝트가 Claude Code 내에서만 실행되는지, 독립 프로세스로 실행되는지.
   - Recommendation: Claude Code 환경 내에서 도구로 직접 호출하는 방식이면 SDK 불필요. 독립 스크립트라면 SDK 설치 필요. 구현 단계에서 확인.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RSCH-04 | 시장조사 결과 구조화 (Zod schema) | unit | `npx vitest run src/workflow/research.test.ts -t "structured"` | Wave 0 |
| EMAIL-02 | 4단계 분류 엔진 결과 | unit | `npx vitest run src/workflow/classify.test.ts` | Wave 0 |
| EMAIL-05 | 이메일 제목 형식 검증 | unit | `npx vitest run src/workflow/compose.test.ts -t "subject"` | Wave 0 |
| EMAIL-06 | 구조화 기호 규칙 검증 | unit | `npx vitest run src/workflow/quality-checker.test.ts -t "symbols"` | Wave 0 |
| EMAIL-07 | 서명 포함 검증 | unit | `npx vitest run src/workflow/quality-checker.test.ts -t "signature"` | Wave 0 |
| EMAIL-11 | 품질 체크리스트 11항목 | unit | `npx vitest run src/workflow/quality-checker.test.ts` | Wave 0 |
| APPR-03 | 금액 포함 시 경고 | unit | `npx vitest run src/workflow/quality-checker.test.ts -t "price"` | Wave 0 |
| FOUND-07 | 시장조사 → 클라이언트 DB 자동 저장 | integration | `npx vitest run src/workflow/research.test.ts -t "client-update"` | Wave 0 |
| EMAIL-08 | CC 자동 포함 검증 | unit | `npx vitest run src/workflow/draft-creator.test.ts -t "cc"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/workflow/classify.test.ts` -- 분류 엔진 단위 테스트
- [ ] `src/workflow/research.test.ts` -- 시장조사 결과 구조화 테스트
- [ ] `src/workflow/prompt-loader.test.ts` -- 섹션 로더 테스트
- [ ] `src/workflow/quality-checker.test.ts` -- 품질 체크리스트 테스트
- [ ] `src/workflow/compose.test.ts` -- 이메일 작성 테스트
- [ ] `src/workflow/draft-creator.test.ts` -- 드래프트 생성 테스트
- [ ] `src/types/` -- 공유 타입 정의 (테스트 아님, 인프라)

## Project Constraints (from CLAUDE.md)

- 대표님은 개발 비전문가 -- 기술 용어 사용 시 쉬운 말로 풀어서 설명
- 한국어 소통 기본, 영어 기술 용어는 괄호 설명 첨부
- 긍정적 자세 유지 ("안 됩니다" 대신 "이렇게 하면 가능합니다")
- 승인 필수 (v1): 모든 이메일은 대표님 승인 후 발송
- 톤/스타일 정합성: v4 ULTRA 프롬프트 규칙 100% 준수
- 보안: 클라이언트 간 내부 정보 교차 노출 금지, 경쟁사 단가 직접 언급 금지
- 슬랙 채널 규칙: #세일즈_통화요약 채널만 읽기
- CC 필수: 모든 이메일에 PM@puzl.co.kr, leader@puzl.co.kr CC 포함
- TDD RED-GREEN 개발 플로우 (Phase 1 패턴)
- DI 패턴 유지 (팩토리 함수로 테스트 용이성 확보)

## Sources

### Primary (HIGH confidence)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` - 22개 섹션 구조, 라인 번호, 이메일 규칙 전체 분석
- `system/페르소나_분석.md` - 한/영 이메일 스타일, 서명 형식, 톤 특성
- `docs/세일즈봇_운영매뉴얼.md` - Workflow A 정의
- `src/queries/clients.ts` - getClient, upsertClient API + ClientInput 타입
- `src/queries/services.ts` - getServiceByName, getRecommendationsByTierAndIndustry API
- `src/safety/cross-contamination.ts` - loadClientContext, validateNoContamination API
- `src/safety/price-validator.ts` - extractPricesFromText, validatePrices API
- `src/safety/gmail-sanitizer.ts` - sanitizeForGmail, SAFE_CHARS, UNSAFE_CHAR_MAP
- `src/state/pipeline.ts` - addDeal, getDealByCompany, stage enum
- `src/db/schema.ts` - clients, services, serviceRecommendations 테이블 스키마
- `.planning/research/STACK.md` - 기술 스택 결정
- `.planning/research/ARCHITECTURE.md` - 아키텍처 패턴
- `.planning/research/PITFALLS.md` - 7대 위험 요소

### Secondary (MEDIUM confidence)
- `package.json` - 설치된 패키지 버전 확인

### Tertiary (LOW confidence)
- WebSearch 한국어 쿼리 전략 -- 실제 결과 품질 미검증 [ASSUMED]
- Gmail MCP 정확한 파라미터 시그니처 -- 런타임 확인 필요 [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Phase 1 코드베이스와 STACK.md에서 모두 검증됨
- Architecture: HIGH -- 기존 모듈의 DI 패턴과 v4 ULTRA 구조가 명확함
- Pitfalls: HIGH -- PITFALLS.md + 실제 코드 분석에서 확인됨
- Gmail MCP integration: MEDIUM -- 도구명은 확인되었으나 정확한 파라미터는 런타임 확인 필요

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- 핵심 의존성이 프로젝트 내부 코드)
