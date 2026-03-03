import type { Request, Response } from "express";

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
};

export function getRequestId(req: Request): string {
  return (
    (req.headers["x-request-id"] as string | undefined) ??
    ((req as any).requestId as string | undefined) ??
    "unknown"
  );
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string
) {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message },
    requestId: getRequestId(req),
  };

  return res.status(status).json(body);
}