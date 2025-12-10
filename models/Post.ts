import { Poll } from './Poll';
import { User } from './User';

export interface Post {
  id: string;
  user: User;
  text: string;
  content: string; // Database field (same as text)
  media?: { type: 'image' | 'video'; url: string }[];
  poll?: Poll;
  quoted_post?: Post;

  // Reply fields
  parent_post_id?: string;
  parent_post?: Post;
  child_posts?: Post[];
  is_reply?: boolean;

  // Thread fields
  thread_id?: string | null;
  sequence_number?: number;
  thread_total?: number;
  thread_posts?: Post[]; // Other posts in the same thread

  created_at: string;
  is_deleted: boolean;
  repost_count: number;
  quote_count: number;
  like_count: number;
  dislike_count: number;
  is_edited?: boolean;
  reply_count?: number;
  my_reaction?: 'like' | 'dislike' | null;
}
