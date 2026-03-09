// apps/backend/scripts/grant-permission.ts
import "dotenv/config";
import { supabaseAdmin } from "../src/lib/supabaseAdmin";
import { logger } from "../src/utils/logger";

const USER_ID = "0296267b-e3c8-45f4-b1b3-f4a9a5a7144e";
const PERMISSION = "view_dashboard";

async function main() {
  const { data: userRes, error: getErr } =
    await supabaseAdmin.auth.admin.getUserById(USER_ID);

  if (getErr || !userRes?.user) {
    throw new Error(`getUserById failed: ${getErr?.message ?? "user not found"}`);
  }

  const current = userRes.user.app_metadata ?? {};
  const currentPerms = Array.isArray((current as any).permissions)
    ? ((current as any).permissions as string[])
    : [];

  const nextPerms = Array.from(new Set([...currentPerms, PERMISSION]));

  const { data: updRes, error: updErr } =
    await supabaseAdmin.auth.admin.updateUserById(USER_ID, {
      app_metadata: {
        ...current,
        permissions: nextPerms,
      },
    });

  if (updErr || !updRes?.user) {
    throw new Error(`updateUserById failed: ${updErr?.message ?? "unknown"}`);
  }

  logger.info("✅ Permission granted", {
    userId: USER_ID,
    permissions: updRes.user.app_metadata?.permissions,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});