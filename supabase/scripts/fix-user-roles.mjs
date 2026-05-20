/**
 * Restaura user_roles após migração SQL quando ON CONFLICT DO NOTHING
 * deixou roles com user_id errado (primeiro admin do seed vs. dump antigo).
 *
 * Uso:
 *   node supabase/scripts/fix-user-roles.mjs [caminho/migration.sql]
 *
 * Requer VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env
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

if (!url || !serviceRole) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const migrationPath = process.argv[2]
  ? resolve(process.argv[2])
  : process.env.MIGRATION_SQL
    ? resolve(process.env.MIGRATION_SQL)
    : null;

function parseRolesFromSql(sql) {
  const re =
    /INSERT INTO "public"\."user_roles" \("id", "user_id", "role", "created_at"\) VALUES \('([^']+)', '([^']+)', '([^']+)', '[^']+'\)/g;
  const roles = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    roles.push({ id: m[1], user_id: m[2], role: m[3] });
  }
  return roles;
}

/** Roles esperados do dump (fallback se migration.sql não for informado) */
const FALLBACK_ROLES = [
  { id: '328a73cf-b57f-4be4-8e30-8cf40e40b97d', user_id: 'dd939cd3-ce76-4b8d-802b-f24c8cf124b4', role: 'admin' },
  { id: 'd96cff00-9e3b-434d-828c-0aa5df8d7e1d', user_id: 'b30a2f84-01ea-46ba-a42e-fc0bdd2b1a3f', role: 'user' },
  { id: '88a9ed73-abce-423d-9fbb-4c7ed45d99a8', user_id: '6c366e23-349c-496d-826c-6bc50161fb74', role: 'admin' },
  { id: '5cffed15-201e-4d37-b842-ad5292f82568', user_id: 'd0686a49-8503-4b2e-9652-5ca1040cfd4c', role: 'user' },
  { id: '4741ef34-1723-4e34-a32e-7425c767ce83', user_id: '2d7f97cc-cc5c-4f0f-b0d0-ed9ac671b4ef', role: 'user' },
  { id: 'e4d14e07-8789-42e6-a2c7-ca51355fcbae', user_id: 'd9f558c0-fa9e-4a2d-8e45-e67669d436ee', role: 'user' },
  { id: '9dd17a18-7673-4a32-8821-d9b9e9397aa5', user_id: 'dafdd8e5-10fd-4773-b19d-f0856da40782', role: 'user' },
  { id: '9be2eb1c-93e0-4c12-b2ad-58268092d7ba', user_id: '755e3a01-4ffa-43d0-95dc-9f02ff801d62', role: 'user' },
  { id: '8483ffcc-69e1-453c-99d0-77c69e88e7ce', user_id: '3a6acb94-d40e-4cff-9fd5-408ad7d80594', role: 'user' },
  { id: '7e43edd2-1959-4619-9bc4-b7d81368273d', user_id: '9cabc35b-31c9-43d7-b3cb-1b182475b1f0', role: 'user' },
  { id: 'bee791e0-4393-4880-913f-b1f885857678', user_id: '07e82838-9421-4ff8-8783-4eb2151ad1d4', role: 'admin' },
  { id: '5887998b-e951-45b0-a193-edff6bce8230', user_id: '7897b833-fb2b-4a11-ba6a-564e9e61b2c5', role: 'user' },
  { id: '2a08d388-34f5-46bf-877a-82d709180b58', user_id: 'c5e5b132-79aa-4fab-b31a-a1a05159baa0', role: 'user' },
];

let expectedRoles = FALLBACK_ROLES;
if (migrationPath) {
  if (!existsSync(migrationPath)) {
    console.error(`Arquivo não encontrado: ${migrationPath}`);
    process.exit(1);
  }
  expectedRoles = parseRolesFromSql(readFileSync(migrationPath, 'utf8'));
  if (expectedRoles.length === 0) {
    console.error('Nenhum INSERT de user_roles encontrado no SQL.');
    process.exit(1);
  }
  console.log(`Lendo ${expectedRoles.length} roles de ${migrationPath}`);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (authErr) {
  console.error('Erro ao listar usuários:', authErr.message);
  process.exit(1);
}
const validUserIds = new Set(authUsers.users.map((u) => u.id));

const { data: currentRoles, error: rolesErr } = await admin.from('user_roles').select('id, user_id, role');
if (rolesErr) {
  console.error('Erro ao ler user_roles:', rolesErr.message);
  process.exit(1);
}

const byId = new Map(currentRoles.map((r) => [r.id, r]));
const byUserId = new Map(currentRoles.map((r) => [r.user_id, r]));

let fixed = 0;
let inserted = 0;
let removed = 0;

// Remove roles órfãs (user_id sem auth.users)
for (const row of currentRoles) {
  if (!validUserIds.has(row.user_id)) {
    const { error } = await admin.from('user_roles').delete().eq('id', row.id);
    if (error) {
      console.error(`  ERRO ao remover órfão ${row.id} (${row.user_id}):`, error.message);
    } else {
      console.log(`  Removido órfão: ${row.user_id} (${row.role})`);
      removed++;
      byId.delete(row.id);
      byUserId.delete(row.user_id);
    }
  }
}

for (const expected of expectedRoles) {
  if (!validUserIds.has(expected.user_id)) {
    console.warn(`  Ignorado (usuário inexistente): ${expected.user_id}`);
    continue;
  }

  const byIdRow = byId.get(expected.id);
  const byUserRow = byUserId.get(expected.user_id);

  if (byIdRow && byIdRow.user_id === expected.user_id && byIdRow.role === expected.role) {
    continue;
  }

  if (byIdRow && byIdRow.user_id !== expected.user_id) {
    const { error } = await admin
      .from('user_roles')
      .update({ user_id: expected.user_id, role: expected.role })
      .eq('id', expected.id);
    if (error) {
      console.error(`  ERRO update id ${expected.id}:`, error.message);
    } else {
      console.log(`  Corrigido role ${expected.role} → ${expected.user_id} (id ${expected.id})`);
      fixed++;
    }
    continue;
  }

  if (byUserRow) {
    if (byUserRow.role !== expected.role) {
      const { error } = await admin
        .from('user_roles')
        .update({ role: expected.role })
        .eq('id', byUserRow.id);
      if (error) {
        console.error(`  ERRO update role ${expected.user_id}:`, error.message);
      } else {
        console.log(`  Atualizado role de ${expected.user_id}: ${byUserRow.role} → ${expected.role}`);
        fixed++;
      }
    }
    continue;
  }

  const { error } = await admin.from('user_roles').insert({
    id: expected.id,
    user_id: expected.user_id,
    role: expected.role,
  });
  if (error) {
    console.error(`  ERRO insert ${expected.user_id}:`, error.message);
  } else {
    console.log(`  Inserido role ${expected.role} → ${expected.user_id}`);
    inserted++;
  }
}

console.log(`\nConcluído: ${fixed} corrigido(s), ${inserted} inserido(s), ${removed} órfão(s) removido(s).`);
