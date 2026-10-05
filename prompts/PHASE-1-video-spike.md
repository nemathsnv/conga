# Phase 1 prompt: video spike

Paste everything below the line into Claude Code, opened in this folder.

---

Read `CLAUDE.md`, then `SPEC.md` Sections 1, 2, 6, 19, 22 and 23. We are starting **phase 1: the video spike**. Build nothing else. This is a technical spike, not Shortcut application development.

**Goal:** collect the evidence I need to pick the video provider (gate 1) and the camera library. It must be real measurements on real phones, not opinions.

**Start with the simplest likely production stack** and only widen on evidence:

- Expo / React Native development build (TypeScript, not Expo Go)
- `expo-camera` for recording
- Mux direct uploads, with the upload URL minted server-side by a Supabase Edge Function
- vertical Mux HLS playback

Do not implement `react-native-vision-camera`, Cloudflare Stream or custom Supabase video hosting at the start.

**The first question:** can `expo-camera` + Mux satisfy Shortcut's recording, upload and playback requirements on a real iPhone and a mid-range Android over normal mobile data?

**What to build:** a throwaway Expo app in `spike/` with a single debug screen. It doesn't follow the design and is never shipped. It must be able to:

1. record front/back vertical video;
2. enforce 2–30 seconds;
3. test the light/flash and zoom requirements (SPEC.md Section 2: light, 1× zoom);
4. preview the recording;
5. discard and re-record;
6. upload directly to Mux in the foreground using a server-minted upload URL; no provider secret is ever in the app;
7. show actual foreground upload progress;
8. preserve the local recording if posting fails or is interrupted (SPEC.md Section 19);
9. detect when the Mux asset becomes playable;
10. play vertically with sound;
11. loop like Shortcut Home;
12. play several clips in sequence like the Response Player.

**Measure and log, for every run:**

- device;
- network type;
- duration, resolution, bitrate and file size as recorded;
- upload time;
- Mux processing time (upload finished to playable);
- playback first-frame latency;
- stalls or rebuffering;
- failures and retries.

Write the log as JSON lines and export it from the debug screen.

**Escalation rules.** Widen the spike only on documented evidence, and record the trigger in `spike/REPORT.md`:

- Test `react-native-vision-camera` only if `expo-camera` fails a documented requirement (front-camera quality, the 30-second limit, light, zoom, sound).
- Test Cloudflare Stream only if Mux fails a documented requirement or its cost is materially unsuitable.
- Investigate Supabase Storage plus our own transcoding only if managed video hosting appears economically unacceptable. There is no transcoding there, so measure the raw file and estimate in the report what our own transcoding would cost and involve.

**Test matrix:** I will run it on a mid-range Android phone over Bali mobile data (4G, not Wi-Fi) and on an iPhone. Give me a short step-by-step checklist for the runs, about 5 recordings per phone per provider tested. Keep the steps simple enough that I can follow them alone.

**Deliverable:** `spike/REPORT.md` containing:

- a results table per provider and per camera library tested;
- the cost per 1,000 minutes stored and per 1,000 minutes watched, using each provider's **current** published pricing. Look it up, cite the pricing page and date, and flag anything that is estimated;
- front-camera quality notes;
- how the upload behaved on bad networks;
- which escalation rules fired, if any, and why;
- a clear recommendation, with the trade-offs stated honestly.

I make the final call and record it in `docs/DECISIONS.md`.

**Before writing code:**

1. Tell me exactly which accounts and keys you need: Mux, a Supabase dev project, and the Apple and Google developer setup for dev builds on my devices.
2. Create `spike/.env.example` for the mobile app. It holds public client configuration only. Mux credentials are stored as Supabase Edge Function secrets, and the Supabase CLI is authenticated locally for deployment; neither goes in the mobile `.env`.
3. Wait for me to fill in `.env`.
4. Check that Xcode, Android Studio or the Android SDK, and CocoaPods are installed on this Mac. Tell me what's missing.

**Out of scope:**

- product screens, navigation, auth, the database schema, feeds, profiles;
- the design system;
- background uploads, camera-roll import, filters.

If any of these seems needed, stop and ask me. Do not continue to phase 2 without my approval.
