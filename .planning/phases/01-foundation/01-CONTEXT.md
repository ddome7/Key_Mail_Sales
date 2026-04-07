# Phase 1: Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

모든 워크플로우의 기반이 되는 데이터 인프라와 안전장치를 구축한다. 클라이언트 정보를 안전하게 저장/조회하고, 서비스 단가를 정확히 관리하며, 이메일 품질 사고(교차 오염, 가격 환각, 인코딩 깨짐)를 예방하는 시스템을 만든다.

</domain>

<decisions>
## Implementation Decisions

### 데이터 저장 방식
- **D-01:** 마크다운 파일 기반 저장소를 사용한다. 기존 knowledge/ 구조(clients/, email_patterns/, market/, briefings/)를 그대로 활용하고, 여기에 services.md를 추가한다. SQLite/DB는 v1에서 도입하지 않는다.
  - 이유: 현재 Claude Code 세션 기반으로 동작하며, 대표님이 직접 파일을 열어보고 수정할 수 있어야 한다. 마크다운이 가장 접근성이 좋다.
  - 이유: 클라이언트 수가 50건 미만인 초기 단계에서 DB 인프라는 과잉 설계다.
- **D-02:** 클라이언트 파일 형식은 기존 지식베이스 설계(지식베이스_구조.md)의 구조를 따른다. 회사명/담당자/연락처/업종/히스토리/예산 패턴/선호 서비스/주의사항/다음 기회를 포함한다.
- **D-03:** 서비스 & 단가 DB는 knowledge/services.md 파일 하나에 17종 서비스 정보와 5단계 예산 티어를 구조화하여 저장한다. v4 ULTRA SECTION 2(서비스 유형)와 SECTION 12(서비스 추천 매트릭스)의 내용을 통합한다.

### 안전장치
- **D-04:** 교차 오염 방지는 "한 번에 하나의 클라이언트만 컨텍스트에 로드" 원칙을 적용한다. 이메일 작성 시 대상 클라이언트 파일만 읽고, 다른 클라이언트 파일은 절대 함께 로드하지 않는다.
- **D-05:** 가격 검증은 이메일 드래프트에 금액이 포함된 경우, services.md의 실제 단가 데이터와 대조하여 일치 여부를 확인한다. 불일치 시 "⚠️ 단가 확인 필요" 경고를 표시하고 대표님 확인을 요청한다.
- **D-06:** Gmail HTML 인코딩 안전은 기존 knowledge/email_patterns/실전_Gmail_인코딩_주의.md의 규칙을 적용한다. 위험 문자 목록(└, → 등)을 안전 문자(--, 하여/연계 등)로 자동 치환하는 함수를 만든다.

### 파이프라인 상태 추적
- **D-07:** 세일즈 파이프라인 상태는 state/pipeline.json 파일에 저장한다. 각 딜(거래)별로 고유 ID, 회사명, 현재 단계(PROSPECT/LEAD/CLIENT/RETENTION/DORMANT), 마지막 소통일, 다음 액션을 기록한다. v4 ULTRA SECTION 13의 5단계 생애주기를 그대로 적용한다.
- **D-08:** 세션 시작 시 pipeline.json을 읽어 현재 진행 중인 딜 목록을 파악한다. 팔로업 필요 건은 자동으로 감지하여 대표님에게 알린다.

### Claude's Discretion
- 파일 인코딩 및 포맷 세부사항
- 에러 핸들링 방식
- state/ 디렉토리 구조 세부 설계
- 유틸리티 함수 네이밍 컨벤션

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 서비스 & 단가 정보
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §2 — 17종 서비스 유형 상세 (단가, 프로세스, A/S 기준)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §12 — 서비스 추천 매트릭스 (5단계 예산 티어 × 7개 업종)
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §13 — 클라이언트 생애주기 5단계 (STAGE 1~5)

### 지식베이스 설계
- `docs/지식베이스_구조.md` — 5개 DB 구조, 클라이언트 파일 형식, 학습 루프 설계, 품질 관리 규칙
- `knowledge/clients/오아름_뷰티브랜드.md` — 클라이언트 파일 실제 예시

### 이메일 안전
- `knowledge/email_patterns/실전_Gmail_인코딩_주의.md` — Gmail HTML 인코딩 깨짐 방지 규칙
- `system/v4_ULTRA_SYSTEM_PROMPT.md` §6 — Gmail 실발송 형식 규칙 (HTML, CC, 특수문자)

### 운영 워크플로우
- `docs/세일즈봇_운영매뉴얼.md` — 현재 워크플로우 A/B/C 정의, 시스템 구성 현황

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `knowledge/` 디렉토리 구조가 이미 존재 (clients/, email_patterns/, market/, briefings/) — 그대로 활용
- `knowledge/clients/오아름_뷰티브랜드.md` — 클라이언트 파일 실제 샘플, 이 형식을 표준으로 채택
- `knowledge/email_patterns/실전_Gmail_인코딩_주의.md` — 인코딩 안전 규칙 이미 문서화

### Established Patterns
- 마크다운 기반 지식 저장 (knowledge/ 구조)
- v4 ULTRA 프롬프트의 구조화된 섹션 체계 (SECTION 1~22)
- 슬랙 통화요약 → 타임스탬프 기반 중복 방지 (이미 메모리에 저장)

### Integration Points
- Gmail MCP — 이메일 드래프트 생성 시 안전장치 함수 호출
- Slack MCP — 통화요약 읽기 시 state/pipeline.json 업데이트
- v4 ULTRA 프롬프트 — 서비스 매트릭스/생애주기 정보 참조

</code_context>

<specifics>
## Specific Ideas

- 대표님이 "너한테 맡길게"로 전체 위임 — 최선의 판단으로 결정
- 기존 knowledge/ 구조를 최대한 활용하여 새로운 학습 비용 최소화
- 마크다운 파일 기반으로 대표님이 직접 확인/수정 가능하게 유지

</specifics>

<deferred>
## Deferred Ideas

None — 논의가 Phase 1 범위 내에서 진행됨

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-07*
