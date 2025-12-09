-- Add FK from posts.author_id to profiles.id to enable PostgREST joins
ALTER TABLE public.posts
ADD CONSTRAINT posts_author_id_profiles_fkey
FOREIGN KEY (author_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;
