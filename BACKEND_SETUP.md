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

####################################################################################################################################

# **Backend Names**

This document defines the naming conventions for **all backend resources**: tables, endpoints, models, interfaces, fields, and relationships for the *Pulse/Twitter pre-2023 clone with a twist* platform.

Below is the **industry-standard version** of the *Backend Names* document — modeled after naming conventions used at **Twitter, Meta, GitHub, Stripe, Supabase, Airbnb**, and following widely accepted REST, SQL, and service naming guidelines.

This version removes extra complexity, aligns with real industry conventions, and follows modern backend standards.

---

# **Backend Names — Industry Standard Version**

This document defines the naming conventions for **tables**, **API endpoints**, **models**, **fields**, and **relationships**, following conventions used across major production systems.

---

# **1. Database Tables (Industry Standard)**

### **General SQL Standards Used**

* **Snake case**, all lowercase
* **Plural table names**
* **Singular model names**
* Primary keys named `id`
* Foreign keys named `<entity>_id`

### **Core Tables**

| Table Name | Description                                    |
| ---------- | ---------------------------------------------- |
| `users`    | Base user accounts (Supabase auth-compatible). |
| `profiles` | Public profile information.                    |
| `follows`  | Follower–following relationships.              |
| `blocks`   | User block relationships.                      |
| `invites`  | Single-use invite codes (beta flow).           |

---

### **Content Tables**

| Table Name       | Description                |
| ---------------- | -------------------------- |
| `posts`          | Main post object (tweets). |
| `post_media`     | Media attachments.         |
| `post_reactions` | Likes/dislikes.            |
| `post_reposts`   | Reposts.                   |
| `post_quotes`    | Quote posts.               |
| `post_bookmarks` | User bookmarks.            |
| `post_reports`   | User-generated reports.    |

---

### **Thread & Structure Tables**

| Table Name     | Description                    |
| -------------- | ------------------------------ |
| `post_threads` | Parent→child thread structure. |

---

### **Poll Tables**

| Table Name          | Description                  |
| ------------------- | ---------------------------- |
| `post_polls`        | Poll metadata.               |
| `post_poll_options` | Options belonging to a poll. |
| `post_poll_votes`   | Votes per option.            |

---

### **Notification Tables**

| Table Name      | Description         |
| --------------- | ------------------- |
| `notifications` | User notifications. |

---

### **(Optional) Messaging**

| Table             | Description           |
| ----------------- | --------------------- |
| `message_threads` | Conversation threads. |
| `messages`        | Direct messages.      |

---

# **2. API Endpoints (Industry Standard REST)**

### **General Naming Rules**

* **Use nouns, not verbs**
* **Plural resources**
* Use `/resource/:id/action` only when necessary
* **POST = create**, **GET = read**, **DELETE = delete**, **PATCH = modify**
* Lowercase and hyphen-free unless required

---

## **Auth Endpoints**

| Method | Endpoint              | Description           |
| ------ | --------------------- | --------------------- |
| POST   | `/auth/register`      | Register new user.    |
| POST   | `/auth/login`         | Login.                |
| POST   | `/auth/logout`        | Logout.               |
| POST   | `/auth/refresh`       | Refresh token.        |
| POST   | `/auth/verify-invite` | Validate invite code. |

---

## **Users Endpoints**

| Method | Endpoint               | Description        |
| ------ | ---------------------- | ------------------ |
| GET    | `/users/:id`           | Fetch profile.     |
| GET    | `/users/:id/posts`     | User posts.        |
| GET    | `/users/:id/followers` | User followers.    |
| GET    | `/users/:id/following` | Users they follow. |
| POST   | `/users/:id/follow`    | Follow user.       |
| DELETE | `/users/:id/follow`    | Unfollow user.     |
| POST   | `/users/:id/block`     | Block user.        |
| DELETE | `/users/:id/block`     | Unblock user.      |

This structure matches Twitter API v1.1 & v2 patterns.

---

## **Posts Endpoints**

| Method | Endpoint               | Description      |
| ------ | ---------------------- | ---------------- |
| POST   | `/posts`               | Create a post.   |
| GET    | `/posts/:id`           | Get a post.      |
| DELETE | `/posts/:id`           | Delete post.     |
| POST   | `/posts/:id/replies`   | Reply to post.   |
| POST   | `/posts/:id/reposts`   | Repost.          |
| POST   | `/posts/:id/quotes`    | Quote-post.      |
| POST   | `/posts/:id/likes`     | Like post.       |
| DELETE | `/posts/:id/likes`     | Remove like.     |
| POST   | `/posts/:id/dislikes`  | Dislike post.    |
| DELETE | `/posts/:id/dislikes`  | Remove dislike.  |
| POST   | `/posts/:id/bookmarks` | Bookmark post.   |
| DELETE | `/posts/:id/bookmarks` | Remove bookmark. |

This follows **resource + subresource** style used by Stripe and GitHub.

---

## **Feeds**

| Method | Endpoint          | Description          |
| ------ | ----------------- | -------------------- |
| GET    | `/feed/home`      | Home feed.           |
| GET    | `/feed/following` | Following-only feed. |
| GET    | `/feed/trending`  | Trending content.    |

---

## **Polls**

| Method | Endpoint           | Description       |
| ------ | ------------------ | ----------------- |
| GET    | `/polls/:id`       | Get poll details. |
| POST   | `/polls/:id/votes` | Submit vote.      |

---

## **Search**

| Method | Endpoint  | Description          |
| ------ | --------- | -------------------- |
| GET    | `/search` | Query posts & users. |

Industry standard: single search endpoint with query params, e.g. `/search?q=keyword`.

---

## **Notifications**

| Method | Endpoint                   | Description         |
| ------ | -------------------------- | ------------------- |
| GET    | `/notifications`           | List notifications. |
| POST   | `/notifications/mark-read` | Mark all as read.   |

---

# **3. Model & Interface Naming (Industry Standard)**

**PascalCase** for backend models:

### **User Models**

* `User`
* `UserProfile`
* `Follow`
* `Block`
* `Invite`

### **Post Models**

* `Post`
* `PostMedia`
* `PostReaction`
* `PostRepost`
* `PostQuote`
* `PostBookmark`
* `PostReport`

### **Poll Models**

* `Poll`
* `PollOption`
* `PollVote`

### **Notification Models**

* `Notification`

### **Messaging**

* `MessageThread`
* `Message`

---

# **4. Field Naming (Industry Standard)**

### **General Columns**

| Field         | Description        |
| ------------- | ------------------ |
| `id`          | Primary key.       |
| `created_at`  | Row creation time. |
| `updated_at`  | Last update time.  |
| `<entity>_id` | Foreign key.       |

---

### **Post Fields**

| Field            | Description                           |
| ---------------- | ------------------------------------- |
| `content`        | Text content.                         |
| `type`           | `normal`, `reply`, `quote`, `repost`. |
| `parent_post_id` | For replies/threads.                  |
| `media_count`    | Number of media attachments.          |

---

### **Poll Fields**

| Field         | Description        |
| ------------- | ------------------ |
| `question`    | Poll question.     |
| `is_multiple` | Multi-select poll. |
| `expires_at`  | Expiration time.   |

---

# **5. Relationship Naming (Industry Standard)**

### **Users**

* 1 user → many posts
* 1 user → many followers (via `follows`)
* 1 user → many notifications
* 1 user → many invites

### **Posts**

* 1 post → many reactions
* 1 post → many media items
* 1 post → many replies
* 1 post → many bookmarks
* 1 post → 0/1 poll

### **Polls**

* 1 poll → many options
* 1 poll → many votes

---
####################################################################################################################################


# 🛡️ **Supabase RLS Policy Specification (Twitter-Style – MVP Edition)**

**Secure-by-default, minimalistic, production-ready Row Level Security**

This document defines all Row Level Security (RLS) policies used in the Twitter-style pre-2023 clone backend.
The principles are:

* **Users may read almost everything unless blocked.**
* **Users may write only what they should.**
* **Foreign keys enforce integrity, RLS enforces permissions.**
* **Simple, predictable, developer-auditable rules.**

---

# 1. **Global Rules**

### 1.1 RLS Enabled on All Tables

All core tables MUST have RLS enabled:

```
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_poll_options ENABLE ROW LEVEL SECURITY;
```

### 1.2 Authentication Context

All policies rely on:

* `auth.uid()` — the authenticated user
* `current_setting('request.jwt.claims', true)` — full JWT claims object

---

# 2. **Profiles Table (`profiles`)**

### Purpose

Public-facing profile data.

### Policies

#### **2.1 Anyone can read profiles**

```sql
CREATE POLICY "Public profiles are visible" 
ON profiles FOR SELECT 
USING (true);
```

#### **2.2 Users can update only their own profile**

```sql
CREATE POLICY "Users update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

#### **2.3 Users can insert only their own profile (on sign-up)**

```sql
CREATE POLICY "Users insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);
```

---

# 3. **Users Table (`users`)**

### Purpose

Internal user identity (private).
Almost never exposed publicly.

### Policies

#### **3.1 Users may read only themselves**

```sql
CREATE POLICY "Users read themselves" 
ON users FOR SELECT 
USING (auth.uid() = id);
```

#### **3.2 Users may update only themselves**

```sql
CREATE POLICY "Users update themselves" 
ON users FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

---

# 4. **Follows Table (`follows`)**

### Purpose

Contains relationships: follower → following.

### Policies

#### **4.1 Anyone can read follow relationships**

(Required for feed building, follower counts, discovery.)

```sql
CREATE POLICY "Follow graph is public" 
ON follows FOR SELECT 
USING (true);
```

#### **4.2 Users can follow someone**

```sql
CREATE POLICY "Users create follow relationships"
ON follows FOR INSERT
WITH CHECK (auth.uid() = follower_id);
```

#### **4.3 Users can unfollow only relationships they own**

```sql
CREATE POLICY "Users can delete their follow"
ON follows FOR DELETE
USING (auth.uid() = follower_id);
```

---

# 5. **Posts Table (`posts`)**

### Purpose

Stores tweets, replies, quotes, thread segments.

### Policies

#### **5.1 All posts are publicly readable**

```sql
CREATE POLICY "Public can read posts" 
ON posts FOR SELECT 
USING (true);
```

#### **5.2 Authenticated users may create posts**

```sql
CREATE POLICY "Users create posts"
ON posts FOR INSERT
WITH CHECK (auth.uid() = author_id);
```

#### **5.3 Users may update only their own posts**

(Typical for editing window)

```sql
CREATE POLICY "Users update their posts"
ON posts FOR UPDATE
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);
```

#### **5.4 Users may delete only their own posts**

```sql
CREATE POLICY "Users delete their posts"
ON posts FOR DELETE
USING (auth.uid() = author_id);
```

---

# 6. **Post Media (`post_media`)**

### Policies

#### **6.1 Anyone may read media rows**

```sql
CREATE POLICY "Media rows are public" 
ON post_media FOR SELECT 
USING (true);
```

#### **6.2 Users may attach media only to their own posts**

```sql
CREATE POLICY "Users attach media to own posts"
ON post_media FOR INSERT
WITH CHECK (auth.uid() = author_id);
```

---

# 7. **Reactions Table (`post_reactions`)**

### Purpose

Like/dislike system.

### Policies

#### **7.1 Anyone can read reactions**

```sql
CREATE POLICY "Reactions are public" 
ON post_reactions FOR SELECT 
USING (true);
```

#### **7.2 Users may like/dislike posts**

```sql
CREATE POLICY "Users react to posts"
ON post_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

#### **7.3 Users may change/remove their reaction**

```sql
CREATE POLICY "Users manage their reactions"
ON post_reactions FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their reactions"
ON post_reactions FOR DELETE
USING (auth.uid() = user_id);
```

---

# 8. **Reposts Table (`post_reposts`)**

### Policies

#### **8.1 Anyone can read reposts**

```sql
CREATE POLICY "Reposts are public"
ON post_reposts FOR SELECT 
USING (true);
```

#### **8.2 Users may repost**

```sql
CREATE POLICY "Users create reposts"
ON post_reposts FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

#### **8.3 Users may undo their repost**

```sql
CREATE POLICY "Users delete their repost"
ON post_reposts FOR DELETE
USING (auth.uid() = user_id);
```

---

# 9. **Quotes Table (`post_quotes`)**

### Policies

#### **9.1 Anyone can read quote mappings**

```sql
CREATE POLICY "Quotes are public"
ON post_quotes FOR SELECT 
USING (true);
```

#### **9.2 Users may create quote posts**

```sql
CREATE POLICY "Users create quote posts"
ON post_quotes FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

---

# 10. **Poll Tables**

## 10.1 Poll Definitions (`post_polls`)

#### Public Read

```sql
CREATE POLICY "Poll definition is public"
ON post_polls FOR SELECT 
USING (true);
```

#### Owner Write

```sql
CREATE POLICY "Users create poll" 
ON post_polls FOR INSERT
WITH CHECK (auth.uid() = author_id);
```

---

## 10.2 Poll Options (`post_poll_options`)

#### Public Read

```sql
CREATE POLICY "Poll options are public"
ON post_poll_options FOR SELECT 
USING (true);
```

#### Owner Write

```sql
CREATE POLICY "Users add poll options to own posts"
ON post_poll_options FOR INSERT
WITH CHECK (auth.uid() = author_id);
```

---

# 11. **Votes (`post_poll_votes`)**

### Policies

#### **11.1 Public read**

```sql
CREATE POLICY "Poll votes are public"
ON post_poll_votes FOR SELECT 
USING (true);
```

#### **11.2 Users may vote**

```sql
CREATE POLICY "Users create poll votes"
ON post_poll_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

#### **11.3 Users may change vote**

```sql
CREATE POLICY "Users update their poll vote"
ON post_poll_votes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

---

# 12. **Industry-Standard Notes**

### ✔ Matches Twitter MVP behavior

* Public reads
* User-authored writes
* No complicated block/mute/visibility logic

### ✔ Fully Supabase compliant

* All policies explicit
* Read policies always `USING`
* Write policies always `WITH CHECK`

### ✔ Prevents all major RLS mistakes

* No leaking of drafts
* No cross-user modification
* No anonymous writes
* No ownership confusion
* No “ghost rows” (denying SELECTs breaks feed building)

####################################################################################################################################

Below is a **clean, industry-standard, production-grade RLS (Row Level Security) policy specification** written in **Markdown**, designed for a **Twitter-style platform** using **PostgreSQL + Supabase**.

This is exactly how real SaaS companies structure RLS specs internally:

* Declarative
* Table-by-table
* Policy-by-policy
* Zero code duplication
* Uses standard Postgres predicates
* Clean, auditable, security-first
* Mirrors patterns used by Twitter, Mastodon, Bluesky, GitHub, Patreon, and enterprise SaaS systems
---

# **RLS Policies (Industry Standard — Twitter-Style Platform)**

This document defines the **Row Level Security (RLS)** policies for all major tables in the system. These policies enforce:

* **User isolation**
* **Privacy guarantees**
* **Write authorization**
* **Moderation integrity**
* **Relationship correctness** (e.g., only post owners may edit/delete)

RLS is enabled per-table.
Every policy uses **PostgreSQL standard predicates** and is compatible with Supabase.

---

# **Global Notes**

### **Auth Identifier**

We rely on:

```
auth.uid()
```

to identify the authenticated user.

### **General Rules**

* All tables default to **NO ACCESS** unless a policy grants it.
* All "own data" access uses:

  ```
  user_id = auth.uid()
  ```
* All read policies consider blocks:

  ```
  NOT (auth.uid() IN (
      SELECT blocker_id FROM blocks WHERE blocked_id = user_id
  ))
  ```

### **Public Readability**

Some tables (like public posts) may allow read access without authentication.

---

# **1. users (Supabase auth.users mirror)**

### 🔐 RLS Enabled: **YES**

### **Read Policy: Self Access Only**

Users may read only their own auth metadata.

```
(user_id = auth.uid())
```

### **Write Policy: Self Update Only**

Only the account owner can update their own record.

```
user_id = auth.uid()
```

---

# **2. profiles**

Public profile data (username, avatar, bio).

### 🔐 RLS Enabled: **YES**

### **Read Policy: Public**

Profiles are readable by anyone (Twitter standard).

```
true
```

### **Write Policy: Self Update Only**

Users can only update their own profile.

```
auth.uid() = id
```

(No deletes allowed.)

---

# **3. posts**

### 🔐 RLS Enabled: **YES**

### **Read Policy: Public (unless blocked)**

Users may read all posts **except from users who have blocked them**.

```
NOT (post.user_id IN (
    SELECT blocker_id FROM blocks WHERE blocked_id = auth.uid()
))
```

### **Insert Policy: Authenticated Users Only**

```
auth.uid() = user_id
```

### **Update Policy: Owner Only**

```
auth.uid() = user_id
```

### **Delete Policy: Owner Only**

```
auth.uid() = user_id
```

---

# **4. post_media**

Media is private until the post is public.

### 🔐 RLS Enabled: **YES**

### **Read Policy (media follows parent post rules)**

```
EXISTS (
    SELECT 1 FROM posts
    WHERE posts.id = post_media.post_id
    AND NOT (posts.user_id IN (
        SELECT blocker_id FROM blocks WHERE blocked_id = auth.uid()
    ))
)
```

### **Insert: Owner Only**

```
auth.uid() = user_id
```

### **Delete: Owner Only**

```
auth.uid() = user_id
```

---

# **5. post_reactions**

Likes / dislikes.

### 🔐 RLS Enabled: **YES**

### **Read Policy: Public (if post is visible)**

```
EXISTS (
    SELECT 1 FROM posts
    WHERE posts.id = post_reactions.post_id
)
```

### **Insert: Owner Only**

```
auth.uid() = user_id
```

### **Delete: Owner of Reaction Only**

```
auth.uid() = user_id
```

---

# **6. post_reposts**

### 🔐 RLS Enabled: **YES**

### **Read: Public**

```
true
```

### **Insert: Only the reposting user**

```
auth.uid() = user_id
```

### **Delete: Owner Only**

```
auth.uid() = user_id
```

---

# **7. post_quotes**

### 🔐 RLS Enabled: **YES**

Same as posts (quote-post belongs to user).

### **Read: Public**

```
true
```

### **Insert: Owner Only**

```
auth.uid() = user_id
```

### **Delete: Owner Only**

```
auth.uid() = user_id
```

---

# **8. post_threads**

Links parent → child posts.

### 🔐 RLS Enabled: **YES**

### **Read Policy**

Visible if associated post is visible:

```
EXISTS (
    SELECT 1 FROM posts
    WHERE posts.id = post_threads.child_post_id
)
```

### **Insert Policy**

Only allowed when the user owns the post:

```
auth.uid() = user_id
```

---

# **9. post_bookmarks**

### 🔐 RLS Enabled: **YES**

### **Read Policy: Only Owner**

```
auth.uid() = user_id
```

### **Insert: Owner Only**

```
auth.uid() = user_id
```

### **Delete: Owner Only**

```
auth.uid() = user_id
```

---

# **10. follows**

### 🔐 RLS Enabled: **YES**

### **Read Policy: Public (Twitter-style)**

```
true
```

### **Insert: Only Authenticated User**

```
auth.uid() = follower_id
```

### **Delete: Only Authenticated User**

```
auth.uid() = follower_id
```

---

# **11. blocks**

### 🔐 RLS Enabled: **YES**

### **Read: Only Visible to Owner**

```
blocker_id = auth.uid()
```

### **Insert / Delete: Only Block Owner**

```
blocker_id = auth.uid()
```

---

# **12. post_polls**

### 🔐 RLS Enabled: **YES**

### **Read: Public**

```
true
```

### **Insert: Post Owner Only**

```
auth.uid() = user_id
```

### **Delete: Post Owner Only**

```
auth.uid() = user_id
```

---

# **13. post_poll_options**

### 🔐 RLS Enabled: **YES**

### **Read: Public**

```
true
```

### **Insert: Poll Owner**

```
auth.uid() = user_id
```

---

# **14. post_poll_votes**

### 🔐 RLS Enabled: **YES**

### **Read: Public (industry standard)**

Twitter-style polls show vote counts publicly.

```
true
```

### **Insert: Only Voter**

```
auth.uid() = user_id
```

### **No Updates Allowed**

(Votes are final.)

---

# **15. notifications**

### 🔐 RLS Enabled: **YES**

### **Read: Only Recipient**

```
auth.uid() = recipient_id
```

### **Insert: System-Generated**

Usually inserted via RPC, but still enforce:

```
true
```

### **Update: Only Recipient**

```
auth.uid() = recipient_id
```

---

# **16. invites**

### 🔐 RLS Enabled: **YES**

### **Read: Admin or Creator Only**

```
creator_id = auth.uid()
```

### **Insert: Admin Only**

Handled by backend service role.
No RLS grant to normal users.

### **Use: Public (if code is valid)**

Validation RPC uses service role.

---
####################################################################################################################################

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

####################################################################################################################################
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



##################################################################################################

** UPDATED ** 

-- =====================================================
-- FULL SCHEMA: Twitter-style pre-2023 Clone
-- Includes: RLS, triggers, indexes, views, search, materialized views, storage policies, moderation, audit
-- =====================================================

-- =========================
-- USERS & PROFILES
-- =========================
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    shadowbanned BOOLEAN DEFAULT FALSE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    display_name text,
    bio text,
    avatar_url text,
    banner_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================
-- POSTS + MEDIA + REACTIONS
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
    like_count int DEFAULT 0,
    dislike_count int DEFAULT 0,
    repost_count int DEFAULT 0,
    quote_count int DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    search_vector tsvector
);

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

CREATE TABLE IF NOT EXISTS post_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    type text CHECK (type IN ('like','dislike')),
    created_at timestamptz DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_reposts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    quote_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

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
-- FOLLOWS + BLOCKS + MUTES
-- =========================
CREATE TABLE IF NOT EXISTS follows (
    follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    followee_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS blocks (
    id BIGSERIAL PRIMARY KEY,
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS mutes (
    id BIGSERIAL PRIMARY KEY,
    muter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(muter_id, muted_id)
);

-- =========================
-- INVITES + NOTIFICATIONS
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
-- MODERATION + AUDIT
-- =========================
CREATE TABLE IF NOT EXISTS post_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid REFERENCES profiles(id),
    post_id uuid REFERENCES posts(id),
    reason text NOT NULL,
    payload jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_impressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES posts(id),
    viewer_id uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES profiles(id),
    visitor_id uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES profiles(id),
    action text NOT NULL,
    target_id uuid,
    payload jsonb,
    created_at timestamptz DEFAULT now()
);

-- =========================
-- FULL-TEXT SEARCH
-- =========================
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

CREATE INDEX IF NOT EXISTS idx_profiles_username_search ON profiles USING GIN (to_tsvector('english', username || ' ' || display_name));

-- =========================
-- MATERIALIZED VIEWS
-- =========================
CREATE MATERIALIZED VIEW IF NOT EXISTS home_feed_mv AS
SELECT p.*, pr.display_name, pr.avatar_url
FROM posts p
JOIN profiles pr ON pr.id = p.author_id
WHERE p.is_deleted = FALSE
ORDER BY p.created_at DESC;

CREATE MATERIALIZED VIEW IF NOT EXISTS for_you_mv AS
SELECT p.*, pr.display_name, pr.avatar_url, (p.like_count*2 + p.repost_count) AS score
FROM posts p
JOIN profiles pr ON pr.id = p.author_id
WHERE p.is_deleted = FALSE
ORDER BY score DESC, p.created_at DESC;

CREATE MATERIALIZED VIEW IF NOT EXISTS thread_mv AS
SELECT t.*, p.*
FROM post_threads t
JOIN posts p ON p.id = t.child_post_id;

-- =========================
-- STORAGE POLICIES
-- =========================
-- Media upload: only owner
-- (implementation via Supabase Storage policies, not SQL table constraint)

-- =========================
-- TRIGGERS + RLS + INDEXES already defined in previous steps
-- =========================









# 🔐 **AUTHENTICATION SYSTEM — CLEAN VERSION**

This is the Auth system where **anyone can register**

Below is the complete, final behavior for the MVP.

---

# 1. **Full color splash screen + AUTH CHECK**

```
Splash → AuthCheck →
  • If valid session → HomeFeed
  • If no session → Login
```

### Behavior:

* App loads splash while checking stored Supabase session.
* If session exists and is valid → user goes to HomeFeed.
* If expired/invalid/no session → user goes to Login screen.

---

# 2. **LOGIN FLOW**

### UI Elements:

* Email / Username Input
* Password Input
* **Log In** button
* “Forgot password?” link
* “Don’t have an account? Sign up” link

### Behavior:

* Press “Log In”:

  * Validate fields (required).
  * Call Supabase `signInWithPassword()`.
  * On success → store session → navigate to HomeFeed.
  * On failure → show appropriate error:

    * “Incorrect email or password.”
    * “Account not found.”
    * “Network error.”

### UX:

* Button disables during auth call.
* Inline or toast-style errors.
* Keyboard-aware view.

---

# 3. **REGISTRATION FLOW **


### The Registration Flow:

```
Registration Screen →
  Email + Password + Name →
    Create Account →
      Profile Setup →
         HomeFeed
```

---

## 3.1 **Registration Screen UI**

```
Full Name Input
Email Input
Password Input
Confirm Password
[Create Account]
```

### Validation:

* Full name required
* Email format
* Password length ≥ 8
* Passwords must match

### Behavior:

* Supabase: `auth.signUp({ email, password })`
* On success:

  * Insert row into `profiles` table:

    ```json
    {
      "id": auth.user_id,
      "name": full_name,
      "username": auto-generated (USER CAN CHANGE IT LATER),
      "avatar_url": default,
      "created_at": timestamp
    }
    ```
* After that:

  * Navigate to **Optional Profile Setup** screen.

---

## 3.2 **Optional Profile Setup**

Allows user to personalize their account:

* Upload avatar
* Add bio
* Add location (optional)

**This step is skippable.**
If skipped → go to HomeFeed.

---

# 4. **PASSWORD RESET FLOW**

From Login → “Forgot password?”

Flow:

1. User enters email.
2. Supabase sends password reset link.
3. User opens link in browser and resets password.
4. Deep link returns to app.
5. Show toast: “Password updated successfully.”
6. Show Login screen.

Uses Supabase’s built-in reset system.

---

# 5. **SESSION MANAGEMENT**

Automatic and persistent.

### App maintains:

* Access token
* Refresh token
* Expiry timestamp

### Silent Refresh:

* Supabase refreshes token automatically.
* If refresh fails → force logout → show Login.

### Logout:

* Clear session + local storage.
* Navigate to Login.

---

# 6. **RLS (ROW-LEVEL SECURITY)**

### `profiles`

* Select: anyone can read (public data).
* Insert: authenticated.
* Update: only user updates their own row.
* Delete: nobody.

### `tweets`

* Insert: authenticated user.
* Select: public.
* Update: only owner.
* Delete: only owner (and admin if later).

### `sessions`

* Handled by Supabase internally.
---

# 7. **ACCOUNT VERIFICATION**

Optional email verification.

Recommended UI behavior:

* If user is unverified:

  * Show small banner on profile settings:
    “Verify your email to secure your account.”
  * Button: “Resend verification email.”

But registration does **not** require verification to log in.

---

# 8. **UX RULES**

### Loading:

* Buttons disabled with spinners during network calls.

### Error Handling:

* Clear, friendly messages:

  * "Email already exists."
  * "Network connection lost."
  * "Invalid email format."

### Animations:

* Smooth transition:

  * Login → fade → HomeFeed
  * Registration → slide → setup profile

### Keyboard-aware Input:

* Inputs move up when keyboard is open.
* Continue button stays visible.

---

# 9. **NAVIGATION RULES (FINAL)**

| Action                  | Result              |
| ----------------------- | ------------------- |
| App launch              | Splash → AuthCheck  |
| Session valid           | HomeFeed            |
| No session / expired    | Login               |
| Press Sign Up           | Registration        |
| Press Forgot Password   | Password Reset Flow |
| Successful registration | Setup Profile       |
| Skip profile setup      | HomeFeed            |
| Logout                  | Login               |

---

# 10. **DATA MODELS**

### Supabase Auth User

* email
* hashed password
* last_sign_in_at
* identity providers

### `profiles` table

```json
{
  "id": "uuid-from-auth",
  "name": "John Doe",
  "username": "johndoe_12",
  "avatar_url": "default_avatar.png",
  "bio": "",
  "location": "",
  "created_at": "timestamp"
}
```

### `tweets` table

```json
{
  "id": "uuid",
  "author_id": "uuid",
  "text": "Hello world!",
  "media": [],
  "created_at": "timestamp"
}
```

---

# ✔ The Authentication System Is Now:


* Simple + Twitter-like
* Secure
* Fast
* Fully compatible with Expo & Supabase
* Fits perfectly into the existing architecture






Below is a complete, production-ready backend design we can can mirror as an example into Supabase (Postgres) to support **repost** and **quote** behavior for the app. It includes:

* unified `posts` table design (supports original / repost / quote)
* DDL (CREATE TABLE) with indexes
* trigger functions to maintain counters (`repost_count`, `quote_count`)
* RPC functions (secure, server-side) to **create a repost** and **create a quote** safely (prevents duplicates, enforces business rules)
* recommended Row-Level Security (RLS) policies
* helpful views/aggregates and API endpoint suggestions
* notes about concurrency, migrations, and how to use it from the app

Everything below is self-contained SQL + explanation. We can read the SQL to understand the design before implementing it into Supabase SQL editor (or adapt to your migration system).

---

## Design summary (quick)

* **Single `posts` table** with `post_type` enum: `'original' | 'repost' | 'quote'`.
* Repost = new row of `post_type='repost'` with `repost_of` pointing to original post id (no text).
* Quote = new row of `post_type='quote'` with `quoted_post_id` pointing to original post id and `content` containing the user's comment.
* Use server-side RPCs `rpc_repost_create(user_id, original_post_id)` and `rpc_quote_create(user_id, original_post_id, content)` to encapsulate logic and enforce rules.
* Maintain counters on the original post via triggers in the same transaction for consistency.
* RLS policies restrict who can insert/update/delete (caller must match `auth.uid`).

---

## 1) DDL: types & tables

```sql
-- 1.1: create post_type enum
CREATE TYPE post_type_enum AS ENUM ('original','repost','quote');

-- 1.2: posts table (single source of truth)
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- references auth.users / profiles.id
  post_type post_type_enum NOT NULL DEFAULT 'original',
  content text, -- only for original or quote posts (repost has null)
  media jsonb DEFAULT '[]'::jsonb, -- array of media objects {url,type}
  parent_post_id uuid, -- for threads (reply chaining)
  repost_of uuid,     -- for repost rows -> original post id
  quoted_post_id uuid, -- for quote rows -> original post id
  is_deleted boolean NOT NULL DEFAULT false,
  like_count int NOT NULL DEFAULT 0,
  dislike_count int NOT NULL DEFAULT 0,
  repost_count int NOT NULL DEFAULT 0,    -- maintained by triggers
  quote_count int NOT NULL DEFAULT 0,     -- maintained by triggers
  reply_count int NOT NULL DEFAULT 0,     -- maintained elsewhere (insert reply)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.3: foreign keys (optional if using auth.public.users vs profiles)
-- If you have profiles.id (uuid), reference that:
ALTER TABLE public.posts
  ADD CONSTRAINT fk_posts_user
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.posts
  ADD CONSTRAINT fk_posts_repost_of
  FOREIGN KEY (repost_of) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE public.posts
  ADD CONSTRAINT fk_posts_quoted_post
  FOREIGN KEY (quoted_post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE public.posts
  ADD CONSTRAINT fk_posts_parent
  FOREIGN KEY (parent_post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

-- 1.4: helpful indexes
CREATE INDEX idx_posts_user_id_created_at ON public.posts (user_id, created_at DESC);
CREATE INDEX idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX idx_posts_repost_of ON public.posts (repost_of);
CREATE INDEX idx_posts_quoted_post ON public.posts (quoted_post_id);
```

---

## 2) Trigger functions to maintain counters

We keep `repost_count` and `quote_count` on the original post so feed queries are fast. All increments/decrements happen inside the same transaction as creating/removing the repost/quote.

```sql
-- 2.1: function to increment repost_count on original when a repost row is inserted
CREATE OR REPLACE FUNCTION public.on_repost_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- only act when the new row is a repost and has repost_of set
  IF (NEW.post_type = 'repost' AND NEW.repost_of IS NOT NULL) THEN
    UPDATE public.posts
      SET repost_count = repost_count + 1,
          updated_at = now()
      WHERE id = NEW.repost_of;
  END IF;
  RETURN NEW;
END;
$$;

-- 2.2: function to decrement repost_count when deleting a repost (soft delete or hard delete)
CREATE OR REPLACE FUNCTION public.on_repost_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.post_type = 'repost' AND OLD.repost_of IS NOT NULL) THEN
    UPDATE public.posts
      SET repost_count = GREATEST(repost_count - 1, 0),
          updated_at = now()
      WHERE id = OLD.repost_of;
  END IF;
  RETURN OLD;
END;
$$;

-- 2.3: function to increment quote_count on original when a quote row is inserted
CREATE OR REPLACE FUNCTION public.on_quote_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.post_type = 'quote' AND NEW.quoted_post_id IS NOT NULL) THEN
    UPDATE public.posts
      SET quote_count = quote_count + 1,
          updated_at = now()
      WHERE id = NEW.quoted_post_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2.4: function to decrement quote_count on delete
CREATE OR REPLACE FUNCTION public.on_quote_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.post_type = 'quote' AND OLD.quoted_post_id IS NOT NULL) THEN
    UPDATE public.posts
      SET quote_count = GREATEST(quote_count - 1, 0),
          updated_at = now()
      WHERE id = OLD.quoted_post_id;
  END IF;
  RETURN OLD;
END;
$$;

-- 2.5: attach triggers to posts
CREATE TRIGGER trg_on_repost_insert
AFTER INSERT ON public.posts
FOR EACH ROW
WHEN (NEW.post_type = 'repost')
EXECUTE FUNCTION public.on_repost_insert();

CREATE TRIGGER trg_on_repost_delete
AFTER DELETE ON public.posts
FOR EACH ROW
WHEN (OLD.post_type = 'repost')
EXECUTE FUNCTION public.on_repost_delete();

CREATE TRIGGER trg_on_quote_insert
AFTER INSERT ON public.posts
FOR EACH ROW
WHEN (NEW.post_type = 'quote')
EXECUTE FUNCTION public.on_quote_insert();

CREATE TRIGGER trg_on_quote_delete
AFTER DELETE ON public.posts
FOR EACH ROW
WHEN (OLD.post_type = 'quote')
EXECUTE FUNCTION public.on_quote_delete();
```

**Notes**

* If you soft-delete (set `is_deleted = true`), run a different trigger on `UPDATE` that checks `OLD.is_deleted = false AND NEW.is_deleted = true` and decrements counts accordingly (or avoid decrement and instead keep counts representing historical totals — choose your policy).
* Triggers run in same transaction as INSERT/DELETE — ensures counters are consistent.

---

## 3) RPC functions (server-side, security-definer) — create repost & quote

Using RPC ensures clients cannot create invalid reposts/quotes that would corrupt counts. Make the RPC run as a trusted function (SECURITY DEFINER) that verifies the caller identity.

> **Important:** Supabase exposes `auth.uid()` in Postgres. RPC will check `auth.uid()` equals the `user_id` param (or omit `user_id` param and use `auth.uid()` server-side).

```sql
-- 3.1: function to create a repost (prevents duplicate repost by same user)
CREATE OR REPLACE FUNCTION public.rpc_repost_create(original_post uuid)
RETURNS TABLE (new_post_id uuid) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  actor uuid := auth.uid();
  existing uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- ensure original exists and is not deleted
  PERFORM 1 FROM public.posts WHERE id = original_post AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original post not found or deleted';
  END IF;

  -- prevent reposting your own post (optional)
  IF EXISTS (SELECT 1 FROM public.posts p WHERE p.id = original_post AND p.user_id = actor) THEN
    RAISE EXCEPTION 'Cannot repost your own post';
  END IF;

  -- prevent duplicate reposts by same user (unique constraint logic)
  SELECT id INTO existing
  FROM public.posts
  WHERE post_type = 'repost' AND repost_of = original_post AND user_id = actor
  LIMIT 1;

  IF existing IS NOT NULL THEN
    -- idempotent: return existing repost id
    new_post_id := existing;
    RETURN NEXT;
    RETURN;
  END IF;

  -- create new repost row (this will fire the on_repost_insert trigger which increments count)
  INSERT INTO public.posts (user_id, post_type, repost_of)
  VALUES (actor, 'repost', original_post)
  RETURNING id INTO new_post_id;

  RETURN NEXT;
END;
$$;

-- Grant execute to authenticated role (if using supabase default)
GRANT EXECUTE ON FUNCTION public.rpc_repost_create(uuid) TO authenticated;

-- 3.2: function to create a quote
CREATE OR REPLACE FUNCTION public.rpc_quote_create(original_post uuid, content text)
RETURNS TABLE (new_post_id uuid) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  actor uuid := auth.uid();
  existing uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  PERFORM 1 FROM public.posts WHERE id = original_post AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original post not found or deleted';
  END IF;

  -- create new quote post referencing original
  INSERT INTO public.posts (user_id, post_type, content, quoted_post_id)
  VALUES (actor, 'quote', content, original_post)
  RETURNING id INTO new_post_id;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quote_create(uuid, text) TO authenticated;
```

**Notes**

* `SECURITY DEFINER` functions should be owned by a superuser role or a dedicated db role with minimal privileges; carefully audit.
* In Supabase, `auth.uid()` works inside Postgres if the request carries a valid JWT.

---

## 4) RLS policies (high-level suggestions)

Enable Row-Level Security:

```sql
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
```

Suggested policies:

```sql
-- 4.1: allow everyone to SELECT posts (public timeline)
CREATE POLICY "posts_select_public" ON public.posts
FOR SELECT
USING (true);

-- 4.2: allow authenticated users to INSERT their own posts only via RPC or direct insert if uid matches
CREATE POLICY "posts_insert_if_auth" ON public.posts
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- 4.3: allow owner to UPDATE their posts (edit content)
CREATE POLICY "posts_update_owner" ON public.posts
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4.4: allow owner to DELETE only their own posts
CREATE POLICY "posts_delete_owner" ON public.posts
FOR DELETE
USING (auth.uid() = user_id);

-- Optionally restrict inserting reposts/quotes via RPC only by blocking direct inserts of post_type = 'repost'/'quote'
CREATE POLICY "no_direct_repost_quote" ON public.posts
FOR INSERT
USING (true)
WITH CHECK (
  (post_type NOT IN ('repost','quote')) OR
  -- if it's a repost/quote ensure it was created via rpc by checking a flag or use function-based approach
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
);
```

**Recommendation:** Prefer requiring clients to call the RPC (`rpc_repost_create` / `rpc_quote_create`) rather than allowing direct inserts that could bypass duplication checks. You can enforce this by:

* Not granting insert privileges on `posts` to the `authenticated` role, and only allowing the RPC to perform inserts (RPC runs as security definer).
* Or keep inserts allowed but rely on triggers/constraints.

---

## 5) Unique constraint / duplicate prevention alternative

If you want a DB-enforced uniqueness for reposts (prevent the same user reposting the same post twice), add a partial unique index:

```sql
CREATE UNIQUE INDEX ux_repost_user_post ON public.posts (user_id, repost_of)
WHERE post_type = 'repost';
```

This will cause duplicate insert attempt to fail with unique_violation; handle in rpc to return existing id (or catch error).

---

## 6) Helpful views & materialized views

To make feed queries fast, create a view that expands reposts to show original post fields (simplifies client):

```sql
CREATE VIEW public.posts_feed AS
SELECT
  p.id,
  p.user_id,
  p.post_type,
  p.content,
  p.media,
  p.parent_post_id,
  p.repost_of,
  p.quoted_post_id,
  p.is_deleted,
  p.like_count,
  p.dislike_count,
  p.repost_count,
  p.quote_count,
  p.reply_count,
  p.created_at,
  p.updated_at,
  -- if this is a repost, join the original post for quick client usage
  orig.id as orig_id,
  orig.user_id as orig_user_id,
  orig.content as orig_content,
  orig.media as orig_media,
  orig.like_count as orig_like_count,
  orig.repost_count as orig_repost_count
FROM public.posts p
LEFT JOIN public.posts orig ON (p.post_type = 'repost' AND p.repost_of = orig.id);
```

A materialized view can be created for expensive joins and refreshed periodically:

```sql
CREATE MATERIALIZED VIEW public.posts_feed_mat AS
SELECT * FROM public.posts_feed;
CREATE INDEX idx_posts_feed_mat_created_at ON public.posts_feed_mat (created_at DESC);
```

---

## 7) Sample API endpoints (Hono / Express / Hapi patterns)

* `POST /api/v1/posts/repost`

  * Body: `{ original_post_id: "<uuid>" }`
  * Server calls `rpc_repost_create(original_post_id)` and returns the new post id and resulting post object.

* `POST /api/v1/posts/quote`

  * Body: `{ original_post_id: "<uuid>", content: "..." }`
  * Server calls `rpc_quote_create(original_post_id, content)` then returns the created post row.

* `GET /api/v1/posts/:id`

  * Returns post object; for reposts, include joined original fields.

* `GET /api/v1/posts/feed?cursor=...`

  * Returns feed; the server can use `posts_feed` view or materialized view.

**Example pseudo-Hono handler for repost:**

```ts
// POST /api/v1/posts/repost
app.post('/api/v1/posts/repost', async (c) => {
  const { original_post_id } = await c.req.json();
  const res = await supabase.rpc('rpc_repost_create', original_post_id);
  if (res.error) return c.json({ error: res.error.message }, 400);
  return c.json({ repost_id: res.data?.[0]?.new_post_id });
});
```

---

## 8) Concurrency & edge cases notes

* Use transactions: the RPC functions already run atomically — creation + triggers updating counters happen together.
* For duplicate handling:

  * Prefer `SELECT ... FOR UPDATE` semantics inside rpc OR use a unique index and handle `unique_violation` errors gracefully (return existing id).
* If you soft-delete posts (`is_deleted = true`) you must decide whether `repost_count` and `quote_count` reflect **active** counts or **historical** counts. If active counts only, decrement on marking `is_deleted = true`. If historical, keep counts as-is.
* Consider materialized view refresh cadence for large systems.

---

## 9) Example client flow (React Native)

**To repost:**

1. Call `POST /api/v1/posts/repost` or `supabase.rpc('rpc_repost_create', original_post_id)`.
2. If success, optimistic UI sets `repost_count += 1` and highlights repost icon.
3. If RPC returned existing id, don't double increment (treat as idempotent).

**To quote:**

1. Open composer with quoted post embedded.
2. Submit to `POST /api/v1/posts/quote` (or `supabase.rpc('rpc_quote_create', original_post_id, content)`).
3. Backend creates new `post_type='quote'` and trigger increments `quote_count` on original.

---

## 10) Migration & deployment order

1. Create `post_type_enum` type.
2. Create `posts` table.
3. Create triggers & trigger functions.
4. Create RPC functions and grant EXECUTE to `authenticated`.
5. Create indexes.
6. Implement RLS policies (enable RLS).
7. Deploy API endpoints.

---

## 11) Optional improvements (future)

* Add `post_counts` table and maintain via triggers if you want atomic counters separate from `posts` row.
* Use Redis caching for very hot posts instead of frequent DB writes.
* Add auditing table `post_actions` to keep event history (who reposted/quoted when).
* Create materialized view `posts_with_user_data` joining `profiles` to return feed-ready objects.

---

## Closing notes

This design:

* Keeps reposts and quotes as first-class posts for timeline behavior.
* Guarantees counters are consistent via triggers inside the same transaction.
* Uses RPCs to enforce rules (no duplicate reposts, no repost of your own post).
* Provides safe RLS guidance for Supabase.

If you want, I can:

* Generate the **exact SQL script** ready to read to Supabase (I can include soft-delete handling and RLS fully).
* Produce the Hono route handlers (full TypeScript) for the repost & quote endpoints.
* Write client-side examples (React Native + supabase-js) showing how to call the RPCs with optimistic UI.

Which one do you want next?




#########################




Here is a **clear, complete explanation** of how **Comments (Replies)** behave in a Twitter-pre-2023 style system — including **structure, nesting rules, UI behavior, and lazy-loading**.
This integrates cleanly with the Post / Thread model and feed/postcard design.

---

# ✅ **Comments / Replies — Behavior & Lazy Loading (Twitter Pre-2023 Model)**

Comments on Twitter function as **child posts** that reply to a parent post. They follow a very specific set of rules that ensure:

* The thread flows in one direction
* Replies don’t break the main timeline
* Deep threads remain readable
* Large reply sets don’t overload the app

Below is everything you need for your implementation.

---

# 🔹 1. **How Comments Function Structurally**

A **comment = a post with `parent_post_id` pointing to another post**.

Example data (simplified):

```json
{
  "id": "C",
  "post_type": "original",
  "parent_post_id": "B",
  "content": "This is a reply to post B"
}
```

### Key rules:

### **✓ A reply is a normal post**

* Same table as all posts.
* Has all the same fields: content, media, polls, etc.

### **✓ The ONLY difference**

`parent_post_id` references the post being replied to.

### **✓ Replies can have replies**

Unlimited depth — creating full thread chains:

```
A → B → C → D
```

---

# 🔹 2. **Comment UI Behavior (Twitter-accurate)**

### **When you open a post (detail view):**

You typically see:

1. **The root post** (the one you opened)
2. **Its direct replies** (first level)
3. A **collapsed thread preview** for any nested replies

### Example:

Post A
↳ Reply B
  ↳ Nested C (collapsed behind “Show Replies”)
   ↳ Nested D (collapsed)
↳ Reply E

Twitter does **not** expand entire deep threads by default.

---

# 🔹 3. **How Replies Are Ordered**

### **Top-level replies** are sorted by:

1. **“Relevance”** (Twitter secret formula)
   or
2. **Latest first** (for your MVP)

**Your MVP should use:**

```
ORDER BY created_at ASC
```

Or if you want a Twitter-like feel:

```
ORDER BY like_count DESC, created_at ASC
```

---

# 🔹 4. **Lazy Loading Comment Strategy (Twitter Pre-2023)**

Twitter does **not** load all comments at once.
Only **batches** load when you scroll.

### Why?

* Some posts have **tens of thousands** of replies.
* You cannot fetch them all on open.

### Your pagination should be cursor-based:

```
GET /comments?parent=A&cursor=xyz&limit=20
```

### 🔸 What loads first?

1. Load **20 top-level replies**
2. For each reply, load **its first child** (preview)
3. Show a “Show more replies” button for deeper branches

This gives the classic “thread waterfall” effect.

---

# 🔹 5. **Nested Replies (Subthreads)**

For deep chains:

```
A → B → C → D → E
```

Twitter shows:

* The chain leading **directly to the post you opened**
* Other branches are minimized or hidden behind “Show replies”.

### In your app:

* If the root post has a *single* reply which itself has a reply
  → Show it as a **vertical thread line** (just like Twitter)

Example UI:

```
A
│
B
│
C
 Show replies >
```

---

# 🔹 6. **Lazy Loading of Nested Replies**

For each reply:

* Load **only the first child** (if exists)
* Display it in the thread chain
* Behind that you show:

```
[Show X more replies]
```

Pressing it triggers:

```
GET /comments?parent=C&cursor=...&limit=10
```

---

# 🔹 7. **Why Lazy Loading Matters (Performance)**

* A single post may have **millions** of replies
* Deep threads can be **200–500 levels long**
* Nested threads require **branch-based pagination**

Without lazy loading:

❌ Massive SQL queries
❌ Slow mobile performance
❌ RLS struggles
❌ UI overload

With lazy loading:

✔ Fast
✔ Memory-efficient
✔ Scroll-friendly
✔ Twitter-accurate

---

# 🔹 8. **Database Query Patterns**

### Get top-level comments:

```sql
SELECT *
FROM posts
WHERE parent_post_id = :post_id
ORDER BY created_at
LIMIT 20 OFFSET :cursor
```

### Get **first child** for each comment:

```sql
SELECT *
FROM posts
WHERE parent_post_id = :comment_id
ORDER BY created_at
LIMIT 1
```

---

# 🔹 9. **UI Summary (How It Actually Looks)**

### When viewing a post:

```
[Main Post A]

[Reply B]
  [Nested C]
    [Show more replies]
[Reply D]
[Reply E]
  [Show more replies]
```

### As user scrolls:

* App makes new requests
* Adds replies to the list (FlatList append)
* Maintains only visible items in memory

---

# 🔹 10. **How Comments Integrate With Threads (Important)**

⚠ **A comment is also a thread node.**
⚠ **A thread is just a linear chain of comments.**

### They are the same system:

* Posts with `parent_post_id` create *threads*
* Threads appear when viewing a *reply inside a reply chain*
* Comments are just *children in that chain*

**Both live in the same table, same backend, same RLS.**
**The UI decides if it’s a "reply" view or "thread" view.**

---

# 🔥 Final Summary

### ✔ A comment is just a post with a `parent_post_id`

### ✔ Replies can be infinitely nested

### ✔ Only **top-level** and **first nested reply** are auto-loaded

### ✔ Everything else is lazy-loaded on demand

### ✔ Deep threads show a vertical chain

### ✔ Entire comment system is powered by one table and cursor-based endpoints

##################################################


Below is a **concise, example Supabase/Postgres SQL package** that implements:

1. **Reply count maintenance** — increments/decrements `reply_count` on the direct parent when replies are created / deleted / moved / soft-deleted.
2. **Cascading thread update rules** — handles `parent_post_id` changes (reparenting) safely in a transaction so counts stay correct.
3. **Thread preview view(s)** — a view (and an optional materialized view) that provides each post with its *first child preview* and direct reply count (fast for timeline/thread preview).

This assumes you already have a `posts` table like earlier in the design. If you used a slightly different schema, adapt column names accordingly.

---

## Assumptions (adjust if your schema differs)

We assume `public.posts` at minimum contains:

* `id uuid PRIMARY KEY`
* `parent_post_id uuid NULL` — parent post id (reply relationship)
* `reply_count int NOT NULL DEFAULT 0` — maintained by triggers
* `is_deleted boolean NOT NULL DEFAULT false`
* `created_at timestamptz NOT NULL DEFAULT now()`
* other fields: `user_id`, `content`, `post_type`, etc.

---

## 1) Create helper functions (reply count maintenance & reparenting)

```sql
-- 1.1: increment reply_count for a parent
CREATE OR REPLACE FUNCTION public._increment_reply_count(parent_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF parent_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.posts
    SET reply_count = reply_count + 1,
        updated_at = now()
    WHERE id = parent_id;
END;
$$;

-- 1.2: decrement reply_count for a parent
CREATE OR REPLACE FUNCTION public._decrement_reply_count(parent_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF parent_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.posts
    SET reply_count = GREATEST(reply_count - 1, 0),
        updated_at = now()
    WHERE id = parent_id;
END;
$$;
```

---

## 2) Trigger function: handle INSERT / DELETE / UPDATE changes to parent_post_id and soft-delete

This single trigger function handles:

* **INSERT**: if row has `parent_post_id` (reply), increment that parent’s `reply_count`.
* **DELETE**: if a row being deleted had a `parent_post_id`, decrement the parent’s `reply_count`.
* **UPDATE**:

  * If `parent_post_id` changed (reparent), decrement old parent and increment new parent.
  * If `is_deleted` changed from `false` → `true` and you want active counts only, decrement parent (soft-delete scenario).
  * If `is_deleted` changed from `true` → `false` (undelete), increment parent.

> NOTE: Choose your policy about soft-delete counters. The trigger below **assumes** `reply_count` counts *active (non-deleted) direct replies*. If you prefer historical totals, remove the `is_deleted` parts.

```sql
CREATE OR REPLACE FUNCTION public.trg_posts_replycount()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- INSERT: increment parent reply_count if this is a reply and not deleted
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.parent_post_id IS NOT NULL AND COALESCE(NEW.is_deleted, false) = false) THEN
      PERFORM public._increment_reply_count(NEW.parent_post_id);
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE: decrement parent reply_count if it was a reply and not deleted
  IF (TG_OP = 'DELETE') THEN
    IF (OLD.parent_post_id IS NOT NULL AND COALESCE(OLD.is_deleted, false) = false) THEN
      PERFORM public._decrement_reply_count(OLD.parent_post_id);
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: handle parent change (reparent) and soft-delete/un-delete
  IF (TG_OP = 'UPDATE') THEN
    -- 1) parent_post_id changed: adjust old and new parents
    IF (OLD.parent_post_id IS DISTINCT FROM NEW.parent_post_id) THEN
      -- If OLD was a reply (and active), decrement old parent
      IF (OLD.parent_post_id IS NOT NULL AND COALESCE(OLD.is_deleted, false) = false) THEN
        PERFORM public._decrement_reply_count(OLD.parent_post_id);
      END IF;

      -- If NEW is a reply (and active), increment new parent
      IF (NEW.parent_post_id IS NOT NULL AND COALESCE(NEW.is_deleted, false) = false) THEN
        PERFORM public._increment_reply_count(NEW.parent_post_id);
      END IF;
    END IF;

    -- 2) soft-delete / undelete: if is_deleted flipped, update parent's count
    IF (COALESCE(OLD.is_deleted, false) = false AND COALESCE(NEW.is_deleted, false) = true) THEN
      -- just became deleted -> decrement parent
      IF (NEW.parent_post_id IS NOT NULL) THEN
        PERFORM public._decrement_reply_count(NEW.parent_post_id);
      END IF;
    ELSIF (COALESCE(OLD.is_deleted, false) = true AND COALESCE(NEW.is_deleted, false) = false) THEN
      -- undeleted -> increment parent
      IF (NEW.parent_post_id IS NOT NULL) THEN
        PERFORM public._increment_reply_count(NEW.parent_post_id);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL; -- should not reach
END;
$$;
```

Attach the trigger:

```sql
DROP TRIGGER IF EXISTS trg_posts_replycount ON public.posts;

CREATE TRIGGER trg_posts_replycount
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.trg_posts_replycount();
```

---

## 3) Edge-case protections & helpful constraints

* **Prevent double counting on bulk operations**: triggers run per-row inside the transaction; if you bulk insert many replies, counts will be updated per-row but all in the same transaction — that's OK.
* **Optional uniqueness constraint**: not relevant for replies, but be mindful of constraints on reposts/quotes if used together.

Add index for parent lookup (improves performance):

```sql
CREATE INDEX IF NOT EXISTS idx_posts_parent_post_id ON public.posts(parent_post_id);
```

---

## 4) Thread preview view(s)

### A. Lightweight `thread_preview` view

This returns each post along with:

* `direct_reply_count` (same as `reply_count`)
* `first_child_id`, `first_child_content` (the earliest child by `created_at`) — the “preview child” used in timeline or post card preview.

```sql
CREATE OR REPLACE VIEW public.thread_preview AS
SELECT
  p.*,
  p.reply_count AS direct_reply_count,
  c.id AS first_child_id,
  c.content AS first_child_content,
  c.created_at AS first_child_created_at,
  c.user_id AS first_child_user_id
FROM public.posts p
LEFT JOIN LATERAL (
  SELECT id, content, created_at, user_id
  FROM public.posts
  WHERE parent_post_id = p.id
    AND COALESCE(is_deleted, false) = false
  ORDER BY created_at ASC
  LIMIT 1
) c ON true;
```

* Use this view to drive timeline previews: you can show `first_child_content` as the snippet beneath the post card.
* The view includes the `direct_reply_count` for display.

### B. Optional materialized view (for high-scale, refresh policy)

If your feed requires heavy joins or complex ranking, create a materialized view and refresh periodically or on demand.

```sql
CREATE MATERIALIZED VIEW public.thread_preview_mat AS
SELECT * FROM public.thread_preview;

CREATE INDEX idx_thread_preview_mat_created_at ON public.thread_preview_mat (created_at DESC);
-- refresh strategy: schedule REFRESH MATERIALIZED VIEW CONCURRENTLY public.thread_preview_mat;
```

**Note**: `CONCURRENTLY` requires a unique index; adapt as needed.

---

## 5) Use-cases: queries you will run from the app

### Get top-level replies (cursor-based pagination)

```sql
SELECT * FROM public.posts
WHERE parent_post_id = '<ROOT_POST_UUID>'
  AND COALESCE(is_deleted, false) = false
ORDER BY created_at ASC
LIMIT 20;
```

### Get thread preview for a feed (join to profile on server)

```sql
SELECT tp.*, prof.display_name, prof.username, prof.profile_picture_url
FROM public.thread_preview tp
JOIN public.profiles prof ON prof.id = tp.user_id
ORDER BY tp.created_at DESC
LIMIT 20;
```

### Get a post + full immediate children (for detail page initial load)

```sql
SELECT p.*
FROM public.posts p
WHERE p.id = '<POST_ID>';

-- Afterwards fetch direct children (first page)
SELECT * FROM public.posts
WHERE parent_post_id = '<POST_ID>'
  AND COALESCE(is_deleted, false) = false
ORDER BY created_at ASC
LIMIT 20;
```

---

## 6) Notes about soft-delete policy

* The trigger above **assumes `reply_count` tracks active (non-deleted) replies**. When you set `is_deleted = true`, the trigger decrements the parent's `reply_count`.
* If you prefer `reply_count` to track *historical totals*, remove the parts in the trigger that handle `is_deleted` flips.

---

## 7) Security / RLS considerations

* Keep `SELECT` open for feeds (public).
* For `INSERT` / `UPDATE` / `DELETE`, restrict via RLS so only the record owner (or admin role) can modify rows.
* If you rely on RPC functions to insert replies (recommended), you can disable direct `INSERT` to `posts` for `authenticated` and let RPCs run `SECURITY DEFINER` logic. In that case the triggers still fire normally.

Example RLS snippet to allow owners to update:

```sql
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select_public" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_auth" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update_owner" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "posts_delete_owner" ON public.posts FOR DELETE USING (auth.uid() = user_id);
```

---

## 8) Testing checklist (run after applying SQL)

1. Insert a parent post `P`.
2. Insert a child reply `R1` with `parent_post_id = P.id` — check `P.reply_count` == 1.
3. Insert a second reply `R2` — check `P.reply_count` == 2.
4. Update `R1.parent_post_id` to `R2.id` (reparent) — check `P.reply_count` decremented and `R2.reply_count` incremented.
5. Soft-delete `R2` (set `is_deleted = true`) — check `R2`'s parent reply_count decremented accordingly.
6. Delete `R1` — check its parent's `reply_count` decremented.




