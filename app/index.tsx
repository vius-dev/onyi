
import { Poll } from "@/models/Poll";
import { Post } from "@/models/Post";
import { User } from "@/models/User";
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

const generateDummyPosts = (): Post[] => {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 120 * 60 * 1000);

  const dummyPoll: Poll = {
    id: "poll1",
    question: "What is your favorite color?",
    options: [
      { id: "opt1", text: "Red", votes: 3 },
      { id: "opt2", text: "Blue", votes: 5 },
      { id: "opt3", text: "Green", votes: 2 },
    ],
    total_votes: 10,
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    allows_multiple_choices: false,
  };

  const threadUser: User = {
    id: "4",
    username: "threader",
    display_name: "Threader",
    profile_picture_url: "https://randomuser.me/api/portraits/women/4.jpg",
    email: "threader@example.com",
    created_at: new Date().toISOString(),
  };

  // -----------------------------------------------------------
  // 🔥 Define flat list of posts (thread + normal posts)
  // -----------------------------------------------------------
  const flatPosts: Post[] = [
    // Thread posts
    {
      id: "thread1",
      user: threadUser,
      text: "This is the start of a great thread!",
      created_at: twoHoursAgo.toISOString(),
      like_count: 50,
      repost_count: 20,
      quote_count: 0,
      dislike_count: 2,
      reply_count: 10,
      is_deleted: false,
    },
    {
      id: "thread2",
      user: threadUser,
      text: "Here is the second part of the thread. It continues the discussion.",
      created_at: oneHourAgo.toISOString(),
      like_count: 40,
      repost_count: 15,
      quote_count: 0,
      dislike_count: 1,
      reply_count: 5,
      is_deleted: false,
      parent_post_id: "thread1",
    },
    {
      id: "thread3",
      user: threadUser,
      text: "And the final part of this engaging thread. Thanks for reading!",
      created_at: fiveMinutesAgo.toISOString(),
      like_count: 30,
      repost_count: 10,
      quote_count: 0,
      dislike_count: 0,
      reply_count: 3,
      is_deleted: false,
      parent_post_id: "thread2",
    },

    // Normal posts
    {
      id: "1",
      user: {
        id: "2",
        username: "testuser",
        display_name: "Test User",
        profile_picture_url: "https://randomuser.me/api/portraits/men/2.jpg",
        email: "testuser@example.com",
        created_at: new Date().toISOString(),
      },
      text: "This is the first post with a poll!",
      created_at: fiveMinutesAgo.toISOString(),
      like_count: 10,
      repost_count: 5,
      quote_count: 0,
      dislike_count: 1,
      reply_count: 2,
      is_deleted: false,
      poll: dummyPoll,
    },
    {
      id: "2",
      user: {
        id: "3",
        username: "anotheruser",
        display_name: "Another User",
        profile_picture_url: "https://randomuser.me/api/portraits/women/2.jpg",
        email: "anotheruser@example.com",
        created_at: new Date().toISOString(),
      },
      text: "This is another post without a poll.",
      created_at: oneHourAgo.toISOString(),
      like_count: 20,
      repost_count: 15,
      quote_count: 0,
      dislike_count: 0,
      reply_count: 5,
      is_deleted: false,
    },
  ];

  // -----------------------------------------------------------
  // 🔥 Build thread: only keep the tree whose root is thread1
  // -----------------------------------------------------------
  const threadRoot = buildThreadTree(flatPosts).find((p) => p.id === "thread1");

  // Feed = thread tree + all non-thread root posts
  return [
    ...(threadRoot ? [threadRoot] : []),
    ...flatPosts.filter((p) => p.parent_post_id === null && p.id !== "thread1"),
  ];
};

export default function Index() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    setPosts(generateDummyPosts());
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
