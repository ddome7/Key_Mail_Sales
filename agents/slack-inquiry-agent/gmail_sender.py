"""Gmail 임시보관함에 초안 저장"""

import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import parseaddr

# CC 자동 포함 주소
CC_ADDRESSES = ['pm@puzl.co.kr', 'leader@puzl.co.kr']

# AI응대완료 라벨명
AI_DONE_LABEL = 'AI응대완료'


def _find_existing_draft(service, to: str, subject: str) -> dict | None:
    """동일 수신자 + 동일 제목의 초안이 이미 존재하는지 확인

    존재하면 draft_info dict를 반환, 없으면 None.
    Gmail API drafts.list는 검색 필터를 지원하지 않으므로,
    최근 초안 50개를 순회하며 헤더를 비교한다.
    """
    try:
        drafts_response = service.users().drafts().list(userId='me', maxResults=50).execute()
        drafts = drafts_response.get('drafts', [])
    except Exception:
        return None  # API 오류 시 중복 체크 스킵 (안전하게 진행)

    to_lower = to.lower().strip()
    subject_clean = subject.strip()

    for draft in drafts:
        try:
            detail = service.users().drafts().get(userId='me', id=draft['id'], format='metadata',
                                                   metadataHeaders=['To', 'Subject']).execute()
            headers = detail.get('message', {}).get('payload', {}).get('headers', [])
            draft_to = ''
            draft_subject = ''
            for h in headers:
                if h['name'].lower() == 'to':
                    draft_to = h['value'].lower().strip()
                elif h['name'].lower() == 'subject':
                    draft_subject = h['value'].strip()

            if to_lower in draft_to and draft_subject == subject_clean:
                return {
                    'draft_id': draft['id'],
                    'message_id': detail['message']['id'],
                    'to': to,
                    'subject': subject,
                }
        except Exception:
            continue  # 개별 초안 조회 실패는 무시

    return None


def create_gmail_draft(service, to: str, subject: str, body: str, thread_id: str = None) -> dict:
    """Gmail 임시보관함에 초안 저장 (CC 자동 포함, 중복 방지)"""
    _, email_addr = parseaddr(to)
    to = email_addr if email_addr else to

    # 중복 초안 체크: 동일 수신자 + 동일 제목이면 기존 초안 반환
    existing = _find_existing_draft(service, to, subject)
    if existing:
        print(f"  [중복 방지] 동일 초안 이미 존재 → 스킵 (수신자: {to}, 제목: {subject[:30]}...)")
        return existing

    # HTML body 처리: 이미 HTML이면 그대로, 아니면 변환
    if '<br>' in body or '<strong>' in body or '<span' in body:
        html_content = (
            f'<div dir="ltr" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;">'
            f'{body}</div>'
            '<div class="gmail_signature" data-smartmail="gmail_signature"></div>'
        )
        plain_body = body.replace('<br>', '\n').replace('<br/>', '\n')
        import re as _re
        plain_body = _re.sub(r'<[^>]+>', '', plain_body)
    else:
        html_content = (
            f'<div dir="ltr">{body.replace(chr(10), "<br>")}</div>'
            '<div class="gmail_signature" data-smartmail="gmail_signature"></div>'
        )
        plain_body = body

    msg = MIMEMultipart('alternative')
    msg['To'] = to
    msg['Cc'] = ', '.join(CC_ADDRESSES)
    msg['Subject'] = subject
    msg.attach(MIMEText(plain_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_content, 'html', 'utf-8'))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')

    draft_body = {'message': {'raw': raw}}
    if thread_id:
        draft_body['message']['threadId'] = thread_id

    draft = service.users().drafts().create(
        userId='me',
        body=draft_body
    ).execute()

    return {
        'draft_id': draft['id'],
        'message_id': draft['message']['id'],
        'to': to,
        'subject': subject,
    }


def get_or_create_label(service, label_name: str) -> str:
    """라벨 조회 또는 생성, ID 반환"""
    labels = service.users().labels().list(userId='me').execute().get('labels', [])
    for label in labels:
        if label['name'] == label_name:
            return label['id']

    # 없으면 생성
    new_label = service.users().labels().create(
        userId='me',
        body={'name': label_name, 'labelListVisibility': 'labelShow', 'messageListVisibility': 'show'}
    ).execute()
    return new_label['id']


def apply_label_if_sent(service, draft_info: dict, label_id: str) -> bool:
    """
    초안이 발송됐는지 확인하고, 발송됐으면 AI응대완료 라벨 부착
    반환값: True(라벨 부착 완료) / False(아직 미발송)
    """
    draft_id = draft_info['draft_id']

    # 초안이 아직 존재하는지 확인
    try:
        service.users().drafts().get(userId='me', id=draft_id).execute()
        return False  # 아직 임시보관함에 있음 = 미발송
    except Exception:
        pass  # 초안 없음 = 발송됐거나 삭제됨

    # 발송된 메일 검색 (제목 기반)
    try:
        query = f'in:sent subject:"{draft_info["subject"]}" to:{draft_info["to"]}'
        result = service.users().messages().list(userId='me', q=query, maxResults=1).execute()
        messages = result.get('messages', [])
        if messages:
            msg_id = messages[0]['id']
            service.users().messages().modify(
                userId='me',
                id=msg_id,
                body={'addLabelIds': [label_id]}
            ).execute()
            return True
    except Exception:
        pass

    return False
