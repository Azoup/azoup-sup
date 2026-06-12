export type AdminConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRole: string;
};

export function adminConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AdminConfig | { error: string } {
  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim() || "";
  const anonKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.SUPABASE_ANON_KEY?.trim() ||
    "";
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceRole) {
    const ref = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? "ittmglvkympbyeowgucl";
    return {
      error: `Defina SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL na Vercel (projeto ${ref}).`,
    };
  }

  return { supabaseUrl, anonKey, serviceRole };
}
