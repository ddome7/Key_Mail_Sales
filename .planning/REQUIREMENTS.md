# Requirements: PUZL Sales AI Bot

**Defined:** 2026-04-07
**Core Value:** 대표님이 문의를 전달하면 봇이 시장조사 → 맞춤 이메일 → 팔로업까지 자율 처리, 대표님은 승인과 대면 소통에만 집중

## v1 Requirements

### Foundation (기반 인프라)

- [x] **FOUND-01**: 클라이언트 DB에 회사명/담당자/연락처/업종/히스토리/예산 패턴/선호 서비스/주의사항을 저장하고 조회할 수 있다
- [x] **FOUND-02**: 서비스 & 단가 DB에 17종 서비스 정보와 5단계 예산 티어(300만↓/300~700만/700~1500만/1500~3000만/3000만↑)를 저장하고 조회할 수 있다
- [x] **FOUND-03**: 이메일 작성 시 대상 클라이언트 외 다른 클라이언트의 정보(단가/내부전략)가 포함되지 않도록 교차 오염을 방지한다
- [x] **FOUND-04**: 이메일에 포함된 금액/단가가 서비스 DB의 실제 데이터와 일치하는지 자동 검증한다
- [x] **FOUND-05**: Gmail 발송 시 깨지는 특수문자(└, → 등)를 안전 문자로 자동 치환한다
- [x] **FOUND-06**: 세일즈 파이프라인 상태(문의접수/제안중/계약진행/운영중/휴면)를 추적하고 세션 간 유지한다
- [ ] **FOUND-07**: 매 소통 후 클라이언트 DB를 자동 업데이트한다 (새 정보, 단가 변경, 담당자 변경 등)

### Market Research (시장조사)

- [ ] **RSCH-01**: 문의 회사의 업종/주요 상품/서비스를 웹 검색으로 조사할 수 있다
- [ ] **RSCH-02**: 문의 회사가 실존하는 회사인지 확인할 수 있다
- [ ] **RSCH-03**: 문의 회사의 현재 마케팅 활동(SNS, 블로그, 광고 등)을 조사할 수 있다
- [ ] **RSCH-04**: 시장조사 결과를 구조화된 형태로 정리하여 이메일 작성에 활용할 수 있다

### Email Composition (이메일 작성)

- [ ] **EMAIL-01**: 신규 문의 시 시장조사 결과 + 문의 내용을 반영하여 맞춤 1차 이메일을 작성한다 (Workflow A)
- [x] **EMAIL-02**: v4 ULTRA 이메일 자동 분류 엔진(4단계 판단 트리)을 적용하여 상황에 맞는 전략(A~L)을 자동 선택한다
- [x] **EMAIL-03**: 톤 캘리브레이션 5단계를 상대방/상황에 맞게 자동 적용한다
- [x] **EMAIL-04**: 업종별 플레이북(F&B/뷰티/주류/IT/가구/해외)을 자동 적용한다
- [ ] **EMAIL-05**: 이메일 제목을 상황별 형식([퍼즐/최영록] [클라이언트] _ [내용] _ [YYMMDD])에 맞게 생성한다
- [x] **EMAIL-06**: 구조화 기호 규칙(■●★◎※)을 정확히 적용한다
- [x] **EMAIL-07**: 서명(감사합니다. / 퍼즐코퍼레이션 / 최 영 록 / 드림.)을 정확히 포함한다
- [ ] **EMAIL-08**: Gmail HTML 형식(text/html)으로 드래프트를 생성하고 CC(PM@puzl.co.kr, leader@puzl.co.kr)를 자동 포함한다
- [ ] **EMAIL-09**: 기존 이메일 스레드에 답장할 때 threadId를 정확히 지정한다
- [ ] **EMAIL-10**: 소개 자료 링크를 URL 텍스트 노출 없이 하이퍼링크로 처리한다
- [x] **EMAIL-11**: 발송 전 품질 체크리스트(SECTION 20) 11개 필수 항목을 자동 검증한다

### Call Processing (통화 처리)

- [ ] **CALL-01**: 슬랙 #세일즈_통화요약 채널에서 새 메시지를 읽을 수 있다 (이미 읽은 메시지 제외)
- [ ] **CALL-02**: 클로바노트 텍스트에서 핵심 사항/액션아이템을 구조화하여 추출한다
- [ ] **CALL-03**: 통화 내용 + 기존 이메일 스레드 맥락을 반영하여 후속 이메일을 작성한다 (Workflow B)
- [ ] **CALL-04**: 통화 브리핑을 briefings DB에 자동 저장한다

### Approval Flow (승인 플로우)

- [ ] **APPR-01**: 봇이 작성한 이메일 초안을 Gmail 임시저장으로 생성하여 대표님이 확인할 수 있다
- [ ] **APPR-02**: 대표님이 수정 요청 시 수정 사항을 반영하여 새 드래프트를 생성한다
- [ ] **APPR-03**: 이메일에 금액/견적이 포함된 경우 HIGH 리스크로 분류하여 반드시 수동 확인을 요청한다

### Follow-up (팔로업)

- [ ] **FLLW-01**: 이메일 발송 후 미응답 시 팔로업 케이던스(Day 3/7/14/30)에 따라 자동 팔로업 드래프트를 생성한다
- [ ] **FLLW-02**: 상황별 팔로업 변형(제안서 후/계약서 후/미팅 후/견적 수정 후/인플루언서)을 적용한다
- [ ] **FLLW-03**: 팔로업 톤 규칙(1차: 확인, 2차: 가치 추가, 3차: 대안 제시, 마지막: 관계 유지)을 적용한다
- [ ] **FLLW-04**: 30일 미응답 시 STAGE 5(Dormant) 관리로 자동 전환한다

### Learning (학습)

- [ ] **LRNG-01**: 매 이메일 소통 후 성공/실패 패턴을 email_patterns DB에 자동 축적한다
- [ ] **LRNG-02**: 대표님이 드래프트를 수정한 경우 수정 내용(edit delta)을 학습 신호로 기록한다
- [ ] **LRNG-03**: 크로스셀/업셀 트리거 매트릭스(SECTION 17)에 따라 추가 서비스 제안 타이밍을 자동 감지한다
- [ ] **LRNG-04**: 경쟁사/시장 정보를 소통 과정에서 자연스럽게 수집하여 market DB에 축적한다

### Objection Handling (반론 대응)

- [ ] **OBJC-01**: 반론/거절 대응 플레이북(5대 시나리오)을 상황에 맞게 자동 적용한다
- [ ] **OBJC-02**: 클라이언트 생애주기(STAGE 1~5)에 따라 이메일 톤과 전략을 자동 조절한다
- [ ] **OBJC-03**: 서비스 추천 매트릭스(예산 티어 + 업종)를 활용하여 최적 믹스안을 자동 제안한다

## v2 Requirements

### Document Hub (자료 허브)

- **DOC-01**: 견적서 자동 생성 — 예산 티어 + 업종별 매트릭스 기반
- **DOC-02**: 원페이지 제안서 자동 구성 — 캠페인 개요 + 믹스안
- **DOC-03**: 포트폴리오 자동 매칭 — 업종/서비스별 레퍼런스 검색
- **DOC-04**: 크리에이터 리스트업 자동 생성 — 업종/예산 맞춤

### Advanced Autonomy (자율화)

- **AUTO-01**: LOW 리스크 이메일 자율 발송 (승인 없이)
- **AUTO-02**: 선제적 시즌/트렌드 기반 클라이언트 제안
- **AUTO-03**: 멀티채널 문의 자동 수집 (이메일/폼/전화)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 음성 통화 직접 수행 | 현재 기술/신뢰도 한계, 대면 소통은 대표님 영역 |
| 대면 미팅 대체 | 인간적 유대가 핵심인 영역 |
| 계약서 법적 검토 | 법률 전문가 영역 |
| 경쟁사 비하 콘텐츠 생성 | 퍼즐 철학(경쟁사 깎아내리지 않음)에 위배 |
| 리드 스코어링 | 단일 사용자 규모에 과잉 설계 |
| 분석 대시보드 | v1에서는 불필요, 대표님이 직접 판단 |
| 챗봇 (고객 대면) | 세일즈 백오피스 지원이 목적, 고객 직접 대면 아님 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| FOUND-07 | Phase 2 | Pending |
| RSCH-01 | Phase 2 | Pending |
| RSCH-02 | Phase 2 | Pending |
| RSCH-03 | Phase 2 | Pending |
| RSCH-04 | Phase 2 | Pending |
| EMAIL-01 | Phase 2 | Pending |
| EMAIL-02 | Phase 2 | Complete |
| EMAIL-03 | Phase 2 | Complete |
| EMAIL-04 | Phase 2 | Complete |
| EMAIL-05 | Phase 2 | Pending |
| EMAIL-06 | Phase 2 | Complete |
| EMAIL-07 | Phase 2 | Complete |
| EMAIL-08 | Phase 2 | Pending |
| EMAIL-09 | Phase 2 | Pending |
| EMAIL-10 | Phase 2 | Pending |
| EMAIL-11 | Phase 2 | Complete |
| CALL-01 | Phase 3 | Pending |
| CALL-02 | Phase 3 | Pending |
| CALL-03 | Phase 3 | Pending |
| CALL-04 | Phase 3 | Pending |
| APPR-01 | Phase 2 | Pending |
| APPR-02 | Phase 2 | Pending |
| APPR-03 | Phase 2 | Pending |
| FLLW-01 | Phase 4 | Pending |
| FLLW-02 | Phase 4 | Pending |
| FLLW-03 | Phase 4 | Pending |
| FLLW-04 | Phase 4 | Pending |
| LRNG-01 | Phase 5 | Pending |
| LRNG-02 | Phase 5 | Pending |
| LRNG-03 | Phase 5 | Pending |
| LRNG-04 | Phase 5 | Pending |
| OBJC-01 | Phase 2 | Pending |
| OBJC-02 | Phase 2 | Pending |
| OBJC-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after initial definition*
