// Server calls and types for the core loop (phase 3). Shapes mirror the SQL card functions.
import { ServerError } from './api';
import { supabase } from './supabase';

export type ProfileCard = { id: string; name: string; username: string; photo_path: string | null };

export type PromptCard = {
  id: string;
  text: string;
  place: { id: string; name: string } | null;
  featured_on: string | null;
  published_at: string | null;
  response_count: number;
  faces: ProfileCard[];
};

export type ResponseCard = {
  id: string;
  prompt_id: string;
  caption: string | null;
  duration_ms: number;
  status: 'processing' | 'live' | 'removed' | 'deleted';
  playback_id: string | null;
  live_at: string | null;
  created_at: string;
  author: ProfileCard;
  is_own: boolean;
  following_author: boolean;
  like_count: number;
  comment_count: number;
  reply_count: number;
};

export type Conversation = { prompt: PromptCard; response: ResponseCard | null };

export type Profile = ProfileCard & {
  bio: string | null;
  is_own: boolean;
  response_count: number;
  reply_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  follows_you: boolean;
  pinned_response_id: string | null;
  followed_by: ProfileCard[];
  followed_by_count: number;
};

export type ProfileResponse = ResponseCard & { prompt_text: string; pinned: boolean };

export type FollowRow = ProfileCard & { is_following: boolean; follows_you: boolean; is_self: boolean };

export type FollowSuggestion = ProfileCard & { response_count: number; prompt_text: string };

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new ServerError(res.error.message);
  return res.data;
}

export async function homeFeed(exclude: string[], limit = 10): Promise<Conversation[]> {
  return (unwrap(await supabase.rpc('home_feed', { p_exclude: exclude, p_limit: limit })) ?? []) as Conversation[];
}

export async function followingFeed(before: string | null, limit = 10): Promise<Conversation[]> {
  return (unwrap(await supabase.rpc('following_feed', { p_before: before, p_limit: limit })) ?? []) as Conversation[];
}

export async function promptResponses(promptId: string, entryId: string | null, seen: string[]): Promise<{ prompt: PromptCard; entry_status: string | null; responses: ResponseCard[] }> {
  return unwrap(await supabase.rpc('prompt_responses', { p_prompt: promptId, p_entry: entryId, p_seen: seen })) as never;
}

export async function getResponse(id: string): Promise<(ResponseCard & { prompt: PromptCard }) | { status: 'unavailable' }> {
  return unwrap(await supabase.rpc('get_response', { p_id: id })) as never;
}

export async function openPrompts(): Promise<PromptCard[]> {
  return (unwrap(await supabase.rpc('open_prompts')) ?? []) as PromptCard[];
}

export async function getPrompt(id: string): Promise<PromptCard | null> {
  return (unwrap(await supabase.rpc('get_prompt', { p_id: id })) ?? null) as PromptCard | null;
}

export async function acknowledgeDisclosure(): Promise<void> {
  unwrap(await supabase.rpc('acknowledge_disclosure'));
}

export async function postResponse(promptId: string, uploadId: string, caption: string | null, durationMs: number): Promise<ResponseCard> {
  return unwrap(await supabase.rpc('post_response', { p_prompt: promptId, p_upload_id: uploadId, p_caption: caption, p_duration_ms: durationMs })) as ResponseCard;
}

export async function retryResponseUpload(responseId: string, uploadId: string): Promise<void> {
  unwrap(await supabase.rpc('retry_response_upload', { p_response: responseId, p_upload_id: uploadId }));
}

export async function abandonResponse(responseId: string): Promise<void> {
  unwrap(await supabase.rpc('abandon_response', { p_response: responseId }));
}

export async function getProfile(args: { id?: string; username?: string } = {}): Promise<Profile | null> {
  return (unwrap(await supabase.rpc('get_profile', { p_id: args.id ?? null, p_username: args.username ?? null })) ?? null) as Profile | null;
}

export async function profileResponses(profileId: string): Promise<ProfileResponse[]> {
  return (unwrap(await supabase.rpc('profile_responses', { p_profile: profileId })) ?? []) as ProfileResponse[];
}

export async function followUser(id: string): Promise<void> {
  unwrap(await supabase.rpc('follow_user', { p_user: id }));
}

export async function unfollowUser(id: string): Promise<void> {
  unwrap(await supabase.rpc('unfollow_user', { p_user: id }));
}

export async function followList(profileId: string, kind: 'followers' | 'following'): Promise<FollowRow[]> {
  return (unwrap(await supabase.rpc('follow_list', { p_profile: profileId, p_kind: kind })) ?? []) as FollowRow[];
}

export async function followSuggestions(watchedPrompts: string[]): Promise<FollowSuggestion[]> {
  return (unwrap(await supabase.rpc('follow_suggestions', { p_watched_prompts: watchedPrompts })) ?? []) as FollowSuggestion[];
}

export async function updateProfile(name: string, username: string, bio: string | null): Promise<void> {
  unwrap(await supabase.rpc('update_profile', { p_name: name, p_username: username, p_bio: bio }));
}

export async function setPinnedResponse(responseId: string | null): Promise<void> {
  unwrap(await supabase.rpc('set_pinned_response', { p_response: responseId }));
}

export async function disclosureAcknowledged(): Promise<boolean> {
  const { data, error } = await supabase.from('accounts').select('public_disclosure_ack_at').maybeSingle();
  if (error) throw new ServerError(error.message);
  return !!data?.public_disclosure_ack_at;
}
