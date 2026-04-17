"""
문의 광고주 시장조사 모듈
- 회사명 + 이메일 도메인 기반으로 기본 정보 수집
- Gemini로 핵심 정보 요약
"""

import requests
import re
import os
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from google import genai as _genai

load_dotenv()
_gemini_client = _genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
GEMINI_MODEL = 'gemini-3-pro-preview'


HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
}


def research_company(company_name: str, email: str, anthropic_client=None) -> str:
    """회사 기본 정보 수집 후 요약 반환"""

    # 도메인 추출
    domain = _extract_domain(email)
    raw_text = ''

    # 1. 회사 홈페이지 크롤링 시도
    if domain and domain not in ['gmail.com', 'naver.com', 'kakao.com', 'daum.net']:
        raw_text += _fetch_website(f'https://{domain}')
        if not raw_text:
            raw_text += _fetch_website(f'http://{domain}')

    # 2. 네이버 검색 결과 크롤링
    raw_text += _search_naver(company_name)

    if not raw_text.strip():
        return f"{company_name}에 대한 정보를 수집하지 못했습니다."

    # Claude로 핵심 정보 요약
    return _summarize(company_name, raw_text, anthropic_client)


def _extract_domain(email: str) -> str:
    match = re.search(r'@([\w.-]+)', email)
    return match.group(1) if match else ''


def _fetch_website(url: str) -> str:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=5)
        soup = BeautifulSoup(resp.text, 'html.parser')
        # 불필요한 태그 제거
        for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
            tag.decompose()
        text = soup.get_text(separator=' ', strip=True)
        return text[:3000]
    except Exception:
        return ''


def _search_naver(company_name: str) -> str:
    try:
        url = f'https://search.naver.com/search.naver?query={requests.utils.quote(company_name)}'
        resp = requests.get(url, headers=HEADERS, timeout=5)
        soup = BeautifulSoup(resp.text, 'html.parser')
        # 지식iN, 블로그 등 텍스트 추출
        texts = []
        for tag in soup.find_all(['p', 'span', 'a'], limit=50):
            t = tag.get_text(strip=True)
            if len(t) > 20:
                texts.append(t)
        return ' '.join(texts[:30])
    except Exception:
        return ''


def _summarize(company_name: str, raw_text: str, anthropic_client=None) -> str:
    prompt = f"""아래는 '{company_name}'에 대해 수집한 웹 정보입니다.

{raw_text[:4000]}

퍼포먼스 마케팅 영업 담당자가 첫 컨텍 메일에 자연스럽게 녹일 수 있도록,
아래 항목을 2~3줄로 간결하게 요약해주세요:

- 회사가 무엇을 하는 곳인지 (주요 사업/서비스)
- 대략적인 규모나 특징 (있으면)
- 마케팅 관점에서 주목할 만한 점 또는 주요 경쟁사 현황 (있으면)

없는 정보는 억지로 만들지 말고 아는 것만 써주세요.
한국어로 2~3줄 이내."""

    response = _gemini_client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    return response.text.strip()
