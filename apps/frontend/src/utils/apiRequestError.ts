import { getApiError } from "./getApiError";
import type { ApiError } from "../types/apiError";

export class ApiRequestError extends Error {
  public code: string;
  public requestId: string;
  public details?: unknown;
  public status?: number;

  constructor(args: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
    status?: number;
  }) {
    super(args.message);
    this.code = args.code;
    this.requestId = args.requestId ?? "unknown";
    this.details = args.details;
    this.status = args.status;
  }

  static fromApiError(apiErr: ApiError, status?: number) {
    return new ApiRequestError({
      code: apiErr.error.code,
      message: apiErr.error.message,
      requestId: apiErr.requestId ?? "unknown",
      details: apiErr.details,
      status,
    });
  }
}

/**
 * Convertit une Response non-OK en ApiRequestError (shape standard backend)
 */
export async function toApiRequestError(res: Response): Promise<ApiRequestError> {
  const apiErr = await getApiError(res);
  return ApiRequestError.fromApiError(apiErr, res.status);
}