# Phase 1 prompt: video spike

Paste everything below the line into Claude Code, opened in this folder.

---

Read `CLAUDE.md`, then `SPEC.md` Sections 1, 2, 6, 19, 22 and 23. We are starting **phase 1: the video spike**. Build nothing else.

**Goal:** collect the evidence I need to pick the video provider (gate 1) and the camera library. It must be real measurements on real phones, not opinions.

**What to build:** a throwaway Expo app in `spike/` (TypeScript, a development build, not Expo Go) with a single debug screen. It doesn't follow the design and is never shipped. It should:

1. Record from the front camera, up to 30 seconds. Implement it twice, once with `expo-camera` and once with `react-native-vision-camera`, behind a toggle.
2. Upload the recording, in the foreground, to each of three backends:
   - **Mux** (direct upload);
   - **Cloudflare Stream** (direct creator upload);
   - **Supabase Storage** (signed upload URL).

   Upload URLs are minted by Supabase Edge Functions. No provider secret is ever in the app.
3. Play each upload back in a full-screen vertical player that loops, with sound on (Mux and Cloudflare via HLS).
4. Log, for every run:
   - file size, duration, resolution and bitrate as recorded;
   - upload time, and whether it failed or retried;
   - time from upload finished to playable;
   - time to first frame on playback;
   - stalls or rebuffering during playback;
   - device and network type.

   Write the log as JSON lines and export it from the debug screen.

**Supabase Storage note:** there is no transcoding, so measure the raw file. Then estimate in the report what our own transcoding would cost and involve.

**Test matrix:** I will run it on a mid-range Android phone over Bali mobile data (4G, not Wi-Fi) and on an iPhone. Give me a short step-by-step checklist for the runs, about 5 recordings per provider per phone. Keep the steps simple enough that I can follow them alone.

**Deliverable:** `spike/REPORT.md` containing:

- a results table per provider and per camera library;
- the cost per 1,000 minutes stored and per 1,000 minutes watched, using each provider's **current** published pricing. Look it up, cite the pricing page and date, and flag anything that is estimated;
- front-camera quality notes;
- how the upload behaved on bad networks;
- a clear recommendation, with the trade-offs stated honestly.

I make the final call and record it in `docs/DECISIONS.md`.

**Before writing code:**

1. Tell me exactly which accounts and keys you need: Mux, Cloudflare, a Supabase dev project, and the Apple and Google developer setup for dev builds on my devices.
2. Create `spike/.env.example` listing them.
3. Wait for me to fill in `.env`.
4. Check that Xcode, Android Studio or the Android SDK, and CocoaPods are installed on this Mac. Tell me what's missing.

**Out of scope:**

- product screens, navigation, auth, the database schema;
- the design system;
- background uploads, camera-roll import, filters.

If any of these seems needed, stop and ask me.
