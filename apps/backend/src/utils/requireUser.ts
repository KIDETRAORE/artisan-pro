import { Request } from "express";
import { HttpError } from "./httpError";
import { User } from "@supabase/supabase-js";

export function requireUser(req: Request): User {
  const user = (req as any).user as User | undefined;

  if (!user) {
    throw new HttpError(401, "Non authentifié");
  }

  return user;
}
