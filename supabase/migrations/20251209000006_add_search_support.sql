-- 1. Enable the pg_trgm extension for fast, fuzzy text searching (crucial for performance)
create extension if not exists pg_trgm;

-- 2. Create the profiles table
-- This table is linked to the 'auth.users' table via the 'id' foreign key.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone,
  
  -- Constraint to ensure usernames aren't too short
  constraint username_length check (char_length(username) >= 3)
);

-- Ensure full_name column exists if table already existed
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;
END $$;

-- 3. Enable Row Level Security (RLS) - This is mandatory for security
alter table public.profiles enable row level security;

-- 4. Create RLS Policies

-- Policy: Public Search - Anyone (authenticated or not) can view profiles.
create policy "Public profiles are viewable by everyone" 
  on public.profiles for select 
  using ( true );

-- Policy: Users can only create their own profile upon signup
create policy "Users can insert their own profile" 
  on public.profiles for insert 
  with check ( auth.uid() = id );

-- Policy: Users can only update their own profile data
create policy "Users can update own profile" 
  on public.profiles for update 
  using ( auth.uid() = id );

-- 5. Create Search Indexes
-- These GIN (Generalized Inverted Index) indexes optimize the `ILike` search in your React Native code.
create index if not exists profiles_username_search_idx on public.profiles using gin (username gin_trgm_ops);
create index if not exists profiles_fullname_search_idx on public.profiles using gin (full_name gin_trgm_ops);

-- 6. Auto-create profile on User Signup (Essential for 'basic' migration)
-- This function automatically creates a 'profiles' row whenever a new user signs up via Supabase Auth.
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'username' 
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a row is inserted into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();