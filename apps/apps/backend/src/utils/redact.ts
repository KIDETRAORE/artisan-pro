// apps/backend/src/utils/redact.ts
import { createHash } from "crypto";

export function redactEmail(email: unknown): {
  masked: string;
  domain: string | null;
  hash: string;
} {
  const s = typeof email === "string" ? email.trim() : "";
  if (!s || !s.includes("@")) {
    return { masked: "***", domain: null, hash: hashShort(s) };
  }

  const [localRaw, domainRaw] = s.split("@");
  const local = localRaw ?? "";
  const domain = domainRaw ?? "";

  const safeLocal =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;

  return {
    masked: `${safeLocal}@${domain}`,
    domain: domain || null,
    hash: hashShort(s.toLowerCase()),
  };
}

function hashShort(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 10);
}