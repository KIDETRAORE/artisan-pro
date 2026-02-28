import { getApiError } from "../utils/getApiError";
import type { ApiError } from "../types/apiError";

export class ApiRequestError extends Error {
  public code: string;
  public requestId?: string;
  public details?: unknown;

  constructor(apiErr: ApiError) {
    super(apiErr.error.message);
    this.code = apiErr.error.code;
    this.requestId = apiErr.requestId;
    this.details = apiErr.details;
  }
}

export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}) {
  const res = await fetch(input, init);

  if (!res.ok) {
    const apiErr = await getApiError(res);
    throw new ApiRequestError(apiErr);
  }

  return res;
}