"""Gmail 인증 (순욱 에이전트와 동일 credentials 공유)"""

import os
import pickle
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.compose']

# 순욱 에이전트의 credentials 재사용
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), '..', 'gmail-agent', 'credentials.json')
TOKEN_PATH = os.path.join(os.path.dirname(__file__), '..', 'gmail-agent', 'token.pickle')


def get_gmail_service():
    creds = None

    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, 'rb') as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, 'wb') as f:
            pickle.dump(creds, f)

    return build('gmail', 'v1', credentials=creds)
