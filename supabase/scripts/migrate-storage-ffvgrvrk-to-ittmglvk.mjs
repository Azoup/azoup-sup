/**
 * Copia todos os arquivos do Storage do projeto antigo (ffvgrvrk) para o novo (ittmglvk).
 *
 * Pré-requisitos no .env (raiz do projeto):
 *   OLD_SUPABASE_URL=https://ffvgrvrkuiypjzfdcfyw.supabase.co
 *   OLD_SUPABASE_SERVICE_ROLE_KEY=<service_role do projeto ANTIGO>
 *   VITE_SUPABASE_URL=https://ittmglvkympbyeowgucl.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role do projeto NOVO (ittmglvk)>
 *
 * Uso:
 *   node supabase/scripts/migrate-storage-ffvgrvrk-to-ittmglvk.mjs
 *   node supabase/scripts/migrate-storage-ffvgrvrk-to-ittmglvk.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const BUCKETS = [
  'analyst-photos',
  'developer-photos',
  'profile-photos',
  'kanban-images',
  'kanban-files',
  'dev-kanban-files',
];

const dryRun = process.argv.includes('--dry-run');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
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

const oldUrl = process.env.OLD_SUPABASE_URL;
const oldKey = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const newUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const newKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Erro: defina ${name} no arquivo .env`);
    process.exit(1);
  }
}

requireEnv('OLD_SUPABASE_URL', oldUrl);
requireEnv('OLD_SUPABASE_SERVICE_ROLE_KEY', oldKey);
requireEnv('VITE_SUPABASE_URL (ou SUPABASE_URL)', newUrl);
requireEnv('SUPABASE_SERVICE_ROLE_KEY (projeto ittmglvk)', newKey);

const oldClient = createClient(oldUrl, oldKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const newClient = createClient(newUrl, newKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Lista recursivamente todos os caminhos de arquivo no bucket. */
async function listAllPaths(client, bucket, folder = '') {
  const paths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`${bucket}/${folder}: ${error.message}`);

    if (!data?.length) break;

    for (const item of data) {
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) {
        paths.push(...(await listAllPaths(client, bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return paths;
}

async function ensurePublicBucket(client, bucketId) {
  const { data: buckets } = await client.storage.listBuckets();
  if (buckets?.some((b) => b.id === bucketId || b.name === bucketId)) return;

  if (dryRun) {
    console.log(`  [dry-run] criaria bucket público: ${bucketId}`);
    return;
  }

  const { error } = await client.storage.createBucket(bucketId, { public: true });
  if (error && !error.message.includes('already exists')) {
    throw new Error(`criar bucket ${bucketId}: ${error.message}`);
  }
  console.log(`  Bucket criado: ${bucketId}`);
}

async function copyFile(bucket, path) {
  if (dryRun) return { status: 'dry-run' };

  const { data: blob, error: dlErr } = await oldClient.storage.from(bucket).download(path);
  if (dlErr) throw new Error(`download: ${dlErr.message}`);

  const contentType = blob.type || 'application/octet-stream';
  const { error: upErr } = await newClient.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  return { status: 'copied' };
}

async function main() {
  console.log(dryRun ? '=== MODO DRY-RUN (nenhum arquivo será copiado) ===\n' : '=== Migração de Storage ===\n');
  console.log('Origem:', oldUrl);
  console.log('Destino:', newUrl);
  console.log('Buckets:', BUCKETS.join(', '), '\n');

  const stats = { copied: 0, failed: 0, dryRun: 0 };

  for (const bucket of BUCKETS) {
    console.log(`\n--- ${bucket} ---`);
    await ensurePublicBucket(newClient, bucket);

    let paths;
    try {
      paths = await listAllPaths(oldClient, bucket);
    } catch (e) {
      console.warn(`  Aviso: não foi possível listar (${e.message}). Bucket vazio ou inexistente.`);
      continue;
    }

    console.log(`  ${paths.length} arquivo(s) no projeto antigo`);

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const label = `  [${i + 1}/${paths.length}] ${path}`;
      try {
        const result = await copyFile(bucket, path);
        if (result.status === 'copied') {
          stats.copied++;
          if ((i + 1) % 10 === 0 || i === paths.length - 1) console.log(`${label} OK`);
        } else {
          stats.dryRun++;
        }
      } catch (e) {
        stats.failed++;
        console.error(`${label} ERRO: ${e.message}`);
      }
    }
  }

  console.log('\n=== Resumo ===');
  console.log('Copiados:', stats.copied);
  console.log('Falhas:', stats.failed);
  if (dryRun) console.log('(dry-run — nada foi enviado ao destino)');

  if (!dryRun && stats.failed === 0) {
    console.log('\nPróximo passo: execute no SQL Editor do projeto ittmglvk:');
    console.log('  supabase/scripts/atualizar-urls-storage-ittmglvk.sql');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
