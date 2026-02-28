import { isApiError, type ApiError } from "../types/apiError";

export async function getApiError(res: Response): Promise<ApiError> {
  // tente JSON
  try {
    const data = await res.json();
    if (isApiError(data)) return data;

    // JSON mais pas au format attendu
    return {
      success: false,
      error: {
        code: "unknown_error",
        message: "Une erreur est survenue",
      },
      details: data,
    };
  } catch {
    // pas du JSON
    const text = await res.text().catch(() => "");
    return {
      success: false,
      error: {
        code: "non_json_error",
        message: "Une erreur est survenue",
      },
      details: text || undefined,
    };
  }
}