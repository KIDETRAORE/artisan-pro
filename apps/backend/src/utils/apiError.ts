import type { Request, Response } from "express";

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
  details?: unknown;
};

export function getRequestId(req: Request): string | undefined {
  return (
    (req.headers["x-request-id"] as string | undefined) ??
    (req as any).requestId ??
    undefined
  );
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message },
    requestId: getRequestId(req),
    details: details ?? undefined,
  };

  return res.status(status).json(body);
}