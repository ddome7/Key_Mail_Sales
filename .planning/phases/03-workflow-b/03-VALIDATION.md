---
phase: 3
slug: workflow-b
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npm test -- src/workflow/ src/queries/ --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test scoped to modified file
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner during plan creation. Every task MUST map to at least one automated test or explicit manual verification.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CALL-01~04 | TBD | TBD | unit/integration | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/workflow/call-parser.test.ts` — 슬랙 메시지 파싱 테스트 (2가지 패턴)
- [ ] `src/workflow/client-matcher.test.ts` — 3단계 매칭 테스트 (전화번호/이름/확인)
- [ ] `src/workflow/call-analyzer.test.ts` — AI 분석 테스트 (mock 기반)
- [ ] `src/workflow/follow-up-composer.test.ts` — 후속 이메일 조합 테스트
- [ ] `src/workflow/thread-loader.test.ts` — Gmail 스레드 로딩 테스트
- [ ] `src/workflow/workflow-b.test.ts` — 통합 오케스트레이터 테스트
- [ ] `src/queries/touchpoints.test.ts` — 터치포인트 DB 테스트
- [ ] `src/queries/briefings.test.ts` — 브리핑 DB 테스트
- [ ] `src/queries/clients.test.ts` — 확장 검색 함수 테스트 (phone/email/fuzzy)
- [ ] `src/state/slack-cursor.test.ts` — 슬랙 마지막 읽음 커서 테스트
- [ ] `npm install @anthropic-ai/sdk` — Claude API 클라이언트 (Wave 0 필수)
- [ ] drizzle-kit migration 생성 — touchpoints, briefings 테이블 추가

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 슬랙 MCP에서 메시지 읽기 | CALL-01 | MCP 도구는 Mock이 불가능한 I/O | 1) 대표님이 "통화 정리해줘" 요청 → 2) 봇이 슬랙에서 새 메시지 가져옴 → 3) 최소 1개 이상 통화 요약 파싱 성공 |
| AI 분석 실제 품질 검증 | CALL-02 | Claude API는 통합 테스트로만 검증 가능 | 실제 통화 내용(동반성장위원회 4/8) 입력 → 핵심 요약 3줄 + 액션아이템 ≥ 2개 + 분위기 감지 확인 |
| Gmail 드래프트 실제 생성 | CALL-03 | Gmail MCP는 실제 API 호출 필요 | 드래프트 생성 후 Gmail에서 확인: CC 포함, threadId 유지, HTML 정상 |
| 대표님 확인 대화형 질문 | D-05 (매칭 실패) | 대화 UI는 E2E만 검증 가능 | 미등록 전화번호 통화 → 봇이 "이 통화 어느 회사 건인가요?" 질문 → 답변 후 DB 저장 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (no `--watch`, `--watchAll`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
