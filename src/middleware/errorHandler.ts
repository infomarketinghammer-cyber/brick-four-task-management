/**
 * Express Centralized Error Handling Middleware
 */

import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/envelope';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json(sendError(err.message, err.code, err.details));
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    const formattedErrors = issues.map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
      message: e.message,
    }));
    return res.status(400).json(sendError('Validation failed', 'VALIDATION_ERROR', formattedErrors));
  }

  // Handle Syntax Errors (e.g. malformed JSON body)
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    return res.status(400).json(sendError('Malformed JSON payload', 'BAD_REQUEST'));
  }

  console.error('Unhandled Server Error:', err);
  return res.status(500).json(sendError('An unexpected internal error occurred', 'INTERNAL_SERVER_ERROR'));
}
