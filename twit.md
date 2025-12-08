

# postCard — pre-2023 Twitter look (with your twist)

Below is the final, unified design spec—100% aligned with the style and structure you want. This includes:

* how **repost**, **quote**, **like**, **dislike (broken heart)**, **edit**, and **delete** work
* how each one **displays in the UI**
* strict adherence to your earlier layout/UX principles

---

# 1 — Visual Layout (postCard)

```
┌─────────────────────────────────────────────────────────────┐
│ profile_picture  Display Name ▾   @handle · 2h · Edited?            │
│                                                             │
│ [post text — wraps to multiple lines]                      │
│ [Optional: image, GIF, video, poll]                         │
│                                                             │
│ ♡ 123   🔁 45   💬 10   🔗 2   💔 3   ✏️ (owner)   🗑️ (owner)  ⋯   │
└─────────────────────────────────────────────────────────────┘
```

**Notes:**

* profile_picture left-aligned (48px).
* Content block flush left beside profile_picture.
* Name bold → handle + timestamp muted.
* Action row uses **uniform spacing**, icons + counts.
* Owner-only actions (`✏️ Edit`, `🗑️ Delete`) appear **just before the more menu**.

---

# 2 — Full Reaction Set (with meanings)

### **1. Like — `♡` → `♥`**

* Outline → filled on activation.
* Count increments/decrements.
* Pop/scale animation when liking.
* Mutually exclusive with dislike (see Section 3).

### **2. Repost — `🔁`**

* Two states: inactive / highlighted (green).
* Long-press menu: `Repost` or `Quote post`.
* Count reflects *reposts* (not replies, not likes).
* If user reposted: icon shows active state.

### **3. Reply — `💬`**

* Opens reply composer.
* Count = number of direct replies.

### **4. Share / Link — `🔗`**

* Opens share sheet (copy link, share to apps, etc).
* Optional count (if you track outbound shares).

### **5. Dislike — `💔` (Your Twist)**

* Outline → filled broken heart.
* Includes crack animation + pulse feedback.
* Count increments/decrements.
* Must follow **mutual exclusion** with Like.

### **6. Edit — `✏️` (Owner Only)**

* Enables post text editing.
* After edit, postCard shows `· Edited` beside timestamp.
* No edit history visible publicly (Twitter-style).

### **7. Delete — `🗑️` (Owner Only)**

* Confirmation dialog required.
* Card disappears immediately after deletion.

### **8. More Menu — `⋯`**

* Secondary actions: Bookmark, Mute, Report, Copy link, Pin, Embed, etc.

---

# 3 — Broken Heart (Dislike) Behavior

### **Default State**

* Icon: outline broken heart (hollow 💔 depending on style).
* Count = current total.

### **Activated State**

* Icon: filled broken heart (`💔`).
* Crack shimmer or pulse animation (150–200ms).
* Tooltip or toast: `"You disliked this post"`.

### **Toggle Behavior**

* Tap → dislike applied
* Tap again → dislike removed

### **Mutual Exclusivity (required)**

When dislike is applied:

* If the post is currently **liked**, remove the like
* Decrease like count
* Increase dislike count

When like is applied:

* Remove dislike
* Decrease dislike count
* Increase like count

This ensures the user has **a single preference** (like *or* dislike) but can also return to neutral.

---

# 4 — Repost vs Quote post — UI & Logic

### **Repost (simple)**

* Shares the post to followers as is.
* Icon `🔁` turns green or active-colored.
* Count +1.
* Undo repost → count −1; icon returns to default.

**In a timeline:**

```
↺ Alice reposted
[Full postCard below]
```

### **Quote post**

* Opens composer with embedded preview of original post.
* User writes additional text above the embed.
* Posting a quote post increments:

  * **quote count** (for original post)
  * AND optionally **repost count** if you're grouping them (Twitter changed this over time)

**Quote display:**

```
[User’s added text]
┌──────────────────────────────┐
│ original author · timestamp  │
│ original post text          │
└──────────────────────────────┘
```

---

# 5 — How Each Reaction Displays in the UI

### **Like**

```
♡ 123      → tap →      ❤️ 124
```

### **Dislike (Broken Heart)**

```
💔 3       → tap →      💔 4
```

If user had liked:

```
❤️ 124    💔3
→ tap dislike
❤️ 123   💔4
```

### **Repost**

```
🔁 45      → tap →      🔁(highlighted) 46
```

### **Quote post**

```
🗨️ Opens quote composer
```

### **Reply**

```
💬 10 → opens thread
```

### **Edit (owner only)**

```
✏️ → opens edit modal → “Edited” tag appears next to timestamp
```

### **Delete (owner only)**

```
🗑️ → confirmation modal → card removed
```

### **More**

```
⋯ → menu with secondary actions
```

---

# 6 — Example Final UI (Markdown Mock)

```
┌─────────────────────────────────────────────────────────────┐
│ 🖼️  Jane Doe ▾   @jane · 2h · Edited                       │
│                                                             │
│ This is an example post with full reactions.               │
│                                                             │
│ ❤️ 123   🔁 12   💬 3   🔗 1   💔 2   ✏️ (owner)   🗑️ (owner)   ⋯   │
└─────────────────────────────────────────────────────────────┘
```

After user dislikes:

```
┌─────────────────────────────────────────────────────────────┐
│ 🖼️  Jane Doe ▾   @jane · 2h · Edited                       │
│                                                             │
│ This is an example post with full reactions.               │
│                                                             │
│ ❤️ 122   🔁 12   💬 3   🔗 1   💔 3   ✏️   🗑️   ⋯             │
└─────────────────────────────────────────────────────────────┘
```




#############################################################################

# **MASTER PROMPT — Build an MVP That Mimics Twitter Pre-2023 (with My Custom Twist)**

---

# 📌 **SYSTEM DIRECTIVE — REQUIRED BEHAVIOR**

You are an expert senior engineer.
Generate production-ready code that implements a fully functional **Twitter pre-2023 MVP**, including:

* A PostCard identical to the pre-2023 Twitter UI/UX
* All essential posting + reaction features
* My custom **broken-heart Dislike** reaction
* Owner-only **Edit** and **Delete** actions
* Repost and Quote Post that behave like classical Twitter
* Threading, timelines, reply composers, and basic navigation flow

Follow all details exactly as defined below.

---

# 1 — **Overall MVP Requirements**

Create a minimal but complete Twitter-style app with:

* Home timeline
* Writing / posting new poats
* Replying to posts
* Reposting
* Quote posts
* Like + Dislike (mutually exclusive)
* Edit post (owner only)
* Delete post (owner only)
* Embedded quoted posts
* Counts for likes, reposts, quotes, replies, dislikes
* Viewer’s own reaction states
* Basic navigation
* Thread view
* Share / copy link
* More menu (bookmark, report, etc. can be placeholders)

All layouts should reproduce **Twitter’s pre-2023** look and interactivity.

---

# 2 — **postCard Specification (Strict)**

Your component must follow this **exact** layout:

```
┌─────────────────────────────────────────────────────────────┐
│ profile_picture │ Display Name ▾ @handle · timestamp · Edited?       │
│        │ [post text — multi-line]                          │
│        │ [Optional image / media / poll / link preview]     │
│        │                                                    │
│        │ ♡ 0   🔁 0   💬 0   🔗 0   💔 0   ✏️ (owner)   🗑️ (owner)   ⋯ │
└─────────────────────────────────────────────────────────────┘
```

### Layout requirements:

* profile_picture: 48px circle, left aligned
* Content block: to the right of profile_picture
* Display Name bold
* Handle + timestamp muted gray
* Rounded card, subtle shadow, padding 12–16px
* Action row icons evenly spaced, small hover/press animations
* Owner-only buttons (`✏️`, `🗑️`) appear **right before** the “More” menu (`⋯`)

---

# 3 — **Reaction Behaviors (Exactly As Defined)**

## 3.1 — **Like**

* Icon: `♡` (outline) → `♥` (filled)
* Count increments/decrements
* Animated pop on like
* Must obey mutual exclusivity with Dislike

## 3.2 — **Dislike (Broken Heart)**

**This is my custom twist and must be implemented exactly.**

* Outline state: `💘` or hollow broken heart
* Active state: `💔`
* Activation animation:

  * Crack shimmer or pulse
  * 150–200ms
* Count increments/decrements
* Must follow **mutual exclusivity logic**:

  * If disliked → remove like
  * If liked → remove dislike
  * User can have only one preference at a time

## 3.3 — **Repost**

* Icon: `🔁`
* Two states: default / highlighted (green)
* Long-press menu with **Repost** and **Quote post**
* Simple repost increments repost count
* Undo repost decrements count

## 3.4 — **Quote post**

* Opens composer with embedded preview
* Count increments on the original post
* In UI, quote posts display as:

```
[User’s added text]
┌──────────────────────────────┐
│ original post card          │
└──────────────────────────────┘
```

## 3.5 — **Reply**

* Icon: `💬`
* Opens reply composer
* Count = number of replies

## 3.6 — **Share / Link**

* Icon: `🔗`
* Opens system share dialog

## 3.7 — **More Menu**

* Icon: `⋯`
* Must include:

  * Bookmark
  * Copy link
  * Report
  * Embed
  * Mute
    (These can be stubbed with no backend)

## 3.8 — **Edit (Owner Only)**

* Icon: `✏️`
* Opens modal for editing
* After saving:

  * Update text
  * Add `· Edited` beside timestamp

## 3.9 — **Delete (Owner Only)**

* Icon: `🗑️`
* Shows confirmation modal
* Deletes post from feed

---

# 4 — **Data Model Requirements**

Use a model with at least this structure:

```ts
post {
  id: string
  author: {
    id: string
    name: string
    handle: string
    profile_pictureUrl: string
  }
  text: string
  media?: string[]

  created_at: ISODateString
  updated_at?: ISODateString

  counts: {
    likes: number
    dislikes: number
    reposts: number
    quotes: number
    replies: number
  }

  viewer_state: {
    liked: boolean
    disliked: boolean
    reposted: boolean
  }

  is_quote: boolean
  parent_post_id?: string
  quoted_post_id?: string
}
```

---

# 5 — **UI/UX Interaction Requirements**

* Icons use small hover highlight (circle behind icon)
* Press animation: scale to 0.95 then bounce back
* Counts animate when incrementing
* Optimistic UI updates
* Undo repost via inline snackbar
* Reply flow stacks into a thread view
* Quote post composer shows preview

---

# 6 — **Accessibility Requirements**

* All interactive elements must have:

  * `aria-label`
  * `aria-pressed` when applicable
  * Keyboard focus ring
* Do not rely on color alone:

  * Use icon fill to indicate active states

---

# 7 — **Example States**

### Liked:

```
♥ 124
```

### Disliked:

```
💔 4
```

### Switching from Like → Dislike:

```
♥ 124   → tap dislike →
🤍 123   💔 4
```

### Simple Repost (active):

```
🔁(green) 46
```

---

# 8 — **Required Deliverables From the AI Code Generator**

Generate:

✔ Full component code (React / React Native / Flutter — match my chosen stack)
✔ postCard component
✔ Repost + Quote modal
✔ Edit modal
✔ Delete confirmation
✔ post composer
✔ Timeline view
✔ Thread view
✔ Sample mock data
✔ All reactions with full logic
✔ UI strictly following Twitter pre-2023
✔ Broken-heart dislike logic implemented exactly as described

You may scaffold the project with any opinionated structure (e.g., Next.js + Tailwind, React Native + Expo, etc.) depending on my selected stack.

---

# 9 — **Style & Precision Requirements**

* All code must be clean, modular, documented
* Reusable icon button components
* Consistent spacing, fonts, shadows
* Never invent unrequested features
* Always follow the exact spec above with zero deviation

############################################################################################
Implemet the following update:

1. USER PROFILE NAVIGATION
Behavior

Whenever a username, a user’s @handle, or a user’s profile picture/profile_picture is pressed/tapped:

Navigate to that user's Profile screen.

The Profile screen must receive:

user_id

username

profile_picture_url

This should work consistently across:

Home feed

Post detail

Replies

Quotes

Reposts

Notifications

Search results

Any component that displays user identity

Implementation Requirements

Make touch areas separate for username, @handle, and profile_picture.

They must not trigger opening a post.

Use proper React Navigation (or equivalent) navigate("Profile", { userId }).

2. OPENING A POST (POST DETAILS)
Behavior

When the post card itself (NOT the profile_picture, NOT the username) is pressed:

Open the Post Details screen for that specific post.

Pass:

post_id

all necessary metadata

Card Press Areas

The whole post is pressable except:

profile_picture → goes to profile

username → goes to profile

@handle → goes to profile


quoted/reposted post card → takes you only to that quoted post

This ensures Twitter-accurate behavior.

3. IMAGE VIEWER (MEDIA LIGHTBOX)
Behavior

When an image inside a post is pressed:

Open a full-screen media viewer.

Dark overlay background.

Image centered, zoomable, swipe-to-dismiss if possible.

Should mimic Twitter’s native media viewer.

Viewer Requirements

Pass the full array of post images (if multiple).

User can swipe left/right to view other images.

Include pinch-to-zoom or double-tap zoom if supported.

Back navigation dismisses the viewer.

4. POST TIMESTAMPS
Requirements

Every post object must contain:

created_at (ISO timestamp)

In feed:

Show relative time (e.g., “2h”, “5m”, “1d”).

In post details:

Show full date + time exactly like Twitter:

"3:45 PM · Jan 18, 2025"

Implement a utility for:

relative time (seconds → minutes → hours → days → weeks)

absolute time display on Post Details

5. QUOTED REpostS & REpostED POSTS

This is the most critical logic. Follow exactly:

Behavior Rules

A quoted post consists of two cards:

A. Outer Quote Card

Shows the text/opinion of the user who is quoting.

Pressing the outer quote card:

Open that quote-post’s Post Details.

B. Inner Quoted Post Card

This is a smaller embedded post inside the quote.

Pressing the inner quoted post card:

Open the original post being quoted.

VERY IMPORTANT

The navigation must be context-aware:

User pressed	Navigate to
Quote text (outer card)	The quote-post post details
The embedded quoted post	The original post being quoted
profile_picture/name in outer card	Quoter’s profile
profile_picture/name in embedded card	Original author’s profile
Reposts (non-quote RT)

Pressing the repost text (“X reposted”) does nothing.

Pressing the main post → open that original post.

6. CONSISTENCY

All rules must apply identically in:

Feed

Profile timeline

Post Details (for nested quotes)

Replies

Search

Hashtag timelines

Lists

Bookmarks

Navigation behavior must always match the pre-2023 Twitter UX.

7. General Implementation Notes

Keep pressable hitboxes accurate and not overlapping.

Do NOT let the entire post card swallow touches for username/profile_picture.

Maintain clean separation between:

Profile navigation

Post navigation

Media viewer navigation

Quoted post navigation

✔️ You should now produce:

Properly structured components

Correct Pressable wrappers

Navigation logic for each touch area

Time/date formatting utilities

A lightbox-style image viewer

Quote/repost card nesting with differentiated navigation



Quoting and Reposting Posts With Media

Quoted Posts Must Display the Entire Original Post (Not Just Text)

When a user quotes another post, the quoted post must include all original content, not only the text. This means:

The quoted post should embed a complete miniature postCard of the original post.
This embedded card must show:

Original poster’s username + profile_picture

Original text content

Original media (images, videos, GIFs)

Original reactions count (like, dislike, repost, quote) — counts only, not interactive from inside the quoted card

Timestamp of the original post

All media from the original post must be included.
If the original post contains:

1 or multiple images → show them

A video → show the preview

A GIF → show the animation or preview

No media → show nothing

The quoted post is rendered as TWO separate cards stacked vertically:

Top card: The user’s new post (the quote text)

Bottom card: A non-interactive preview of the original post (full miniature postCard)

Media rules

The quoting user cannot remove or modify the original media

If the quoting user attaches their own media, it should appear in THEIR quote card above (just like Twitter)

Interaction logic

Pressing the top quote card → opens the quote post details page

Pressing inside the embedded quoted card → opens the original post's detail page

Pressing an image inside the quoted original card → open the original media viewer, not the quoting post viewer

Design expectations

The quoted card should have a faint border or background separation

The quote (top card) must visually appear as the parent of the quoted content

Avoid nested infinite quoting; only show one level deep (like Twitter)



#############################################################################################


# **Bottom Navigation (BottomNav) **

The BottomNav is a persistent navigation bar fixed at the **bottom of the screen** throughout the app (except on full-screen media viewer or auth screens). It should mimic Twitter’s pre-2023 style with slight modern cleanup.

---

# ✅ **BottomNav Structure**

The BottomNav consists of **4 main tabs**:

1. **Home Feed**
2. **Search / Explore**
3. **Notifications**
4. **Messages**
5. **Profile**

**central Floating Action Button (FAB)** used for creating a new post/post. (Partially Already implemented)

---

# 🧩 **1. Home Tab**

* Icon: Home (filled when active, outline when inactive)
* When pressed:

  * Navigate to the Home Timeline screen.
  * Home screen loads the feed with posts from users the viewer follows.
* Behavior:

  * Pressing the tab again (when already on Home) scrolls the feed back to the top and refreshes content.

---

# 🔍 **2. Search / Explore Tab**

* Icon: Magnifying Glass
* When pressed:

  * Navigate to the Search/Explore screen.
* UI:

  * Search bar at the top.
  * Trending posts, trending topics, accounts, hashtags.
* Behavior:

  * Re-tapping the tab brings the search screen back to the top.

---

# 🔔 **3. Notifications Tab**

* Icon: Bell (outline when inactive, filled when active)
* When pressed:

  * Navigate to Notifications screen.
* Types of notifications:

  * Likes on your post
  * Quotes or reposts of your post
  * Mentions (@username)
  * New followers
* Behavior:

  * Unread notifications display a badge (●) on the bell icon.
  * Re-pressing the active tab scrolls to top.

---

# ✉️ **4. Messages Tab**

* Icon: Envelope
* When pressed:

  * Navigate to Messages/Inbox screen.
* Features:

  * List of message threads
  * Ability to open a specific chat
* Behavior:

  * If unread messages exist, show a small badge (●) on the envelope icon.

---

# ✏️ **Floating Action Button (FAB)** — Optional but Twitter-like

Even with a BottomNav, Twitter keeps a central floating compose button:

* Position: bottom right, floating above the nav bar
* Icon: Feather pen or “+”
* Action:

  * Opens the New Post/post Composer
* Used for:

  * Text posts
  * Create polls

The FAB must show on **every screen except**:

* Post detail full-screen media viewer
* Settings page
* Camera screen (if implemented)
* Authentication screens

---

# 🧱 **General Behavior Requirements**

### **1. Persistent Across Screens**

BottomNav stays visible on:

* Home
* Search
* Notifications
* Messages
* User profiles
* Post detail pages

Exception: Full-screen media viewer hides the nav.

---

### **2. Visual Behavior**

* Active tab has a filled icon.
* Inactive tabs have outline icons.
* All icons centered and evenly spaced.
* Slight top shadow (elevation 2) for visual separation.

---

### **3. Navigation Behavior**

* Navigation must use a **stack navigator** above a **bottom tab navigator**.
* BottomNav is the base/root navigation layer.
* Each tab opens independent navigation stacks.

Meaning:

* Tapping Home navigates to Home Stack.
* Opening a post pushes a PostDetailScreen on Home Stack.
* BottomNav remains visible because only the content area is replaced.

---

### **4. Performance Notes**

* BottomNav should NOT re-render full screens unnecessarily.
* Use memoization where needed.
* Ensure state persists when switching tabs (don’t lose scroll position).

---

# 🎨 **BottomNav Icons (Twitter-Style)**

Use standard icon patterns:

| Tab           | Active Icon     | Inactive Icon    |
| ------------- | --------------- | ---------------- |
| Home          | Home Filled     | Home Outline     |
| Search        | Magnifier Bold  | Magnifier Thin   |
| Notifications | Bell Filled     | Bell Outline     |
| Messages      | Envelope Filled | Envelope Outline |

---

# 📱 **Interaction Rules**

1. **Pressing a tab navigates to its root screen.**
2. **Pressing the same tab again resets the stack and scrolls to top.**
3. **FAB always opens the new post composer.**
4. **Badge indicators must work on Notifications and Messages.**



###############################################################################################


# 👤 **PROFILE SCREEN — Full Explanation for Code Generator**

The **Profile Screen** is where users see information about themselves or other users. It must mimic Twitter's pre-2023 layout and behavior with slightly modernized UI spacing.

Everything about this screen must work whether it's:

* **Your own profile**, or
* **Another user’s profile**

---

# 🧱 **PROFILE STRUCTURE (Top to Bottom)**

---

## **1. Header Section**

* Contains:

  * A **cover photo** (optional; if none, show a grey placeholder background)
  * The **profile picture**, overlapping the cover photo
  * A **back button** (top-left)
  * A **settings icon** (only for own profile)
  * A **follow/following button** (only when viewing another user’s profile)

---

## **2. Profile Picture**

* Circular profile_picture
* Tapping the profile picture:

  * If it’s your own → open "Edit profile photo" options
  * If it’s another user → open full-screen profile photo viewer

---

## **3. Profile Actions**

### **For Own Profile**

* Button: **Edit Profile**

  * Opens screen to edit:

    * Display name
    * Bio
    * Profile photo
    * Cover photo
    * Location
    * Website
    * Date of birth (optional)

### **For Other Users**

* Buttons:

  * **Follow / Following**
  * **Message** (only if messaging is implemented)

---

## **4. Name + Username**

* Display Name (big text)
* Username (@handle) in grey
* Verified badge (if any)

---

## **5. Bio Section**

* Short text
* Automatically detects:

  * links
  * @mentions
  * #hashtags

These become tappable links:

* @username → opens that user’s profile
* #hashtag → opens Explore with hashtag results
* link → open external browser

---

## **6. Additional Profile Info**

Fields include:

* Location (icon + text)
* Website (tappable hyperlink)
* Join date (“Joined May 2020”)

---

## **7. Following / Followers Count**

* Shows:

  * “123 Following”
  * “456 Followers”
* Tapping each opens a list screen:

  * Following list
  * Followers list

---

# 🚦 **TABS (Under Profile)**

Like Twitter, show 2–4 tabs:

1. **posts**
2. **posts & replies**
3. **Media** (only posts with images/videos)
4. **Likes** (optional for MVP — can hide)

The default tab is **posts**.

---

# 🧵 **PROFILE TIMELINE (Posts Feed)**

This is where all posts by the user appear.

Each post must use the exact same **postCard** as the main feed, with these interaction rules:

### **1. Pressing the entire post**

→ Opens the Post Detail Screen.

### **2. Pressing the user’s profile picture or username**

→ Stays on profile (since you're already here).
→ If it's another user's profile, navigate to that user's profile.

### **3. Pressing images inside the post**

→ Opens full-screen media viewer.

### **4. For reposts and quotes**

* Repost:

  * Shows repost label: “User reposted”
  * Opens the original post if pressed.

* Quote post:

  * Shows the quoting post + embedded miniature original post.
  * Pressing the quoted card opens the original post detail.

### **5. Interaction Buttons**

* Like
* Dislike
* Repost
* Quote
* Comment
* Share (optional)

**Single preference rule:**

* Liking removes dislike.
* Disliking removes like.

---

# 🔐 **OWN PROFILE vs OTHER PERSON'S PROFILE**

---

## **Own Profile**

* Tabs: posts, posts & Replies, Media
* Edit Profile button
* Can delete own posts
* Can edit own posts
* No Follow button (replace with Settings)

---

## **Another User’s Profile**

* Tabs: posts, Media
* Follow / Following button
* Message button (optional)
* Can view their posts but cannot edit/delete
* Can like/dislike/repost/quote their posts

---

# 🧭 **NAVIGATION BEHAVIOR**

### **1. From anywhere in the app:**

* Tapping profile picture in postCard → open that user’s profile
* Tapping username (@handle) → same behavior
* Tapping quoted card username → open the original author's profile

### **2. BottomNav stays visible**

Profile is at the top of the Home Stack (not replacing the root).

### **3. Back button**

Return to the previous screen without resetting the feed.

---

# 📸 **MEDIA HANDLING ON PROFILE**

* In the **Media** tab: show all posts by this user that contain images, videos, or GIFs.
* Each media item when pressed → opens full-screen viewer (like Twitter).

---

# 🕒 **TIMESTAMPS**

Every post on the profile must show:

* **Relative time** on the timeline (e.g., "5m", "3h", "2d")
* **Full timestamp** inside the post detail screen (e.g., “10:45 AM · Oct 5, 2025”)

---

# 🧩 **PERMISSIONS & CAPABILITIES**

### When viewing your own profile:

* You can:

  * Edit profile
  * Edit your posts
  * Delete your posts
  * Change profile/cover photo

### When viewing someone else’s profile:

* You can:

  * Like, dislike, repost, quote their posts
  * Follow/unfollow
  * Message (if messaging exists)





##################################################################################################


# ✅ **POLL SYSTEM — FULL SPEC (Twitter pre-2023 + Custom Additions, Corrected Media Handling)**

The poll system must replicate **original Twitter polls (pre-2023)** with the following extended capabilities.
Everything here is **mandatory logic** for rendering, voting, displaying results, quoting, reposting, and countdown animation.

---

# 1. **Poll Options (Basic Rules)**

* Poll must support **2 to 6 options**.
* Each option contains **text only**:

```ts
option: {
  id: string,
  text: string
}
```

* Poll can optionally include **one media item (image or link)** associated with the poll as a whole, **not per option**.

---

# 2. **Poll Media (Corrected)**

* Media is displayed **under the poll question** and **above the poll options**.
* Only **one media item per poll**:

  * Image → opens full-screen viewer when tapped.
  * Link → navigates to the URL when tapped.
  * Deactive Link inclusion on poll if image has been add and vice versa
* Poll options remain text-only (no images or links attached to individual options).

```ts
poll: {
  id: string,
  question: string,
  options: [
    { id: string, text: string }
  ],
  media?: {
    type: 'image' | 'link',
    url: string
  }
}
```

---

# 3. **Voting Behavior (Pre-2023 Twitter Rules)**

### **Single-Choice Mode (DEFAULT)**

* User can select **only one option**.
* Once submitted:

  * Cannot change vote.
  * All percentages become visible immediately.

### **Multiple-Choice Mode (TWIST)**

* Poll creator can enable **multiple_choice = true**.
* User can select **one or more options**.
* A **Submit Vote** button appears.
* After submitting:

  * Vote cannot be changed.
  * Reveal percentages.

---

# 4. **Visibility Rules**

### BEFORE user votes:

* Show only:

  * Poll options
  * Media (if present)
  * Poll time remaining
* DO NOT show:

  * Percentages
  * Results bars
  * Total votes

### AFTER user votes:

* Show:

  * Percentages for each option
  * Highlight the chosen option(s)
  * Total votes

### AFTER poll ends:

* Everyone sees:

  * Final percentages
  * "Final results"
  * Total votes

---

# 5. **Results Display (UI Rules)**

Each option shows:

* Progress bar representing percentage
* Percentage number (e.g., “34%”)
* A filled circle/checkbox for user’s chosen option(s)

**If multiple-choice mode:**
Use checkbox indicators rather than radio buttons.

---

# 6. **Poll Duration**

* Poll creator selects duration between:

  * **5 minutes minimum**
  * **7 days maximum**
* Poll tracks:

  * `start_time`
  * `end_time`

### Countdown Display:

* Ongoing: `"3 hours left"`, `"40 minutes left"`, `"5 minutes left"`
* Ended: `"Final results"`

---

# 7. **Expiration Progress Bar (Custom Twist)**

* Horizontal bar at top of poll card
* Shrinks linearly over time
* Colors:

  * Normal: blue
  * < 5 minutes: yellow
  * < 60 seconds: red with pulsing animation

---

# 8. **Interaction Rules**

### **8.1 — Selecting Option (Single-Choice)**

* Tapping an option instantly submits your vote
* Results reveal immediately

### **8.2 — Selecting Options (Multiple-Choice)**

* Tap each option to toggle selection
* Use **Submit Vote** button
* After submission:

  * Cannot edit vote
  * Percentages appear

### **8.3 — After Poll End**

* Voting disabled
* Results permanently visible

---

# 9. **Quoted & Reposted Poll Behavior**

* Reposts increment count and highlight repost icon
* Quotes display:

  * Entire poll card, including poll media
  * Current results (percentages) only if allowed
* Voting inside a quoted poll **not allowed**
* Tapping quoted poll → navigate to original poll detail to vote or view results

---

# 10. **Post Detail Screen Behavior**

* Shows full poll, media, and options
* Voting allowed only if:

  * Poll is active
  * User hasn’t voted yet
* Percentages shown depending on `viewer_vote_state`

---

# 11. **Poll Object for Rendering**

```ts
poll: {
  id: string,
  question: string,
  options: [
    { id: string, text: string }
  ],
  media?: {
    type: 'image' | 'link',
    url: string
  },
  allows_multiple: boolean,
  viewer_selected_options: [option_ids],
  total_votes: number,
  options_percentages: [percentages],
  start_time: timestamp,
  end_time: timestamp,
  has_ended: boolean
}
```

* Renderer computes:

  * Remaining time
  * Countdown bar width
  * Whether percentages are shown
  * Whether the user can vote

---

# 12. **Accessibility Rules**

* Option buttons:

  * Before voting → `"Vote for Option A"`
  * After voting → `"Option A — 34%"`
* Progress bar has textual alternative

---

# 13. **Edge Cases**

* < 2 options → do not render
* Offline vote → optimistic UI + sync later
* Votes on other devices → refresh viewer state

---

# ✔ FINAL COMBINED MEDIA RULE

* **Only one media item per poll**, shared above the options, not per option.
* Media can be image or link.
* Poll options remain **text-only**, consistent with original Twitter behavior.



#########################################################################################################



# ✏️ **POST TEXT INPUT AREA — DESIGN SPEC**

The Post Text Input Area is the **main composer** where users write posts/posts. It includes the text box, optional media attachments, emojis, GIFs, and action buttons.

---

## **1. Layout Overview**

```
┌─────────────────────────────────────────────┐
│ profile_picture │ Text Input Area                     │
│        │ "What's happening?" placeholder    │
│        │ (expands as user types)            │
│        │                                     │
│        │ [Media Icon] [GIF Icon] [Emoji]    │
│        │ [Poll Icon] [Schedule Icon]        │
│        │ [Character Count] [Post Button]    │
└─────────────────────────────────────────────┘
```

* **profile_picture:** 48px circle on the left, aligns with the first line of text.
* **Text Input Area:** Expands vertically as user types (auto-growing), up to a max height (e.g., 200–220px). Scrolls internally after reaching max height.
* **Action row:** Horizontal row under text input with icons and Post button aligned right.

---

## **2. Text Input Behavior**

* **Placeholder:** `"What's happening?"`
* **Auto-expanding:**

  * Increases height line by line up to a max height.
  * After max height, inner scrolling activates.
* **Keyboard awareness:**

  * On mobile, when the keyboard opens:

    * Composer moves above keyboard.
    * Optional: Scroll the timeline/content so the input is visible.
  * Smooth animation for resizing and repositioning.
* **Character count:**

  * Shows remaining characters (e.g., 280 max).
  * Turns red if user exceeds limit.
  * Live-updates as user types.
* **Focus / Blur:**

  * Placeholder disappears on focus.
  * Shows cursor and typing state.

---

## **3. Action Icons & Placement**

| Icon / Action       | Placement                     | Behavior                                                                         |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| **Media / Image**   | Leftmost in action row        | Opens device gallery/camera. Preview of selected media appears above action row. |
| **GIF**             | Right of Media icon           | Opens GIF picker. Inserts GIF into post (shown as media preview).                |
| **Emoji**           | Right of GIF                  | Opens emoji picker. Inserts emoji at cursor position.                            |
| **Poll**            | Optional, right of Emoji      | Opens poll creation modal. Updates composer with poll card.                      |
| **Schedule**        | Optional, right of Poll       | Opens scheduling modal to schedule post.                                         |
| **Character Count** | Far right, before Post button | Shows remaining characters. Turns red when limit exceeded.                       |
| **Post / post**    | Rightmost, primary CTA        | Disabled until post has text or media/poll. Submits post.                        |

---

## **4. Media / Emoji / GIF Handling**

* **Image:** Preview thumbnails appear **above text input** or **above action row**, with a small **remove button** on each. Multiple images allowed (up to platform limit, e.g., 4).
* **GIF:** Single GIF allowed; displayed in preview area similar to images.
* **Emoji:** Inserts inline at cursor position in text. Supports unicode emojis.

---

## **5. Keyboard-Aware Behavior**

* Composer must **remain visible** when keyboard opens:

  * Moves up smoothly with keyboard.
  * Scrolls timeline if needed.
* If media preview is visible:

  * Adjusts its position above keyboard.
* Pressing outside composer (background/timeline):

  * Keyboard closes
  * Composer retains typed text
* On landscape mode:

  * Composer and action row remain fully visible
  * Media previews adjust layout horizontally if needed

---

## **6. Accessibility & Interaction**

* **Text input:** aria-label: `"Compose new post"`
* **Icons:** aria-labels for screen readers:

  * `"Add image"`
  * `"Add GIF"`
  * `"Add emoji"`
  * `"Add poll"`
  * `"Schedule post"`
* **Keyboard navigation:** Users can tab between icons and the post button
* **Focus states:** Visible outline for icons and text area
* **Touch feedback:** Press animation for buttons (scale 0.96, subtle shadow)

---

## **7. Edge Cases**

* If max media limit reached → disable media icon
* Emoji / GIF / Poll icons always accessible
* Post button disabled until at least:

  * Text input not empty, **or**
  * Media attached, **or**
  * Poll created


  #################################################################################################



# 🔐 **AUTHENTICATION SYSTEM **

Below is a complete, final behavior for MVP.

---

# 1. **SPLASH + AUTH CHECK**

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

* Email Input
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

# 3. **REGISTRATION FLOW (NOW ALWAYS OPEN)**

There is **no invite code**, no verification step before registration.

### The Registration Flow:

```
Registration Screen →
  Email + Password + Name →
    Create Account →
      Optional Profile Setup →
         HomeFeed
```

---

## 3.1 **Registration Screen UI**

```
Full Name Input*
usernaname Input*
Email Input*
Password Input*
Confirm Password*
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
      "username": auto-generated, (user can edit later)
      "profile_picture_url": default,
      "created_at": timestamp
    }
    ```
* After that:

  * Navigate to **Optional Profile Setup** screen.

---

## 3.2 **Optional Profile Setup**

Allows user to personalize their account:

* Upload profile_picture
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

### `posts`

* Insert: authenticated user.
* Select: public.
* Update: only owner.
* Delete: only owner (and admin if later).

### `sessions`

* Handled by Supabase internally.

No invites table needed anymore.

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
  "profile_picture_url": "default_profile_picture.png",
  "bio": "",
  "location": "",
  "created_at": "timestamp"
}
```

### `posts` table

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

# ✔ Your Authentication System Is Now:

* Simple + Twitter-like
* Secure
* Fast
* Fully compatible with Expo & Supabase
* Fits perfectly into the existing architecture




######################################################################################################

You are tasked with generating the *official backend naming registry* for my app.
You must gather **all API endpoints, database table names, column names, enums, storage bucket names, and event channels** used across the entire system.

Your goal is to produce a **single authoritative naming document** that will be used to create the Supabase schema and backend routes.
There must be **zero naming mismatch** anywhere in the system.

### **You must extract, standardize, and list names for the following modules:**

---

### **1. AUTHENTICATION SYSTEM**

* Users table
* Profiles table
* Auth endpoints
* Password reset endpoints
* Session, login, logout endpoints

---

### **2. USER PROFILES**

* Profile fields
* profile_picture storage bucket
* Username rules
* Name

---

### **3. POSTS / FEED SYSTEM**

* Posts table
* Post media table
* Post reactions
* Post bookmarks
* Post reports
* Repost + Quote Post relations
* Post detail endpoints
* Feed endpoints

---

### **4. THREADS / COMMENTS**

* Comments table
* Comment reactions
* Nested thread support
* Comment endpoints

---

### **5. DIRECT MESSAGING**

* Conversations table
* Members table
* Messages table
* Real-time channel names
* DM endpoints

---

### **8. POLLS MODULE**

* Polls table
* Poll options
* Poll votes
* Poll endpoints
* Poll rules:

  * Twitter pre-2023 behavior
  * One optional header image for entire poll
  * Results hidden until voting

---

### **9. SEARCH / EXPLORE**

* Endpoints
* Entities included in search

---

### **10. NOTIFICATIONS**

* Notification table
* Event enums
* Notification endpoints
* Realtime channels

---

### **11. MODERATION**

* Content flag/report table
* Moderation endpoints

---

### **13. SYSTEM SUPPORT**

* Storage bucket names
* Realtime event channel names
* Shared enums
* Timestamp fields

---

## **📌 Output Format (REQUIRED)**

You must output the final results in the following structure:

```
# UNIFIED BACKEND NAMING REGISTRY (v1)

## 1. Tables
### users
- id
- email
- hashed_password
- ...

### user_profiles
- user_id
- username
- name
- ...

### posts
- id
- content
- ...
```

```
## 2. API Endpoints
- POST /api/v1/auth/register
- GET /api/v1/posts/feed
- ...
```

```
## 3. Storage Buckets
- profile_pictures
- post_media
- item_media
- ...
```

```
## 4. Realtime Channels
- realtime:posts
- realtime:messages
- ...
```

```
## 5. Enums
- reaction_type: like | dislike | love | haha | angry
- post_type: original | repost | quote
- ...
```

---

## **📌 Requirements for the generator**

* Use **snake_case** for all tables and columns
* Use **/api/v1/...** for all endpoints
* Ensure all names are consistent across the system
* Do NOT invent new features
* Only extract and standardize the modules defined above and they must be present in the codebase
* Output must be exhaustive and authoritative

---

## **📌 Final Task**

Generate the **complete naming registry document** that I can use to create:

1. The complete Supabase SQL schema
2. The backend directory structure
3. The frontend TypeScript interfaces



##################################################################################################


# 🧵 **POST THREADING — FULL SPEC (Pre-2023 Twitter Behavior + Modern Enhancements)**

Threading allows users to create **multiple connected posts** forming a continuous chain (“thread”). Each post in the thread behaves like a normal post but is also **linked** to the previous and next posts by the same author.

---

# **1. What is a Thread?**

A thread is a sequence of posts:

* Written by the **same user**
* Connected via a **reply relationship** (each post is a reply to the previous post by the same user)
* Displayed together in chronological order
* Treated as a single grouped content unit

### Example structure:

```
Post A  →  Post B  →  Post C
(root)      (reply)      (reply)
```

This is **not** like comments; it is still part of the **main timeline**, but visually grouped.

---

# **2. How Threads Are Created**

## **A. In the Composer**

Twitter uses this UI pattern:

* User composes a post
* They tap the **"+" icon** to add another post beneath
* Each added box is a separate post that will become part of the thread

### Composer layout:

```
[Post Input Box 1]
   ↓
[Post Input Box 2]
   ↓
[Post Input Box 3]
   [+ Add another]
```

Each box supports:

* text
* images
* GIFs
* polls (Twitter allowed one poll per entire thread, not per post)
* emojis

When user taps **Post All**, all posts are published in order, each replying to the previous one.

---

# **3. Database / Backend Model**

Threading depends on the `parent_post_id` relationship.

```
posts table:
- id
- user_id
- content
- media
- parent_post_id  ← (if this post is part of a thread)
- created_at
```

### Rules:

1. The first post of a thread has:

   ```
   parent_post_id = null
   ```

2. Every subsequent post in the thread has:

   ```
   parent_post_id = id of previous post in the thread
   ```

3. A thread is always **one-directional**:

   * Child → parent
   * Never backwards
   * No branching

4. A user can only create a thread with **their own posts**.

---

# **4. How the UI Displays a Thread**

## **A. In the Timeline (Scrolling Feed)**

Twitter shows threads like this:

* The first post (root) appears
* Directly below it, the next post by the same author appears with a vertical connector line
* The UI only shows the **first 2–3 posts** in long threads
* A “Show this thread” button appears if more exist

### Example layout:

```
[ Post 1 ]
     │
[ Post 2 ]
     │
[ Show this thread ]
```

Pressing **Show this thread** loads the full continuation.

---

## **B. In Post Detail View**

When user taps a post from a thread:

* They see the post they tapped
* Above it, earlier posts in the thread by the same user
* Below it, later posts in the thread by the same user

Exactly like Twitter:

```
--- Earlier Post (root)
------- Earlier Post
========== Current Post
------- Next Post
--- Next Post
```

This creates a **bi-directional context**, showing the entire chain.

---

# **5. Replying to a Thread**

There are 3 reply types:

### **A. Reply to the Thread Root**

* Treated like replying to the first post
* Appears in the root’s reply count

### **B. Reply to the Middle Post**

* Appears only under that specific post

### **C. Continue the Thread (by the same user)**

* If the user replies to their own thread post, Twitter shows:

  * "Add another Tweet"
  * This continues the thread

---

# **6. Thread Navigation Rules**

### **When user taps any post in a thread:**

* Open **Post Details**
* Always load:

  * thread ancestors (parent → grandparent → ...)
  * thread descendants (children → grandchildren → ...)

### **When user taps “Show this thread”:**

* Load the full thread
* Scroll to the position of the tapped post

### **When user taps anywhere inside a quoted thread:**

* Behavior depends on where they tapped:

  * If on the quote wrapper → Open the original root post
  * If on the quoted post inside the wrapper → Open that specific quoted post
  * This matches your rule:
    **"Only open the quoted/retweeted post if the user presses the quoted section itself."**

---

# **7. How Thread Media Works**

Each post carries its own:

* images
* GIFs
* videos


If a post has an image:

* Tapping the image opens full-screen viewer
* In thread mode, user can swipe between images from all posts in the thread

---

# **8. Thread Deletion Rules**

Like Twitter:

* A user can delete **any post they own** in a thread
* Deleting a post **does not delete the entire thread**
* Thread shifts like:

```
Here’s the **redesigned hybrid thread deletion section** reflecting the **“Deleted Placeholder Node”** approach. This version replaces your old Option 1 / Option 2 explanation and is ready for documentation, prompts, or developer specs.

---

# 🧹 **Thread Deletion Behavior — Hybrid Placeholder Approach**

When a user deletes a post in a thread, the system inserts a **deleted placeholder node** in its position. The thread remains **structurally intact**, and descendants continue to reference the deleted post as their parent. This ensures the thread is visually continuous and readable, while clearly showing that a post was removed.

---

### **Example Thread**

Before deletion:

```
A → B → C → D
```

After deleting B:

```
A → [ This post was deleted ] → C → D
```

---

1. **Deleted Placeholder Node**

   * The deleted post itself remains in the database as a “soft-deleted” entry.
   * `content = null`, `media = []`, `is_deleted = true`
   * Optionally, `post_type = "deleted_placeholder"` to distinguish in the UI.
   * Appears exactly where the deleted post was in the thread.

2. **Descendants Maintain Parent Reference**

   * Posts that were replying to the deleted post (e.g., C) **keep their `parent_post_id` pointing to B**.
   * This preserves logical relationships and threading depth.

3. **UI Rendering**

   * Placeholder visually indicates a deleted post:

     * Muted text: “This post was deleted”
     * No username, no media, no interactive content
     * Thread connectors remain continuous
   * Replies below continue normally

---

### **Benefits**

| Feature              | Placeholder Approach            |
| -------------------- | ------------------------------- |
| Thread continuity    | ✅ Fully intact                  |
| Visual clarity       | ✅ Shows where deletion occurred |
| UX for replies       | ✅ Replies still make sense      |
| Backend complexity   | ✅ Minimal (soft-delete only)    |
| Thread navigation    | ✅ Works without reparenting     |
| Historical integrity | ✅ Preserved                     |


# **9. Thread Indicators / Visual Elements**

* Left-side vertical line between posts
* Posts slightly closer together than normal posts
* “Thread start/end” padding
* Seamless scrolling, with no card gaps

---

# **10. Performance Strategy**

To avoid multiple queries:

### When loading a thread:

* Fetch ancestors in a single recursive query
* Fetch descendants in a single recursive query
* Combine results into final ordered array

Supabase SQL supports recursive CTEs.










###########################################################################################


**Build a Twitter Pre-2023 (MVP) With Customizations**

**Important naming rule:**

* Use **post** instead of **tweet**
* Use **repost** instead of **retweet**

Your job is to generate the full code for a modern mobile-first social network based on Twitter’s pre-2023 UI/UX, with the modifications listed below.
The generator must collect all names, data structures, endpoints, and tables consistently and record them in BackEnd_Names.md.

---

# 1. **Authentication System**

Implement:

* **Email/password registration**
* **Email/password login**
* **Logout**
* **Forgot Password**
* **Session persistence**
* **Secure user store**

User profile fields:

```
users: {
  id
  email
  username (unique)
  display_name
  profile_picture_url
  bio
  location
  created_at
}
```

---

# 2. **Navigation Structure**

Create bottom navigation with four tabs:

1. **Home** (feed)
2. **Search / Explore**
3. **Notifications** (MVP can be Minimal)
4. **Messages** (MVP can be minimal)
4. **Profile**

Extra screens:

* Post Details
* User Profile
* Image Viewer
* Compose New Post (FAB: with two options (post/polls))

---

# 3. **Home Feed**

The Home feed must show:

* Posts
* Reposts
* Quotes
* Threads
* Deleted placeholders
* Inline media
* Polls
* Mixed content but rendered by **one PostCard component**

Feed rules:

* Pressing a PostCard → Post Details
* Pressing profile_picture/username → Profile
* Pressing media → fullscreen viewer
* Pressing repost label → original post
* Pressing quoted post block → original post

---

# 4. **PostCard Component (Core of the App)**

Every post uses the PostCard.
It must include:

### **Header**

* profile_picture (tap → profile)
* Display name (tap → profile)
* Username
* Timestamp (short: “2h” and long: “Dec 7, 2025 · 3:40 PM”)

### **Body**

* Text
* Media (0–4 images, no video)
* Poll (if present)
* Quoted Post block (if present)

### **Action Bar**

Left → Right:

1. **Reply** (💬)
2. **Repost** (🔁 but call it repost)

   * Tap → repost OR quote menu (nested: (when pressed show options))
3. **Like** (HeartIcon)
4. **Dislike** (💔 broken heart, exclusive with like)
5. **Share** (system share sheet)
6. **More** (…) menu

### **Behavior**

* Liking removes dislike
* Disliking removes like
* Only one preference at a time
* Repost has two modes:

  * Quick repost
  * Quote (opens composer with embed)
* Quoting shows full original post including media
* Deleted post appears as grey box:
  **“This post was deleted.”**

---

# 5. **Threading**

A thread is a chain of posts:

```
A → B → C → D
```

Where each has:

```
parent_post_id
```

### **Hybrid deletion system**

When a middle post is deleted:

* Replace the deleted item with a placeholder box:
  **“This post was deleted.”**
* Do **not** reparent children
* Thread visual lines must remain continuous
* C still appears after the placeholder
* Keeps original context intact

### **Post Details screen**

Shows:

* main post at the top
* thread before it
* replies after it
* quoted nested posts

---

# 6. **Quote Posts**

If a user presses "Quote":

* Composer opens
* Original post is embedded underneath composer text box
* Embedded card includes:

  * text
  * media
  * polls
  * repost/quote count
  * timestamp

### **When rendered in feed**

A quote has **two cards inside one PostCard**:

1. **Outer card** → quoting user’s text
2. **Inner card** → original post

### **Pressing behavior**

* Tap inside quoted card → navigate to **original post detail**
* Tap outside → navigate to **quote post detail**

---

# 7. **Repost (Instead of Retweet)**

When user taps the repost icon:

* Show menu:

  * Repost (quick)
  * Quote Post

Repost behaviors:

* Count increments
* Icon turns green (Twitter’s behavior)
* Repost label appears in feed:
  “Alice reposted”

---

# 8. **Reactions: Like + Dislike**

### Like

* Icon: heart outline → red heart
* Toggles on/off

### Dislike (custom twist)

* Icon: broken heart (💔)
* **Mutually exclusive** with like

---

# 9. **Media Handling**

### Image attachment in composer:

* Positioned under text input area
* Show horizontal previews
* Tap X to remove
* Limit 4 images per post
* Polls cannot be combined with images EXCEPT:

  * **1 image or link can be attached ABOVE the poll, not per option**

### Image viewer:

* Fullscreen
* Swipe to dismiss
* Dark background
* Supports multiple images

---

# 10. **Polls (Exact pre-2023 Twitter behavior + one twist)**

### Core behavior:

* 2–4 options
* Single-choice voting
* Cannot change vote
* Hidden percentages until voting
* Show results after vote or expiration
* Duration: 5 mins → 7 days
* Expiration bar with countdown animation

### Media:

* Poll options NEVER have images
* The **poll itself** may have **one image or one link** above it

### Structure:

```
poll: {
  id
  question
  media?: { image | link }
  options: [
    { id, text }
  ]
  expires_at
  total_votes
}
```

### Quoted & Reposted polls:

* Show entire poll including media and countdown timer

---

# 11. **Compose New Post**

### Text input behavior:

* Expands with content
* Keyboard aware (slides up)
* Icons at bottom:

  * image picker
  * gif
  * emoji
  * poll
* Media preview sits above icons
* Poll button is disabled if images are attached
* Images are cleared if user activates poll

---

# 12. **Search / Explore**

Search includes:

* Search bar at top
* Tabs: **Top**, **Latest**, **People**, **Media**
* Trending topics list
* Pressing a topic loads search results
* Pressing a user opens Profile
* Pressing a post opens Post Details

---

# 13. **Profile Screen**

Contains:

* Banner
* profile_picture
* Display name
* Username
* Bio
* Join date
* Follow / Following counts
* Tabs:

  * Posts
  * Replies
  * Media
  * Likes

Interact with:

* Press profile_picture → full screen viewer
* Press post → Post Details
* Press media thumbnail → media viewer

---

# 14. **Backend Naming Consistency (Important)**

Your code generator must gather **ALL** names used in:

* tables
* endpoints
* models
* interfaces
* fields
* relationships

And ensure the following table names exist:

```
users
posts
post_media
post_polls
post_poll_options
post_reactions
post_reposts
post_quotes
post_threads  (or use parent_post_id in posts)
follows
profiles
```

Endpoints must follow consistent names:

```
/auth/register
/auth/login
/auth/logout

/posts/create
/posts/list
/posts/details/:id
/posts/reply
/posts/repost
/posts/quote
/posts/like
/posts/dislike
/posts/delete

/search/query
/users/profile/:id
/users/posts/:id
```

Never mix "tweet" or "retweet."
Always use **post**, **repost**.

---

# 15. **Implementation Notes**

* normal posts, threads, quotes, reposts must all use the **same PostCard**
* thread logic must not interfere with normal posts
* thread lines only render if parent_post_id exists
* deletion placeholders must not break layout
* optimistic UI for like/dislike
* reconcile with server afterward

---

# 16. **Final Output Requirement**

Your code generator must output:

* React Native (Expo) components
* Navigation
* Screens
* Contexts
* TypeScript models
* Hooks
* Minimal backend bindings
* Sample Supabase schemas aligned with collected names

The result must be a **working minimal Twitter clone** using the terminology:
**post**, **repost**, **quote**, **dislike**, **postcard**, **thread**, **profile**, and so on.