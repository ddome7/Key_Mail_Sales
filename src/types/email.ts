/**
 * Email-related types for the sales workflow.
 * Shared contract for email composition, quality checking, and workflow results.
 */

export interface InquiryInput {
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  emailBody: string;         // 원본 문의 내용
  threadId?: string;         // 기존 스레드 답장 시
  recipientEmail: string;
}

export interface EmailDraft {
  subject: string;
  htmlBody: string;
  to: string;
  cc: string[];
  threadId?: string;
}

export interface QualityCheckResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export interface WorkflowResult {
  success: boolean;
  draftId?: string;
  warnings?: string[];
  errors?: string[];
}
