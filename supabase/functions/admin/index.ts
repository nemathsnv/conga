// Moderation admin: see handler.ts for the routes and the security model, and
// docs/release/MODERATION.md for deploying and operating it. Deployed with verify_jwt off (the
// function checks the caller's token and moderator membership itself, on every request).
import { adminClient } from "../_shared/supabase.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHandler, type Deps } from "./handler.ts";

function realDeps(): Deps {
  const svc = adminClient();
  const verifier = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    // auth.getUser(token) asks Auth to validate the token; nothing is trusted from decoding it.
    verifyToken: async (token) => {
      const { data, error } = await verifier.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    rpc: async (name, args) => {
      const { data, error } = await svc.rpc(name, args ?? {});
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
    config: {
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      authBase: Deno.env.get("ADMIN_AUTH_BASE") ?? "",
      webBase: Deno.env.get("ADMIN_WEB_PLAYER_BASE") ?? "",
    },
  };
}

Deno.serve(createHandler(realDeps()));
