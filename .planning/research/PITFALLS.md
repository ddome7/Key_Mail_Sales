# Pitfalls Research

**Domain:** AI Sales Email Automation (CEO persona ghostwriting, real client communications)
**Researched:** 2026-04-06
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Client Data Cross-Contamination (Wrong Client Gets Wrong Info)

**What goes wrong:**
AI 가 클라이언트 A의 예산, 단가, 내부 전략 정보를 클라이언트 B에게 보내는 이메일에 삽입한다. 예: "샘표식품에 적용한 드랍 단가 30만원 특가"를 다른 클라이언트 이메일에 언급. 또는 오아름 뷰티브랜드의 캠페인 세부사항이 다른 뷰티 브랜드 이메일에 혼입.

**Why it happens:**
- LLM의 context window에 여러 클라이언트 DB 파일이 동시에 로드되면 정보가 뒤섞임
- 지식베이스(`/knowledge/clients/`) 검색 시 유사 업종 클라이언트 파일이 함께 잡힘
- 대표님 브리핑에서 비교 언급한 내용("A사처럼 해주면 돼")이 그대로 이메일에 반영됨
- PROJECT.md에 명시된 보안 원칙("클라이언트 간 내부 정보 교차 노출 금지")이 프롬프트 레벨에서 충분히 강제되지 않으면 발생

**How to avoid:**
- 이메일 작성 시 해당 클라이언트의 DB 파일만 context에 로드하는 격리 로직 구현
- 드래프트 생성 후 "다른 클라이언트 이름/단가/내부 정보 포함 여부" 자동 검증 단계 추가
- v4 ULTRA 프롬프트에 하드 룰 추가: "현재 수신자가 아닌 클라이언트의 이름, 단가, 캠페인 세부사항을 절대 언급하지 않는다"
- 경쟁사 단가 DB(`/knowledge/market/경쟁사_인텔.md`)는 이메일 생성 context에서 제외하고, 대응 논리만 참조

**Warning signs:**
- 이메일 드래프트에 현재 수신자가 아닌 회사명이 등장
- "장기 파트너 특가", "이전 캠페인에서"처럼 해당 클라이언트와 히스토리가 없는데 히스토리 언급
- 단가가 서비스 DB 기본 단가가 아닌 다른 클라이언트 특가 단가로 작성됨

**Phase to address:**
Phase 1 (핵심 워크플로우 구축) — 첫 이메일 발송 전에 반드시 해결. 한 번이라도 발생하면 클라이언트 신뢰 회복 불가.

---

### Pitfall 2: 단가/숫자 Hallucination (존재하지 않는 가격 제시)

**What goes wrong:**
AI가 서비스 DB에 없는 단가를 "자신있게" 생성한다. 예: 카페 바이럴 건당 6.5만원인데 "건당 5만원에 진행 가능합니다"로 작성. 또는 견적 총액 계산을 틀리거나, 존재하지 않는 패키지 할인을 제안.

**Why it happens:**
- LLM은 숫자 연산이 본질적으로 약함 — 30건 x 6.5만원 = 195만원을 180만원으로 계산 가능
- 서비스 DB에 단가 범위가 있을 때(건당 10~30만원), AI가 중간값을 "확정 단가"처럼 제시
- 대표님이 "좀 깎아줘도 돼"라고 브리핑하면, AI가 임의 할인율 적용
- 17종 서비스의 단가 체계가 복잡(메가드랍 40만원 vs 장기특가 30만원 등)하여 조건 없이 특가 적용

**How to avoid:**
- 단가/금액은 반드시 서비스 DB에서 정확히 참조하고, 연산 결과는 코드 레벨에서 계산
- 이메일에 금액이 포함되면 "금액 검증 플래그" 자동 활성화 — 대표님에게 별도 확인 요청
- v4 ULTRA 프롬프트에 룰 추가: "정확한 단가를 모르면 '별도 견적 안내드리겠습니다'로 대체. 절대 추정 단가를 제시하지 않는다"
- 견적 관련 이메일은 별도 템플릿으로 분리하여, 서비스 DB 참조 + 수동 계산 검증 필수

**Warning signs:**
- 드래프트에 구체적 금액이 포함된 경우 (모든 금액 포함 드래프트는 높은 위험)
- 서비스 DB에 없는 단가가 등장
- "~원 정도", "약 ~만원" 같은 추정 표현이 견적처럼 제시됨
- 할인 조건 없이 특가 단가가 적용됨

**Phase to address:**
Phase 1 — 서비스 DB(`/knowledge/services.md`) 완성 시점부터 검증 로직 구현. 잘못된 견적은 계약 분쟁으로 이어질 수 있음.

---

### Pitfall 3: 톤 언캐니밸리 (대표님 같으면서 대표님이 아닌 어색함)

**What goes wrong:**
페르소나 분석 문서의 스타일 요소(`:D`, `!!`, `드림.`, `얼마든지`)를 기계적으로 적용하여, 상황에 안 맞는 곳에서 과도한 열정을 보이거나, 민감한 상황에서 부적절하게 밝은 톤을 사용. 예: 클라이언트가 불만을 표현했는데 ":D 빠르게 해결해보겠습니다!!"로 응답.

**Why it happens:**
- 페르소나 분석이 "평균적 톤"을 캡처하지만, 상황별 톤 변화를 충분히 반영하지 못함
- v4 ULTRA의 톤 캘리브레이션 5단계(LEVEL 1~5)가 있지만, 상황 판단 자체를 AI가 틀릴 수 있음
- `:D`, `!!` 같은 표현의 사용 빈도를 과대평가하여 모든 이메일에 삽입
- 한영 병행 이메일에서 영문은 적절한데 한국어 톤이 어색하거나 그 반대

**How to avoid:**
- 톤 캘리브레이션 판단 근거를 드래프트와 함께 제시 ("이 이메일은 LEVEL 3으로 판단, 근거: ...")
- 페르소나 분석에 "이 표현을 쓰지 말아야 할 상황" 네거티브 룰 추가 (예: 클레임/불만 상황에서 `:D` 금지)
- 초기에는 대표님이 매 드래프트의 톤 적절성을 평가하고, 부적절 사례를 이메일 패턴 DB에 축적
- 한영 병행 이메일은 각각 독립적으로 톤 체크

**Warning signs:**
- 대표님이 드래프트 톤을 자주 수정하는 패턴 (수정률 추적 필요)
- 클라이언트의 감정 상태(불만, 긴급, 공식적 요청)와 드래프트 톤의 불일치
- `:D`나 `!!`가 문맥과 무관하게 삽입됨
- 마무리 인사("감사합니다. 최 영 록 드림.")가 빠지거나 변형됨

**Phase to address:**
Phase 1 (기본 워크플로우) + Phase 2 (학습 루프) — 톤 정확도는 실전 피드백 축적으로만 개선 가능. 초기에 톤 피드백 수집 체계를 빌드해야 함.

---

### Pitfall 4: Gmail HTML 인코딩 깨짐 (발송 후 깨진 문자)

**What goes wrong:**
발송된 이메일에서 특수문자가 깨져서 `◆◆`나 `?`로 표시됨. 이미 `└` → `◆◆` 사례가 실전에서 발견됨(`/knowledge/email_patterns/실전_Gmail_인코딩_주의.md`). 영문 이메일의 `―――`, `▸`, 이모지(`📊`) 등 페르소나 분석에 정의된 포맷 요소들이 수신 환경(Outlook, 모바일)에서 깨질 위험.

**Why it happens:**
- Gmail API가 UTF-8 확장 문자를 일관되게 처리하지 못하는 알려진 이슈
- 한국어 이메일의 인코딩 처리가 영문보다 복잡 (EUC-KR/UTF-8 혼용 환경)
- 수신자가 Outlook Korea 등 다른 이메일 클라이언트를 사용하면 렌더링 차이 발생
- 페르소나 분석의 영문 포맷(`📊`, `▸`, `═══`)이 모든 이메일 클라이언트에서 지원되지 않음

**How to avoid:**
- 안전한 문자 화이트리스트 관리: `■ ● ◎ ※ ★`는 확인됨, 나머지는 테스트 후 추가
- 드래프트 생성 후 "위험 문자 스캔" 자동화 — 화이트리스트에 없는 특수문자 경고
- 영문 이메일 포맷은 이모지 대신 텍스트 헤더로 대체 가능한 폴백 준비
- Gmail API 발송 시 `Content-Type: text/html; charset=utf-8` 명시적 설정
- 주요 수신 환경(Gmail, Outlook, Naver Mail, 모바일)에서 테스트 이메일 발송하여 렌더링 확인

**Warning signs:**
- 드래프트에 박스 드로잉 문자(`└ ┌ ─ │`), 화살표(`→ ← ↓`), 특수 구분선이 포함됨
- 발송 후 대표님이 "글자가 깨졌다" 피드백
- 영문 이메일의 이모지 섹션 헤더가 `?`로 표시됨

**Phase to address:**
Phase 1 — 첫 이메일 발송 전 안전 문자 셋 확정. 이후 발견되는 깨짐 사례는 즉시 이메일 패턴 DB에 추가.

---

### Pitfall 5: 팔로업 케이던스 오판 (너무 빠르거나, 너무 공격적이거나, 문맥 무시)

**What goes wrong:**
v4 ULTRA의 Day 0/3/7/14/30 팔로업 케이던스를 기계적으로 적용하여:
- 클라이언트가 "다음 주에 확인하겠다"고 했는데 Day 3에 리마인드 발송
- 클라이언트가 이미 다른 채널(전화/카카오톡)로 대표님과 소통 중인데 이메일로 팔로업
- 거절 의사를 우회적으로 표현한 건데 리마인드 계속 발송
- 공휴일/연휴 기간에 팔로업 발송

**Why it happens:**
- 팔로업 케이던스가 "마지막 이메일 발송일" 기준으로만 작동하고, 다른 채널 소통을 반영하지 못함
- 한국 비즈니스 문화의 완곡한 거절("검토 후 연락드리겠습니다" = 거절 가능성 높음)을 AI가 파악 못함
- 대표님이 이미 통화로 해결한 건을 봇이 모르고 팔로업 큐에 유지
- 클라이언트별 의사결정 속도 차이 미반영 (대기업: 2~4주, 스타트업: 2~3일)

**How to avoid:**
- 팔로업 발송 전 대표님 확인 필수 (v1에서는 자율 팔로업 금지)
- 클라이언트 DB에 "최근 소통 채널" 필드 추가 — 전화/미팅 기록도 반영
- 한국 비즈니스 거절 시그널 감지 룰 추가: "내부 검토", "시기상 어려울 수도", "예산 재편성 중" 등
- 팔로업 제안 시 근거 제시: "Day 7 팔로업 제안. 근거: 마지막 이메일 4/1, 응답 없음, 이전 소통 톤은 긍정적"
- 공휴일/연휴 캘린더 연동하여 부적절 시기 자동 제외

**Warning signs:**
- 같은 클라이언트에게 짧은 기간 내 여러 팔로업이 큐에 쌓임
- 대표님이 "이건 안 보내도 돼"라고 자주 취소
- 클라이언트가 팔로업에 부정적 반응

**Phase to address:**
Phase 1 (기본 팔로업) + Phase 2 (자동화 고도화) — v1에서는 모든 팔로업에 대표님 승인 필수. v2에서 자동 케이던스 로직 정교화.

---

### Pitfall 6: 이메일 스레드 맥락 단절 (기존 대화 흐름 무시한 답장)

**What goes wrong:**
Gmail 스레드의 이전 대화를 제대로 읽지 못하거나 무시하여:
- 클라이언트가 이미 답변한 질문을 다시 물어봄
- 이전 이메일에서 합의된 사항을 모르고 다른 제안을 함
- 스레드에서 다른 CC 참여자(PM, 팀장)가 보낸 메시지를 무시
- "지난번 말씀드린 것처럼"이라고 하면서 실제로는 말한 적 없는 내용 언급

**Why it happens:**
- Gmail API로 스레드를 읽을 때 모든 메시지를 context에 로드하면 window가 부족하거나 중간 메시지가 누락됨
- HTML 이메일의 인용(quoted) 부분 파싱 실패로 이전 대화 내용 인식 오류
- 스레드가 길어지면(10회 이상 왕복) 초기 맥락이 context에서 밀려남
- PM@puzl.co.kr이나 leader@puzl.co.kr이 보낸 중간 메시지를 봇이 인식하지 못함

**How to avoid:**
- 답장 생성 전 스레드 전체 요약을 먼저 생성 후, 요약 기반으로 답장 작성 (2-step 프로세스)
- 스레드 요약에 반드시 포함할 항목: 합의사항, 미결 질문, 마지막 요청, CC 참여자 발언
- 긴 스레드(5회+ 왕복)는 클라이언트 DB에 "진행 상황 요약" 자동 기록
- 답장 드래프트에 "이 답장이 참조한 이전 메시지" 메타데이터 표시

**Warning signs:**
- 드래프트가 이전 대화와 모순되는 내용 포함
- "앞서 말씀드린 것처럼" 표현이 포함되었는데, 실제 스레드에 해당 내용 없음
- 클라이언트 질문에 대한 답변이 누락됨

**Phase to address:**
Phase 1 — 워크플로우 B(유선통화 후 후속 이메일)와 워크플로우 A(신규 문의 답장)에서 스레드 파싱 로직 필수.

---

### Pitfall 7: 승인 플로우 병목 (대표님이 승인 못 하면 모든 것이 멈춤)

**What goes wrong:**
v1에서 모든 이메일이 대표님 승인 필수인데, 대표님이 미팅 중이거나 바쁘면:
- 긴급한 클라이언트 문의에 대한 회신이 수시간~하루 이상 지연
- 대표님의 세일즈 철학인 "속도"가 오히려 후퇴
- 동시에 여러 드래프트가 쌓이면 하나하나 확인하는 게 더 비효율적
- "빨리 봐야 하는 이메일" vs "내일 봐도 되는 이메일" 구분 없이 동일 대기열에 쌓임

**Why it happens:**
- 승인 플로우가 "전부 승인" vs "전부 자율" 이분법으로 설계됨
- 이메일 긴급도/리스크 레벨에 따른 차등 승인 체계가 없음
- 대표님에게 드래프트를 전달하는 채널(Slack? 직접 대화?)이 표준화되지 않음

**How to avoid:**
- 이메일을 3단계 리스크로 분류: HIGH(견적/단가/신규 클라이언트), MEDIUM(후속 이메일/자료 전달), LOW(팔로업 리마인드/감사 이메일)
- LOW 리스크 이메일은 v1에서도 "간이 승인" (대표님이 제목만 보고 승인/거부)
- 드래프트 전달 시 "핵심 포인트 3줄 요약 + 리스크 레벨 + 긴급도" 함께 제시
- 대표님이 1분 내에 승인/거부/수정 요청할 수 있는 간소화된 인터페이스

**Warning signs:**
- 미승인 드래프트가 3건 이상 쌓임
- 클라이언트 문의 후 24시간 내 회신 못함 (대표님의 속도 원칙 위반)
- 대표님이 "그냥 보내" 식으로 확인 없이 승인하기 시작

**Phase to address:**
Phase 1 — 승인 플로우 설계 시 반드시 긴급도/리스크 분류 체계 포함.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 클라이언트 DB 수동 관리 (자동 업데이트 없이) | 빠른 v1 출시 | 데이터 부정확성 누적, 30+ 클라이언트 시 관리 불가 | v1 MVP (10개 이하 클라이언트) |
| 서비스 DB를 시스템 프롬프트에 하드코딩 | 별도 DB 관리 불필요 | 단가 변경 시 프롬프트 전체 수정 필요, 버전 관리 어려움 | Never — 분리 설계 필수 |
| 모든 이메일에 동일 톤 레벨 적용 | 톤 판단 로직 생략 | 부적절 톤으로 클라이언트 관계 손상 | Never |
| 팔로업 케이던스 수동 추적 (스프레드시트) | 자동화 개발 비용 절약 | 10+ 클라이언트 시 누락 발생, 사람 실수 | v1 초기 (5개 이하 활성 딜) |
| 이메일 패턴 학습 없이 v4 ULTRA만 사용 | 학습 시스템 개발 생략 | LEVEL 2 이상으로 성장 불가, 수정률 감소 안 됨 | v1 첫 1~2주 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gmail MCP (draft) | threadId 미지정으로 새 스레드로 답장 생성 | 반드시 원래 스레드의 threadId를 참조하여 같은 스레드에 답장 |
| Gmail MCP (CC) | CC 누락 (PM@puzl.co.kr, leader@puzl.co.kr) | 모든 발송 이메일에 CC 자동 삽입 로직 — 누락 시 발송 차단 |
| Gmail MCP (encoding) | UTF-8 확장 문자를 그대로 HTML에 삽입 | 안전 문자 화이트리스트 기반, HTML entity 변환 또는 텍스트 대체 |
| Slack MCP (채널) | 다른 채널 조회 시도 | #세일즈_통화요약(C0AQYJ9GJHK)만 읽기, 채널 ID 하드코딩 |
| Slack MCP (브리핑) | 클로바노트 원문을 그대로 context에 넣어 토큰 낭비 | 핵심 발화/액션아이템만 추출 후 구조화하여 사용 |
| Gmail MCP (서명) | AI가 서명을 임의로 생성하거나 변형 | 서명은 고정 HTML 블록으로 분리, 절대 AI 생성 대상 아님 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| 클라이언트 A의 단가를 클라이언트 B 이메일에 포함 | 내부 단가 유출, 비교견적 악용, 클라이언트 신뢰 상실 | 이메일 생성 시 단일 클라이언트 context 격리 |
| 경쟁사 인텔 DB 정보를 클라이언트에 직접 언급 | "A사는 건당 4만원인데 저희는..." 식 비교 언급 금지 위반 | 경쟁사 인텔 DB는 이메일 생성 context에서 제외, 대응 논리만 간접 참조 |
| 대표님 브리핑 내 민감 정보 이메일 반영 | "다른 대행사 쓰고 있는데 불만족"을 이메일에 직접 언급하면 관계 훼손 | 브리핑 정보는 전략 수립에만 사용, 이메일 본문에 직접 인용 금지 |
| Gmail 접근 권한으로 비세일즈 이메일 접근 | 대표님 개인 메일, 내부 HR 메일 등 접근 가능 | 봇의 Gmail 접근 범위를 세일즈 관련 스레드로 제한 |

## UX Pitfalls (대표님 사용 경험)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 드래프트 확인에 Gmail 앱 진입 필요 | 대표님이 휴대폰으로 빠른 확인 어려움 | Slack DM으로 드래프트 요약 + 핵심 포인트 전달, Gmail은 최종 확인만 |
| 브리핑 포맷 강제 | 대표님이 자유롭게 던지는 스타일인데 포맷 맞추라고 하면 번거로움 | 운영매뉴얼에 이미 "포맷 안 지키셔도 됩니다" 명시됨 — 이 원칙 유지 필수 |
| 수정 피드백 반영이 느림 | "이거 이렇게 바꿔"했는데 다음에도 같은 실수 반복 | 피드백 즉시 이메일 패턴 DB에 기록 + v4 ULTRA 프롬프트 수정 반영 |
| 너무 많은 확인 요청 | 모든 사항에 대해 질문하면 대표님이 "차라리 내가 쓸게" 됨 | 질문은 핵심만, 판단 가능한 건 판단 후 근거와 함께 제시 |

## "Looks Done But Isn't" Checklist

- [ ] **이메일 드래프트:** CC(PM@puzl.co.kr, leader@puzl.co.kr)가 포함되었는지 확인 — 누락 매우 흔함
- [ ] **한영 병행 이메일:** 한국어/영문 양쪽 모두 포함되었는지, 내용이 일치하는지 확인
- [ ] **서명 블록:** 고정 서명이 정확히 삽입되었는지 (링크 4개 + 이름 + 직함 + 연락처)
- [ ] **스레드 답장:** threadId가 올바르게 지정되어 같은 스레드에 답장되는지 (새 메일로 가면 안 됨)
- [ ] **클라이언트 이름:** 담당자 이름, 회사명, 직급이 정확한지 (다른 클라이언트 정보 혼입 없는지)
- [ ] **날짜/요일:** 제안된 미팅 날짜의 요일이 실제로 맞는지 (AI가 요일을 자주 틀림)
- [ ] **첨부파일 언급:** "첨부드린 자료"라고 했는데 실제 첨부가 없는 경우 (MCP 한계)
- [ ] **인코딩 안전성:** 위험 특수문자(└, →, 박스드로잉) 미포함 확인
- [ ] **톤 적절성:** 상황(신규/팔로업/클레임 대응 등)에 맞는 톤 레벨인지
- [ ] **제목 형식:** 페르소나 분석의 제목 패턴(`[퍼즐/최영록] ...`)에 맞는지

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 클라이언트 정보 교차 오염 이메일 발송 | HIGH | 대표님이 직접 전화로 사과 + 해당 정보 어디서 왔는지 설명 + 보안 강화 약속. 재발 시 클라이언트 이탈 가능 |
| 잘못된 단가 이메일 발송 | HIGH | 즉시 정정 이메일 발송 + "확인 과정에서 오류" 설명. 이미 계약 진행 중이면 법적 리스크 발생 가능 |
| 톤 부적절 이메일 발송 | MEDIUM | 대표님이 후속 이메일/전화로 자연스럽게 톤 보정. 한두 번은 용서 가능하나 반복 시 신뢰도 하락 |
| Gmail 인코딩 깨진 이메일 발송 | LOW | 동일 내용 깨끗한 버전 재발송 + "화면 깨짐 죄송합니다" 한 줄. 비즈니스 영향 낮지만 프로페셔널리즘 저하 |
| 부적절 팔로업 발송 | MEDIUM | 대표님이 전화로 "팀에서 실수로 보냈다" 사과. 반복 시 스팸으로 인식될 위험 |
| 스레드 맥락 단절 답장 발송 | MEDIUM | 후속 이메일로 정정 + 정확한 맥락 반영 재답장. 프로페셔널리즘 저하 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 클라이언트 데이터 교차 오염 | Phase 1 (워크플로우 구축) | 드래프트에 수신자 외 클라이언트 정보 0건 — 자동 스캔 |
| 단가/숫자 Hallucination | Phase 1 (서비스 DB 구축) | 금액 포함 이메일 100% 대표님 수동 검증 + 서비스 DB 대조 |
| 톤 언캐니밸리 | Phase 1 + Phase 2 (학습 루프) | 대표님 수정률 추적, 월별 감소 추세 확인 |
| Gmail HTML 인코딩 | Phase 1 (첫 발송 전) | 안전 문자 화이트리스트 운영, 테스트 메일 렌더링 확인 |
| 팔로업 오판 | Phase 1 + Phase 2 | v1: 대표님 승인률 추적. v2: 자동 거절 시그널 감지 정확도 |
| 스레드 맥락 단절 | Phase 1 (워크플로우 A/B) | 답장 드래프트의 스레드 요약 정확도 대표님 평가 |
| 승인 플로우 병목 | Phase 1 (승인 체계) | 문의 접수 → 1차 회신 평균 소요 시간 추적 (목표: 2시간 이내) |

## Sources

- [AI Hallucinations Legal Risk in B2B Sales](https://www.influencers-time.com/ai-hallucinations-in-b2b-sales-managing-legal-risks-2025/) — hallucination liability
- [ISACA: Avoiding AI Pitfalls in 2026](https://www.isaca.org/resources/news-and-trends/isaca-now-blog/2025/avoiding-ai-pitfalls-in-2026-lessons-learned-from-top-2025-incidents) — organizational failures
- [Context Engineering: Why AI Agents Fail](https://inkeep.com/blog/context-engineering-why-agents-fail) — context contamination
- [AI Agent Failure Modes](https://www.mindstudio.ai/blog/ai-agent-failure-modes-reasoning-action-disconnect) — cross-contamination in multi-agent systems
- [Hidden Risks of Using AI for Email](https://www.futureofbeinghuman.com/p/the-hidden-risks-of-using-ai-for-email) — trust and authenticity erosion
- [Gmail API UTF-8 Issues](https://discuss.google.dev/t/gmail-api-html-message-with-utf-8-character-set-extended-characters/188232) — encoding bugs
- [Gmail API HTML/Plain Text Quirks](https://www.gmass.co/blog/gmail-api-html-plain-text-messages/) — draft format handling
- [How to Prevent LLM Hallucinations](https://www.voiceflow.com/blog/prevent-llm-hallucinations) — RAG and guardrails
- [LLM Hallucination Examples](https://www.evidentlyai.com/blog/llm-hallucination-examples) — real-world business impacts
- `/knowledge/email_patterns/실전_Gmail_인코딩_주의.md` — 프로젝트 자체 발견 사례
- `/system/페르소나_분석.md` — 톤/스타일 규칙 원본
- `/docs/지식베이스_구조.md` — DB 구조 및 보안 원칙

---
*Pitfalls research for: AI Sales Email Automation (CEO Persona Ghostwriting)*
*Researched: 2026-04-06*
