export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
  details?: unknown;
};

export function isApiError(x: any): x is ApiError {
  return (
    x &&
    x.success === false &&
    x.error &&
    typeof x.error.code === "string" &&
    typeof x.error.message === "string"
  );
}