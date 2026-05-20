/**
 * Proxy REST/Storage do Supabase via /api/rest-proxy.
 * Contorna falha ES256 no PostgREST (usuário cai em anon e RLS retorna vazio).
 */
export function createSupabaseRestFetch(): typeof fetch {
  const nativeFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const isSupabaseDataApi =
      url.includes("/rest/v1/") || url.includes("/storage/v1/");

    if (!isSupabaseDataApi || typeof window === "undefined") {
      return nativeFetch(input, init);
    }

    try {
      const parsed = new URL(url, window.location.origin);
      const headers = new Headers(init?.headers);
      const auth = headers.get("Authorization") || "";

      const proxyRes = await nativeFetch("/api/rest-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          path: parsed.pathname + parsed.search,
          method: init?.method || "GET",
          body:
            init?.body != null && typeof init.body === "string"
              ? init.body
              : init?.body != null
                ? await new Response(init.body).text()
                : null,
          headers: {
            ...(headers.get("Prefer") ? { Prefer: headers.get("Prefer")! } : {}),
            ...(headers.get("Accept") ? { Accept: headers.get("Accept")! } : {}),
            ...(headers.get("Content-Type")
              ? { "Content-Type": headers.get("Content-Type")! }
              : {}),
            ...(headers.get("Content-Range")
              ? { "Content-Range": headers.get("Content-Range")! }
              : {}),
            ...(headers.get("X-Upsert") ? { "X-Upsert": headers.get("X-Upsert")! } : {}),
          },
        }),
      });

      const responseHeaders = new Headers();
      proxyRes.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "content-encoding") {
          responseHeaders.set(key, value);
        }
      });

      return new Response(await proxyRes.text(), {
        status: proxyRes.status,
        statusText: proxyRes.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      console.warn("[supabase] rest-proxy falhou, tentando fetch direto:", err);
      return nativeFetch(input, init);
    }
  };
}
