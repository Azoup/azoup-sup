import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type KanbanCardImagesTable = "kanban_card_images" | "dev_kanban_card_images";

export type UploadKanbanImageBody = {
  card_id: string;
  images_table: KanbanCardImagesTable;
  file_name: string;
  content_type: string;
  file_base64: string;
};

const ALLOWED_TABLES: KanbanCardImagesTable[] = ["kanban_card_images", "dev_kanban_card_images"];

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

export async function uploadKanbanImageCore(
  authHeader: string,
  body: UploadKanbanImageBody,
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
  const imagesTable = body.images_table;
  const fileName = body.file_name?.trim() || "image.png";
  const contentType = body.content_type?.trim() || "image/png";
  const fileBase64 = body.file_base64?.trim();

  if (!cardId || !fileBase64) {
    return { status: 400, body: { error: "missing_fields" } };
  }
  if (!imagesTable || !ALLOWED_TABLES.includes(imagesTable)) {
    return { status: 400, body: { error: "invalid_table" } };
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

  const ext = fileName.split(".").pop() || "png";
  const storagePath = `${cardId}/${Date.now()}.${ext}`;

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: upErr } = await admin.storage.from("kanban-images").upload(storagePath, fileBuffer, {
    upsert: false,
    contentType,
  });
  if (upErr) {
    return { status: 500, body: { error: "upload_failed", message: upErr.message } };
  }

  const { data: urlData } = admin.storage.from("kanban-images").getPublicUrl(storagePath);
  const publicUrl = normalizeStorageHost(urlData.publicUrl, config.supabaseUrl);

  const { data: row, error: dbErr } = await admin
    .from(imagesTable)
    .insert({ card_id: cardId, image_url: publicUrl })
    .select("id, image_url")
    .single();

  if (dbErr) {
    return { status: 500, body: { error: "db_insert_failed", message: dbErr.message } };
  }

  return {
    status: 200,
    body: { public_url: publicUrl, id: row?.id },
  };
}
