/**
 * ERREUR HTTP STANDARDISÉE
 * Permet de transporter un status HTTP proprement
 * à travers services, contrôleurs et middlewares.
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

    // Corrige le prototype (important en TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);

    // Stack trace propre
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}