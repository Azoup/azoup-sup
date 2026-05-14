/**
 * CORS para Edge Functions chamadas pelo browser (inclui preflight OPTIONS).
 * Deve incluir Access-Control-Allow-Methods; sem isto o browser pode falhar com "Failed to fetch".
 * Alinhado a @supabase/supabase-js/cors (headers + methods).
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer, accept-profile, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
