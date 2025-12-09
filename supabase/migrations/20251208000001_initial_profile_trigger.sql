-- Update the handle_new_user function to also create a profile
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
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
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
