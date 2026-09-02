import { describe, expect, it } from "vitest";
import { isEligibleDigisacAnalystUser } from "./digisacActiveUsers";

const activeUser = {
  id: "c025ce3f-7a08-463f-9c39-13d675b2a237",
  name: "Anna Carollina",
  active: true,
  archivedAt: null,
  deletedAt: null,
  isClientUser: false,
};

describe("isEligibleDigisacAnalystUser", () => {
  it("mantém usuário ativo da equipe", () => {
    expect(isEligibleDigisacAnalystUser(activeUser)).toBe(true);
  });

  it("remove usuário arquivado no Digisac", () => {
    expect(isEligibleDigisacAnalystUser({
      ...activeUser,
      archivedAt: "2026-08-01T12:00:00.000Z",
    })).toBe(false);
    expect(isEligibleDigisacAnalystUser({
      ...activeUser,
      archived_at: "2026-08-01T12:00:00.000Z",
    })).toBe(false);
    expect(isEligibleDigisacAnalystUser({
      ...activeUser,
      archived: true,
    })).toBe(false);
  });

  it("remove usuário excluído", () => {
    expect(isEligibleDigisacAnalystUser({
      ...activeUser,
      deletedAt: "2026-08-01T12:00:00.000Z",
    })).toBe(false);
  });

  it("remove usuário inativo", () => {
    expect(isEligibleDigisacAnalystUser({ ...activeUser, active: false })).toBe(false);
  });

  it("remove usuário de cliente", () => {
    expect(isEligibleDigisacAnalystUser({ ...activeUser, isClientUser: true })).toBe(false);
  });

  it("mantém registro legado sem campos de status", () => {
    expect(isEligibleDigisacAnalystUser({ id: "1", name: "Beatriz Oliveira" })).toBe(true);
  });

  it("remove registro sem id", () => {
    expect(isEligibleDigisacAnalystUser({ name: "Sem id" })).toBe(false);
  });
});
