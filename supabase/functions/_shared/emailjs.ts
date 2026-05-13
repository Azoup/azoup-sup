const EMAILJS_SEND = "https://api.emailjs.com/api/v1.0/email/send";

export async function sendEmailJs(templateParams: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID")?.trim();
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID")?.trim();
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY")?.trim();

  if (!serviceId || !templateId || !publicKey) {
    return { ok: false, status: 500, body: "missing_emailjs_config" };
  }

  const payload: Record<string, unknown> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: templateParams,
  };
  if (privateKey) payload.accessToken = privateKey;

  const res = await fetch(EMAILJS_SEND, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
