// POST { email } -> { providers: string[] }
// Tells the app which sign-in method an email already uses, before an email
// code is sent, so E-Linked ("You already have an account ... signs in with
// Apple") can be shown. SPEC.md Section 13: accounts can't be merged; one
// sign-in method per account. Runs with the service role; the app never sees
// auth tables. The caller is not signed in yet, so verify_jwt is off and the
// request must carry the project's public API key instead.
//
// Limited (migration 20261016000204, rules signin_address and signin_client): per address and
// per client IP. Over a limit the answer is the same as for an address with no account
// ({ providers: [] }), so a lookup never says it was limited and the app shows no new state: the
// email code is sent as usual, and the access token hook still refuses it for an Apple or Google
// account (E-Code).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { clientIp } from "../_shared/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleSigninMethod(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!publicKey || apikey !== publicKey) return json({ error: "unauthorized" }, 401);

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!EMAIL.test(email) || email.length > 254) return json({ error: "bad_request" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.rpc("signin_providers_limited", { p_email: email, p_client: clientIp(req) });
  if (error) return json({ error: "lookup_failed" }, 500);
  return json({ providers: data ?? [] });
}
