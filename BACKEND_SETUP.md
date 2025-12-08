# Backend Architecture — Twitter-style (pre-2023) Clone

> Full backend architecture documentation for the project. This document is production-minded, integrates the RLS policy decisions, and ties database schema, APIs, auth, moderation, background jobs, and operational concerns together.

---

## 1. Goals & Constraints

**Primary goals**

* Fast time-to-MVP for a pre-2023 Twitter-like experience: posting, replies, reposts, quotes, polls, follow graph, notifications, and search.
* Privacy and security by default using Supabase/Postgres RLS.
* Modular, testable, and observable backend suitable for staged rollout (invite-only beta → open).
* Minimal trust surface: service-role only for admin/system tasks.

**Key constraints**

* Use Supabase (Postgres) as primary DB + Auth
* Host serverless or lightweight node service for business logic (Hono/Express/Nest/Hapi) — recommend Hono for small footprint
* All user-facing operations are RLS-compatible (no service role leakage in normal paths)

---

## 2. High-Level Components

1. **Database (Supabase / PostgreSQL)**

   * Tables: users (auth), profiles, posts, post_media, post_reactions, post_reposts, post_quotes, post_threads, post_polls, post_poll_options, post_poll_votes, follows, blocks, invites, notifications, message_threads, messages, feed_scores (materialized view).
   * RLS policies applied per `RLS_POLICIES.md` / `SUPABASE_POLICIES.sql`.

2. **Auth & Identity (Supabase Auth + JWT)**

   * Primary auth provider (email/password, OAuth later).
   * JWT contains `sub` = `auth.uid()` and optionally `role` claim for admin/service.

3. **API Layer (Serverless Node / Hono)**

   * Responsibilities: input validation, business rules, transactional operations that need to coordinate multiple tables or external systems, media upload presigning, rate-limiting enforcement, invite validation, moderation endpoints.
   * Exposes REST endpoints as in `API_ROUTE_MAP.md` (resource + subresource style). Optionally add GraphQL gateway later.

4. **Storage (Supabase Storage / S3)**

   * Store media (images, video). Objects are referenced by `post_media` rows. Use presigned upload URLs; ensure media row creation ties to post and user.

5. **Background Workers**

   * Tasks: feed score computation, trending topics, notification batching, moderation scans (NSFW, spam), media transcoding, email delivery, retention/archival jobs.
   * Use lightweight worker pool (e.g., Cloud Run cron + Pub/Sub, or serverless functions triggered by DB changes or queue).

6. **Realtime**

   * Supabase Realtime (for home feed, mentions, notifications) or WebSocket layer for live updates.

7. **Search / Indexing**

   * Full-text: Postgres `tsvector` + GIN index for simple search; or an external index (ElasticSearch / Meilisearch) for richer queries and faster trending.

8. **Admin / Moderation Tools**

   * Admin UI (service-role) to view flagged content, ban users, issue strikes, manage invites, and tune feed scoring.

9. **Observability**

   * Metrics (Prometheus/Grafana), centralized logs (Stackdriver/Datadog), alerts (SRE playbooks), tracing (OpenTelemetry).

---

## 3. Data Model (High-level)

> Use snake_case for DB fields. Plural table names. Singular model names in code.

### Core table summaries

* `users` (supabase auth users) — id (uuid), email, created_at
* `profiles` — id (uuid, FK to users.id), username, display_name, bio, avatar_url, created_at, updated_at
* `posts` — id (uuid), author_id, content, type (normal/reply/quote/repost), parent_post_id, thread_root_id, media_count, poll_id, created_at, updated_at, deleted_at
* `post_media` — id, post_id, user_id, url, mime, width, height, size, created_at
* `post_reactions` — id, post_id, user_id, type (like/dislike), created_at
* `post_reposts` — id, post_id, user_id, created_at
* `post_quotes` — id, post_id (quoted), user_id (author of quote), quote_post_id, created_at
* `post_threads` — parent_post_id, child_post_id, created_at
* `post_polls` — id, post_id, question, is_multiple, expires_at, created_at
* `post_poll_options` — id, poll_id, label, position
* `post_poll_votes` — id, poll_id, option_id, user_id, created_at
* `follows` — follower_id, followee_id, created_at
* `blocks` — blocker_id, blocked_id, created_at
* `invites` — id, code, creator_id, used_by, used_at, expires_at, single_use
* `notifications` — id, recipient_id, actor_id, type, payload (jsonb), read_at, created_at
* `message_threads`, `messages` — for DMs (optional)
* `feed_scores` — materialized view (post_id, score, computed_at)

### Indexing

* Primary keys on `id` (uuid)
* FK indexes: author_id, post_id, poll_id, user_id
* GIN index on `posts` tsvector(content) for search
* Partial indexes for active posts (`deleted_at IS NULL`)
* Unique constraints: `profiles.username` unique, `post_poll_votes (poll_id, user_id)` unique

---

## 4. Row Level Security (RLS) — Summary

* RLS is enabled for all tables.
* Policies use `auth.uid()` to scope write operations.
* Read policies default to permissive for public data (posts, profiles, polls) but can be tightened if you later introduce private profiles or protected posts.
* Admin/service operations must use Supabase service role or admin JWT claim; we recommend an `is_admin` claim (populated by server) and admin-aware policies for auditability.
* Keep `notifications`, `invites`, `blocks` strongly scoped to recipients/creators.

(Full RLS in `SUPABASE_POLICIES.sql`.)

---

## 5. API Design & Endpoint Mapping

Follow RESTful resource patterns (`/posts/:id/likes`, `/users/:id/followers`). Use standard HTTP verbs. Use consistent pagination (cursor-based). Use RFC-compliant pagination tokens (`next_cursor`) that are opaque to clients.

### Authentication & Session

* `POST /auth/register` (invite required in beta)
* `POST /auth/login`
* `POST /auth/refresh`

### Users

* `GET /users/:id` — profile
* `GET /users/:id/posts` — user posts (cursor)
* `POST /users/:id/follow` — follow (auth user must equal follower)

### Posts

* `POST /posts` — create (body: content, parent_post_id?, poll?, media[])
* `GET /posts/:id` — single post
* `GET /posts?feed=home&cursor=...` — home feed (server computes, paginates)
* `POST /posts/:id/replies` — reply
* `POST /posts/:id/reposts` — repost
* `POST /posts/:id/quotes` — quote-post
* `POST /posts/:id/likes` — like
* `DELETE /posts/:id` — delete (owner only)

### Polls

* `POST /polls` — create poll (tied to a post)
* `POST /polls/:id/votes` — vote

### Search

* `GET /search?q=...&type=posts|users` — backend routes to Postgres full-text or external index

### Notifications

* `GET /notifications` — user notifications (cursor)
* `POST /notifications/mark-read` — mark read

### Admin (service role or admin claim)

* `GET /admin/flags` — flagged content
* `POST /admin/users/:id/ban` — ban
* `POST /admin/invites` — create invites

---

## 6. Business Logic Patterns & Transactions

* Keep complex multi-table changes inside **server-side transactions**. Examples:

  * Creating a post with media + poll: wrap inserts for `posts`, `post_media`, `post_polls`, `post_poll_options` in a single transaction.
  * Deleting a user: use service-role to cascade or soft-delete (`deleted_at`) to preserve auditability.

* Use `WITH CHECK` constraints in RLS to ensure integrity on inserts/updates.

* Use optimistic concurrency where appropriate (e.g., `updated_at` checks) for edits.

---

## 7. Background Jobs & Workers

**Responsibilities**

* Feed score computation (recompute `feed_scores` incrementally)
* Trend detection (hashtags, high-engagement posts)
* Notification delivery (batched push/email)
* Media processing (resize/thumbnail/transcode)
* Spam and abuse detection (automated scanning)

**Implementation**

* Use a queue (e.g., Redis streams, Cloud Tasks, or Supabase's cron + functions) with workers that process DB events. Prefer idempotent consumers.

---

## 8. Moderation & Safety

* `post_reports` table records user reports (reporter_id, post_id, reason, meta)
* Admin dashboard to take actions: remove post, ban user, mute user.
* Automated rule engine (scoring) to escalate suspicious accounts to human review.

---

## 9. Security & Privacy

* Use RLS for all sensitive rows
* Validation at API layer (max post length, media size, allowed MIME types)
* Rate limit write endpoints (per-user) to mitigate spam
* Enforce CSRF protections for browser flows if using cookies
* Store minimal PII; rely on Supabase Auth for passwords; encrypt sensitive logs
* Use TLS everywhere; HSTS; secure cookies if applicable

---

## 10. Scalability & Performance

* Use cursor-based pagination for feeds & timelines
* Materialize heavy aggregations: `feed_scores`, `trending_topics`
* Use read replicas for heavy read workloads if Postgres hosted on provider that supports it
* Offload search to specialized service if query load grows
* CDN for media assets

---

## 11. Observability & Testing

* Unit tests for business logic
* Integration tests that mock Supabase calls and validate RLS behavior (use Supabase emulators or run a local Postgres with RLS enabled)
* End-to-end tests for key flows (posting, reactions, follow/unfollow, invite signup)
* Monitoring: latency, error rates, queue lengths, CPU, DB connections

---

## 12. Deployment & Ops

* CI: Run linting, tests, and SQL migrations in PR pipelines
* Migrations: Use a single source migration tool (e.g., supabase migrations, flyway, or sqitch)
* Secret management: store service-role keys in secrets manager and never in code
* Blue/green or canary deploy strategy for backend services

---

## 13. Data Retention & Compliance

* Retain `posts` and `profiles` with soft deletes for a configurable period (e.g., 30–90 days) before permanent purge
* Provide export/delete flows for GDPR/CCPA compliance (service-route required)

---

## 14. Next Deliverables (I can generate)

* Complete `schema.sql` with full CREATE TABLE statements and constraints
* `SUPABASE_POLICIES.sql` (already generated) applied to schema
* OpenAPI spec for all endpoints
* Example transactional code for `POST /posts` (Node/Hono + Supabase client)
* Admin moderation UI wireframes and endpoint hooks

---

### Closing notes

This architecture is intentionally pragmatic: it leans on Supabase for auth, RLS, and storage so you can ship quickly while retaining production-grade security controls. When the product grows, swap in more specialized components (e.g., ElasticSearch, distributed task queue, read-replicas) while keeping the same RLS-anchored security model.

If you want, I can now: generate the `schema.sql` (full DDL + indexes + constraints) or produce the OpenAPI spec next. Which one would you like me to do immediately?



####################################################################################################################################################################

## SCHEMA.SQL

-- Full SQL schema for Twitter-style pre-2023 clone (Supabase/Postgres)

-- =========================
-- USERS (auth handled by Supabase Auth)
-- =========================
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    display_name text,
    bio text,
    avatar_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================
-- POSTS
-- =========================
CREATE TABLE IF NOT EXISTS posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    content text,
    type text CHECK (type IN ('normal','reply','quote','repost')) DEFAULT 'normal',
    parent_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
    thread_root_id uuid REFERENCES posts(id) ON DELETE SET NULL,
    media_count int DEFAULT 0,
    poll_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- =========================
-- POST MEDIA
-- =========================
CREATE TABLE IF NOT EXISTS post_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    url text NOT NULL,
    mime text NOT NULL,
    width int,
    height int,
    size int,
    created_at timestamptz DEFAULT now()
);

-- =========================
-- REACTIONS
-- =========================
CREATE TABLE IF NOT EXISTS post_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    type text CHECK (type IN ('like','dislike')),
    created_at timestamptz DEFAULT now(),
    UNIQUE (post_id, user_id)
);

-- =========================
-- REPOSTS
-- =========================
CREATE TABLE IF NOT EXISTS post_reposts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (post_id, user_id)
);

-- =========================
-- QUOTES
-- =========================
CREATE TABLE IF NOT EXISTS post_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    quote_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- =========================
-- THREADS
-- =========================
CREATE TABLE IF NOT EXISTS post_threads (
    parent_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    child_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (parent_post_id, child_post_id)
);

-- =========================
-- POLLS
-- =========================
CREATE TABLE IF NOT EXISTS post_polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE UNIQUE,
    question text NOT NULL,
    is_multiple boolean DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_poll_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid REFERENCES post_polls(id) ON DELETE CASCADE,
    label text NOT NULL,
    position int NOT NULL,
    UNIQUE (poll_id, position)
);

CREATE TABLE IF NOT EXISTS post_poll_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid REFERENCES post_polls(id) ON DELETE CASCADE,
    option_id uuid REFERENCES post_poll_options(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (poll_id, user_id)
);

-- =========================
-- FOLLOW GRAPH
-- =========================
CREATE TABLE IF NOT EXISTS follows (
    follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    followee_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
);

-- =========================
-- BLOCKS
-- =========================
CREATE TABLE IF NOT EXISTS blocks (
    blocker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);

-- =========================
-- INVITES
-- =========================
CREATE TABLE IF NOT EXISTS invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    creator_id uuid REFERENCES profiles(id),
    used_by uuid REFERENCES profiles(id),
    used_at timestamptz,
    expires_at timestamptz,
    single_use boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid REFERENCES profiles(id),
    actor_id uuid REFERENCES profiles(id),
    type text NOT NULL,
    payload jsonb NOT NULL,
    read_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- =========================
-- FEED SCORE MATERIALIZED VIEW
-- =========================
CREATE MATERIALIZED VIEW IF NOT EXISTS feed_scores AS
SELECT 
    p.id AS post_id,
    (COUNT(r.id) * 2 + COUNT(re.id) * 1) AS score,
    now() AS computed_at
FROM posts p
LEFT JOIN post_reactions r ON r.post_id = p.id AND r.type = 'like'
LEFT JOIN post_reposts re ON re.post_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;

CREATE INDEX IF NOT EXISTS idx_feed_scores_score ON feed_scores(score DESC);

-- =========================
-- FULL-TEXT SEARCH INDEX
-- =========================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE posts SET search_vector = to_tsvector('english', content);

CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN (search_vector);

CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_search_vector
BEFORE INSERT OR UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all core tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- ----------------------------
-- USERS & PROFILES
-- ----------------------------
CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ----------------------------
-- POSTS
-- ----------------------------
CREATE POLICY "posts_select_all" ON posts
  FOR SELECT USING (true);

CREATE POLICY "posts_insert_owner" ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_update_owner" ON posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "posts_delete_owner" ON posts
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------
-- POST MEDIA
-- ----------------------------
CREATE POLICY "post_media_select_all" ON post_media
  FOR SELECT USING (true);

CREATE POLICY "post_media_insert_owner" ON post_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = post_id AND p.user_id = auth.uid()
    )
  );

-- ----------------------------
-- REACTIONS
-- ----------------------------
CREATE POLICY "post_reactions_select_all" ON post_reactions
  FOR SELECT USING (true);

CREATE POLICY "post_reactions_insert_self" ON post_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_reactions_delete_self" ON post_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------
-- FOLLOWS
-- ----------------------------
CREATE POLICY "follows_select_all" ON follows
  FOR SELECT USING (true);

CREATE POLICY "follows_insert_self" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_self" ON follows
  FOR DELETE USING (auth.uid() = follower_id);


-- =============================================
-- TRIGGERS
-- =============================================

-- ------------------------------------------------
-- AUTO-UPDATE: profiles.updated_at on change
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION update_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_timestamp
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_timestamp();


-- ------------------------------------------------
-- AUTO-LINK THREADS (reply creates thread relation)
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION create_thread_link()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_post_id IS NOT NULL THEN
    INSERT INTO post_threads (post_id, parent_post_id)
    VALUES (NEW.id, NEW.parent_post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_thread_link
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION create_thread_link();


-- ------------------------------------------------
-- COUNTERS: increment/decrement like/dislike counts
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION update_reaction_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'post_reactions' THEN

    IF TG_OP = 'INSERT' THEN
      UPDATE posts
      SET like_count = like_count + (CASE WHEN NEW.reaction_type = 'like' THEN 1 ELSE 0 END),
          dislike_count = dislike_count + (CASE WHEN NEW.reaction_type = 'dislike' THEN 1 ELSE 0 END)
      WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE posts
      SET like_count = like_count - (CASE WHEN OLD.reaction_type = 'like' THEN 1 ELSE 0 END),
          dislike_count = dislike_count - (CASE WHEN OLD.reaction_type = 'dislike' THEN 1 ELSE 0 END)
      WHERE id = OLD.post_id;
    END IF;

  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reaction_counters_insert
  AFTER INSERT ON post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_reaction_counters();

CREATE TRIGGER trigger_reaction_counters_delete
  AFTER DELETE ON post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_reaction_counters();


-- ------------------------------------------------
-- COUNTERS: repost + quote counts
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION update_share_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
    SET repost_count = repost_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
    SET repost_count = repost_count - 1
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repost_counters_insert
  AFTER INSERT ON post_reposts
  FOR EACH ROW
  EXECUTE FUNCTION update_share_counters();

CREATE TRIGGER trigger_repost_counters_delete
  AFTER DELETE ON post_reposts
  FOR EACH ROW
  EXECUTE FUNCTION update_share_counters();


-- ------------------------------------------------
-- COUNTERS: quotes
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION update_quote_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
    SET quote_count = quote_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
    SET quote_count = quote_count - 1
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_quote_counters_insert
  AFTER INSERT ON post_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_counters();

CREATE TRIGGER trigger_quote_counters_delete
  AFTER DELETE ON post_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_counters();

-- =============================================
-- INDEXES (PERFORMANCE & FEED OPTIMIZATION)
-- =============================================

-- USERS
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- PROFILES
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- POSTS
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent_post_id ON posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_type_created_at ON posts(post_type, created_at DESC);

-- THREADS
CREATE INDEX IF NOT EXISTS idx_threads_parent_post_id ON post_threads(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_threads_post_id ON post_threads(post_id);

-- REACTIONS
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON post_reactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions_user_post ON post_reactions(user_id, post_id);

-- FOLLOWS
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_pair ON follows(follower_id, following_id);

-- REPOSTS
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON post_reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON post_reposts(user_id);

-- QUOTES
CREATE INDEX IF NOT EXISTS idx_quotes_post_id ON post_quotes(post_id);
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON post_quotes(user_id);

-- MEDIA
CREATE INDEX IF NOT EXISTS idx_media_post_id ON post_media(post_id);


-- =============================================
-- VIEWS (HOME FEED, USER FEED, PUBLIC FEED)
-- =============================================

-- ---------------------------------------------------------
-- PUBLIC FEED VIEW (non-personalized chronological)
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW public_feed AS
SELECT p.*,
       pr.display_name,
       pr.avatar_url
FROM posts p
JOIN profiles pr ON pr.user_id = p.user_id
ORDER BY p.created_at DESC;

-- ---------------------------------------------------------
-- USER PROFILE FEED (user → their posts)
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW user_feed AS
SELECT p.*,
       pr.display_name,
       pr.avatar_url
FROM posts p
JOIN profiles pr ON pr.user_id = p.user_id
ORDER BY p.created_at DESC;

-- ---------------------------------------------------------
-- HOME FEED VIEW (followed users + self)
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW home_feed AS
SELECT p.*,
       pr.display_name,
       pr.avatar_url
FROM posts p
JOIN profiles pr ON pr.user_id = p.user_id
WHERE p.user_id IN (
  SELECT following_id FROM follows WHERE follower_id = auth.uid()
) OR p.user_id = auth.uid()
ORDER BY p.created_at DESC;

-- ---------------------------------------------------------
-- EXPANDED THREAD VIEW
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW thread_expanded AS
SELECT t.*, p.*
FROM post_threads t
JOIN posts p ON p.id = t.post_id;



-- =============================================
-- ADVANCED RLS SETS (X PACKAGE)
-- =============================================
-- Includes: mutes, blocks, private posts, soft delete visibility, shadowban rules
-- These align with industry-standard Twitter-era backend access constraints.

-- =============================================
-- BLOCKS SYSTEM
-- =============================================
CREATE TABLE IF NOT EXISTS blocks (
  id BIGSERIAL PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Users can see only their own block relationships
CREATE POLICY "blocks_select_self" ON blocks
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "blocks_insert_self" ON blocks
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "blocks_delete_self" ON blocks
  FOR DELETE USING (auth.uid() = blocker_id);


-- =============================================
-- MUTES SYSTEM
-- =============================================
CREATE TABLE IF NOT EXISTS mutes (
  id BIGSERIAL PRIMARY KEY,
  muter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(muter_id, muted_id)
);

ALTER TABLE mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mutes_select_self" ON mutes
  FOR SELECT USING (auth.uid() = muter_id);

CREATE POLICY "mutes_insert_self" ON mutes
  FOR INSERT WITH CHECK (auth.uid() = muter_id);

CREATE POLICY "mutes_delete_self" ON mutes
  FOR DELETE USING (auth.uid() = muter_id);


-- =============================================
-- PRIVATE POSTS
-- =============================================
-- Add column to posts if not exists
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- RLS: private posts only visible to author + approved followers
CREATE POLICY "posts_select_private_restriction" ON posts
  FOR SELECT USING (
    NOT is_private
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.following_id = posts.user_id
        AND f.follower_id = auth.uid()
    )
  );


-- =============================================
-- SOFT DELETE SYSTEM
-- =============================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Soft delete trigger
CREATE OR REPLACE FUNCTION soft_delete_post()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_deleted = TRUE;
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_soft_delete_posts
  BEFORE DELETE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_post();

-- Update RLS: hide deleted posts
CREATE POLICY "posts_select_hide_deleted" ON posts
  FOR SELECT USING (NOT is_deleted);


-- =============================================
-- SHADOWBAN SYSTEM
-- =============================================
-- Add field to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS shadowbanned BOOLEAN DEFAULT FALSE;

-- Shadowbanned users can see their own content but others cannot
CREATE POLICY "shadowban_posts_policy" ON posts
  FOR SELECT USING (
    (SELECT shadowbanned FROM users u WHERE u.id = posts.user_id) = FALSE
    OR posts.user_id = auth.uid()
  );

-- Shadowbanned users cannot appear in search
CREATE OR REPLACE VIEW search_index AS
SELECT p.user_id, p.username, p.bio, u.shadowbanned
FROM profiles p
JOIN users u ON u.id = p.user_id
WHERE shadowbanned = FALSE;
