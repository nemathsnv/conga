// Where the app goes when the server refuses to post because of the account's standing (SPEC.md
// Section 17: "While paused they can't respond, reply, comment or suggest prompts"). Pure,
// Jest-tested; shared by Post Review and the comment input.

/** The refusal means the account may not post: A-Restricted (posting paused) or LV-Suspended. */
export function isPostingRestriction(reason: string): boolean {
  return reason.includes('posting_paused') || reason.includes('suspended');
}

/**
 * After the sign-in state is read again: the restriction's notice (A-Restricted) when there is one
 * to show, else Home (a suspended account is moved to LV-Suspended by the session from there).
 */
export function restrictionTarget(actionId: string | null | undefined): { pathname: '/notice/[actionId]'; params: { actionId: string } } | '/(tabs)' {
  return actionId ? { pathname: '/notice/[actionId]', params: { actionId } } : '/(tabs)';
}
