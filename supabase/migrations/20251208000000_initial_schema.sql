-- 1. Users table (Supabase auth.users mirror)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Follows
CREATE TABLE public.follows (
  follower_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  followee_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- 4. Blocks
CREATE TABLE public.blocks (
  blocker_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- 5. Invites
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  creator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  used_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz,
  single_use boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 6. Posts
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text,
  type text CHECK (type IN ('normal', 'reply', 'quote', 'repost')) DEFAULT 'normal',
  parent_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  thread_root_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  media_count integer DEFAULT 0,
  poll_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX posts_author_id_idx ON public.posts(author_id);
CREATE INDEX posts_created_at_idx ON public.posts(created_at DESC);
CREATE INDEX posts_active_idx ON public.posts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX posts_content_idx ON public.posts USING GIN (to_tsvector('english', content));

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 7. Post Media
CREATE TABLE public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  mime text,
  width integer,
  height integer,
  size integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

-- 8. Post Reactions
CREATE TABLE public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type text CHECK (type IN ('like', 'dislike')) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id, type)
);
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- 9. Post Reposts
CREATE TABLE public.post_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

-- 10. Post Quotes
CREATE TABLE public.post_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  quote_post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.post_quotes ENABLE ROW LEVEL SECURITY;

-- 11. Post Bookmarks
CREATE TABLE public.post_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;

-- 12. Post Reports
CREATE TABLE public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  reason text NOT NULL,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

-- 13. Post Threads
CREATE TABLE public.post_threads (
  parent_post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  child_post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (parent_post_id, child_post_id)
);
ALTER TABLE public.post_threads ENABLE ROW LEVEL SECURITY;

-- 14. Post Polls
CREATE TABLE public.post_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  is_multiple boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.post_polls ENABLE ROW LEVEL SECURITY;

-- 15. Post Poll Options
CREATE TABLE public.post_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES public.post_polls(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  position integer DEFAULT 0
);
ALTER TABLE public.post_poll_options ENABLE ROW LEVEL SECURITY;

-- 16. Post Poll Votes
CREATE TABLE public.post_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES public.post_polls(id) ON DELETE CASCADE NOT NULL,
  option_id uuid REFERENCES public.post_poll_options(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id)
);
ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;

-- 17. Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  actor_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 18. Message Threads
CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

-- 19. Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.message_threads(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 20. Feed Scores Materialized View
CREATE MATERIALIZED VIEW public.feed_scores AS
SELECT
  id as post_id,
  0.0 as score,
  now() as computed_at
FROM public.posts
WITH NO DATA;
CREATE UNIQUE INDEX feed_scores_post_id_idx ON public.feed_scores(post_id);

-- RLS POLICIES

-- Users
CREATE POLICY "Users read themselves" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users update themselves" ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Profiles
CREATE POLICY "Public profiles are visible" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

-- Follows
CREATE POLICY "Follow graph is public" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users create follow relationships" ON public.follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY "Users can delete their follow" ON public.follows FOR DELETE USING (follower_id = auth.uid());

-- Blocks
CREATE POLICY "Only visible to owner" ON public.blocks FOR SELECT USING (blocker_id = auth.uid());
CREATE POLICY "Only block owner" ON public.blocks FOR INSERT WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "Only block owner delete" ON public.blocks FOR DELETE USING (blocker_id = auth.uid());

-- Posts
CREATE POLICY "Public can read posts" ON public.posts FOR SELECT USING (
  NOT (author_id IN (SELECT blocker_id FROM public.blocks WHERE blocked_id = auth.uid()))
);
CREATE POLICY "Users create posts" ON public.posts FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users update their posts" ON public.posts FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users delete their posts" ON public.posts FOR DELETE USING (author_id = auth.uid());

-- Post Media
CREATE POLICY "Media rows are public" ON public.post_media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_media.post_id
    AND NOT (posts.author_id IN (SELECT blocker_id FROM public.blocks WHERE blocked_id = auth.uid()))
  )
);
CREATE POLICY "Users attach media to own posts" ON public.post_media FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete media from own posts" ON public.post_media FOR DELETE USING (user_id = auth.uid());

-- Post Reactions
CREATE POLICY "Reactions are public" ON public.post_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts WHERE posts.id = post_reactions.post_id)
);
CREATE POLICY "Users react to posts" ON public.post_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage their reactions" ON public.post_reactions FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete their reactions" ON public.post_reactions FOR DELETE USING (user_id = auth.uid());

-- Post Reposts
CREATE POLICY "Reposts are public" ON public.post_reposts FOR SELECT USING (true);
CREATE POLICY "Users create reposts" ON public.post_reposts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete their repost" ON public.post_reposts FOR DELETE USING (user_id = auth.uid());

-- Post Quotes
CREATE POLICY "Quotes are public" ON public.post_quotes FOR SELECT USING (true);
CREATE POLICY "Users create quote posts" ON public.post_quotes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete quote posts" ON public.post_quotes FOR DELETE USING (user_id = auth.uid());

-- Post Bookmarks
CREATE POLICY "Users read own bookmarks" ON public.post_bookmarks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create bookmarks" ON public.post_bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete bookmarks" ON public.post_bookmarks FOR DELETE USING (user_id = auth.uid());

-- Post Threads
CREATE POLICY "Threads visible if post visible" ON public.post_threads FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts WHERE posts.id = post_threads.child_post_id)
);

-- Post Polls
CREATE POLICY "Poll definition is public" ON public.post_polls FOR SELECT USING (true);
CREATE POLICY "Users create poll" ON public.post_polls FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid())
);
CREATE POLICY "Users delete poll" ON public.post_polls FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid())
);

-- Post Poll Options
CREATE POLICY "Poll options are public" ON public.post_poll_options FOR SELECT USING (true);
CREATE POLICY "Users add poll options" ON public.post_poll_options FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.post_polls 
    JOIN public.posts ON post_polls.post_id = posts.id
    WHERE post_polls.id = poll_id AND posts.author_id = auth.uid()
  )
);

-- Post Poll Votes
CREATE POLICY "Poll votes are public" ON public.post_poll_votes FOR SELECT USING (true);
CREATE POLICY "Users create poll votes" ON public.post_poll_votes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update their poll vote" ON public.post_poll_votes FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Notifications
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Invites
CREATE POLICY "Creator reads invites" ON public.invites FOR SELECT USING (creator_id = auth.uid());


-- TRIGGERS

-- Handle new user creation (sync auth.users to public.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Updated At Timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- STORAGE
-- Create the 'post_media' bucket required for media uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('post_media', 'post_media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Rules
CREATE POLICY "Public Access" 
  ON storage.objects FOR SELECT 
  USING ( bucket_id = 'post_media' );

CREATE POLICY "Authenticated users can upload media" 
  ON storage.objects FOR INSERT 
  WITH CHECK ( bucket_id = 'post_media' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update own media" 
  ON storage.objects FOR UPDATE 
  USING ( bucket_id = 'post_media' AND auth.uid() = owner )
  WITH CHECK ( bucket_id = 'post_media' AND auth.uid() = owner );

CREATE POLICY "Users can delete own media" 
  ON storage.objects FOR DELETE 
  USING ( bucket_id = 'post_media' AND auth.uid() = owner );
