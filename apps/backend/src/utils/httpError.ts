/**
 * ERREUR HTTP STANDARDISÉE
 * Permet de transporter un status HTTP proprement
 * à travers les services, contrôleurs et middlewares.
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    isOperational: boolean = true
  ) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // ⚠️ Nécessaire pour instanceof avec Error étendu
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture propre de la stack (utile pour logs)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
