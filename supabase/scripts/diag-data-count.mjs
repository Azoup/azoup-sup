import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(resolve(root, '.env'));

const url = process.env.VITE_SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pub = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const legacy = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const admin = createClient(url, sr, { auth: { autoRefreshToken: false, persistSession: false } });
const uid = 'dd939cd3-ce76-4b8d-802b-f24c8cf124b4';

for (const table of ['kanban_cards', 'kanban_columns', 'analysts', 'developers', 'doubt_records']) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  console.log(`${table}:`, error ? error.message : count);
}

const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'bea.azoup@gmail.com' });
const { data: verify } = await admin.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'magiclink',
});
const token = verify.session.access_token;

async function testKey(label, apiKey) {
  const res = await fetch(`${url}/rest/v1/kanban_cards?select=id&limit=3`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  console.log(`\n[${label}] kanban_cards status=${res.status} rows=${Array.isArray(body) ? body.length : JSON.stringify(body).slice(0, 120)}`);

  const roleRes = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${uid}&select=role`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
  });
  const roles = await roleRes.json();
  console.log(`[${label}] user_roles status=${roleRes.status}`, JSON.stringify(roles));
}

await testKey('publishable', pub);
if (legacy) await testKey('legacy anon', legacy);
