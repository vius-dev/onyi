
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const CURRENT_USER_ID = "1";

const fetchUser = async (userId: string): Promise<User | null> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) {
    return {
      id: userId,
      email: `mockuser${userId}@example.com`,
      display_name: "Mock User",
      username: `mockuser${userId}`,
      bio: "This is a mock bio. Update your Supabase schema.",
      location: "Mock Location",
      website: "mock.com",
      created_at: new Date().toISOString(),
      following_count: 123,
      followers_count: 456,
      profile_picture_url: "https://via.placeholder.com/150",
    } as User;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data as User;
  } catch (error: any) {
    console.error("Error fetching user:", error);

    if (error.message.includes("schema cache")) {
      return {
        id: userId,
        email: `mockuser${userId}@example.com`,
        display_name: "Mock User",
        username: `mockuser${userId}`,
        bio: "This is a mock bio. Update your Supabase schema.",
        location: "Mock Location",
        website: "mock.com",
        created_at: new Date().toISOString(),
        following_count: 123,
        followers_count: 456,
        profile_picture_url: "https://via.placeholder.com/150",
      } as User;
    }

    return null;
  }
};

const fetchUserPosts = async (userId: string): Promise<Post[]> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) {
    return [
      {
        id: "1",
        text: "This is a mock post for the UI.",
        user: {
          id: userId,
          username: "mockuser",
          display_name: "Mock User",
          email: "mock@example.com",
          created_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        like_count: 0,
        dislike_count: 0,
        repost_count: 0,
        quote_count: 0,
        reply_count: 0,
        is_deleted: false,
      },
      {
        id: "2",
        text: "The backend will provide real data later.",
        user: {
          id: userId,
          username: "mockuser",
          display_name: "Mock User",
          email: "mock@example.com",
          created_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        like_count: 0,
        dislike_count: 0,
        repost_count: 0,
        quote_count: 0,
        reply_count: 0,
        is_deleted: false,
      },
    ];
  }

  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("author_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as Post[];
  } catch (error: any) {
    console.error("Error fetching posts:", error);

    if (error.message.includes("schema cache")) {
      return [
        {
          id: "1",
          text: "This is a mock post for the UI.",
          user: {
            id: userId,
            username: "mockuser",
            display_name: "Mock User",
            email: "mock@example.com",
            created_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
          like_count: 0,
          dislike_count: 0,
          repost_count: 0,
          quote_count: 0,
          reply_count: 0,
          is_deleted: false,
        },
        {
          id: "2",
          text: "The backend will provide real data later.",
          user: {
            id: userId,
            username: "mockuser",
            display_name: "Mock User",
            email: "mock@example.com",
            created_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
          like_count: 0,
          dislike_count: 0,
          repost_count: 0,
          quote_count: 0,
          reply_count: 0,
          is_deleted: false,
        },
      ];
    }

    return [];
  }
};

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState("Posts");

  const router = useRouter();
  const { id } = useLocalSearchParams();
  const userId = Array.isArray(id) ? id[0] : id;

  const isOwnProfile = userId === CURRENT_USER_ID;

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const u = await fetchUser(userId);
      setUser(u);
      const p = await fetchUserPosts(userId);
      setPosts(p);
    };

    load();
  }, [userId]);

  const renderPost = useCallback(
    ({ item }: { item: Post }) => (
      <View style={styles.postContainer}>
        <Text>{item.text}</Text>
      </View>
    ),
    []
  );

  if (!user) return <Text>Loading profile...</Text>;

  const TABS = isOwnProfile
    ? ["Posts", "Posts & replies", "Media"]
    : ["Posts", "Media"];

  // --- Header rendered ABOVE the FlatList posts ---
  const ListHeader = () => (
    <View>
      {/* Cover photo */}
      <ImageBackground
        source={
          user.cover_photo_url
            ? { uri: user.cover_photo_url }
            : require("../../assets/images/default-cover.png")
        }
        style={styles.coverPhoto}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
      </ImageBackground>

      {/* Profile picture & button */}
      <View style={styles.profileHeader}>
        <Image
          source={{
            uri: user.profile_picture_url || "https://via.placeholder.com/150",
          }}
          style={styles.profilePicture}
        />

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>
            {isOwnProfile ? "Edit Profile" : "Follow"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Basic Info */}
      <View style={styles.userInfo}>
        <Text style={styles.displayName}>{user.display_name}</Text>
        <Text style={styles.username}>@{user.username}</Text>

        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

        <View style={styles.metaInfo}>
          {user.location && (
            <Text style={styles.metaText}>
              <Ionicons name="location-outline" size={14} /> {user.location}
            </Text>
          )}
          {user.website && (
            <Text style={[styles.metaText, styles.link]}>
              <Ionicons name="link-outline" size={14} /> {user.website}
            </Text>
          )}
          <Text style={styles.metaText}>
            <Ionicons name="calendar-outline" size={14} /> Joined{" "}
            {new Date(user.created_at).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>

        <View style={styles.followStats}>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>
              {user.following_count || 0}
            </Text>{" "}
            Following
          </Text>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>
              {user.followers_count || 0}
            </Text>{" "}
            Followers
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, activeTab === tab && styles.activeTabText]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Non-post tabs */}
      {activeTab !== "Posts" && (
        <View style={styles.nonPostContent}>
          <Text style={styles.tabContent}>
            {activeTab} coming soon.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={activeTab === "Posts" ? posts : []}
      renderItem={renderPost}
      keyExtractor={(item) => item.id.toString()}
      ListHeaderComponent={<ListHeader />}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    />
  );
}







// ---------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  coverPhoto: {
    height: 150,
    backgroundColor: "#ccc",
    justifyContent: "flex-end",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 5,
  },
  profileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    marginTop: -40,
  },
  profilePicture: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
  },
  actionButton: {
    borderColor: "#1DA1F2",
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginTop: 50,
  },
  actionButtonText: {
    color: "#1DA1F2",
    fontWeight: "bold",
  },
  userInfo: {
    padding: 15,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
  },
  username: {
    fontSize: 16,
    color: "gray",
  },
  bio: {
    fontSize: 16,
    marginTop: 10,
  },
  metaInfo: {
    marginTop: 10,
  },
  metaText: {
    fontSize: 14,
    color: "gray",
    marginBottom: 5,
  },
  link: {
    color: "#1DA1F2",
  },
  followStats: {
    flexDirection: "row",
    marginTop: 10,
  },
  followText: {
    marginRight: 15,
    fontSize: 16,
    color: "gray",
  },
  followCount: {
    fontWeight: "bold",
    color: "black",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e8ed",
  },
  tab: {
    paddingVertical: 15,
    flex: 1,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#1DA1F2",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "gray",
  },
  activeTabText: {
    color: "#1DA1F2",
  },
  postContainer: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e8ed",
  },
  nonPostContent: {
    padding: 20,
  },
  tabContent: {
    textAlign: "center",
    fontSize: 16,
    color: "gray",
  },
});
