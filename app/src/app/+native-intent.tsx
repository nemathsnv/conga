// Runs on every link that opens the app, before the router sees it. A link the app has no screen for
// (an old or mistyped link, a path from the web player) goes Home: the router's own "unmatched route"
// page is not an approved board, and a redirect from it left a blank screen on a phone.
import { systemPathRedirect } from '@/lib/links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return systemPathRedirect(path);
  } catch {
    return '/';
  }
}
