/**
 * Testa leitura de roles/permissões como usuário autenticado (RLS + publishable key).
 * Uso: node supabase/scripts/test-client-rls.mjs [email]
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
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const legacyAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const email = process.argv[2] || 'bea.azoup@gmail.com';

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
});
if (linkErr) {
  console.error('generateLink:', linkErr.message);
  process.exit(1);
}

const hashed = linkData.properties?.hashed_token;
const { data: verify, error: verifyErr } = await admin.auth.verifyOtp({
  token_hash: hashed,
  type: 'magiclink',
});
if (verifyErr) {
  console.error('verifyOtp:', verifyErr.message);
  process.exit(1);
}

const session = verify.session;
const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
const uid = payload.sub;

console.log('Email:', email);
console.log('JWT role:', payload.role, '| sub:', uid);
const jwtHeader = JSON.parse(Buffer.from(session.access_token.split('.')[0], 'base64url').toString());
console.log('JWT alg:', jwtHeader.alg, '| kid:', jwtHeader.kid || '(none)');

try {
  const jwksRes = await fetch(`${url}/auth/v1/.well-known/jwks.json`);
  console.log('JWKS status:', jwksRes.status, (await jwksRes.text()).slice(0, 200));
} catch (e) {
  console.log('JWKS fetch failed:', e.message);
}

async function testApiKey(label, apiKey) {
  const roleRes = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${uid}&select=role`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${session.access_token}` },
  });
  const roleJson = await roleRes.json();

  const permsRes = await fetch(
    `${url}/rest/v1/user_permissions?user_id=eq.${uid}&select=permission_key,allowed`,
    { headers: { apikey: apiKey, Authorization: `Bearer ${session.access_token}` } },
  );
  const permsJson = await permsRes.json();

  const kanbanRes = await fetch(`${url}/rest/v1/kanban_cards?select=id&limit=1`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${session.access_token}` },
  });
  const kanbanJson = await kanbanRes.json();

  console.log(`\n[${label}]`);
  console.log('  user_roles:', roleRes.status, JSON.stringify(roleJson));
  console.log(
    '  user_permissions:',
    permsRes.status,
    Array.isArray(permsJson) ? `${permsJson.length} rows` : JSON.stringify(permsJson),
  );
  console.log(
    '  kanban_cards:',
    kanbanRes.status,
    Array.isArray(kanbanJson) ? `${kanbanJson.length} row(s)` : JSON.stringify(kanbanJson),
  );
}

await testApiKey('publishable key', publishable);
if (legacyAnon) await testApiKey('legacy anon JWT', legacyAnon);

// Teste: só user JWT no Authorization, apikey = anon (padrão Supabase)
const anon =
  legacyAnon ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0dG1nbHZreW1wYnllb3dndWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTE0NzMsImV4cCI6MjA5MzEyNzQ3M30.ZPqv4Ml_DJOHv5htP-B-csXi2xk9d6D-0sR0yDvmevs';

const client = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});
await client.auth.setSession({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
});
const { data: roleViaClient, error: clientErr } = await client
  .from('user_roles')
  .select('role')
  .eq('user_id', uid)
  .maybeSingle();
console.log('\n[supabase-js + anon key + setSession]');
console.log('  user_roles:', clientErr ? `ERRO: ${clientErr.message}` : roleViaClient);

const bypass = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${uid}&select=role`, {
  headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
});
console.log('\n[service role bypass]', bypass.status, await bypass.text());
