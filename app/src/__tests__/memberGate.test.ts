// The closed-beta member gate (supabase/migrations/20261102000100_member_gate.sql): pre_request
// refuses every API call from a signed-in account without a profile, except the paths in
// pre_member_allowed_path (and the older suspended_allowed_path, which returns first). So any call
// the app makes before Home must be on one of those lists, or onboarding gets a 403.
//
// pgTAP 0037 tests the gate in the database but needs a local Supabase stack, which GitHub CI does
// not run. This test reads the migrations and the app source instead, so CI catches the drift the
// audit warned about (docs/release/ACCESS-CONTROL-AUDIT.md section 5, "Maintenance rule").
// The app has no Node types (tsconfig types: jest), so fs and path are typed by hand, as in
// androidLayout.test.ts.
declare const __dirname: string;
declare const require: (id: string) => unknown;
const { readdirSync, readFileSync } = require('fs') as { readdirSync: (dir: string) => string[]; readFileSync: (file: string, encoding: string) => string };
const { join } = require('path') as { join: (...parts: string[]) => string };

const APP = join(__dirname, '..', '..');
const SRC = join(APP, 'src');
const MIGRATIONS = join(APP, '..', 'supabase', 'migrations');

/** The /rpc/ names in the newest migration that defines public.<fn>(p_path text). */
function pathList(fn: string): Set<string> {
  let body: string | null = null;
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    const m = sql.match(new RegExp(`create or replace function public\\.${fn}\\(p_path text\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i'));
    if (m) body = m[1];
  }
  if (body === null) throw new Error(`no migration defines public.${fn}`);
  return new Set([...body.matchAll(/'\/rpc\/([a-z_]+)'/g)].map((m) => m[1]));
}

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const rpcNames = (src: string) => [...src.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1]);

/** The source of one exported function, up to the next top-level export. */
function exportedFunction(rel: string, name: string): string {
  const src = read(rel);
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${rel} has no exported ${name}`);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

/** Named imports from a module specifier, e.g. '@/lib/content'. */
function importsFrom(src: string, specifiers: string[]): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    if (!specifiers.includes(m[2])) continue;
    names.push(...m[1].split(',').map((s) => s.replace(/^\s*type\s+/, '').trim()).filter(Boolean));
  }
  return names;
}

const onboardingScreens = readdirSync(join(SRC, 'app', '(onboarding)')).map((f) => join('app', '(onboarding)', f));

// Everything that runs while the account is not yet a member: the onboarding screens, the invite
// link screen, and the modules they and the session provider use.
const PRE_HOME_FILES = [
  ...onboardingScreens,
  join('app', 'i', '[code].tsx'),
  'lib/api.ts',
  'lib/analytics.ts',
  'lib/auth.ts',
  'lib/onboarding.ts',
  'lib/photo.ts',
  'lib/session.tsx',
  'lib/useStepNavigation.ts',
];

// O-Photo runs only after create_profile, which makes the account a member at once.
const AFTER_PROFILE = new Set(['set_profile_photo']);

const memberAllowed = pathList('pre_member_allowed_path');
const suspendedAllowed = pathList('suspended_allowed_path');
const openToNonMember = (rpc: string) => memberAllowed.has(rpc) || suspendedAllowed.has(rpc);

describe('member gate allowlist (20261102000100)', () => {
  it('is exactly the reviewed list, so widening it is a deliberate change (keep pgTAP 0037 in step)', () => {
    expect([...memberAllowed].sort()).toEqual([
      'check_invite', 'confirm_age', 'create_profile', 'delete_account', 'get_onboarding_state', 'invite_preview',
      'join_waitlist', 'redeem_invite', 'remove_push_token', 'track_events', 'username_status', 'username_suggestions',
      'web_prompt', 'web_video',
    ]);
  });

  it('keeps member reads and writes closed to accounts without a profile', () => {
    for (const rpc of [
      'home_feed', 'following_feed', 'open_prompts', 'get_prompt', 'prompt_responses', 'get_response', 'get_video',
      'reply_room', 'comments_list', 'get_profile', 'profile_responses', 'profile_replies', 'follow_list',
      'follow_suggestions', 'search', 'discover', 'places_screen', 'place_page', 'follow_place', 'block_user',
      'register_push_token', 'follow_user', 'like_video', 'post_comment', 'set_profile_photo', 'graphql',
    ]) {
      expect({ rpc, open: openToNonMember(rpc) }).toEqual({ rpc, open: false });
    }
  });
});

describe('calls the app makes before Home pass the member gate', () => {
  it('every RPC in the onboarding screens and their modules is on the allowlist', () => {
    const calls = PRE_HOME_FILES.flatMap((f) => rpcNames(read(f)).map((rpc) => ({ file: f, rpc })));
    expect(calls.length).toBeGreaterThan(5);
    const blocked = calls.filter(({ rpc }) => !AFTER_PROFILE.has(rpc) && !openToNonMember(rpc));
    expect(blocked).toEqual([]);
  });

  it('none of them reads a table directly (a table read is a member call too)', () => {
    const tableReads = PRE_HOME_FILES.filter((f) => /supabase\s*\.from\(/.test(read(f)));
    expect(tableReads).toEqual([]);
  });

  it('they import from content and notifications only the reviewed functions', () => {
    const imported = PRE_HOME_FILES.flatMap((f) => importsFrom(read(f), ['@/lib/content', './content', '@/lib/notifications', './notifications']));
    // A new import here is a new call before Home: add its path to pre_member_allowed_path and to
    // pgTAP 0037, then to this list.
    expect([...new Set(imported)].sort()).toEqual(['requestReview', 'setSuspendedHandler']);
  });

  it('the suspended screen, sign-out and the invite link reach only open paths', () => {
    for (const [file, fn] of [
      ['lib/content.ts', 'requestReview'],
      ['lib/notifications.ts', 'unregisterPushToken'],
      ['lib/api.ts', 'invitePreview'],
      ['lib/api.ts', 'getOnboardingState'],
    ] as const) {
      const rpcs = rpcNames(exportedFunction(file, fn));
      expect(rpcs.length).toBeGreaterThan(0);
      for (const rpc of rpcs) expect({ fn, rpc, open: openToNonMember(rpc) }).toEqual({ fn, rpc, open: true });
    }
  });
});
