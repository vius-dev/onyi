-- Create the 'avatars' bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Rules for Avatars
CREATE POLICY "Avatar images are public" 
  ON storage.objects FOR SELECT 
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Authenticated users can upload avatars" 
  ON storage.objects FOR INSERT 
  WITH CHECK ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update own avatar" 
  ON storage.objects FOR UPDATE 
  USING ( bucket_id = 'avatars' AND auth.uid() = owner )
  WITH CHECK ( bucket_id = 'avatars' AND auth.uid() = owner );

CREATE POLICY "Users can delete own avatar" 
  ON storage.objects FOR DELETE 
  USING ( bucket_id = 'avatars' AND auth.uid() = owner );
