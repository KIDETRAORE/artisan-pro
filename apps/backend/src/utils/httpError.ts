export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;

    // Important pour instanceof
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
