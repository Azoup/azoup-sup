/**
 * Corrige auth.users com email vazio após migração SQL (login falha com "credenciais inválidas").
 * Preenche email a partir de user_metadata ou identities via Admin API.
 *
 * Uso: node supabase/scripts/fix-auth-users-email.mjs
 * Requer SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL no .env
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

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('Erro ao listar usuários:', listErr.message);
  process.exit(1);
}

let fixed = 0;
let skipped = 0;

for (const user of list.users) {
  if (user.email?.trim()) {
    skipped++;
    continue;
  }

  const metaEmail =
    typeof user.user_metadata?.email === 'string' ? user.user_metadata.email.trim() : '';
  const identityEmail =
    user.identities
      ?.map((i) => i.identity_data?.email)
      .find((e) => typeof e === 'string' && e.includes('@')) ?? '';
  const email = metaEmail || identityEmail;

  if (!email) {
    console.warn(`  Ignorado (sem email): ${user.id}`);
    skipped++;
    continue;
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });

  if (error) {
    console.error(`  ERRO ${user.id} (${email}):`, error.message);
  } else {
    console.log(`  OK: ${email}`);
    fixed++;
  }
}

console.log(`\nConcluído: ${fixed} corrigido(s), ${skipped} já ok ou ignorado(s).`);
