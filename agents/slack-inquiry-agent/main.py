import time
import os
import sys
import json
import shutil
import atexit
from datetime import datetime
from slack_sdk import WebClient
from dotenv import load_dotenv
import anthropic

if sys.platform == 'win32':
    # line_buffering=True → 줄 단위로 즉시 flush (백그라운드 리다이렉트 시 필수)
    sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
    sys.stderr.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)

from classifier import classify_inquiry
from draft_generator import generate_first_contact_draft, generate_reply_draft, generate_postcall_draft
from gmail_sender import create_gmail_draft, get_or_create_label, apply_label_if_sent, AI_DONE_LABEL
from auth import get_gmail_service
from research import research_company

load_dotenv()

CHECK_INTERVAL = 300       # 5분 주기
TRIGGER_EMOJI = '이주민출동'
PHASE2_TRIGGER_EMOJI = '키주민'
WORK_HOUR_START = 0        # 24시간 운영
WORK_HOUR_END = 24         # 24시간 운영
PROCESSED_FILE = 'processed_ts.json'  # 처리 기록 영구 저장
PID_FILE = 'agent.pid'                 # 중복 실행 방지용


def _is_pid_alive(pid: int) -> bool:
    """Windows/POSIX 공통 — 해당 PID가 살아있는지 확인"""
    if sys.platform == 'win32':
        import subprocess
        try:
            out = subprocess.check_output(
                ['tasklist', '/FI', f'PID eq {pid}'],
                stderr=subprocess.DEVNULL,
            ).decode('cp949', errors='replace')
            return str(pid) in out
        except Exception:
            return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def acquire_singleton_lock():
    """이미 돌고 있는 에이전트가 있으면 즉시 종료"""
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, encoding='utf-8') as f:
                old_pid = int(f.read().strip())
            if _is_pid_alive(old_pid):
                print(f"[SKIP] 이미 실행 중 (PID={old_pid}) — 이 인스턴스 종료")
                sys.exit(0)
        except Exception:
            pass  # 깨진 pid 파일은 무시하고 덮어씀
    with open(PID_FILE, 'w', encoding='utf-8') as f:
        f.write(str(os.getpid()))

    def _cleanup_pid():
        try:
            if os.path.exists(PID_FILE):
                with open(PID_FILE, encoding='utf-8') as f:
                    if f.read().strip() == str(os.getpid()):
                        os.remove(PID_FILE)
        except Exception:
            pass
    atexit.register(_cleanup_pid)

CHANNEL_IDS = {
    'inquiry': 'C096GK2L000',       # 1-리캐치-문의접수
    'download': 'C0973AFSFHN',      # 2-리캐치-회사소개서-다운로드
    'postcall': 'C0AU4P4K3AL',      # 주민_메일세일즈 (2단계: 통화 후속)
    'sales_test': 'C0AN77RP3UM',    # 퍼즐_세일즈테스트 (Growth X-Ray 상담 신청)
}


def is_work_hour() -> bool:
    return True  # 24시간 운영


def load_processed() -> set:
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, encoding='utf-8') as f:
            try:
                return set(json.load(f))
            except Exception:
                return set()
    return set()


def save_processed(processed: set):
    # 기존 파일과 merge (덮어쓰지 않고 추가)
    existing = load_processed()
    merged = existing | processed
    with open(PROCESSED_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(merged), f)


def _backup_processed_file():
    """시작 시 processed_ts.json을 백업 — 실수로 초기화되는 것을 방지"""
    if os.path.exists(PROCESSED_FILE):
        backup_path = PROCESSED_FILE.replace('.json', '.backup.json')
        try:
            shutil.copy2(PROCESSED_FILE, backup_path)
            print(f"  처리 기록 백업 완료 → {backup_path}")
        except Exception as e:
            print(f"  [경고] 처리 기록 백업 실패: {e}")


def main():
    acquire_singleton_lock()

    print("=" * 50)
    print("  슬랙 문의 자동화 에이전트 시작")
    print(f"  PID: {os.getpid()} | 시작 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    # 처리 기록 백업 (재시작 시 초기화 방지)
    _backup_processed_file()

    slack = WebClient(token=os.getenv('SLACK_BOT_TOKEN'))
    anthropic_client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    gmail_service = get_gmail_service()

    # AI응대완료 라벨 ID 확보
    ai_done_label_id = get_or_create_label(gmail_service, AI_DONE_LABEL)

    # 처리 기록 로드 (재시작해도 중복 처리 방지)
    processed = load_processed()

    # 발송 감지 대기 중인 초안 목록
    pending_drafts = []

    # 에이전트 시작 시점 기록 — 이 이후 메시지만 처리
    agent_start_ts = str(time.time())

    print(f"모니터링 시작")
    print(f"  → 운영 시간: 24시간 | 5분 간격")
    print(f"  → :{TRIGGER_EMOJI}: 이모지가 달린 메시지만 처리")
    print(f"  → 에이전트 시작 이후 신규 메시지만 처리 (기존 메시지 무시)")
    print(f"  → [1단계] 퍼포먼스 문의 → 시장조사 → Gmail 임시보관함")
    print(f"  → [2단계] :{PHASE2_TRIGGER_EMOJI}: 이모지 감지 → 통화 후속 메일 초안 → Gmail 임시보관함")
    print(f"  → 발송 시 '{AI_DONE_LABEL}' 라벨 자동 부착\n")

    while True:
        try:
            now = datetime.now()

            if not is_work_hour():
                print(f"[{now.strftime('%H:%M')}] 운영 시간 외 — 대기 중")
                time.sleep(CHECK_INTERVAL)
                continue

            print(f"[{now.strftime('%H:%M')}] 채널 확인 중...")

            # ── 1. 새 문의 처리 ──────────────────────────────
            for msg in fetch_triggered_messages(slack, CHANNEL_IDS['inquiry'], agent_start_ts):
                if msg['ts'] in processed:
                    continue
                processed.add(msg['ts'])
                save_processed(processed)
                try:
                    draft_info = handle_inquiry(msg, anthropic_client, gmail_service)
                    if draft_info:
                        pending_drafts.append(draft_info)
                except Exception as e:
                    print(f"  [문의] 처리 오류: {e}")

            for msg in fetch_triggered_messages(slack, CHANNEL_IDS['download'], agent_start_ts):
                if msg['ts'] in processed:
                    continue
                processed.add(msg['ts'])
                save_processed(processed)
                try:
                    draft_info = handle_download(msg, anthropic_client, gmail_service)
                    if draft_info:
                        pending_drafts.append(draft_info)
                except Exception as e:
                    print(f"  [다운로드] 처리 오류: {e}")

            # ── Growth X-Ray 세일즈테스트 채널 처리 ──────────
            for msg in fetch_triggered_messages(slack, CHANNEL_IDS['sales_test'], agent_start_ts):
                if msg['ts'] in processed:
                    continue
                processed.add(msg['ts'])
                save_processed(processed)
                try:
                    draft_info = handle_sales_test(msg, slack, anthropic_client, gmail_service)
                    if draft_info:
                        pending_drafts.append(draft_info)
                except Exception as e:
                    print(f"  [세일즈테스트] 처리 오류: {e}")

            # ── [2단계] 통화 후속 메일 처리 ─────────────────
            for reply_ts, parent_msg, reply_msg in fetch_postcall_triggered_replies(slack, CHANNEL_IDS['postcall'], agent_start_ts):
                if reply_ts in processed:
                    continue
                # ts를 먼저 저장 — 실패해도 중복 처리 방지
                processed.add(reply_ts)
                save_processed(processed)
                try:
                    draft_info = handle_postcall(parent_msg, reply_msg, anthropic_client, gmail_service)
                    if draft_info:
                        pending_drafts.append(draft_info)
                except Exception as e:
                    print(f"  [2단계] 처리 오류 (ts={reply_ts}): {e}")

            # ── 2. 발송 감지 → AI응대완료 라벨 부착 ─────────
            still_pending = []
            for draft_info in pending_drafts:
                sent = apply_label_if_sent(gmail_service, draft_info, ai_done_label_id)
                if sent:
                    print(f"  ✓ 발송 확인 → AI응대완료 라벨 부착: {draft_info['subject']}")
                else:
                    still_pending.append(draft_info)
            pending_drafts = still_pending

            time.sleep(CHECK_INTERVAL)

        except KeyboardInterrupt:
            print("\n에이전트 종료")
            break
        except Exception as e:
            print(f"오류: {e}")
            time.sleep(CHECK_INTERVAL)


def fetch_triggered_messages(slack, channel_id, oldest_ts, limit=20):
    """:이주민출동: 이모지가 달린 메시지만 반환 (에이전트 시작 이후 메시지만)"""
    try:
        response = slack.conversations_history(channel=channel_id, limit=limit, oldest=oldest_ts)
        triggered = []
        for msg in response.get('messages', []):
            for r in msg.get('reactions', []):
                if r['name'] == TRIGGER_EMOJI:
                    triggered.append(msg)
                    break
        return triggered
    except Exception as e:
        print(f"메시지 조회 오류: {e}")
        return []


def fetch_postcall_triggered_replies(slack, channel_id, oldest_ts):
    """주민_메일세일즈 채널에서 :키주민: 이모지 달린 스레드 댓글 반환
    - 부모 메시지 및 댓글 모두 oldest_ts 이후 것만 처리
    """
    triggered = []
    try:
        response = slack.conversations_history(channel=channel_id, limit=20)
        for msg in response.get('messages', []):
            if not msg.get('reply_count'):
                continue
            replies = slack.conversations_replies(channel=channel_id, ts=msg['ts'])
            for reply in replies['messages'][1:]:  # 첫 번째는 원본 메시지
                # 댓글 자체가 agent_start_ts 이후인 것만 처리
                if float(reply['ts']) <= float(oldest_ts):
                    continue
                for r in reply.get('reactions', []):
                    if r['name'] == PHASE2_TRIGGER_EMOJI:
                        triggered.append((reply['ts'], msg, reply))
                        break
    except Exception as e:
        print(f"2단계 메시지 조회 오류: {e}")
    return triggered


def handle_postcall(parent_msg, reply_msg, anthropic_client, gmail_service):
    """통화 후속 메일 초안 생성 → Gmail 임시보관함 저장"""
    # 원본 문의 내용 추출 (attachments)
    inquiry_text = ''
    for att in parent_msg.get('attachments', []):
        inquiry_text = att.get('text', '') or att.get('fallback', '')
        if inquiry_text:
            break

    if not inquiry_text:
        print(f"[2단계] 원본 문의 내용 없음, 스킵")
        return None

    call_notes = reply_msg.get('text', '')
    if not call_notes:
        print(f"[2단계] 통화 메모 없음, 스킵")
        return None

    # 이메일 추출
    import re
    email_match = re.search(r'[\w.+-]+@[\w-]+\.[a-zA-Z]+', inquiry_text)
    if not email_match:
        print(f"[2단계] 이메일 주소 없음, 스킵")
        return None
    email = email_match.group()

    print(f"[2단계] 통화 후속 메일 생성 중 → {email}")
    subject, body = generate_postcall_draft(inquiry_text, call_notes, anthropic_client)
    draft_info = create_gmail_draft(gmail_service, to=email, subject=subject, body=body)
    print(f"  ✓ 통화 후속 초안 저장 완료 → {email} (CC: pm, leader)")
    return draft_info


def handle_sales_test(msg, slack, anthropic_client, gmail_service):
    """퍼즐_세일즈테스트 채널 처리 (Growth X-Ray 상담 신청)
    - 주변 메시지에서 이메일·회사명 추출
    - Gmail에서 과거 메일 히스토리 검색
    - 맥락 반영한 메일 초안 생성
    """
    import re

    channel_id = CHANNEL_IDS['sales_test']
    msg_ts = float(msg['ts'])

    # 트리거 메시지 전후 메시지에서 이메일·회사명 추출
    try:
        response = slack.conversations_history(channel=channel_id, limit=20)
        all_msgs = response.get('messages', [])
    except Exception as e:
        print(f"[세일즈테스트] 채널 조회 오류: {e}")
        return None

    # 트리거 메시지 기준 전후 10개 메시지 탐색
    email = ''
    company = ''
    context_text = ''
    for m in all_msgs:
        t = m.get('text', '')
        # 이메일 캡처 메시지에서 추출
        if 'Growth X-Ray' in t and '이메일 캡처' in t:
            em = re.search(r'<mailto:([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})\|', t)
            if em:
                email = em.group(1)
        # 진단 완료 메시지에서 회사명 추출
        if '1차 진단 완료' in t or '진단 완료' in t:
            co = re.search(r'진단 완료\]\s*(.+?)\s*[—-]', t)
            if co:
                company = co.group(1).strip()
        context_text += t + '\n'

    if not email:
        print(f"[세일즈테스트] 이메일 추출 실패, 스킵")
        return None

    print(f"[세일즈테스트] 광고주: {company} | {email}")

    # 메일 초안 생성
    from draft_generator import COMPANY_CONTEXT, STYLE_GUIDE, _load_style_profile, _parse_response
    style_profile = _load_style_profile()

    prompt = f"""당신은 퍼즐코퍼레이션 퍼포먼스 마케팅 팀장 이주민님의 이메일 분신입니다.
{COMPANY_CONTEXT}
{STYLE_GUIDE}

## 퍼즐코퍼레이션 학습된 스타일 가이드
{style_profile}

## 현재 상황
광고주 회사: {company}
이메일: {email}
상담 채널: Growth X-Ray (퍼즐의 그로스 마케팅 진단 서비스)
슬랙 컨텍스트: {context_text[:300]}

## 메일 작성 규칙
- Growth X-Ray 상담 신청에 대한 1차 컨텍 메일
- 이주민 팀장이 직접 챙기겠다는 뉘앙스
- 미팅 또는 통화 제안 포함
- 포맷 규칙 (Gmail HTML):
  - 문장마다 <br>, 단락 구분 <br><br>
  - <strong style="color:#1a73e8">파란 볼드</strong>: 서비스명, 핵심 수치
  - ** 기호 절대 금지, 마크다운 금지
  - 이모지 3개 이하
- 마지막 줄 반드시 "-이주민 배상-"

아래 형식으로만 출력:
제목: [제목]
본문:
[본문]"""

    response = anthropic_client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=2048,
        messages=[{'role': 'user', 'content': prompt}]
    )
    subject, body = _parse_response(response.content[0].text)
    draft_info = create_gmail_draft(gmail_service, to=email, subject=subject, body=body)
    print(f"  ✓ 세일즈테스트 초안 저장 완료 → {email}")
    return draft_info


def handle_inquiry(msg, anthropic_client, gmail_service):
    """문의접수 채널 처리 → draft_info 반환"""
    text = msg.get('text', '')
    if not text:
        return None

    result = classify_inquiry(text)
    print(f"[문의접수] 유형: {result['type']} | {result['name']} / {result['company']}")

    if result['type'] not in ('performance', 'mixed'):
        print(f"  → {result['type']} 문의, 스킵")
        return None

    email = result.get('email', '')
    if not email:
        print(f"  → 이메일 주소 없음, 스킵")
        return None

    # 시장조사
    print(f"  → 시장조사 중: {result['company']}...")
    research = research_company(result['company'], email, anthropic_client)
    print(f"  → 조사 완료: {research[:60]}...")

    subject, body = generate_reply_draft(text, anthropic_client, company_research=research)
    draft_info = create_gmail_draft(gmail_service, to=email, subject=subject, body=body)
    print(f"  ✓ 초안 저장 완료 → {email} (CC: pm, leader)")
    return draft_info


def handle_download(msg, anthropic_client, gmail_service):
    """소개서 다운로드 채널 처리 → draft_info 반환"""
    text = msg.get('text', '')
    if not text:
        return None

    result = classify_inquiry(text)
    print(f"[소개서 다운로드] 유형: {result['type']} | {result['name']} / {result['company']}")

    if result['type'] not in ('performance', 'mixed'):
        print(f"  → {result['type']} 문의, 스킵")
        return None

    email = result.get('email', '')
    if not email:
        print(f"  → 이메일 주소 없음, 스킵")
        return None

    print(f"  → 시장조사 중: {result['company']}...")
    research = research_company(result['company'], email, anthropic_client)
    print(f"  → 조사 완료: {research[:60]}...")

    subject, body = generate_first_contact_draft(text, anthropic_client)
    draft_info = create_gmail_draft(gmail_service, to=email, subject=subject, body=body)
    print(f"  ✓ 첫 컨텍 초안 저장 완료 → {email} (CC: pm, leader)")
    return draft_info


if __name__ == '__main__':
    main()
