import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type KanbanBoardPayload = {
  columns: unknown[];
  analysts: unknown[];
  cards: unknown[];
  labels: unknown[];
  cardLabels: unknown[];
  cardImages: unknown[];
};

export async function fetchKanbanBoardWithAdmin(
  admin: ReturnType<typeof createClient>,
): Promise<KanbanBoardPayload | { error: string }> {
  const [columnsRes, analystsRes, cardsRes, labelsRes, cardLabelsRes, cardImagesRes] =
    await Promise.all([
      admin.from("kanban_columns").select("*").order("position"),
      admin.from("analysts").select("*").eq("status", "active").order("name"),
      admin.from("kanban_cards").select("*").order("position"),
      admin.from("kanban_labels").select("*").order("name"),
      admin.from("kanban_card_labels").select("*, kanban_labels(*)"),
      admin.from("kanban_card_images").select("*").order("created_at"),
    ]);

  const firstErr =
    columnsRes.error ||
    analystsRes.error ||
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
    cards: cardsRes.data ?? [],
    labels: labelsRes.data ?? [],
    cardLabels: cardLabelsRes.data ?? [],
    cardImages: cardImagesRes.data ?? [],
  };
}

export async function fetchKanbanBoardCore(
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

  const board = await fetchKanbanBoardWithAdmin(admin);
  if ("error" in board) {
    return { status: 500, body: { error: "kanban_fetch_failed", message: board.error } };
  }

  return { status: 200, body: board as unknown as Record<string, unknown> };
}
