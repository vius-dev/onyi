
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase"; // Import supabase
import { useEffect, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import PostCard from "../components/PostCard";

const currentUser: User = {
  id: "1",
  username: "current_user",
  display_name: "Current User",
  profile_picture_url: "https://randomuser.me/api/portraits/men/1.jpg",
  email: "current_user@example.com",
  created_at: new Date().toISOString(),
};

// -----------------------------------------------------------
// 🔥 Utility: Build a thread tree from flat posts
// -----------------------------------------------------------
function buildThreadTree(posts: Post[], parentId: string | null = null): Post[] {
  return posts
    .filter((p) => p.parent_post_id === parentId)
    .map((p) => ({
      ...p,
      child_posts: buildThreadTree(posts, p.id),
    }));
}

// -----------------------------------------------------------
// 🔥 Fetch posts and profiles from Supabase
// -----------------------------------------------------------
const fetchPosts = async (): Promise<Post[]> => {
  try {
    // 1. Fetch posts
    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postsError) throw postsError;
    if (!postsData || postsData.length === 0) return [];

    // 2. Get unique author IDs
    const authorIds = Array.from(new Set(postsData.map((p) => p.author_id)));

    // 3. Fetch profiles for those authors
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", authorIds);

    if (profilesError) throw profilesError;

    // 4. Map profiles by ID for easy lookup
    const profilesMap = new Map();
    profilesData?.forEach((profile) => {
      profilesMap.set(profile.id, profile);
    });

    // 5. Construct Post objects with User data
    const posts: Post[] = postsData.map((p) => {
      const profile = profilesMap.get(p.author_id);

      const user: User = profile ? {
        ...profile,
      } : {
        // Fallback if profile not found
        id: p.author_id,
        username: "Unknown",
        display_name: "Unknown User",
        email: "",
        created_at: new Date().toISOString(),
      };

      return {
        ...p,
        user, // Attach the user object expected by the UI
        text: p.content, // Map 'content' (DB) to 'text' (UI model)
        like_count: 0, // TODO: Fetch counts
        repost_count: 0,
        quote_count: 0,
        dislike_count: 0,
        reply_count: 0,
        is_deleted: !!p.deleted_at,
      };
    });

    // 6. Build Thread Tree (if needed, but for now flat list sorted by date is a good start for "Latest")
    // If we want detailed threads, we'd use buildThreadTree explicitly. 
    // For the main feed, showing thread roots + orphan posts is typical.
    // Let's filter to only show top-level posts (no parent) OR implement the tree logic.
    // For simplicity V1: Show all posts (or just roots).
    // Let's just return all for now to verify data flow.
    return posts; // .filter(p => !p.parent_post_id); 

  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
};

export default function Index() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    fetchPosts().then(setPosts);
    // Optional: Subscribe to changes or refresh interval
  }, []);

  const handleVote = (pollId: string, optionIds: string[]) => {
    Alert.alert("Voted!", `Poll: ${pollId}, Options: ${optionIds.join(", ")}`);
  };

  const onLike = (id: string) => console.log("Liked", id);
  const onDislike = (id: string) => console.log("Disliked", id);
  const onRepost = (id: string) => console.log("Reposted", id);
  const onQuote = (p: Post) => console.log("Quoted", p.id);
  const onDelete = (id: string) => console.log("Deleted", id);

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard
      post={item}
      currentUser={currentUser}
      onLike={onLike}
      onDislike={onDislike}
      onRepost={onRepost}
      onQuote={onQuote}
      onDelete={onDelete}
      onVote={handleVote}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1 }}
      />
    </View>
  );
}
