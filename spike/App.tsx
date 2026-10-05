import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { PreviewScreen } from './src/screens/PreviewScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { SequenceScreen } from './src/screens/SequenceScreen';
import { UploadScreen } from './src/screens/UploadScreen';
import { upsertRun } from './src/log';
import type { Run } from './src/types';

type Screen =
  | { name: 'home' }
  | { name: 'record' }
  | { name: 'preview'; run: Run }
  | { name: 'upload'; run: Run }
  | { name: 'player'; run: Run }
  | { name: 'sequence'; runs: Run[] };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const home = () => setScreen({ name: 'home' });

  let body: React.ReactNode;
  switch (screen.name) {
    case 'record':
      body = <RecordScreen onCancel={home} onRecorded={(run) => { upsertRun(run); setScreen({ name: 'preview', run }); }} />;
      break;
    case 'preview':
      body = <PreviewScreen run={screen.run} onDiscard={() => setScreen({ name: 'record' })} onPost={(run) => setScreen({ name: 'upload', run })} />;
      break;
    case 'upload':
      body = <UploadScreen run={screen.run} onBack={home} onDone={(run) => setScreen({ name: 'player', run })} />;
      break;
    case 'player':
      body = <PlayerScreen run={screen.run} onBack={home} />;
      break;
    case 'sequence':
      body = <SequenceScreen runs={screen.runs} onBack={home} />;
      break;
    default:
      body = <HomeScreen onRecord={() => setScreen({ name: 'record' })} onRetry={(run) => setScreen({ name: 'upload', run })} onPlay={(run) => setScreen({ name: 'player', run })} onSequence={(runs) => setScreen({ name: 'sequence', runs })} />;
  }
  return (
    <>
      <StatusBar style="light" />
      {body}
    </>
  );
}
