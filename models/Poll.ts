export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  media?: {
    type: 'image' | 'link';
    url: string;
  };
  allows_multiple_choices: boolean;
  // Contains the IDs of the options the viewer has selected.
  viewer_selected_options?: string[];
  total_votes: number;
  expires_at: string;   // ISO 8601 format for expiration
  created_at?: string;
}
