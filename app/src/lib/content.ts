// Server calls and types for the core loop (phase 3) and the conversation (phase 4).
// Shapes mirror the SQL card functions.
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
  liked: boolean;
  comment_count: number;
  reply_count: number;
  /** Phase 4: a video reply lives in the responses table with kind 'reply'. */
  kind: 'response' | 'reply';
  root_response_id: string | null;
  reply_to_id: string | null;
};

/** What a video replies to (Reply-Watch, Reply-Watch-2, Record-Reply, PR-Reply, A-Orphan). */
export type VideoContext =
  | { kind: 'response' }
  | {
      kind: 'reply';
      root: ResponseCard | null;
      root_deleted: boolean;
      reply_to: ResponseCard | null;
      reply_to_deleted: boolean;
      reply_to_is_root: boolean;
      prompt_text: string;
    };

export type Video = ResponseCard & { prompt: PromptCard; context: VideoContext };

export type RoomReply = ResponseCard & { reply_to_name: string | null; reply_to_deleted: boolean };

export type ReplyRoom = { root: ResponseCard | null; root_deleted: boolean; prompt: PromptCard; count: number; replies: RoomReply[] };

export type CommentCard = {
  id: string;
  response_id: string;
  parent_id: string | null;
  thread_id: string | null;
  /** A deleted parent keeps its place while it has replies (board LV-CommentDeleted). */
  deleted: boolean;
  body: string | null;
  created_at: string;
  author: ProfileCard | null;
  is_author: boolean;
  is_own: boolean;
  liked: boolean;
};

export type CommentThread = CommentCard & { replies: CommentCard[] };

export type CommentsSheet = {
  count: number;
  response: ResponseCard;
  prompt_text: string;
  video_replies: { count: number; faces: ProfileCard[]; thumbnails: string[] };
  comments: CommentThread[];
};

export type ActivityKind = 'video_reply' | 'comment' | 'comment_reply' | 'follow' | 'like' | 'followed_responded' | 'removed' | 'restricted' | 'suspended' | 'review_outcome';

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  created_at: string;
  updated_at: string;
  read: boolean;
  section: 'new' | 'week';
  actor: ProfileCard | null;
  actors: ProfileCard[];
  actor_count: number;
  count: number;
  following_actor: boolean;
  video: { id: string; kind: 'response' | 'reply'; playback_id: string | null; caption: string | null; status: string; root_response_id: string | null; prompt_id: string; prompt_text: string } | null;
  comment: { id: string; body: string; deleted: boolean } | null;
  prompt: { id: string; text: string } | null;
  like_count: number | null;
  moderation_action_id: string | null;
};

export type ActivityList = { unread_count: number; tonight: PromptCard | null; rows: ActivityRow[] };

export type NotificationPrefs = {
  pause_all: boolean;
  video_replies: boolean;
  comments: boolean;
  comment_replies: boolean;
  new_followers: boolean;
  followed_respond: boolean;
  tonight_prompt: boolean;
  place_prompts: boolean;
  likes: boolean;
};

export type NotificationAsk = 'never' | 'declined_once' | 'declined_twice' | 'accepted';

export type NotificationState = { ask: NotificationAsk; ask_due: boolean; prefs: NotificationPrefs };

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
  blocked: boolean;
};

export type ProfileResponse = ResponseCard & { prompt_text: string; pinned: boolean };

export type ProfileReply = ResponseCard & { prompt_text: string; reply_to_name: string | null };

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

// ---------------------------------------------------------------------------
// Phase 4: video replies, comments, likes, Activity, notifications
// ---------------------------------------------------------------------------

export async function profileReplies(profileId: string): Promise<ProfileReply[]> {
  return (unwrap(await supabase.rpc('profile_replies', { p_profile: profileId })) ?? []) as ProfileReply[];
}

export async function replyRoom(rootId: string): Promise<ReplyRoom> {
  return unwrap(await supabase.rpc('reply_room', { p_root: rootId })) as ReplyRoom;
}

export async function getVideo(id: string): Promise<Video | { status: 'unavailable' }> {
  return unwrap(await supabase.rpc('get_video', { p_id: id })) as never;
}

export async function postReply(replyToId: string, uploadId: string, caption: string | null, durationMs: number): Promise<ResponseCard> {
  return unwrap(await supabase.rpc('post_reply', { p_reply_to: replyToId, p_upload_id: uploadId, p_caption: caption, p_duration_ms: durationMs })) as ResponseCard;
}

export async function commentsList(responseId: string): Promise<CommentsSheet> {
  return unwrap(await supabase.rpc('comments_list', { p_response: responseId })) as CommentsSheet;
}

export async function postComment(responseId: string, body: string, parentId: string | null): Promise<CommentThread> {
  return unwrap(await supabase.rpc('post_comment', { p_response: responseId, p_body: body, p_parent: parentId })) as CommentThread;
}

export async function deleteComment(id: string): Promise<void> {
  unwrap(await supabase.rpc('delete_comment', { p_id: id }));
}

export async function likeVideo(id: string): Promise<number> {
  return unwrap(await supabase.rpc('like_video', { p_video: id })) as number;
}

export async function unlikeVideo(id: string): Promise<number> {
  return unwrap(await supabase.rpc('unlike_video', { p_video: id })) as number;
}

export async function likeComment(id: string): Promise<void> {
  unwrap(await supabase.rpc('like_comment', { p_comment: id }));
}

export async function unlikeComment(id: string): Promise<void> {
  unwrap(await supabase.rpc('unlike_comment', { p_comment: id }));
}

export async function activityList(): Promise<ActivityList> {
  return unwrap(await supabase.rpc('activity_list')) as ActivityList;
}

export async function markActivityRead(): Promise<void> {
  unwrap(await supabase.rpc('mark_activity_read'));
}

export async function activityUnreadCount(): Promise<number> {
  return (unwrap(await supabase.rpc('activity_unread_count')) ?? 0) as number;
}

export async function getNotificationState(): Promise<NotificationState> {
  return unwrap(await supabase.rpc('get_notification_state')) as NotificationState;
}

export async function updateNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationState> {
  return unwrap(await supabase.rpc('update_notification_prefs', { p_prefs: prefs })) as NotificationState;
}

export async function setNotificationAsk(state: 'accepted' | 'declined'): Promise<void> {
  unwrap(await supabase.rpc('set_notification_ask', { p_state: state }));
}

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  unwrap(await supabase.rpc('register_push_token', { p_token: token, p_platform: platform }));
}

export async function setTimezone(timezone: string): Promise<void> {
  unwrap(await supabase.rpc('set_timezone', { p_timezone: timezone }));
}

// ---------------------------------------------------------------------------
// Phase 5: report, block, delete, notices, review requests
// ---------------------------------------------------------------------------

/** SF-Report, in the board's order. */
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech or symbols' },
  { id: 'nudity', label: 'Nudity or sexual content' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'self_harm', label: 'Self-harm or suicide' },
  { id: 'private_info', label: 'Shares private information' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'under_18', label: 'May be under 18' },
  { id: 'other', label: 'Something else' },
];
export type ReportReason = 'harassment' | 'hate' | 'nudity' | 'violence' | 'self_harm' | 'private_info' | 'spam' | 'under_18' | 'other';
export type ReportKind = 'video' | 'comment' | 'profile';

export async function reportItem(kind: ReportKind, id: string, reason: ReportReason): Promise<ProfileCard> {
  return unwrap(await supabase.rpc('report_item', { p_kind: kind, p_id: id, p_reason: reason })) as ProfileCard;
}

export async function blockUser(id: string): Promise<void> {
  unwrap(await supabase.rpc('block_user', { p_user: id }));
}

export async function unblockUser(id: string): Promise<void> {
  unwrap(await supabase.rpc('unblock_user', { p_user: id }));
}

export async function blockedList(): Promise<ProfileCard[]> {
  return (unwrap(await supabase.rpc('blocked_list')) ?? []) as ProfileCard[];
}

export async function deleteVideo(id: string): Promise<void> {
  unwrap(await supabase.rpc('delete_video', { p_id: id }));
}

/** Needs a sign-in no older than ten minutes; otherwise the server says reauth_required. */
export async function deleteAccount(): Promise<void> {
  unwrap(await supabase.rpc('delete_account'));
}

export type Notice = {
  id: string;
  kind: 'remove' | 'warn' | 'restrict' | 'suspend' | 'restore' | 'remove_attribution';
  reason: string;
  created_at: string;
  restrict_until: string | null;
  target_kind: 'video' | 'comment' | 'account' | 'suggestion' | null;
  video: { id: string; kind: 'response' | 'reply'; playback_id: string | null; caption: string | null; created_at: string; prompt_text: string } | null;
  comment: { id: string; body: string } | null;
  removed_action_ids: string[] | null;
  review_requested: boolean;
  review_outcome: 'upheld' | 'reversed' | null;
};

export async function getNotice(actionId: string): Promise<Notice> {
  return unwrap(await supabase.rpc('get_notice', { p_action: actionId })) as Notice;
}

export async function requestReview(actionId: string): Promise<void> {
  unwrap(await supabase.rpc('request_review', { p_action: actionId }));
}
