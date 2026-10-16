// A link the app has no screen for (an old or mistyped link, a path from the web player). The
// default "Unmatched route" page is not an approved board, so this goes Home with no screen of its own.
import { Redirect } from 'expo-router';

export default function NotFoundScreen() {
  return <Redirect href="/" />;
}
