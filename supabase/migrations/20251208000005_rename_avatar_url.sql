-- Rename column to match application code
ALTER TABLE public.profiles
RENAME COLUMN avatar_url TO profile_picture_url;

-- Update the trigger function to use the new column name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_username text;
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);

  -- Generate a temporary username based on email
  default_username := split_part(new.email, '@', 1) || floor(random() * 1000)::text;

  -- Insert into public.profiles
  INSERT INTO public.profiles (id, username, display_name, profile_picture_url)
  VALUES (
    new.id, 
    default_username, 
    split_part(new.email, '@', 1), -- Default display name
    'https://randomuser.me/api/portraits/lego/1.jpg' -- Default avatar
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force schema reload
NOTIFY pgrst, 'reload config';
