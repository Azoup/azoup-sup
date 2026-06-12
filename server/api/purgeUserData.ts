import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove permissões, perfil e papel antes/depois de apagar auth (lista usa user_roles). */
export async function purgeUserData(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error?: string }> {
  const steps = [
    admin.from("user_permissions").delete().eq("user_id", userId),
    admin.from("user_roles").delete().eq("user_id", userId),
    admin.from("profiles").delete().eq("id", userId),
  ];

  const results = await Promise.all(steps);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: failed.error.message };
  }
  return {};
}

export function isAuthUserNotFoundError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("not_found") ||
    m.includes("user not found") ||
    m.includes("does not exist")
  );
}
