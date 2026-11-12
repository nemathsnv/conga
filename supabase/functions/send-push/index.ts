// Drains the push outbox: due rows -> Expo push service -> marked sent or retried.
// Called by pg_cron through pg_net every minute (public.run_push_sender) with the key stored
// in Vault as push_function_key; the same value is this function's PUSH_SENDER_KEY secret.
// No user JWT. Dead tokens reported by Expo are dropped.
import { bearerMatches } from "../_shared/client.ts";
import { json } from "../_shared/mux.ts";
import { adminClient } from "../_shared/supabase.ts";

type Due = {
  id: number;
  kind: string;
  recipient_id: string;
  tokens: { token: string; platform: string }[];
  body: string | null;
  data: Record<string, unknown>;
};

type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("PUSH_SENDER_KEY");
  // Constant-time comparison (a plain !== leaks how much of the key matched through timing).
  if (!bearerMatches(req.headers.get("Authorization"), key)) return json({ error: "unauthorized" }, 401);

  const admin = adminClient();
  const { data, error } = await admin.rpc("push_due", { p_limit: 100 });
  if (error) return json({ error: "db_failed" }, 500);
  const due = (data ?? []) as Due[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of due) {
    if (!row.body || row.tokens.length === 0) {
      // Nothing to say or nobody to say it to: mark it done so it is not retried forever.
      await admin.rpc("push_mark", { p_id: row.id, p_ok: true, p_error: row.body ? "no_tokens" : "no_text" });
      skipped++;
      continue;
    }
    const messages = row.tokens.map((t) => ({ to: t.token, sound: "default", body: row.body, data: row.data }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(Deno.env.get("EXPO_ACCESS_TOKEN") ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` } : {}) },
        body: JSON.stringify(messages),
      });
      if (!res.ok) throw new Error(`expo_http_${res.status}`);
      const { data: tickets } = (await res.json()) as { data: ExpoTicket[] };
      let ok = false;
      const errors: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === "ok") ok = true;
        else {
          errors.push(ticket.details?.error ?? ticket.message ?? "error");
          if (ticket.details?.error === "DeviceNotRegistered") void admin.rpc("push_drop_token", { p_token: row.tokens[i].token });
        }
      });
      await admin.rpc("push_mark", { p_id: row.id, p_ok: ok, p_error: errors.length ? errors.join(",") : null });
      if (ok) sent++;
      else failed++;
    } catch (e) {
      await admin.rpc("push_mark", { p_id: row.id, p_ok: false, p_error: String(e) });
      failed++;
    }
  }
  return json({ ok: true, due: due.length, sent, skipped, failed });
});
