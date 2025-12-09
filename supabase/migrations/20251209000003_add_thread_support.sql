-- Add thread support fields
-- This migration adds:
-- 1. thread_id - groups posts by the same author into a thread
-- 2. sequence_number - orders posts within a thread (1/3, 2/3, 3/3)
-- 3. is_reply - flag to distinguish replies from thread continuations

-- 1. Add thread_id column (replaces thread_root_id concept)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN thread_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Add sequence_number for thread ordering
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'sequence_number'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN sequence_number integer DEFAULT 1;
  END IF;
END $$;

-- 3. Add is_reply flag to distinguish replies from thread posts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'is_reply'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN is_reply boolean DEFAULT false;
  END IF;
END $$;

-- 4. Add index for thread lookups
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON public.posts(thread_id, sequence_number);

-- 5. Backfill is_reply based on parent_post_id
UPDATE public.posts
SET is_reply = true
WHERE parent_post_id IS NOT NULL
  AND is_reply = false;

-- 6. Add comment explaining the distinction
COMMENT ON COLUMN public.posts.thread_id IS 'Groups posts by same author into a thread (1/3, 2/3, 3/3). NULL for standalone posts.';
COMMENT ON COLUMN public.posts.sequence_number IS 'Position in thread (1, 2, 3, etc.). Always 1 for non-threaded posts.';
COMMENT ON COLUMN public.posts.is_reply IS 'True if this is a reply to another post (any author). False for thread continuations by same author.';
COMMENT ON COLUMN public.posts.parent_post_id IS 'For replies: the post being replied to. For threads: NULL (threads use thread_id instead).';
COMMENT ON COLUMN public.posts.thread_root_id IS 'DEPRECATED: Use thread_id instead. Kept for backward compatibility.';
