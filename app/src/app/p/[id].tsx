// Link to a prompt: shortcut://p/<id>. Opens the prompt's responses in the player, which starts
// at the first response (SPEC.md Section 4, "Links"). No screen of its own.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PromptLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/player/[promptId]', params: { promptId: id } }} />;
}
