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
    - 트리거 메시지의 blocks에서 직접 이메일·회사명·담당자 추출
    - blocks 없을 경우 text에서 폴백 추출
    """
    import re

    email = ''
    company = ''
    name = ''
    context_text = ''

    # 1순위: blocks 필드에서 직접 추출 (Growth X-Ray 신규 포맷)
    for block in msg.get('blocks', []):
        for field in block.get('fields', []):
            t = field.get('text', '')
            context_text += t + '\n'
            if '회사:' in t:
                company = t.split('\n')[-1].strip()
            if '이메일:' in t:
                em = re.search(r'<mailto:([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})\|', t)
                if em:
                    email = em.group(1)
            if '담당자:' in t:
                name = t.split('\n')[-1].strip()
        # 버튼/섹션 텍스트도 컨텍스트에 추가
        if block.get('text', {}).get('text'):
            context_text += block['text']['text'] + '\n'

    # 2순위: text 필드 폴백 (구 포맷)
    if not email:
        text = msg.get('text', '')
        context_text += text
        em = re.search(r'<mailto:([\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})\|', text)
        if em:
            email = em.group(1)
        co = re.search(r'회사명?:\*?\s*\n?\s*(.+?)(?:\s*\*|\s*\n)', text)
        if co:
            company = co.group(1).strip()

    if not email:
        print(f"[세일즈테스트] 이메일 추출 실패, 스킵")
        return None

    print(f"[세일즈테스트] {name} / {company} | {email}")

    # 시장조사
    print(f"  → 시장조사 중: {company}...")
    research = research_company(company, email, anthropic_client)
    print(f"  → 조사 완료")

    # 메일 초안 생성
    from draft_generator import COMPANY_CONTEXT, _load_style_profile, _parse_response, _call_gemini
    style_profile = _load_style_profile()

    prompt = f"""당신은 퍼즐코퍼레이션 퍼포먼스 마케팅 팀장 이주민님의 이메일 분신입니다.
{COMPANY_CONTEXT}

## 이메일 작성 원칙
- 인사말 어순: 반드시 "[회사명] [이름]님 안녕하세요 :)" 패턴 사용 — 수신자 호칭이 먼저, 인사말이 뒤에 (이주민 팀장 고유 스타일, 변경 금지)
- 자사 호칭: "저희 쪽" 표현 절대 금지 — 반드시 "저희 퍼즐코퍼레이션"으로 표기
- [확인 필요], [날짜 미정] 같은 내부 메모 표현 절대 금지 — 모든 문장은 완성된 자연스러운 문장으로 작성
- 다음 액션은 미팅이 아닌 통화로 제안: "유선상으로 가벼운 안내를 도와드리고자 합니다. 통화가 편하신 일정 알려주시면 연락드릴 수 있도록 하겠습니다" — "미팅 일정", "편하신 일정 제가 맞춰보겠습니다" 표현 금지
- 진단 점수, 손실 추정액 등 Growth X-Ray 수치 언급 금지
- 반드시 마지막 줄은 "-이주민 배상-" 으로 끝낼 것 (이주민 팀장 지정 형식, 변경 금지)
- 서명란, 연락처 일체 작성 금지
- *텍스트*, ◎, ✅ 등 마크다운 기호 및 특수 기호 절대 금지 — 강조는 HTML <strong> 태그만 사용
- 입력값(조사 결과·슬랙 컨텍스트)에 없는 니즈·고민·목표 절대 언급 금지 — 정보 불충분 시 해당 문장 생략
- 단정적인 성과 약속 금지 — "함께 방향을 찾아볼 수 있을 것 같습니다" 수준으로 표현
- 느낌표는 전체 메일에서 최대 1회
- 수신자를 설득하기보다 대화를 이어가는 흐름으로 작성
- 클라이언트 레퍼런스는 반드시 실명 3개(버거킹, 밀리의서재, 비앤빛안과)를 나열하거나, 아예 언급하지 않을 것 — 1~2개만 단독 나열 금지, "다양한 클라이언트" 같은 추상적 표현 단독 사용 금지

## 퍼즐코퍼레이션 학습된 스타일 가이드
{style_profile}

## 광고주 사전 조사 결과
{research}
(위 내용을 메일 본문에 자연스럽게 녹여서, 우리가 이 회사에 대해 관심을 갖고 미리 살펴봤다는 인상을 줄 것. 억지스럽지 않게 1~2문장으로 자연스럽게 언급. 조사 결과가 없으면 이 항목 생략)

## 광고주 정보
담당자: {name}
회사: {company}
이메일: {email}
슬랙 컨텍스트: {context_text[:500]}

## 메일 구조 (1차 컨텍 메일)
1. 인사 및 감사 (1~2문장): "[회사명] [이름]님 안녕하세요 :)" (수신자 호칭 먼저, 인사말 뒤) + Growth X-Ray 상담 신청 감사
2. 수신자 브랜드 관찰 + 기회 연결 (2~3문장): 사전 조사 기반 브랜드 관찰 내용 언급 후, 퍼즐 개입 시 기대 효과를 연결하는 문장 추가 (예: "현재 활발하게 활용하고 계신 [활동]에 맞추어 [마케팅 방향]을 더욱 키워갈 수 있을 것으로 생각됩니다.") — 조사 결과 없으면 생략
3. 퍼즐코퍼레이션 소개 (최대 3문장): 그로스 마케팅 에이전시 소개, 주요 서비스, 클라이언트 레퍼런스는 반드시 버거킹·밀리의서재·비앤빛안과 실명 3개 나열하거나 아예 생략 — 1~2개만 단독 언급 금지, "다양한 브랜드" 같은 추상적 표현 단독 사용 금지
4. 다음 단계 제안 (1~2문장): "유선상으로 가벼운 안내를 도와드리고자 합니다. 통화가 편하신 일정 알려주시면 연락드릴 수 있도록 하겠습니다" — "미팅 일정", "편하신 일정 제가 맞춰보겠습니다" 표현 금지

## 포맷 규칙 (Gmail HTML)
- 문장마다 <br>, 단락 구분 <br><br>
- <strong style="color:#1a73e8">파란 볼드</strong>: 퍼즐 서비스명
- <strong>검정 볼드</strong>: 대표 클라이언트명
- 볼드 금지: 인사말, 일반 문장, 맺음말
- 이모지 3개 이하 (없어도 무방), ** 기호 절대 금지, 마크다운 문법 절대 금지

- 제목 형식: [클라이언트 브랜드명/퍼즐코퍼레이션] {{핵심 목적}} 건 — 클라이언트명은 회사명 전체가 아닌 브랜드/짧은 이름 사용, "미팅 제안"·"문의 확인 안내" 같은 목적 과노출 표현 금지 (예: [기준/퍼즐코퍼레이션] 온라인 광고 문의에 대한 안내 메일 건)

아래 형식으로만 출력:
제목: [제목]
본문:
[본문]"""

    subject, body = _parse_response(_call_gemini(prompt))
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
