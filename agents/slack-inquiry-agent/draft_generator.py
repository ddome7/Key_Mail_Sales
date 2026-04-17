"""
메일 초안 생성 (LLM: Gemini 2.5 Flash)
- generate_reply_draft: 문의 접수 → 답신 초안
- generate_first_contact_draft: 소개서 다운로드 → 첫 컨텍 초안
- generate_postcall_draft: 통화 후속 메일 초안
"""
import os
import time as _time
from dotenv import load_dotenv
from google import genai as _genai

load_dotenv()
_gemini_client = _genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
GEMINI_MODEL = 'gemini-3-pro-preview'

# 재시도 대상 HTTP 상태 코드
_RETRYABLE_STATUS_CODES = (429, 503)
_MAX_RETRIES = 3
_BASE_DELAY = 1  # 초 (지수 백오프: 1, 2, 4)


def _call_gemini(prompt: str) -> str:
    """Gemini API 호출 공통 함수 (지수 백오프 재시도 포함)

    429(Rate Limit) 또는 503(Unavailable) 오류 시 최대 3회 재시도.
    재시도 간격: 1초 → 2초 → 4초 (지수 백오프).
    3회 모두 실패하면 마지막 예외를 그대로 raise.
    """
    last_error = None
    for attempt in range(_MAX_RETRIES):
        try:
            response = _gemini_client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
            return response.text
        except Exception as e:
            last_error = e
            # 상태 코드 추출 시도 (google.api_core 예외 또는 HTTP 상태 코드 속성)
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
            # grpc 상태 코드인 경우 정수 변환 시도
            if status_code is not None:
                try:
                    status_code = int(status_code)
                except (ValueError, TypeError):
                    # grpc.StatusCode.UNAVAILABLE 등 → 문자열 비교
                    status_str = str(status_code).upper()
                    if 'UNAVAILABLE' in status_str or '503' in str(e):
                        status_code = 503
                    elif 'RESOURCE_EXHAUSTED' in status_str or '429' in str(e):
                        status_code = 429
                    else:
                        status_code = None

            # 에러 메시지에서 상태 코드 추출 폴백
            if status_code is None:
                err_msg = str(e)
                if '503' in err_msg or 'UNAVAILABLE' in err_msg.upper():
                    status_code = 503
                elif '429' in err_msg or 'RESOURCE_EXHAUSTED' in err_msg.upper():
                    status_code = 429

            if status_code not in _RETRYABLE_STATUS_CODES:
                raise  # 재시도 불가한 오류는 즉시 raise

            delay = _BASE_DELAY * (2 ** attempt)
            print(f"  [Gemini] {status_code} 오류, {delay}초 후 재시도 ({attempt + 1}/{_MAX_RETRIES})")
            _time.sleep(delay)

    # 모든 재시도 소진
    raise last_error

COMPANY_CONTEXT = """
## 회사 정보 (퍼즐코퍼레이션)
- 성과중심 그로스 마케팅 전문 에이전시. 설립 3년, 매출 90억, 직원 약 27명.
- 주요 서비스: 퍼포먼스 마케팅, UGC 마케팅, 콘텐츠 마케팅, 미디어 플래닝(퍼즐믹스)
- 틱톡 공식 마케팅 파트너. B2C/B2B/글로벌 다양한 클라이언트 보유.
- 주요 클라이언트: 버거킹, 밀리의서재, 비앤빛안과, 비즈넵 등

## 이주민 팀장 정보
- 직책: 퍼포먼스 마케팅 팀장 (마케팅 본부 | 퍼포먼스 2팀), Senior Manager
- 이메일: ljm@puzl.co.kr
- 주요 업무: 신규 수주 BD, 멀티채널 캠페인 운영 총괄, 매체 파트너 관리
- 주요 채널: 네이버·메타·틱톡·앱광고
"""

def _load_style_profile() -> str:
    """학습된 퍼즐 스타일 프로필 로드"""
    profile_path = os.path.join(os.path.dirname(__file__), 'puzl_style_profile.md')
    if os.path.exists(profile_path):
        with open(profile_path, encoding='utf-8') as f:
            return f.read()
    return ""

STYLE_GUIDE = """
## 이메일 작성 원칙
- 반드시 아래 퍼즐코퍼레이션 스타일 가이드를 따를 것
- 인사말은 반드시 "안녕하세요 :) [회사명] [이름]님" 패턴 사용
- 판단이 필요한 부분은 [확인 필요: 이유] 형태로 표시
- 반드시 마지막 줄은 "-이주민 배상-" 으로 끝낼 것
- 서명란, 연락처 등 일체 작성 금지
"""


def generate_reply_draft(inquiry_text: str, anthropic_client=None, company_research: str = '') -> tuple[str, str]:
    """문의 접수 → 답신 초안 생성"""
    style_profile = _load_style_profile()

    research_section = ''
    if company_research:
        research_section = f"""
## 광고주 사전 조사 결과
{company_research}
(위 내용을 메일 본문에 자연스럽게 녹여서, 우리가 이 회사에 대해 관심을 갖고 미리 살펴봤다는 인상을 줄 것. 억지스럽지 않게 1~2문장으로 자연스럽게 언급)
"""

    prompt = f"""당신은 퍼즐코퍼레이션 퍼포먼스 마케팅 팀장 이주민님의 이메일 분신입니다.
{COMPANY_CONTEXT}
{STYLE_GUIDE}

## 퍼즐코퍼레이션 학습된 스타일 가이드
{style_profile}
{research_section}

## 처리할 문의 내용 (리캐치 알럿)
{inquiry_text}

위 문의에 대한 1차 컨텍 메일 초안을 작성하세요.

## 1차 메일 작성 규칙
- 미팅 또는 일정 제안은 절대 포함하지 말 것 (2차 유선 컨텍 이후 단계)
- [확인 필요] 같은 내부 메모 표현은 절대 그대로 쓰지 말 것 — 대신 자연스러운 문장으로 녹일 것
- ** 마크다운 볼드 기호는 절대 사용하지 말 것
- 아래 구조를 반드시 지킬 것:

  1. 인사
  2. 문의 감사 인사 + "문의 주셔서 [광고주명] 브랜드에 대해 간략히 찾아봤고, [조사 결과 기반으로 어떤 브랜드인지 1~2줄]" — 조사 결과가 없으면 업종/서비스명 기반으로 짧게 언급
  3. 퍼즐코퍼레이션 간략 소개 (그로스 마케팅 에이전시, 주요 서비스, 대표 클라이언트)
  4. 문의 사항에 대한 상세 내용 (해당 채널/업종 관점에서 퍼즐이 어떻게 접근할 수 있는지 구체적으로)
  5. 맺음말 (담당자로서 직접 연락드리겠다는 내용)

- 포맷 규칙 (Gmail HTML로 출력):
  - 문장 하나 끝나면 반드시 <br> 줄바꿈
  - 단락 구분은 <br><br>
  - 아래 볼드 기준을 반드시 준수할 것:
    * <strong style="color:#1a73e8">파란 볼드</strong>: 퍼즐 서비스명(퍼포먼스 마케팅/UGC 마케팅/콘텐츠 마케팅 등), 예산 수치(월 OOO만원), 문의 종류 키워드(검색광고/IMC 등)
    * <strong>검정 볼드</strong>: 대표 클라이언트명(버거킹, 밀리의서재, 비앤빛안과, 비즈넵 등)
    * 볼드 금지: 인사말, 일반 문장, 맺음말
  - 섹션 구분이 필요하면 이모지(✅ 💡 등) 1~2개 사용 (과하지 않게)
  - 전체에서 이모지는 3개 이하로 제한
  - ** 기호 절대 사용 금지
  - 마크다운 문법 절대 사용 금지

- 제목은 새 제목으로 작성 ("Re:" 없이)
- HTML body만 출력할 것 (제목: / 본문: 구분은 유지)

아래 형식으로만 출력하세요:
제목: [제목]
본문:
[본문]"""

    return _parse_response(_call_gemini(prompt))


def generate_first_contact_draft(download_text: str, anthropic_client=None) -> tuple[str, str]:
    """소개서 다운로드 → 첫 컨텍 초안 생성"""
    style_profile = _load_style_profile()

    prompt = f"""당신은 퍼즐코퍼레이션 퍼포먼스 마케팅 팀장 이주민님의 이메일 분신입니다.
{COMPANY_CONTEXT}
{STYLE_GUIDE}

## 퍼즐코퍼레이션 학습된 스타일 가이드
{style_profile}

## 상황
아래 정보는 회사 소개서를 다운로드한 잠재 고객 정보입니다.
문의를 직접 하지 않았지만, 관심이 있어 소개서를 받아간 상태입니다.
{download_text}

이 잠재 고객에게 보내는 첫 컨텍 메일 초안을 작성하세요.
- 부담 없이 연락했음을 강조
- 퍼포먼스 마케팅에 관심이 있다면 짧게 이야기 나눠보자는 제안
- 강요하지 않고 가볍게
- 제목은 새 제목으로 작성

아래 형식으로만 출력하세요:
제목: [제목]
본문:
[본문]"""

    return _parse_response(_call_gemini(prompt))


def generate_postcall_draft(inquiry_text: str, call_notes: str, anthropic_client=None) -> tuple[str, str]:
    """통화 후속 메일 초안 생성 (2단계)"""
    style_profile = _load_style_profile()

    prompt = f"""당신은 퍼즐코퍼레이션 퍼포먼스 마케팅 팀장 이주민님의 이메일 분신입니다.
{COMPANY_CONTEXT}
{STYLE_GUIDE}

## 퍼즐코퍼레이션 학습된 스타일 가이드
{style_profile}

## 광고주 문의 정보 (리캐치 알럿 원본)
{inquiry_text}

## 유선 통화 내용 메모
{call_notes}

위 광고주와 유선 통화를 마친 직후 보내는 후속 메일 초안을 작성하세요.

## 통화 후속 메일 작성 규칙
- 통화 내용을 자연스럽게 정리하여 공유하는 형태
- 통화에서 논의된 핵심 내용(니즈, 예산, 희망 매체 등)을 간결하게 요약
- 다음 스텝(제안서 발송, 미팅 일정 등)을 제안하는 내용 포함
- [확인 필요] 같은 내부 메모 표현 절대 그대로 쓰지 말 것
- ** 마크다운 볼드 기호 절대 사용 금지
- 아래 구조를 반드시 지킬 것:

  1. 인사 + 통화 감사 인사
  2. 통화에서 확인된 주요 내용 요약 (광고주 니즈, 예산, 희망 매체 등)
  3. 퍼즐이 제안할 수 있는 방향 간략 언급
  4. 다음 스텝 제안 (제안서 or 미팅 일정)
  5. 맺음말

- 포맷 규칙 (Gmail HTML로 출력):
  - 문장 하나 끝나면 반드시 <br> 줄바꿈
  - 단락 구분은 <br><br>
  - <strong style="color:#1a73e8">파란 볼드</strong>: 핵심 수치(예산, CAC 목표 등), 매체명, 서비스명
  - <strong>검정 볼드</strong>: 대표 클라이언트명
  - 볼드 금지: 인사말, 일반 문장, 맺음말
  - 이모지는 전체 3개 이하
  - ** 기호 절대 사용 금지
  - 마크다운 문법 절대 사용 금지

- 제목은 새 제목으로 작성 ("Re:" 없이)
- HTML body만 출력할 것 (제목: / 본문: 구분은 유지)

아래 형식으로만 출력하세요:
제목: [제목]
본문:
[본문]"""

    _, body = _parse_response(_call_gemini(prompt))

    # 광고주명 추출해서 제목 고정
    import re
    company_name = '광고주'
    # 방법 1: *회사명:* 패턴 (리캐치 형식)
    m = re.search(r'회사명:\*?\s*\n?\s*(.+?)(?:\s*\*|\s*문의|\s*\n|\s*$)', inquiry_text)
    if m:
        company_name = m.group(1).strip()
    # 방법 2: *회사:* 패턴 (Growth X-Ray 형식)
    if company_name == '광고주':
        m2 = re.search(r'\*회사:\*\s*\n?\s*(.+?)(?:\s*\*|\s*\n)', inquiry_text)
        if m2:
            company_name = m2.group(1).strip()
    # 방법 3: *진단 대상:* 패턴 (브랜드명)
    if company_name == '광고주':
        m3 = re.search(r'진단 대상:\*?\s*\n?\s*(.+?)(?:\s*\*|\s*\n)', inquiry_text)
        if m3:
            company_name = m3.group(1).strip()
    subject = f"[{company_name}/퍼즐] 온라인 광고 문의에 대한 유선 소통 사항 전달의 건"

    return subject, body


def _parse_response(text: str) -> tuple[str, str]:
    text = text.strip()
    subject = ''
    body = ''

    for line in text.split('\n'):
        if line.strip().startswith('제목:'):
            subject = line.replace('제목:', '').strip()
            break

    if '본문:' in text:
        body = text.split('본문:', 1)[1].strip()
    else:
        body = text

    return subject, body
