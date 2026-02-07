import { Request, Response, NextFunction } from "express"
import { verifyToken } from "../utils/jwt"

export interface AuthRequest extends Request {
  user?: any
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    return res.sendStatus(401)
  }

  try {
    const token = header.split(" ")[1]
    req.user = verifyToken(token)
    next()
  } catch {
    res.sendStatus(403)
  }
}
