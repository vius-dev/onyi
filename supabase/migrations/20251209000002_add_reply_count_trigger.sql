-- Add reply_count column and trigger for automatic maintenance
-- This migration adds:
-- 1. reply_count column to posts table
-- 2. Helper functions to increment/decrement counts
-- 3. Trigger to automatically update counts on insert/update/delete
-- 4. Index for parent_post_id lookups

-- 1. Add reply_count column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'reply_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN reply_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Helper function: increment reply_count
CREATE OR REPLACE FUNCTION public._increment_reply_count(parent_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF parent_id IS NULL THEN 
    RETURN; 
  END IF;
  
  UPDATE public.posts
    SET reply_count = reply_count + 1
    WHERE id = parent_id;
END;
$$;

-- 3. Helper function: decrement reply_count
CREATE OR REPLACE FUNCTION public._decrement_reply_count(parent_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF parent_id IS NULL THEN 
    RETURN; 
  END IF;
  
  UPDATE public.posts
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = parent_id;
END;
$$;

-- 4. Trigger function: handle INSERT/DELETE/UPDATE for reply counts
CREATE OR REPLACE FUNCTION public.trg_posts_replycount()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- INSERT: increment parent reply_count if this is a reply and not deleted
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.parent_post_id IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      PERFORM public._increment_reply_count(NEW.parent_post_id);
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE: decrement parent reply_count if it was a reply and not deleted
  IF (TG_OP = 'DELETE') THEN
    IF (OLD.parent_post_id IS NOT NULL AND OLD.deleted_at IS NULL) THEN
      PERFORM public._decrement_reply_count(OLD.parent_post_id);
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: handle parent change (reparenting) and soft-delete/un-delete
  IF (TG_OP = 'UPDATE') THEN
    -- 1) parent_post_id changed: adjust old and new parents
    IF (OLD.parent_post_id IS DISTINCT FROM NEW.parent_post_id) THEN
      -- If OLD was a reply (and active), decrement old parent
      IF (OLD.parent_post_id IS NOT NULL AND OLD.deleted_at IS NULL) THEN
        PERFORM public._decrement_reply_count(OLD.parent_post_id);
      END IF;

      -- If NEW is a reply (and active), increment new parent
      IF (NEW.parent_post_id IS NOT NULL AND NEW.deleted_at IS NULL) THEN
        PERFORM public._increment_reply_count(NEW.parent_post_id);
      END IF;
    END IF;

    -- 2) soft-delete / undelete: if deleted_at flipped, update parent's count
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      -- just became deleted -> decrement parent
      IF (NEW.parent_post_id IS NOT NULL) THEN
        PERFORM public._decrement_reply_count(NEW.parent_post_id);
      END IF;
    ELSIF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      -- undeleted -> increment parent
      IF (NEW.parent_post_id IS NOT NULL) THEN
        PERFORM public._increment_reply_count(NEW.parent_post_id);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Attach the trigger
DROP TRIGGER IF EXISTS trg_posts_replycount ON public.posts;

CREATE TRIGGER trg_posts_replycount
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.trg_posts_replycount();

-- 6. Add index for parent_post_id lookups (performance)
CREATE INDEX IF NOT EXISTS idx_posts_parent_post_id ON public.posts(parent_post_id);

-- 7. Backfill existing reply counts
UPDATE public.posts p
SET reply_count = (
  SELECT COUNT(*)
  FROM public.posts r
  WHERE r.parent_post_id = p.id
    AND r.deleted_at IS NULL
)
WHERE p.reply_count != (
  SELECT COUNT(*)
  FROM public.posts r
  WHERE r.parent_post_id = p.id
    AND r.deleted_at IS NULL
);
