import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type DevKanbanBoardPayload = {
  columns: unknown[];
  analysts: unknown[];
  developers: unknown[];
  cards: unknown[];
  labels: unknown[];
  cardLabels: unknown[];
  cardImages: unknown[];
};

export async function fetchDevKanbanBoardWithAdmin(
  admin: SupabaseClient,
): Promise<DevKanbanBoardPayload | { error: string }> {
  const [columnsRes, analystsRes, developersRes, cardsRes, labelsRes, cardLabelsRes, cardImagesRes] =
    await Promise.all([
      admin.from("dev_kanban_columns").select("*").order("position"),
      admin.from("analysts").select("*").eq("status", "active").order("name"),
      admin.from("developers").select("*").eq("status", "active").order("name"),
      admin.from("dev_kanban_cards").select("*").order("position"),
      admin.from("dev_kanban_labels").select("*").order("name"),
      admin.from("dev_kanban_card_labels").select("*, dev_kanban_labels(*)"),
      admin.from("dev_kanban_card_images").select("*").order("created_at"),
    ]);

  const firstErr =
    columnsRes.error ||
    analystsRes.error ||
    developersRes.error ||
    cardsRes.error ||
    labelsRes.error ||
    cardLabelsRes.error ||
    cardImagesRes.error;

  if (firstErr) {
    return { error: firstErr.message };
  }

  return {
    columns: columnsRes.data ?? [],
    analysts: analystsRes.data ?? [],
    developers: developersRes.data ?? [],
    cards: cardsRes.data ?? [],
    labels: labelsRes.data ?? [],
    cardLabels: cardLabelsRes.data ?? [],
    cardImages: cardImagesRes.data ?? [],
  };
}

export async function fetchDevKanbanBoardCore(
  authHeader: string,
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

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const board = await fetchDevKanbanBoardWithAdmin(admin);
  if ("error" in board) {
    return { status: 500, body: { error: "dev_kanban_fetch_failed", message: board.error } };
  }

  return { status: 200, body: board as unknown as Record<string, unknown> };
}
