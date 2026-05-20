/**
 * Audita roles e permissões de todos os usuários no Supabase.
 * Uso: node supabase/scripts/audit-users-access.mjs
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

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !serviceRole) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: roles, error: rolesErr } = await admin.from('user_roles').select('user_id, role');
if (rolesErr) {
  console.error('Erro user_roles:', rolesErr.message);
  process.exit(1);
}

const { data: perms, error: permsErr } = await admin
  .from('user_permissions')
  .select('user_id, permission_key, allowed');
if (permsErr) {
  console.error('Erro user_permissions:', permsErr.message);
  process.exit(1);
}

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('Erro listUsers:', listErr.message);
  process.exit(1);
}

const roleByUser = Object.fromEntries(roles.map((r) => [r.user_id, r.role]));
const permByUser = {};
for (const p of perms) {
  if (!permByUser[p.user_id]) permByUser[p.user_id] = { total: 0, viewTrue: [] };
  permByUser[p.user_id].total++;
  if (p.allowed && p.permission_key.endsWith('_view')) {
    permByUser[p.user_id].viewTrue.push(p.permission_key);
  }
}

console.log('\n=== AUDITORIA (service role) ===\n');
for (const u of list.users.sort((a, b) => (a.email || '').localeCompare(b.email || ''))) {
  const pb = permByUser[u.id] || { total: 0, viewTrue: [] };
  const role = roleByUser[u.id] || 'MISSING';
  console.log(`${u.email}`);
  console.log(`  id: ${u.id}`);
  console.log(`  role: ${role}`);
  console.log(`  permissions: ${pb.total} (${pb.viewTrue.length} views ativas)`);
  if (role === 'MISSING') console.log('  ⚠ SEM ROLE');
  if (pb.total === 0 && role !== 'admin') console.log('  ⚠ SEM PERMISSÕES');
  console.log('');
}

// Testa leitura como usuário autenticado (simula o app)
if (publishable) {
  console.log('=== TESTE CLIENTE (publishable key + login) ===\n');
  const testEmail = process.env.AUDIT_TEST_EMAIL || 'bea.azoup@gmail.com';
  const testPassword = process.env.AUDIT_TEST_PASSWORD;
  if (!testPassword) {
    console.log('Pule teste de login: defina AUDIT_TEST_PASSWORD no .env para testar RLS no cliente.');
  } else {
    const client = createClient(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signErr } = await client.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signErr) {
      console.error(`Login falhou (${testEmail}):`, signErr.message);
    } else {
      const uid = signIn.user.id;
      const { data: myRole, error: myRoleErr } = await client
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle();
      const { data: myPerms, error: myPermsErr } = await client
        .from('user_permissions')
        .select('permission_key, allowed')
        .eq('user_id', uid);
      console.log(`Login OK: ${testEmail}`);
      console.log(`  user_roles query:`, myRoleErr ? `ERRO: ${myRoleErr.message}` : myRole);
      console.log(
        `  user_permissions query:`,
        myPermsErr
          ? `ERRO: ${myPermsErr.message}`
          : `${myPerms?.length ?? 0} registros`,
      );
    }
  }
}
