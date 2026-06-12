import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type PhotoBucket = "analyst-photos" | "developer-photos" | "profile-photos";
export type PhotoTable = "analysts" | "developers" | "profiles";

export type UploadPhotoBody = {
  bucket: PhotoBucket;
  table: PhotoTable;
  record_id: string;
  file_name: string;
  content_type: string;
  file_base64: string;
};

const ALLOWED_TABLES: Record<PhotoBucket, PhotoTable> = {
  "analyst-photos": "analysts",
  "developer-photos": "developers",
  "profile-photos": "profiles",
};

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

export async function uploadPhotoCore(
  authHeader: string,
  body: UploadPhotoBody,
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

  const bucket = body.bucket;
  const table = body.table;
  const recordId = body.record_id?.trim();
  const fileName = body.file_name?.trim() || "photo.jpg";
  const contentType = body.content_type?.trim() || "image/jpeg";
  const fileBase64 = body.file_base64?.trim();

  if (!bucket || !ALLOWED_TABLES[bucket]) {
    return { status: 400, body: { error: "invalid_bucket" } };
  }
  if (table !== ALLOWED_TABLES[bucket]) {
    return { status: 400, body: { error: "invalid_table" } };
  }
  if (!recordId || !fileBase64) {
    return { status: 400, body: { error: "missing_fields" } };
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(fileBase64, "base64");
  } catch {
    return { status: 400, body: { error: "invalid_base64" } };
  }
  if (fileBuffer.length < 16) {
    return { status: 400, body: { error: "empty_file" } };
  }

  const ext = fileName.split(".").pop() || "jpg";
  const storagePath = `${recordId}/${Date.now()}.${ext}`;

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: upErr } = await admin.storage.from(bucket).upload(storagePath, fileBuffer, {
    upsert: true,
    contentType,
  });
  if (upErr) {
    return { status: 500, body: { error: "upload_failed", message: upErr.message } };
  }

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = normalizeStorageHost(urlData.publicUrl, config.supabaseUrl);

  const { data: updated, error: dbErr } = await admin
    .from(table)
    .update({ photo_url: publicUrl })
    .eq("id", recordId)
    .select("id, photo_url")
    .maybeSingle();

  if (dbErr) {
    return { status: 500, body: { error: "db_update_failed", message: dbErr.message } };
  }
  if (!updated) {
    return { status: 404, body: { error: "record_not_found" } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      public_url: publicUrl,
      photo_url: updated.photo_url,
      storage_path: storagePath,
    },
  };
}
