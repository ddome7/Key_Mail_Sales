---
status: pending
phase: 04-workflow-c
source: [04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md]
started: null
updated: 2026-04-12
verdict: null
---

# Phase 4 UAT — Workflow C 실운영 검증

**Date:** (미실행)
**Conducted by:** 대표님 + Claude Code 세션
**Status:** pending

---

## 사전 조건

- [ ] Gmail MCP: 연결 확인 (`mcp__claude_ai_Gmail__gmail_search_messages` 응답)
- [ ] DB 상태: `data/sales.db` 존재, `briefings` + `touchpoints` 테이블 정상
- [ ] DB 백업: `data/sales.db.backup-phase4-uat-{YYYYMMDDHHMMSS}` 생성 완료
- [ ] 테스트 대상 클라이언트 선정:
  - 회사명: {companyName}
  - 마지막 접점: {date}
  - 경과 일수: {days}일
  - 기존 touchpoints: {N}건
  - Stage: {stage}
  - followupPaused: false
- [ ] ANTHROPIC_API_KEY: (Claude Code 모드에서는 불필요)

---

## 시나리오 1 — 단건 성공 경로

### 실행 명령

```bash
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 1 --company {companyName}
```

### 기대 결과

- `runWorkflowCForClient('{companyName}', deps)` 호출
- status: `success`
- stage.ordinal: 1~3 중 하나
- draftId: 실제 Gmail 드래프트 ID
- touchpoints 테이블에 type='email_sent' + metadata.cadence 레코드 1건 추가

### 실제 결과

- status: [pending]
- 드래프트 ID: [pending]
- Stage: [pending]차 Day [pending] / [pending]
- dormantPending: [pending]
- Touchpoint 기록: [pending]
- 본문 톤 품질 (대표님 평가): [pending]
- 금기 표현: [pending]

### 검증 포인트

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | Gmail에 드래프트 실제 생성? | [pending] | |
| 2 | subject가 `Re: {원 subject}` 형식? | [pending] | Pitfall 4 |
| 3 | CC에 PM@puzl.co.kr, leader@puzl.co.kr 포함? | [pending] | CLAUDE.md 필수 |
| 4 | 본문 톤이 v4 ULTRA 15 해당 stage 수준? | [pending] | 대표님 주관 3/5+ |
| 5 | 금기 표현 0건? | [pending] | D-15 |
| 6 | touchpoints에 email_sent + cadence 메타데이터? | [pending] | |
| 7 | 교차 오염(다른 회사 정보 노출) 0건? | [pending] | |

### 발견된 이슈

[pending]

---

## 시나리오 2 — 금기 표현 주입 차단

### 실행 명령

```bash
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 2 --company {companyName}
```

### 기대 결과

- 의도적으로 "답장 안 주시면 제안을 철회하겠습니다" 포함 본문 주입
- status: `error`
- error 메시지에 "금지 표현 감지" 포함
- Gmail 드래프트 생성: 0건
- touchpoint 기록: 0건

### 실제 결과

- status: [pending]
- error 메시지: [pending]
- Gmail 드래프트 생성 여부: [pending]
- touchpoint 기록 여부: [pending]

### 검증 포인트

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | status가 'error'인가? | [pending] | |
| 2 | composeEmail 이전에 차단? | [pending] | forbidden-phrase-guard |
| 3 | Gmail 드래프트 미생성? | [pending] | |
| 4 | touchpoint 미기록? | [pending] | |

### 발견된 이슈

[pending]

---

## 시나리오 3 — isFinalTouch Dormant 확인 플로우

> 이 시나리오는 30일 이상 경과한 클라이언트가 있을 때만 실행 가능합니다.
> 적절한 테스트 대상이 없으면 skip 가능 (사유 기록 필수).

### 실행 명령

```bash
npx tsx scripts/_uat-workflow-c-dryrun.ts --scenario 3 --company {companyName}
```

### 사전 준비 (필요 시)

적절한 30일+ 경과 클라이언트가 없는 경우 임시 조작:

```sql
-- 백업 후 임시 업데이트 (UAT 전용)
UPDATE clients SET lastContactDate = '2026-03-01' WHERE companyName = '{companyName}';

-- UAT 완료 후 원복
UPDATE clients SET lastContactDate = '{원래값}' WHERE companyName = '{companyName}';
```

### 기대 결과

- status: `success`
- stage.isFinalTouch: `true`
- dormantPending: `true` (확인 전) 또는 `false` (confirm 후)
- `askCeoDormantConfirmation` 대화형 프롬프트 표시
  - "confirm" 응답 시: pipeline.yaml stage = 'DORMANT'
  - "keep_active" 응답 시: stage 유지, dormantPending=true

### 실제 결과

- status: [pending]
- isFinalTouch: [pending]
- dormantPending: [pending]
- 대화형 프롬프트 표시: [pending]
- 대표님 응답: [pending]
- pipeline.yaml stage 변경: [pending]
- 드래프트 본문 톤 ("관계 유지 전환"): [pending]

### 검증 포인트

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | askCeoDormantConfirmation 프롬프트 정상 표시? | [pending] | |
| 2 | "confirm" 시 DORMANT 전환? | [pending] | D-17/D-18 |
| 3 | "keep_active" 시 stage 유지? | [pending] | |
| 4 | 드래프트 본문이 "관계 유지" 톤? | [pending] | D-14 마지막 단계 |

### 발견된 이슈 / Skip 사유

[pending]

---

## RESEARCH 오픈 질문 응답

### #5 Gmail MCP ThreadMessage labelIds 필드

- **관찰 방법:** `[UAT observation]` 로그에 Gmail 응답 키 목록 출력
- **관찰 결과:** [pending]
- **labelIds 필드 존재:** [YES / NO — pending]
- **실제 응답 키 목록:** [pending — 민감 정보 마스킹 후 기록]
- **후속 조치:**
  - YES인 경우: 04-02 inbound-detector에 labelIds 우선 판정 추가 패치 검토
  - NO인 경우: 현재 from 도메인 판정 방식 유지

---

## 운영 DB 무결성 확인

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | 04-01 기준선 legacy 'email' touchpoint 카운트 유지? | [pending] | |
| 2 | 시나리오 1 신규 touchpoint = 정확히 1건? | [pending] | |
| 3 | 시나리오 2 touchpoint 추가 0건? | [pending] | |
| 4 | 시나리오 3 후 DB 상태 원복 완료? | [pending] | 임시 조작한 경우 |

---

## 수용 결정

- [ ] Phase 4 수용 (3 시나리오 모두 통과)
- [ ] 후속 패치 필요 (아래 목록)

### 후속 패치 필요 시

| # | 대상 | 설명 | 우선순위 |
|---|------|------|----------|
| - | - | - | - |

### FLLW-04 수용 기준 재해석 (D-17)

> ROADMAP 원문: "30일 미응답 클라이언트가 **자동으로** STAGE 5(Dormant)로 전환된다"
> 실제 구현 (D-17): "마지막 터치 드래프트 + **대표님 확인 후** 전환"
>
> UAT 시나리오 3은 이 재해석 기준으로 검증합니다. 완전 자동 전환이 아닌
> "대표님 확인 후 전환" 플로우가 정상 동작하면 FLLW-04 수용으로 판정합니다.

---

## 드래프트 삭제 로그

| 시나리오 | 드래프트 ID | 삭제 일시 | 확인자 |
|----------|------------|-----------|--------|
| 1 | [pending] | [pending] | 대표님 |
| 3 | [pending] | [pending] | 대표님 |

> 주의: 모든 UAT 드래프트는 검증 직후 Gmail 웹에서 수동 삭제.
> CLAUDE.md "승인 필수" 원칙 — 발송하지 않고 삭제합니다.

---

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0
