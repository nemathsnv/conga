# Phase 2 report: foundations

Branch `phase-2-foundations`. Date 6 Oct 2026. Gate 2 is **not** marked passed; that is Nemat's call.

## 1. What Phase 2 required (SPEC.md Section 23)

Repo, Expo app with the five tabs, clean Supabase migrations, Apple, Google and email sign-in,
18+ step, invite step behind its switch, name, username and photo.
Gate: the founder can sign up on iOS and Android.

## 2. What was implemented

- **Repo layout:** `app/` (production Expo SDK 57 / React Native 0.86 / TypeScript / Expo Router app),
  `supabase/` (migrations, tests, Edge Function, email template, config), `scripts/create-invite.sh`.
  `spike/` is untouched.
- **Sign-in:** email code (send, verify, resend countdown, wrong-code state), Sign in with Apple
  (native on iOS, Supabase web flow on Android), Google Sign-In (native on both). The E-Linked
  check runs server-side before a code is sent.
- **Onboarding order enforced from server state:** sign in → 18+ → invite (only while
  `app_config.invite_required` is true) or waitlist → name and username (live availability,
  taken state with three suggestions) → optional photo → Home. The next step is always computed
  from `get_onboarding_state()`, never from local guesses.
- **Five tabs** with the approved tab bar (dark glass on Home, light elsewhere). Tab contents are
  empty until phase 3; the + tab does nothing yet (C-Plus is phase 3).
- **Video architecture:** nothing video-related is built in this phase, by design. The phase 1
  conditions (H.264 at 2 to 3 Mbps, mint the Mux URL on Post Review, pre-warm, 1 s buffer, screen-fill
  front light, torch re-apply, segment recording for the mid-recording flip) are carried forward
  to phase 3 unchanged; see `spike/REPORT.md` Section 9 and `docs/DECISIONS.md`.

## 3. Migrations and schema

`supabase/migrations/`, reproducible from an empty database (`supabase db reset` runs them plus the local seed).

| Migration | Contents |
|---|---|
| `20261006000100_foundations.sql` | `app_config` (invite_required, invites_per_member, invite_valid_days), `beta_cohorts` (Canggu), `accounts` (created by a trigger on `auth.users`; age_confirmed_at, beta_cohort), `invites` (single-use codes, inviter, cohort, expiry, redemption, cancellation), `waitlist`, `profiles` (name ≤40, username 3–24 `[a-z0-9._]`, bio ≤150, photo_path). RLS on every table. |
| `20261006000200_onboarding_functions.sql` | `get_onboarding_state`, `confirm_age`, `check_invite`, `redeem_invite`, `join_waitlist`, `username_status`, `username_suggestions`, `create_profile`, `set_profile_photo` (signed-in users); `team_create_invite`, `team_admit_from_waitlist`, `signin_providers_for_email` (service role only). All SECURITY DEFINER with `search_path = ''`, all derive the user from `auth.uid()`. Default function privileges are revoked from anon and authenticated. |
| `20261006000300_storage_avatars.sql` | Public `avatars` bucket (5 MB, image/*). A person writes only inside `<account id>/`, and only once a profile exists. |

Edge Function `auth-signin-method`: tells the app which method an email already uses (E-Linked). Service role stays server-side; the request must carry the public API key.

## 4. Approved boards implemented

| Board | Route |
|---|---|
| `O-Welcome`, `O-Welcome-Android` | `(onboarding)/welcome` (button order by platform) |
| `O-Email`, `E-Code` | `(onboarding)/email` |
| `E-Linked` | `(onboarding)/linked` |
| `A-Age` | `(onboarding)/age` |
| `O-Invite`, `W-Invalid` | `(onboarding)/invite` |
| `W-Waitlist` | `(onboarding)/waitlist` |
| `O-Profile`, `E-Username` | `(onboarding)/profile` |
| `O-Photo` | `(onboarding)/photo` |
| Tab bar from `Main` and `R-Discover` | `(tabs)/_layout` + `src/ui/TabBar.tsx` |

Not built: `W-Link` (invite links need the universal-link domain, SPEC.md Section 22 "Links"), `S-Invites` (Settings, later phase). The data model supports both (an invite is a code with an inviter and a cohort).

## 5. Tests and builds

| Check | Result |
|---|---|
| `supabase test db` (pgTAP, `supabase/tests/0001_onboarding.sql`) | 46 of 46 pass: anon reads nothing; a person reads only their own account; invite/profile steps refused before 18+; profile refused without beta access; invite not_found/expired/valid/used/already_in; one invite per account; username rules and suggestions; name/username validation; one profile per account; photo path confined to own folder; direct writes to profiles and accounts are no-ops. |
| `npm run typecheck` | passes |
| `npm run lint` (eslint-config-expo) | passes, no warnings |
| `npm test` (Jest) | 24 of 24 pass: validation rules, step resolver, invite copy |
| Avatar storage policies + `set_profile_photo` (script against local Supabase) | upload refused before a profile exists and outside own folder; own upload, RPC and public read work |
| iOS simulator build (`expo run:ios`, iPhone 17, iOS 27) | builds and runs |
| iOS device build (Release, iPhone 17 Pro) | RESULT_IOS_DEVICE |
| Android debug build (`gradlew :app:assembleDebug`, SDK 36, build-tools 35) | builds: `app-debug.apk` produced. Never run on an Android device or emulator. |

## 6. Verified on a real iPhone

RESULT_IOS_DEVICE_DETAIL

## 7. Verified on the iOS simulator (not a real device)

Against the local Supabase stack, with codes read from Mailpit:

- Welcome renders as the board; "Continue with email" → O-Email; email row then the 6-digit boxes and the resend countdown; a wrong code shows E-Code; "Send a new code" works; the right code signs in.
- A-Age → Yes → O-Invite. Expired code shows the W-Invalid state; a not-found code shows its line; a valid code shows "Invited by …" and enables Continue; redeeming leads to O-Profile.
- Join waitlist → W-Waitlist with the signed-in email; "I have an invite code" returns to O-Invite and a second code redeems.
- O-Profile: live "Available"; a taken username shows E-Username with three suggestions; tapping a chip fills it; Continue creates the profile and opens O-Photo with the name and @username.
- "Choose from library" asks for photo permission (system sheet). The picker, crop and upload were not completed on the simulator because the permission grant restarted the app; the upload path was verified by script instead (section 5).
- Start watching → Home with the dark tab bar; Me tab shows the light tab bar; dev sign-out returns to Welcome; relaunch with a profile lands on Home.

## 8. Unverified on Android

Everything. No Android device was available and no emulator is installed. The Android project compiles (see section 5) but the app has never been run on Android. Specifically unverified: Google Sign-In, the Apple web flow via the browser sheet and `shortcut://auth/callback`, the image picker, the tab bar blur, keyboard behaviour on the onboarding screens.

## 9. Deviations from the locked spec and open questions

None of these change the spec; each needs Nemat's yes or no.

1. **W-Invalid copy for not-found and expired codes.** The board only draws the "already used" line. Implemented, following its pattern: expired → "This invite has expired. Ask {first name} for another one, or join the waitlist."; not found → "That code didn't match an invite. Check it, or join the waitlist."; team codes with no inviter → "Ask for another one". `src/lib/inviteCopy.ts`.
2. **E-Linked for Google.** The board shows the Apple variant; the Google variant substitutes the provider name in the same sentence and button.
3. **Reverse of E-Linked.** If someone with an email-code account later taps Continue with Apple or Google using the same address, Supabase links the new identity to the existing account automatically. The spec says one method per account, but no screen exists for this direction, so it is left as Supabase's default. Decide: allow (current), or block with a new state.
4. **Welcome collage and the faces on O-Invite / W-Waitlist** use the boards' placeholder photos, bundled in `app/assets/placeholders/`. Decide what the production source is.
5. **W-Waitlist "Done"** goes to Welcome with the session kept (the board links to O-Welcome); the next launch lands on W-Waitlist again. "Sign out" on the same screen signs out.
6. **Back on A-Age and O-Invite** signs out and returns to Welcome, since the boards link back to O-Welcome and a signed-in Welcome has no meaning.
7. **Photo step on relaunch.** If the app is killed on O-Photo, the next launch goes to Home; the photo can be added in Edit profile (phase 3). The server does not track "photo step seen".
8. **Resend countdown** is 60 s, Supabase's minimum interval between emails to one address. The board's "0:24" is a moment in that countdown.
9. **Splash screen** is plain black (no board exists). App icon is the Expo template icon until phase 7.
10. **Session storage** uses AsyncStorage (Supabase's documented React Native default), not the keychain.

## 10. Remaining blockers for Gate 2

1. **Hosted Supabase project not yet deployed.** The CLI is linked to project `picvoavfxnajfjkqawju` but the push was blocked in this session. Run from the repo root:
   ```bash
   supabase db push
   supabase functions deploy auth-signin-method --no-verify-jwt
   supabase config push        # needs supabase/.env; pushes the email-code template and provider settings
   LINKED=1 scripts/create-invite.sh
   ```
   Until `config push`, hosted email codes arrive as a magic-link email without the 6-digit code.
2. **Apple credentials:** Sign in with Apple capability on bundle id `app.shortcut` (team BP7TM32HCQ); for Android's web flow also a Services ID and client secret. Enter them in `supabase/.env`.
3. **Google credentials:** iOS and web OAuth client ids and the web client secret (`supabase/.env`), plus `EXPO_PUBLIC_GOOGLE_*` and `GOOGLE_IOS_URL_SCHEME` in `app/.env`. Without them the Google button logs a configuration error.
4. **Email provider:** the Supabase built-in sender is rate-limited (a few emails an hour) and only fine for the founder's own test. Section 22 still lists Resend / Postmark as open.
5. **Android real device:** needed for the gate ("sign up on iOS and Android") and still needed for phase 1's video validation.

## 11. Git

Branch `phase-2-foundations`. Commits:

COMMITS_PLACEHOLDER

## 12. Gate 2 readiness

Not ready to mark passed. The iOS sign-up flow works end to end against a local backend (simulator) and the app builds for the device; the hosted backend needs the four commands above and the Apple/Google credentials before Nemat can sign up with Apple or Google, and Android has not been run on a device.
