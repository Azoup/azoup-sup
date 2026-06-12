import { describe, it, expect } from "vitest";
import { routeName } from "./routeName";

describe("routeName", () => {
  it("lê query.route string", () => {
    expect(routeName({ query: { route: "my-access" }, url: "/api/my-access" })).toBe("my-access");
  });

  it("lê query.route array", () => {
    expect(routeName({ query: { route: ["my-access"] }, url: "/api/my-access" })).toBe("my-access");
  });

  it("fallback para req.url quando query vazio", () => {
    expect(routeName({ query: {}, url: "/api/kanban-board?foo=1" })).toBe("kanban-board");
  });
});
