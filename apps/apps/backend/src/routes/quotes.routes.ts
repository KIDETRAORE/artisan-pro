// apps/backend/src/routes/quotes.routes.ts
import { Router } from "express";
import {
  getQuotes,
  getPendingQuotes,
  postQuote,
  patchQuoteStatus,
  postConvertQuote,
} from "../controllers/quotes.controller";

const router = Router();

router.get("/", getQuotes);
router.get("/pending", getPendingQuotes);
router.post("/", postQuote);
router.patch("/:id/status", patchQuoteStatus);
router.post("/:id/convert", postConvertQuote);

export default router;