/**
 * Consistent API Envelope Format
 * { success: boolean, data?: T, meta?: object, error?: { code: string, message: string, details?: unknown } }
 */

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(data: T, meta?: Record<string, unknown>): ApiEnvelope<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function sendError(message: string, code: string = 'ERROR', details?: unknown): ApiEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}
