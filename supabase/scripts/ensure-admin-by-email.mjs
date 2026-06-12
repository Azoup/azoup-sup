/**
 * Garante role admin para um e-mail.
 * Uso: node supabase/scripts/ensure-admin-by-email.mjs bea.azoup@gmail.com
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = v;
  }
}

const email = (process.argv[2] || "bea.azoup@gmail.com").trim().toLowerCase();
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}

const user = (list.users || []).find((u) => (u.email || "").toLowerCase() === email);
if (!user) {
  console.error("Usuário não encontrado:", email);
  process.exit(1);
}

const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
const hasAdmin = (roles || []).some((r) => r.role === "admin");
if (!hasAdmin) {
  const { error: insErr } = await admin.from("user_roles").insert({ user_id: user.id, role: "admin" });
  if (insErr) {
    console.error(insErr.message);
    process.exit(1);
  }
  console.log("Admin concedido:", email);
} else {
  console.log("Já é admin:", email);
}
console.log("user_id:", user.id);
