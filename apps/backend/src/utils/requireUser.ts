import { Request } from "express";
import { HttpError } from "@utils/httpError";

export function requireUser(req: Request) {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }

  return req.user;
}
