import { createClient } from "@supabase/supabase-js";
import { adminConfigFromEnv, type AdminConfig } from "./adminUserActionCore";

export type UserAccessResult = {
  role: string;
  permissions: Record<string, boolean> | null;
};

export async function fetchUserAccessCore(
  authHeader: string,
  config: AdminConfig,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.slice(7).trim();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser(jwt);
  if (authErr || !user?.id) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleErr) {
    return { status: 500, body: { error: "role_fetch_failed", message: roleErr.message } };
  }

  const { data: perms, error: permsErr } = await admin
    .from("user_permissions")
    .select("permission_key, allowed")
    .eq("user_id", user.id);
  if (permsErr) {
    return { status: 500, body: { error: "permissions_fetch_failed", message: permsErr.message } };
  }

  const roles = (roleRows ?? []).map((r) => r.role as string);
  const role = roles.includes("admin") ? "admin" : roles[0] || "user";
  const permissions =
    perms && perms.length > 0
      ? Object.fromEntries(
          perms.map((p) => [
            p.permission_key,
            p.allowed === true || (p.allowed as unknown) === "true" || (p.allowed as unknown) === 1,
          ]),
        )
      : null;

  const body: UserAccessResult = {
    role,
    permissions,
  };

  return { status: 200, body: body as unknown as Record<string, unknown> };
}

export { adminConfigFromEnv };
