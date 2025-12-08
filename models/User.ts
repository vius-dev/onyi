
export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  profile_picture_url?: string;
  cover_photo_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  date_of_birth?: string;
  created_at: string;
  following_count?: number;
  followers_count?: number;
}
