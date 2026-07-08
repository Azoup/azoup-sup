import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type KanbanFilesBucket = "kanban-files" | "dev-kanban-files";
export type KanbanCardFilesTable = "kanban_card_files" | "dev_kanban_card_files";

export type UploadKanbanFileBody = {
  card_id: string;
  files_table: KanbanCardFilesTable;
  bucket: KanbanFilesBucket;
  file_name: string;
  content_type: string;
  file_base64: string;
};

const BUCKET_TABLE_MAP: Record<KanbanFilesBucket, KanbanCardFilesTable> = {
  "kanban-files": "kanban_card_files",
  "dev-kanban-files": "dev_kanban_card_files",
};

/** Limite da API (base64); arquivos maiores usam upload direto/resumável no cliente. */
const KANBAN_API_MAX_FILE_BYTES = 48 * 1024 * 1024;
/** Limite do bucket ao criar via API (5 GB). */
const KANBAN_BUCKET_MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
  "video/x-ms-wmv",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/xml",
  "application/xml",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-compressed",
  "application/rar",
  "application/x-7z-compressed",
  "application/gzip",
  "application/x-tar",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

function normalizeStorageHost(url: string, supabaseUrl: string): string {
  const legacy = "ffvgrvrkuiypjzfdcfyw.supabase.co";
  if (!url.includes(legacy)) return url;
  try {
    const host = new URL(supabaseUrl).host;
    return url.replace(legacy, host);
  } catch {
    return url.replace(legacy, "ittmglvkympbyeowgucl.supabase.co");
  }
}

async function ensureKanbanFilesBucket(admin: SupabaseClient, bucketId: KanbanFilesBucket): Promise<void> {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw listErr;
  if (buckets?.some((b) => b.id === bucketId || b.name === bucketId)) return;

  const { error: createErr } = await admin.storage.createBucket(bucketId, {
    public: true,
    fileSizeLimit: KANBAN_BUCKET_MAX_FILE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
  if (createErr && !/already exists/i.test(createErr.message)) {
    throw createErr;
  }
}

export async function uploadKanbanFileCore(
  authHeader: string,
  body: UploadKanbanFileBody,
  config: AdminConfig,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const jwt = authHeader.slice(7).trim();
  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser(jwt);
  if (authErr || !user?.id) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const cardId = body.card_id?.trim();
  const bucket = body.bucket;
  const filesTable = body.files_table;
  const fileName = body.file_name?.trim() || "file.bin";
  const contentType = body.content_type?.trim() || "application/octet-stream";
  const fileBase64 = body.file_base64?.trim();

  if (!cardId || !fileBase64) {
    return { status: 400, body: { error: "missing_fields" } };
  }
  if (!bucket || !BUCKET_TABLE_MAP[bucket]) {
    return { status: 400, body: { error: "invalid_bucket" } };
  }
  if (!filesTable || filesTable !== BUCKET_TABLE_MAP[bucket]) {
    return { status: 400, body: { error: "invalid_table" } };
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(fileBase64, "base64");
  } catch {
    return { status: 400, body: { error: "invalid_base64" } };
  }
  if (fileBuffer.length < 1) {
    return { status: 400, body: { error: "empty_file" } };
  }
  if (fileBuffer.length > KANBAN_API_MAX_FILE_BYTES) {
    return { status: 400, body: { error: "file_too_large" } };
  }

  const ext = (fileName.split(".").pop() || "bin").toLowerCase();
  const storagePath = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await ensureKanbanFilesBucket(admin, bucket);
  } catch (bucketErr) {
    const message = bucketErr instanceof Error ? bucketErr.message : "bucket_setup_failed";
    return { status: 500, body: { error: "bucket_setup_failed", message } };
  }

  const { error: upErr } = await admin.storage.from(bucket).upload(storagePath, fileBuffer, {
    upsert: false,
    contentType,
  });
  if (upErr) {
    return { status: 500, body: { error: "upload_failed", message: upErr.message } };
  }

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = normalizeStorageHost(urlData.publicUrl, config.supabaseUrl);

  const { data: row, error: dbErr } = await admin
    .from(filesTable)
    .insert({
      card_id: cardId,
      file_url: publicUrl,
      file_path: storagePath,
      file_name: fileName,
      file_type: contentType,
      file_size: fileBuffer.length,
      uploaded_by: user.id,
      uploaded_by_email: user.email || "",
    })
    .select("id, card_id, file_url, file_path, file_name, file_type, file_size, created_at")
    .single();

  if (dbErr) {
    return { status: 500, body: { error: "db_insert_failed", message: dbErr.message } };
  }

  return {
    status: 200,
    body: { file: row },
  };
}
