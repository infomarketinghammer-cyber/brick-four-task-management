/**
 * Attachment Security Utility
 * Provides MIME type & size validation, and HMAC-signed expiring download/access URLs.
 */

import crypto from 'crypto';
import { AppError } from './errors';

const ATTACHMENT_SECRET = process.env.ATTACHMENT_SECRET || process.env.JWT_SECRET || 'super-secret-attachment-key-32-chars!!';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface AttachmentValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAttachment(mimetype: string, size: number): AttachmentValidationResult {
  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds max limit of 10MB (received ${(size / (1024 * 1024)).toFixed(2)}MB)`,
    };
  }

  if (!ALLOWED_MIME_TYPES.has(mimetype.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimetype}. Allowed types include PNG, JPEG, WebP, PDF, TXT, CSV, DOCX, XLSX, ZIP.`,
    };
  }

  return { valid: true };
}

/**
 * Generates an HMAC-SHA256 signature for an attachment URL expiring in expirationSeconds.
 */
export function generateSignedAttachmentUrl(
  fileKey: string,
  expirationSeconds: number = 3600
): { url: string; expiresAt: number; signature: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + expirationSeconds;
  const payload = `${fileKey}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', ATTACHMENT_SECRET)
    .update(payload)
    .digest('hex');

  const url = `/api/v1/attachments/download?key=${encodeURIComponent(fileKey)}&expires=${expiresAt}&sig=${signature}`;

  return {
    url,
    expiresAt,
    signature,
  };
}

/**
 * Verifies the HMAC-SHA256 signature and expiration timestamp.
 */
export function verifySignedAttachmentUrl(fileKey: string, expires: number, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now > expires) {
    return false; // Expired
  }

  const payload = `${fileKey}:${expires}`;
  const expectedSignature = crypto
    .createHmac('sha256', ATTACHMENT_SECRET)
    .update(payload)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
