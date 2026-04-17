"""
문의 유형 분류 + 이메일/이름/회사명 추출
유형: performance / ugc / content / mixed / unknown

메시지 형식 예시:
  *문의 종류:* 퍼포먼스 마케팅
  *Customer Email:* <mailto:abc@company.com|abc@company.com>
  *Customer Name:* 홍길동
  *회사명:* (주)퍼즐코퍼레이션
"""

import re
import json


# 퍼포먼스 관련 키워드
PERFORMANCE_KEYWORDS = [
    '퍼포먼스', 'IMC', '통합 마케팅', '검색광고', '매체광고',
    '네이버광고', '메타광고', '틱톡광고', '앱광고', 'ROAS', 'CPA', 'CPC',
    '디지털광고', '퍼포먼스 마케팅', '광고 대행', '광고대행'
]

UGC_KEYWORDS = [
    'UGC', '바이럴', '체험단', '인플루언서', '커뮤니티', 'SNS 운영',
    '바이럴 마케팅', '카페', '블로그 마케팅'
]

CONTENT_KEYWORDS = [
    '콘텐츠', '영상 제작', '콘텐츠 마케팅', '영상마케팅', 'SNS 콘텐츠'
]


def classify_inquiry(text: str, anthropic_client=None) -> dict:
    """슬랙 메시지에서 문의 유형, 이메일, 이름, 회사명 추출"""

    # 이메일 추출: <mailto:abc@company.com|abc@company.com> 또는 일반 이메일
    email = ''
    mailto_match = re.search(r'<mailto:([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})\|', text)
    if mailto_match:
        email = mailto_match.group(1)
    else:
        plain_match = re.search(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', text)
        if plain_match:
            email = plain_match.group(0)

    # 이름 추출 (다음 필드 * 전까지)
    name = ''
    name_match = re.search(r'Customer Name:\*?\s*\n?(.*?)(?:\s*\*|\s*Customer Email)', text, re.DOTALL)
    if name_match:
        name = name_match.group(1).strip()

    # 회사명 추출 (다음 필드 * 전까지)
    company = ''
    company_match = re.search(r'회사명:\*?\s*\n?(.*?)(?:\s*\*|\s*문의)', text, re.DOTALL)
    if company_match:
        company = company_match.group(1).strip()

    # 문의 종류 필드 직접 추출
    inquiry_type_raw = ''
    type_match = re.search(r'문의 종류:\*?\s*\n?([^\n*]+)', text)
    if type_match:
        inquiry_type_raw = type_match.group(1).strip()

    # 유형 분류
    inquiry_type = _classify_type(inquiry_type_raw, text)

    return {
        'type': inquiry_type,
        'email': email,
        'name': name,
        'company': company,
        'inquiry_type_raw': inquiry_type_raw,
    }


def _classify_type(inquiry_type_raw: str, full_text: str) -> str:
    """문의 종류 필드 + 전체 텍스트 기반 분류"""
    source = (inquiry_type_raw + ' ' + full_text).lower()

    has_performance = any(kw.lower() in source for kw in PERFORMANCE_KEYWORDS)
    has_ugc = any(kw.lower() in source for kw in UGC_KEYWORDS)
    has_content = any(kw.lower() in source for kw in CONTENT_KEYWORDS)

    if has_performance and (has_ugc or has_content):
        return 'mixed'   # 퍼포먼스 + 다른 유형 복합
    elif has_performance:
        return 'performance'
    elif has_ugc:
        return 'ugc'
    elif has_content:
        return 'content'
    else:
        return 'unknown'
