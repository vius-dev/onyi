
import { useAuth } from "@/contexts/AuthContext";
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase"; // Import supabase

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import PostCard from "../../components/PostCard";


// Placeholder for now - we will fetch real profile in component
// Placeholder for now - we will fetch real profile in component
const defaultUser: User | null = null;

// -----------------------------------------------------------
// 🔥 Utility: Build a thread tree from flat posts
// -----------------------------------------------------------
function buildThreadTree(posts: Post[], parentId: string | null = null): Post[] {
  const result = posts
    .filter((p) => p.parent_post_id === parentId)
    .map((p) => ({
      ...p,
      child_posts: buildThreadTree(posts, p.id),
    }));

  // Debug logging
  if (parentId === null) {
    console.log('🔍 buildThreadTree - Total posts:', posts.length);
    console.log('🔍 buildThreadTree - Posts with parent_post_id:', posts.filter(p => p.parent_post_id).length);
    console.log('🔍 buildThreadTree - Top-level posts:', result.length);
    console.log('🔍 buildThreadTree - First post children:', result[0]?.child_posts?.length || 0);
  }

  return result;
}

// -----------------------------------------------------------
// 🔥 Fetch posts and profiles from Supabase
// -----------------------------------------------------------
// NOTE: We fetch ALL posts (including replies) and then build a thread tree.
// -----------------------------------------------------------
const fetchPosts = async (currentUserId?: string): Promise<Post[]> => {
  try {
    // 1. Fetch ALL posts (including replies) with joined user, counts, AND POLLS
    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(`
        *,
        user:profiles(*),
        post_reactions(count),
        post_reposts(count),
        post_quotes:post_quotes!post_quotes_quote_post_id_fkey(count),
        post_polls(
          *,
          options:post_poll_options(*),
          votes:post_poll_votes(user_id, option_id)
        )
      `)
      .order("created_at", { ascending: false });

    if (postsError) throw postsError;
    if (!postsData || postsData.length === 0) return [];

    // 2. Fetch current user's reactions (if logged in)
    let myReactionsMap = new Map<string, string>(); // postId -> 'like' | 'dislike'
    if (currentUserId) {
      const postIds = postsData.map((p) => p.id);
      const { data: reactionsData, error: reactionsError } = await supabase
        .from("post_reactions")
        .select("post_id, type")
        .in("post_id", postIds)
        .eq("user_id", currentUserId);

      if (!reactionsError && reactionsData) {
        reactionsData.forEach((r) => {
          myReactionsMap.set(r.post_id, r.type);
        });
      }
    }

    // 3. Construct Post objects with User data & Polls & Reactions
    const allPosts: Post[] = postsData.map((p: any) => {
      // User is already joined by Supabase (p.user)
      if (!p.user) {
        p.user = {
          id: p.author_id,
          username: "Unknown",
          display_name: "Unknown User",
          email: "",
          created_at: new Date().toISOString(),
        } as User;
      }

      // Handle Poll Mapping
      let poll = undefined;
      if (p.post_polls && p.post_polls.length > 0) {
        const rawPoll = p.post_polls[0]; // Assuming one poll per post
        const options = rawPoll.options || [];

        // Calculate vote counts per option
        const votes = rawPoll.votes || [];
        const voteCounts: Record<string, number> = {};
        votes.forEach((v: any) => {
          voteCounts[v.option_id] = (voteCounts[v.option_id] || 0) + 1;
        });

        const mappedOptions = options.map((opt: any) => ({
          id: opt.id,
          text: opt.label,
          votes: voteCounts[opt.id] || 0
        })).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

        // Determine if user voted
        const myVote = votes.find((v: any) => v.user_id === currentUserId);

        poll = {
          id: rawPoll.id,
          question: rawPoll.question,
          options: mappedOptions,
          user_voted_option_id: myVote ? myVote.option_id : null,
          expires_at: rawPoll.expires_at,
        };
      }

      return {
        ...p,
        user: p.user,
        text: p.content,
        content: p.content, // Keep both for compatibility
        like_count: p.post_reactions?.[0]?.count || 0,
        repost_count: p.post_reposts?.[0]?.count || 0,
        quote_count: p.post_quotes?.[0]?.count || 0,
        reply_count: p.reply_count || 0, // From database trigger
        dislike_count: 0,
        is_deleted: !!p.deleted_at,
        my_reaction: myReactionsMap.get(p.id) || null,
        poll: poll,
        thread_id: p.thread_id,
        sequence_number: p.sequence_number,
        is_reply: p.is_reply,
        parent_post_id: p.parent_post_id,
      };
    });

    // 4. Fetch thread_posts for posts that are part of a thread
    const threadIds = new Set(allPosts.map(p => p.thread_id).filter(Boolean));
    if (threadIds.size > 0) {
      const { data: threadPosts } = await supabase
        .from("posts")
        .select("id, thread_id, sequence_number")
        .in("thread_id", Array.from(threadIds));

      // Group by thread_id
      const threadMap = new Map<string, any[]>();
      threadPosts?.forEach(tp => {
        if (!threadMap.has(tp.thread_id)) {
          threadMap.set(tp.thread_id, []);
        }
        threadMap.get(tp.thread_id)!.push(tp);
      });

      // Attach thread_posts to each post
      allPosts.forEach(post => {
        if (post.thread_id) {
          post.thread_posts = threadMap.get(post.thread_id) || [];
        }
      });
    }

    // 5. Build thread tree to nest replies under parents
    const threadedPosts = buildThreadTree(allPosts, null);

    // 6. Return only top-level posts (with nested children)
    return threadedPosts;

  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
};

export default function Index() {
  const [posts, setPosts] = useState<Post[]>([]);
  const { user: authUser } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);

  useEffect(() => {
    if (authUser) {
      supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setCurrentProfile(data as User);
        });
    }
  }, [authUser]);

  const loadPosts = async () => {
    const data = await fetchPosts(authUser?.id);
    setPosts(data);
  };

  // Initial load
  useEffect(() => {
    loadPosts();
  }, []);

  // Poll for refresh / Auto-update on focus
  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [])
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, []);

  const handleVote = (pollId: string, optionIds: string[]) => {
    Alert.alert("Voted!", `Poll: ${pollId}, Options: ${optionIds.join(", ")}`);
  };

  const onLike = async (postId: string) => {
    if (!authUser) return;

    // 1. Optimistic Update
    setPosts((currentPosts) =>
      currentPosts.map((p) => {
        if (p.id !== postId) return p;

        const wasLiked = p.my_reaction === "like";
        const wasDisliked = p.my_reaction === "dislike";

        // Toggle like
        if (wasLiked) {
          return { ...p, my_reaction: null, like_count: p.like_count - 1 };
        } else {
          return {
            ...p,
            my_reaction: "like",
            like_count: p.like_count + 1,
            dislike_count: wasDisliked ? p.dislike_count - 1 : p.dislike_count,
          };
        }
      })
    );

    // 2. DB Update
    try {
      const post = posts.find((p) => p.id === postId);
      const wasLiked = post?.my_reaction === "like";

      if (wasLiked) {
        // Remove like
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id)
          .eq("type", "like");
      } else {
        // Add like (and remove dislike if exists)
        // Batch operations? Or sequential. Sequential is safer for now.
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id); // Remove ANY reaction

        await supabase.from("post_reactions").insert({
          post_id: postId,
          user_id: authUser.id,
          type: "like",
        });
      }
    } catch (error) {
      console.error("Error updating like:", error);
      // Revert optimistic update? For MVP mostly fine to ignore or reload.
    }
  };

  const onDislike = async (postId: string) => {
    if (!authUser) return;

    setPosts((currentPosts) =>
      currentPosts.map((p) => {
        if (p.id !== postId) return p;

        const wasLiked = p.my_reaction === "like";
        const wasDisliked = p.my_reaction === "dislike";

        if (wasDisliked) {
          return { ...p, my_reaction: null, dislike_count: p.dislike_count - 1 };
        } else {
          return {
            ...p,
            my_reaction: "dislike",
            dislike_count: p.dislike_count + 1,
            like_count: wasLiked ? p.like_count - 1 : p.like_count,
          };
        }
      })
    );

    try {
      const post = posts.find((p) => p.id === postId);
      const wasDisliked = post?.my_reaction === "dislike";

      if (wasDisliked) {
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id)
          .eq("type", "dislike");
      } else {
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id);

        await supabase.from("post_reactions").insert({
          post_id: postId,
          user_id: authUser.id,
          type: "dislike",
        });
      }
    } catch (error) {
      console.error("Error updating dislike:", error);
    }
  };

  const onRepost = (id: string) => console.log("Reposted", id);
  const onQuote = (p: Post) => console.log("Quoted", p.id);
  const onDelete = async (id: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (!error) {
      setPosts(current => current.filter(p => p.id !== id));
    } else {
      Alert.alert("Error", "Could not delete post");
    }
  };

  if (!currentProfile) return <View style={{ flex: 1, backgroundColor: 'white' }}><FlatList data={[]} renderItem={null} /></View>; // Loading state

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard
      post={item}
      currentUser={currentProfile}
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}
