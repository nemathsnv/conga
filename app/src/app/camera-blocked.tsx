// Boards P7 and P8: Respond, Reply or Record while the member's last recording is waiting or still
// posting. With kind=responded (proposed copy, ui/failedPost.ts RESPONDED_COPY): Respond on a
// prompt the member has already responded to.
// Its own transparent sheet route, so the native stack opens it over whichever screen asked (Home,
// a player, Post Review, or the +, Comments and Replies sheets) and waits for any sheet that is
// still closing; a <Modal> opened from those moments was refused by iOS and left the screen
// unresponsive (ui/OverlaySheet.tsx). ui/recordEntry.tsx decides when it opens.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActionSheet } from '@/ui/ActionSheet';
import { CAMERA_BLOCK_SHEET, RESPONDED_COPY } from '@/ui/failedPost';

export default function CameraBlockedSheet() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const sheet =
    kind === 'responded'
      ? { title: RESPONDED_COPY.sheetTitle, line: RESPONDED_COPY.sheetLine, ok: RESPONDED_COPY.ok }
      : CAMERA_BLOCK_SHEET[kind === 'posting' ? 'posting' : 'waiting'];
  return <ActionSheet title={sheet.title} lines={[sheet.line]} actions={[]} cancelLabel={sheet.ok} onCancel={() => router.back()} />;
}
