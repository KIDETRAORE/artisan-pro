import { Request, Response } from "express"
import { signAccessToken, signRefreshToken } from "../utils/jwt"
import { supabaseAdmin } from "../lib/supabaseAdmin"

export async function login(req: Request, res: Response) {
  const { email, password } = req.body

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    return res.status(401).json({ error: "Invalid credentials" })
  }

  const user = data.user

  const accessToken = signAccessToken({ sub: user.id })
  const refreshToken = signRefreshToken({ sub: user.id })

  res
    .cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/auth/refresh",
    })
    .json({ accessToken })
}
