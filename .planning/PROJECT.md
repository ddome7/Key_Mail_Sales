# 최영록 세일즈봇 (PUZL Sales AI)

## What This Is

퍼즐코퍼레이션 CEO 최영록의 세일즈 분신 AI 시스템. 문의접수부터 이메일 소통, 시장조사, 자료 제작, 팔로업까지 사무적 세일즈 업무를 100% 지원하여, 대표님은 유선통화와 대면 미팅에만 집중할 수 있는 환경을 구축한다. 궁극적으로 휴대폰 하나로 세일즈가 가능한 환경을 만든다.

## Core Value

대표님이 문의를 전달하면, 봇이 시장조사 → 맞춤 이메일 작성 → 팔로업까지 자율적으로 처리하고, 대표님은 승인과 대면 소통에만 집중할 수 있어야 한다.

## Requirements

### Validated

- ✓ v4 ULTRA 시스템 프롬프트 완성 (508개 이메일 분석 + 22개 섹션) — existing
- ✓ Gmail MCP 연동 (cyr@puzl.co.kr, 드래프트 생성/발송) — existing
- ✓ Slack MCP 연동 (#세일즈_통화요약 채널 읽기) — existing
- ✓ 페르소나 분석 문서 (한/영 이메일 스타일, 서명, 톤) — existing
- ✓ 지식베이스 5개 DB 구조 설계 (clients, email_patterns, market, briefings, services) — existing
- ✓ 이메일 자동 분류 엔진 (4단계 판단 트리) — existing
- ✓ 서비스 추천 매트릭스 (5단계 예산 티어 + 7개 업종) — existing
- ✓ 클라이언트 생애주기 관리 (5단계 STAGE) — existing
- ✓ 반론/거절 대응 플레이북 (5대 시나리오) — existing
- ✓ 팔로업 케이던스 시스템 (Day 0/3/7/14/30) — existing
- ✓ 톤 캘리브레이션 5단계 — existing
- ✓ 크로스셀/업셀 트리거 매트릭스 — existing
- ✓ 업종별 플레이북 6종 — existing
- ✓ 제안서 이메일 구조 템플릿 — existing
- ✓ 발송 전 품질 체크리스트 — existing
- ✓ 학습 루프 시스템 설계 (5개 트리거) — existing
- ✓ 운영 매뉴얼 (워크플로우 A/B/C) — existing

### Active

**v1: 세일즈 어시스턴트 자동화**

- [ ] 문의접수 시 시장조사 자동화 — 문의 회사의 업종/상품/마케팅 현황/실존 여부 조사
- [ ] 시장조사 기반 맞춤 1차 이메일 컨택 — 시장조사 결과 + 문의 내용 반영한 유연한 이메일 생성
- [ ] 통화 녹음(슬랙) → 액션아이템 추출 자동화 — 클로바노트 텍스트에서 핵심 사항/액션 구조화
- [ ] 통화 후 후속 이메일 자동 생성 — 액션아이템 기반 + 기존 스레드 맥락 반영
- [ ] 미응답 리마인드 규칙 기반 재컨택 — 팔로업 케이던스(Day 3/7/14/30) 자동 실행
- [ ] 대표님 승인 플로우 — 봇이 초안 생성 → 대표님 확인/수정 → 발송 승인
- [ ] 클라이언트 DB 자동 업데이트 — 매 소통 후 히스토리/예산/선호 서비스 자동 기록
- [ ] 이메일 패턴 학습 — 성공/실패 패턴 자동 축적 및 적용
- [ ] v4 ULTRA 프롬프트 실전 통합 — 22개 섹션 전체를 실전 워크플로우에 연결

**v2: 자료 허브 & 생성 (이후 마일스톤)**

- [ ] 자료 허브 구축 — 견적서/제안서/포트폴리오/리스트업 레시피 저장소
- [ ] 견적서 자동 생성 — 예산 티어 + 업종별 매트릭스 기반 자동 견적
- [ ] 원페이지 제안서 생성 — 캠페인 개요 + 믹스안 자동 구성
- [ ] 포트폴리오 매칭 — 업종/서비스별 레퍼런스 자동 검색 및 전달
- [ ] 크리에이터 리스트업 샘플 — 업종/예산 맞춤 크리에이터 리스트 생성

**v3: 영업 스타일 학습 & 고도화 (이후 마일스톤)**

- [ ] 대표님 영업 스타일 딥러닝 — 통화/이메일 축적 데이터 기반 스타일 고도화
- [ ] 상황별 유연한 판단력 — 정형화되지 않은 상황에서 자율적 판단
- [ ] 대표님 수정률 0%에 근접 — 드래프트 품질 극대화

**v4: 자율 세일즈팀 (이후 마일스톤)**

- [ ] 자율 이메일 발송 — 승인 없이 자율 운영 (특정 조건 충족 시)
- [ ] 리드 파이프라인 관리 — 문의 → 제안 → 계약 전 과정 자동 추적
- [ ] 선제적 제안 — 시장 트렌드/시즌 기반 클라이언트에게 먼저 제안
- [ ] 멀티채널 자동 수집 — 이메일/폼/전화 등 문의 채널 자동 통합

### Out of Scope

- 음성 통화 직접 수행 — AI가 실제 전화를 거는 건 현재 기술/신뢰도 한계
- 대면 미팅 대체 — 대표님의 인간적 유대가 핵심인 영역
- 계약서 법적 검토 — 법률 전문가 영역, AI가 대체 불가
- 내부 팀 관리/HR — 세일즈 외부 소통에만 집중
- 경쟁사 비하/비교 멘트 자동 생성 — 퍼즐의 철학(경쟁사 깎아내리지 않음)에 위배

## Context

### 기존 시스템 현황
- **v4 ULTRA 시스템 프롬프트**: 508개 이메일 12개월 분석 + 대표님 직접 인터뷰 기반. 22개 섹션에 이메일 작성 규칙, 상황별 전략(A~L), 자동 분류 엔진, 서비스 추천 매트릭스, 생애주기 관리, 반론 대응, 팔로업 케이던스, 톤 캘리브레이션, 크로스셀 트리거, 업종별 플레이북, 품질 체크리스트까지 포함
- **지식베이스**: 5개 DB 구조 설계 완료 (clients, email_patterns, market, briefings, services). 현재 클라이언트 1건(오아름 뷰티브랜드), 이메일 패턴 1건(Gmail 인코딩 주의) 축적
- **MCP 연동**: Gmail(cyr@puzl.co.kr) + Slack(#세일즈_통화요약, C0AQYJ9GJHK) 연결 완료
- **운영 매뉴얼**: 워크플로우 A(신규문의→1차이메일), B(유선통화→후속이메일), C(팔로업) 정의

### 퍼즐코퍼레이션 서비스
17종 서비스 운영: 카페 바이럴, 커뮤니티 바이럴, 카페 모니터링, 드랍 캠페인(메가/웨이브), UGC 인플루언서, 블로그 체험단, 인스타 채널 대행, 퍼포먼스 DA, 라이브 커머스, 유튜브 크리에이터, 트위터 체험단, KOL/KOC, 웹예능 PPL, BTL, 수출바우처, OSMU, 파워페이지 확산

### 주요 클라이언트 레퍼런스
샘표식품, 라바짜, CJ올리브영, 현대카드, 골든블루, 케이스티파이, 에스쁘아, 라프텔, 네오젠 등

### 세일즈 철학
- KPI → 전략 → 견적 (절대 견적부터 던지지 않음)
- 속도/적극성/성실함/파트너십 지향/유연성
- 경쟁사 비하 금지, 퍼즐의 강점만 어필
- 못하는 건 없다. 상황에 따라 하지 않을 뿐

### 성장 단계 비전
- LEVEL 1 카피캣 (현재) → LEVEL 2 어시스턴트 → LEVEL 3 파트너 → LEVEL 4 분신
- 최종 목표: 대표님보다 방대한 클라이언트 히스토리 보유, 모든 업종/상황 최적화 자동 제안

## Constraints

- **MCP 도구 한계**: Gmail/Slack MCP로만 외부 소통 가능. 직접 웹 크롤링이나 전화는 불가
- **승인 필수 (v1)**: 모든 이메일은 대표님 승인 후 발송. 자율 발송은 v4 이후
- **톤/스타일 정합성**: v4 ULTRA 프롬프트의 톤 캘리브레이션, 구조화 기호 규칙, Gmail HTML 인코딩 규칙 100% 준수 필수
- **보안**: 클라이언트 간 내부 정보 교차 노출 금지, 경쟁사 단가 직접 언급 금지
- **슬랙 채널 규칙**: #세일즈_통화요약 채널만 읽기, 다른 채널 절대 조회 금지
- **CC 필수**: 모든 이메일에 PM@puzl.co.kr, leader@puzl.co.kr CC 포함

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v4 ULTRA를 기반 시스템으로 채택 | 508개 이메일 + 대표님 인터뷰 기반, 22개 섹션의 포괄적 규칙 체계 | ✓ Good |
| Gmail MCP + Slack MCP 조합 | 대표님의 실제 업무 도구와 직접 연동 | ✓ Good |
| 대표님이 문의 내용 직접 취합하여 전달 (v1) | 멀티채널 자동 수집은 복잡도 높아 v4로 이연 | — Pending |
| 시장조사를 1차 이메일 전에 수행 | 회신 품질을 높여 브랜드사 신뢰 확보 | — Pending |
| 자료 허브를 v2로 이연 | v1은 이메일 소통 자동화에 집중, 자료 제작은 규칙 미정립 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
