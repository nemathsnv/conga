// Camera entry (P7 and P8): Respond, Reply and Record do not open the camera while the member's last
// recording is waiting (failed, offline, or a discard Shortcut has not confirmed) or still posting.
// The sheet says why; no second take exists to replace the first. Every place that opens the camera
// goes through useOpenRecord. Reads the posting state (app/src/video), never changes it.
//
// NOT APPROVED YET: P7 and P8 are proposal boards. Lives on hold/failed-post-ui.
import { useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from 'react-native';

import { ActionSheet } from '@/ui/ActionSheet';
import { CAMERA_BLOCK_SHEET, cameraBlock, type CameraBlock } from '@/ui/failedPost';
import { usePosting } from '@/video/posting';

type RecordEntry = {
  /** Opens the camera, or shows P7 or P8 and does not. `replace` swaps the current screen (sheets). */
  open: (href: Href, mode?: 'push' | 'replace') => void;
  /** Shows the P7 or P8 sheet for the current state, if one applies (for Post Review's post_pending refusal). Returns whether it did. */
  showBlock: () => boolean;
};

const RecordEntryContext = createContext<RecordEntry | null>(null);

export function RecordEntryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const posting = usePosting();
  const [shown, setShown] = useState<CameraBlock | null>(null);
  const block = cameraBlock(posting.state);

  const open = useCallback<RecordEntry['open']>(
    (href, mode = 'push') => {
      if (block) {
        setShown(block);
        return;
      }
      if (mode === 'replace') router.replace(href);
      else router.push(href);
    },
    [block, router],
  );
  const showBlock = useCallback(() => {
    if (!block) return false;
    setShown(block);
    return true;
  }, [block]);

  const value = useMemo(() => ({ open, showBlock }), [open, showBlock]);
  const sheet = shown ? CAMERA_BLOCK_SHEET[shown] : null;
  return (
    <RecordEntryContext.Provider value={value}>
      {children}
      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setShown(null)}>
        {sheet ? <ActionSheet title={sheet.title} lines={[sheet.line]} actions={[]} cancelLabel={sheet.ok} onCancel={() => setShown(null)} /> : null}
      </Modal>
    </RecordEntryContext.Provider>
  );
}

export function useOpenRecord(): RecordEntry {
  const ctx = useContext(RecordEntryContext);
  if (!ctx) throw new Error('useOpenRecord must be used inside RecordEntryProvider');
  return ctx;
}
