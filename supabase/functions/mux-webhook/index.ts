import { handleMuxWebhook } from "./handler.ts";

Deno.serve(handleMuxWebhook);
