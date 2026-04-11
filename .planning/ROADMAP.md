# Roadmap: PUZL Sales AI Bot

## Overview

대표님이 문의를 전달하면 봇이 시장조사부터 이메일 작성, 승인, 팔로업, 학습까지 자율적으로 처리하는 세일즈 어시스턴트를 구축한다. Phase 1에서 데이터 인프라와 안전장치를 세우고, Phase 2에서 신규 문의 워크플로우(시장조사 -> 이메일 -> 승인)를 완성하며, Phase 3에서 통화 후속 처리, Phase 4에서 팔로업 자동화, Phase 5에서 학습 루프를 추가하여 점진적으로 자율성을 높인다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - 클라이언트/서비스 DB, 파이프라인 상태 추적, 데이터 안전장치 구축 (completed 2026-04-07)
- [ ] **Phase 2: Workflow A (신규 문의 처리)** - 시장조사 -> 맞춤 이메일 작성 -> 승인 플로우까지 end-to-end 워크플로우
- [x] **Phase 3: Workflow B (통화 후속 처리)** - 슬랙 통화요약 읽기 -> 액션아이템 추출 -> 후속 이메일 생성
- [ ] **Phase 4: Workflow C (팔로업 자동화)** - 미응답 리마인드 케이던스 자동 실행 및 휴면 관리
- [ ] **Phase 5: Learning Loop (학습 루프)** - 이메일 패턴 학습, 수정 추적, 크로스셀 감지, 시장정보 축적

## Phase Details

### Phase 1: Foundation
**Goal**: 모든 워크플로우의 기반이 되는 데이터 인프라와 안전장치가 동작하여, 클라이언트 정보를 안전하게 저장/조회하고 이메일 품질 사고를 예방할 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. 클라이언트 정보(회사명/담당자/업종/예산/히스토리)를 저장하고 조회할 수 있다
  2. 17종 서비스와 5단계 예산 티어 정보를 조회하여 정확한 단가를 확인할 수 있다
  3. A사 이메일 작성 시 B사의 단가/내부전략이 절대 포함되지 않는다 (교차 오염 방지)
  4. Gmail 발송 시 특수문자(└, → 등)가 깨지지 않고 안전 문자로 치환된다
  5. 클라이언트의 파이프라인 상태(문의접수~휴면)가 세션 간 유지된다
**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-PLAN.md — 프로젝트 초기화, SQLite DB 스키마, 클라이언트/서비스 쿼리 함수
- [x] 01-02-PLAN.md — 안전장치 (교차 오염 방지, 가격 검증, Gmail 인코딩 치환)
- [x] 01-03-PLAN.md — 파이프라인 상태 관리 (JSON 기반 딜 추적, 세션 로더)

### Phase 2: Workflow A (신규 문의 처리)
**Goal**: 대표님이 신규 문의를 전달하면 봇이 시장조사 -> 맞춤 1차 이메일 작성 -> 승인까지 end-to-end로 처리하여, 대표님은 최종 확인만 하면 된다
**Depends on**: Phase 1
**Requirements**: FOUND-07, RSCH-01, RSCH-02, RSCH-03, RSCH-04, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06, EMAIL-07, EMAIL-08, EMAIL-09, EMAIL-10, EMAIL-11, APPR-01, APPR-02, APPR-03, OBJC-01, OBJC-02, OBJC-03
**Success Criteria** (what must be TRUE):
  1. 문의 회사의 업종/상품/마케팅 현황을 자동 조사하고 구조화된 리포트를 제공한다
  2. 시장조사 결과를 반영한 맞춤 1차 이메일이 v4 ULTRA 규칙(톤/구조/서명/제목형식)을 100% 준수하여 Gmail 임시저장에 생성된다
  3. 대표님이 수정 요청하면 반영된 새 드래프트가 생성되고, 금액 포함 시 HIGH 리스크 경고가 표시된다
  4. 매 소통 후 클라이언트 DB가 새 정보로 자동 업데이트된다
  5. 반론/거절 상황에서 플레이북이 자동 적용되고, 생애주기/예산에 맞는 서비스 믹스가 제안된다
**Plans:** 5 plans

Plans:
- [x] 02-01-PLAN.md — 공유 타입 정의 + v4 ULTRA 선택적 섹션 로더
- [x] 02-02-PLAN.md — 시장조사 파이프라인 + 클라이언트 DB 자동 업데이트
- [x] 02-03-PLAN.md — 분류 엔진 + 품질 체크리스트 + 반론 대응/생애주기/서비스 추천
- [x] 02-04-PLAN.md — 이메일 본문 조합 + Gmail MCP 드래프트 생성
- [x] 02-05-PLAN.md — Workflow A 오케스트레이터 (end-to-end 파이프라인)

### Phase 3: Workflow B (통화 후속 처리)
**Goal**: 대표님이 유선통화 후 슬랙에 올라온 통화요약을 봇이 읽고, 액션아이템을 추출하여 기존 스레드 맥락을 반영한 후속 이메일을 자동 생성한다
**Depends on**: Phase 2
**Requirements**: CALL-01, CALL-02, CALL-03, CALL-04
**Success Criteria** (what must be TRUE):
  1. 슬랙 #세일즈_통화요약 채널에서 새 메시지를 읽고 이미 처리한 메시지는 건너뛴다
  2. 클로바노트 텍스트에서 핵심 사항과 액션아이템이 구조화되어 추출된다
  3. 통화 내용 + 기존 이메일 스레드 맥락이 반영된 후속 이메일이 올바른 threadId로 생성된다
  4. 통화 브리핑이 briefings DB에 자동 저장된다
**Plans:** 5 plans

Plans:
- [x] 03-01-PLAN.md — Anthropic SDK 설치 + briefings/touchpoints DB 스키마 + 쿼리 모듈 + 슬랙 커서 + 픽스처
- [x] 03-02-PLAN.md — 익시오 파서 + 전화번호 정규화 + clients 쿼리 확장 + 3단계 클라이언트 매칭 상태 머신
- [x] 03-03-PLAN.md — call-analyzer (Claude tool_use 기반 통화 분석: 요약/액션/분위기)
- [x] 03-04-PLAN.md — Gmail 스레드 로더 + follow-up-composer (프롬프트 빌더 + 전략 선택 + subject 헬퍼)
- [x] 03-05-PLAN.md — runWorkflowB 오케스트레이터 + Workflow A 후방 호환 (touchpoint 기록)

### Phase 4: Workflow C (팔로업 자동화)
**Goal**: 이메일 발송 후 미응답 시 케이던스 규칙(Day 3/7/14/30)에 따라 자동으로 팔로업 드래프트가 생성되고, 30일 미응답 시 휴면 관리로 전환된다
**Depends on**: Phase 2
**Requirements**: FLLW-01, FLLW-02, FLLW-03, FLLW-04
**Success Criteria** (what must be TRUE):
  1. 미응답 시 Day 3/7/14/30에 맞춰 팔로업 드래프트가 자동 생성된다
  2. 상황별(제안서 후/계약서 후/미팅 후 등) 팔로업 변형이 올바르게 적용된다
  3. 팔로업 톤이 단계별(확인 -> 가치추가 -> 대안제시 -> 관계유지)로 자연스럽게 변화한다
  4. 30일 미응답 클라이언트가 자동으로 STAGE 5(Dormant)로 전환된다
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Learning Loop (학습 루프)
**Goal**: 매 소통의 성공/실패 패턴이 자동 축적되고, 대표님의 수정 습관을 학습하며, 크로스셀 기회와 시장정보를 자동 감지하여 봇의 품질이 지속적으로 개선된다
**Depends on**: Phase 2
**Requirements**: LRNG-01, LRNG-02, LRNG-03, LRNG-04
**Success Criteria** (what must be TRUE):
  1. 매 이메일 소통 후 성공/실패 패턴이 email_patterns DB에 자동 기록된다
  2. 대표님이 드래프트를 수정한 내용(edit delta)이 학습 신호로 저장되어 향후 드래프트에 반영된다
  3. 크로스셀/업셀 트리거 조건 충족 시 추가 서비스 제안 타이밍이 자동 감지된다
  4. 소통 과정에서 파악된 경쟁사/시장 정보가 market DB에 자동 축적된다
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete    | 2026-04-07 |
| 2. Workflow A | 0/5 | Planned | - |
| 3. Workflow B | 0/5 | Planned | - |
| 4. Workflow C | 0/0 | Not started | - |
| 5. Learning Loop | 0/0 | Not started | - |
