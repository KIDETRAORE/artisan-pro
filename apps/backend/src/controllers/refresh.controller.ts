import { Request, Response } from "express"
import { signAccessToken, verifyToken } from "../utils/jwt"

export function refresh(req: Request, res: Response) {
  const token = req.cookies?.refresh_token
  if (!token) return res.sendStatus(401)

  try {
    const payload = verifyToken(token) as any
    const newAccessToken = signAccessToken({ sub: payload.sub })
    res.json({ accessToken: newAccessToken })
  } catch {
    res.sendStatus(403)
  }
}
