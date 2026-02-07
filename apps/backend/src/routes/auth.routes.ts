import { Router } from "express"
import { login } from "../controllers/auth.controller"
import { refresh } from "../controllers/refresh.controller"

const router = Router()

router.post("/login", login)
router.post("/refresh", refresh)

export default router
