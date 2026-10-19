// Where the bottom overlay of a full-screen video sits, from the bottom of the screen up (founder
// iPhone test, 19 Oct: on Home and in the response player it took too much of the video).
// Pure, so the order of the rows and their gaps are tested.
//
// Home (board Main, Z-First): the Respond row stands 28 pt above the tab bar, as drawn; it stood
// 100 pt above because the tab bar was counted twice. The author block and the rail stand on it.
// Player (R-Player-2): the Next row stands on the home indicator's inset instead of 26 pt above
// it, and each row above follows with the board's gaps (progress line, the two buttons, author).

/** Height of the player's "Next · name" row (a full touch target). */
export const NEXT_ROW = 44;
const BUTTON_ROW = 36;
const HOME_ROW = 44;
/** Z-First's card: two lines and the Ask someone button. */
const FIRST_CARD = 58;

export function homeOverlay(tabBarSpace: number, firstOwn: boolean) {
  const row = tabBarSpace + 28;
  const firstCard = tabBarSpace + 24;
  const author = firstOwn ? firstCard + FIRST_CARD + 24 : row + HOME_ROW + 24;
  return { progress: tabBarSpace + 15, row, firstCard, author, rail: author };
}

export function playerOverlay(insetBottom: number) {
  const next = Math.max(insetBottom, 10);
  const progress = next + NEXT_ROW + 4;
  const buttons = progress + 12;
  const author = buttons + BUTTON_ROW + 18;
  return { next, progress, buttons, author, rail: author };
}
