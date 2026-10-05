// Shared Mux REST helper for the spike. Runs only inside Supabase Edge Functions.
// MUX_TOKEN_ID / MUX_TOKEN_SECRET come from `supabase secrets set`, never from the app.

const MUX_API = "https://api.mux.com";

function authHeader(): string {
  const id = Deno.env.get("MUX_TOKEN_ID");
  const secret = Deno.env.get("MUX_TOKEN_SECRET");
  if (!id || !secret) throw new Error("MUX_TOKEN_ID / MUX_TOKEN_SECRET not set");
  return "Basic " + btoa(`${id}:${secret}`);
}

export async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(MUX_API + path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Mux ${res.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body.data as T;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
