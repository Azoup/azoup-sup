/**
 * Testa fetchUserAccessCore (mesma lógica de /api/my-access).
 * Uso: node supabase/scripts/test-my-access-api.mjs [email]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, '.env'));

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('URL:', url);
console.log('SR length:', serviceRole?.length, 'ends:', serviceRole?.slice(-12));
const email = process.argv[2] || 'bea.azoup@gmail.com';

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: verify } = await admin.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'magiclink',
});

const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${verify.session.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
const jwt = verify.session.access_token;
const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
if (userErr || !user) {
  console.error('getUser failed:', userErr?.message);
  process.exit(1);
}

console.log('User id:', user.id);

const { data: roleRow, error: roleErr } = await admin
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .maybeSingle();
if (roleErr) console.error('roleErr:', roleErr.message);
console.log('roleRow raw:', roleRow);

const directRole = await admin
  .from('user_roles')
  .select('role')
  .eq('user_id', 'dd939cd3-ce76-4b8d-802b-f24c8cf124b4')
  .maybeSingle();
console.log('directRole:', directRole.data, directRole.error?.message);
const { data: perms } = await admin
  .from('user_permissions')
  .select('permission_key, allowed')
  .eq('user_id', user.id);

console.log('Email:', email);
console.log('Role:', roleRow?.role ?? 'user');
console.log('Permissions:', perms?.length ?? 0);
const views = (perms || []).filter((p) => p.allowed && p.permission_key.endsWith('_view'));
console.log('Views ativas:', views.map((v) => v.permission_key).join(', ') || '(admin vê tudo)');
