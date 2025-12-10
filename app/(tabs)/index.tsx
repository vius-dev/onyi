import { useAuth } from "@/contexts/AuthContext";
import { Poll } from "@/models/Poll";
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import PostCard from "../../components/PostCard";

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

  if (parentId === null && __DEV__) {
    console.log('🔍 buildThreadTree - Total posts:', posts.length);
    console.log('🔍 buildThreadTree - Top-level posts:', result.length);
  }

  return result;
}

// -----------------------------------------------------------
// 🔥 Map poll data from Supabase to Poll interface
// -----------------------------------------------------------
function mapPollData(rawPoll: any, currentUserId?: string): Poll | undefined {
  if (!rawPoll) return undefined;

  const options = (rawPoll.options || []).map((opt: any) => ({
    id: opt.id,
    text: opt.text,
    votes: opt.votes || 0,
  }));

  // Get viewer's selected options
  const viewerSelectedOptions = rawPoll.viewer_selected_options || [];

  return {
    id: rawPoll.id,
    question: rawPoll.question,
    options: options,
    media: rawPoll.media || undefined,
    allows_multiple_choices: rawPoll.allows_multiple_choices,
    viewer_selected_options: viewerSelectedOptions,
    total_votes: rawPoll.total_votes || 0,
    expires_at: rawPoll.expires_at,
    created_at: rawPoll.created_at,
  };
}

// -----------------------------------------------------------
// 🔥 Fetch posts with polls using RPC function
// -----------------------------------------------------------
const fetchPosts = async (currentUserId?: string): Promise<Post[]> => {
  try {
    // 1. Fetch ALL posts (including replies) with joined user and counts
    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(`
        *,
        user:profiles(*),
        post_reactions(count),
        post_reposts(count),
        post_quotes:post_quotes!post_quotes_quote_post_id_fkey(count)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (postsError) throw postsError;
    if (!postsData || postsData.length === 0) return [];

    // 2. Fetch current user's reactions (if logged in)
    let myReactionsMap = new Map<string, string>();
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

    // 3. Fetch polls for posts that have them
    const postIds = postsData.map(p => p.id);
    const { data: pollsData, error: pollsError } = await supabase
      .from("polls")
      .select("id, post_id")
      .in("post_id", postIds);

    // 4. Fetch poll details with viewer status using RPC
    const pollsMap = new Map<string, Poll>();
    if (pollsData && pollsData.length > 0) {
      for (const pollRef of pollsData) {
        const { data: pollData, error: pollError } = await supabase
          .rpc('get_poll_with_viewer_status', {
            poll_id_input: pollRef.id,
            viewer_id: currentUserId || null
          });

        if (!pollError && pollData) {
          const mappedPoll = mapPollData(pollData, currentUserId);
          if (mappedPoll) {
            pollsMap.set(pollRef.post_id, mappedPoll);
          }
        }
      }
    }

    // 5. Construct Post objects with User data, Polls, and Reactions
    const allPosts: Post[] = postsData.map((p: any) => {
      // Ensure user data exists
      if (!p.user) {
        p.user = {
          id: p.author_id,
          username: "Unknown",
          display_name: "Unknown User",
          email: "",
          created_at: new Date().toISOString(),
        } as User;
      }

      return {
        ...p,
        user: p.user,
        content: p.content,
        like_count: p.post_reactions?.[0]?.count || 0,
        repost_count: p.post_reposts?.[0]?.count || 0,
        quote_count: p.post_quotes?.[0]?.count || 0,
        reply_count: p.reply_count || 0,
        dislike_count: 0, // TODO: Add dislike count if needed
        is_deleted: !!p.deleted_at,
        my_reaction: myReactionsMap.get(p.id) || null,
        poll: pollsMap.get(p.id), // Attach poll data
        thread_id: p.thread_id,
        sequence_number: p.sequence_number,
        is_reply: p.is_reply,
        parent_post_id: p.parent_post_id,
      };
    });

    // 6. Fetch thread_posts for posts that are part of a thread
    const threadIds = new Set(allPosts.map(p => p.thread_id).filter(Boolean));
    if (threadIds.size > 0) {
      const { data: threadPosts } = await supabase
        .from("posts")
        .select("id, thread_id, sequence_number")
        .in("thread_id", Array.from(threadIds))
        .eq("is_reply", false); // Only count thread posts

      const threadMap = new Map<string, any[]>();
      threadPosts?.forEach(tp => {
        if (!threadMap.has(tp.thread_id)) {
          threadMap.set(tp.thread_id, []);
        }
        threadMap.get(tp.thread_id)!.push(tp);
      });

      allPosts.forEach(post => {
        if (post.thread_id) {
          const threads = threadMap.get(post.thread_id) || [];
          post.thread_posts = threads;
          post.thread_total = threads.length;
        }
      });
    }

    // 7. Build thread tree to nest replies under parents
    const threadedPosts = buildThreadTree(allPosts, null);

    return threadedPosts;

  } catch (error) {
    console.error("Error fetching posts:", error);
    throw error; // Propagate error for better error handling
  }
};

export default function Index() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user: authUser } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch current user profile
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

  // Load posts with error handling
  const loadPosts = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPosts(authUser?.id);
      setPosts(data);
    } catch (err) {
      console.error("Error loading posts:", err);
      setError("Failed to load posts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [authUser?.id]);

  // Initial load
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Auto-refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        loadPosts();
      }
    }, [loadPosts, loading])
  );

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  // -----------------------------------------------------------
  // Action Handlers
  // -----------------------------------------------------------

  const handleVote = async (pollId: string, optionIds: string[]) => {
    if (!authUser) {
      Alert.alert("Login Required", "Please log in to vote.");
      return;
    }

    try {
      // Call the cast_poll_vote RPC function
      const { data: updatedPoll, error } = await supabase
        .rpc('cast_poll_vote', {
          poll_id_input: pollId,
          option_ids_input: optionIds,
          voter_id: authUser.id
        });

      if (error) throw error;

      // Update the poll in state with new vote data
      if (updatedPoll) {
        const mappedPoll = mapPollData(updatedPoll, authUser.id);

        setPosts(currentPosts =>
          updatePostsRecursively(currentPosts, (post) => {
            if (post.poll?.id === pollId) {
              return { ...post, poll: mappedPoll };
            }
            return post;
          })
        );
      }

    } catch (error) {
      console.error("Error voting on poll:", error);
      Alert.alert("Vote Failed", "Could not submit your vote. Please try again.");
    }
  };

  const onLike = async (postId: string) => {
    if (!authUser) {
      Alert.alert("Login Required", "Please log in to like posts.");
      return;
    }

    // Optimistic update
    setPosts(currentPosts =>
      updatePostsRecursively(currentPosts, (post) => {
        if (post.id !== postId) return post;

        const wasLiked = post.my_reaction === "like";
        const wasDisliked = post.my_reaction === "dislike";

        if (wasLiked) {
          return { ...post, my_reaction: null, like_count: post.like_count - 1 };
        } else {
          return {
            ...post,
            my_reaction: "like",
            like_count: post.like_count + 1,
            dislike_count: wasDisliked ? post.dislike_count - 1 : post.dislike_count,
          };
        }
      })
    );

    // DB Update
    try {
      const post = findPostById(posts, postId);
      const wasLiked = post?.my_reaction === "like";

      if (wasLiked) {
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id)
          .eq("type", "like");
      } else {
        await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authUser.id);

        await supabase.from("post_reactions").insert({
          post_id: postId,
          user_id: authUser.id,
          type: "like",
        });
      }
    } catch (error) {
      console.error("Error updating like:", error);
      // Revert on error
      await loadPosts();
    }
  };

  const onDislike = async (postId: string) => {
    if (!authUser) {
      Alert.alert("Login Required", "Please log in to dislike posts.");
      return;
    }

    setPosts(currentPosts =>
      updatePostsRecursively(currentPosts, (post) => {
        if (post.id !== postId) return post;

        const wasLiked = post.my_reaction === "like";
        const wasDisliked = post.my_reaction === "dislike";

        if (wasDisliked) {
          return { ...post, my_reaction: null, dislike_count: post.dislike_count - 1 };
        } else {
          return {
            ...post,
            my_reaction: "dislike",
            dislike_count: post.dislike_count + 1,
            like_count: wasLiked ? post.like_count - 1 : post.like_count,
          };
        }
      })
    );

    try {
      const post = findPostById(posts, postId);
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
      await loadPosts();
    }
  };

  const onRepost = (id: string) => {
    Alert.alert("Coming Soon", "Repost feature is under development.");
  };

  const onQuote = (p: Post) => {
    Alert.alert("Coming Soon", "Quote feature is under development.");
  };

  const onDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (!error) {
        setPosts(currentPosts =>
          updatePostsRecursively(currentPosts, (post) =>
            post.id === id ? { ...post, is_deleted: true } : post
          )
        );
      } else {
        Alert.alert("Error", "Could not delete post");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      Alert.alert("Error", "Could not delete post");
    }
  };

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!currentProfile) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

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
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No posts yet. Start sharing!</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#1DA1F2"]}
            tintColor="#1DA1F2"
          />
        }
      />
    </View>
  );
}

// -----------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------

// Recursively update posts (handles nested child_posts)
function updatePostsRecursively(posts: Post[], updateFn: (post: Post) => Post): Post[] {
  return posts.map(post => {
    const updatedPost = updateFn(post);
    if (updatedPost.child_posts && updatedPost.child_posts.length > 0) {
      return {
        ...updatedPost,
        child_posts: updatePostsRecursively(updatedPost.child_posts, updateFn)
      };
    }
    return updatedPost;
  });
}

// Recursively find a post by ID
function findPostById(posts: Post[], postId: string): Post | null {
  for (const post of posts) {
    if (post.id === postId) return post;
    if (post.child_posts && post.child_posts.length > 0) {
      const found = findPostById(post.child_posts, postId);
      if (found) return found;
    }
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#536471',
    textAlign: 'center',
  },
});