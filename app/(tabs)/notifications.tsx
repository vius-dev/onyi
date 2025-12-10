import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { formatRelativeTime } from "@/utils/time";

type NotificationType = "like" |"dislike" | "reply" | "repost" | "follow" | "quote" | "mention";

interface Notification {
  id: string;
  type: NotificationType;
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar?: string;
  post_id?: string;
  post_content?: string;
  created_at: string;
  is_read: boolean;
  additional_actors?: number; // For aggregated notifications (e.g., "John and 5 others liked your post")
}

export default function NotificationsScreen() {
  const [activeTab, setActiveTab] = useState<"all" | "mentions">("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user: authUser } = useAuth();
  const router = useRouter();

  // Fetch notifications from Supabase
  const fetchNotifications = useCallback(async () => {
    if (!authUser) return;

    try {
      // This is a placeholder query - you'll need to adjust based on your schema
      // For now, we'll fetch from post_reactions, replies, follows, etc.
      
      const notifs: Notification[] = [];

      // 1. Fetch likes on user's posts
      const { data: likesData } = await supabase
        .from("post_reactions")
        .select(`
          id,
          created_at,
          user_id,
          post_id,
          type,
          profile:profiles!post_reactions_user_id_fkey(username, display_name, profile_picture_url),
          post:posts!post_reactions_post_id_fkey(content, author_id)
        `)
        .eq("type", "like")
        .eq("post.author_id", authUser.id)
        .neq("user_id", authUser.id) // Don't show own likes
        .order("created_at", { ascending: false })
        .limit(50);

      if (likesData) {
        likesData.forEach((like: any) => {
          if (like.profile && like.post) {
            notifs.push({
              id: like.id,
              type: "like",
              actor_id: like.user_id,
              actor_username: like.profile.username,
              actor_display_name: like.profile.display_name,
              actor_avatar: like.profile.profile_picture_url,
              post_id: like.post_id,
              post_content: like.post.content,
              created_at: like.created_at,
              is_read: false, // TODO: Track read status
            });
          }
        });
      }

      // 2. Fetch replies to user's posts
      const { data: repliesData } = await supabase
        .from("posts")
        .select(`
          id,
          content,
          created_at,
          author_id,
          parent_post_id,
          profile:profiles!posts_author_id_fkey(username, display_name, profile_picture_url),
          parent:posts!posts_parent_post_id_fkey(author_id)
        `)
        .not("parent_post_id", "is", null)
        .eq("parent.author_id", authUser.id)
        .neq("author_id", authUser.id) // Don't show own replies
        .order("created_at", { ascending: false })
        .limit(50);

      if (repliesData) {
        repliesData.forEach((reply: any) => {
          if (reply.profile) {
            notifs.push({
              id: reply.id,
              type: "reply",
              actor_id: reply.author_id,
              actor_username: reply.profile.username,
              actor_display_name: reply.profile.display_name,
              actor_avatar: reply.profile.profile_picture_url,
              post_id: reply.id,
              post_content: reply.content,
              created_at: reply.created_at,
              is_read: false,
            });
          }
        });
      }

      // 3. Fetch new followers
      const { data: followsData } = await supabase
        .from("follows")
        .select(`
          id,
          created_at,
          follower_id,
          profile:profiles!follows_follower_id_fkey(username, display_name, profile_picture_url)
        `)
        .eq("following_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (followsData) {
        followsData.forEach((follow: any) => {
          if (follow.profile) {
            notifs.push({
              id: follow.id,
              type: "follow",
              actor_id: follow.follower_id,
              actor_username: follow.profile.username,
              actor_display_name: follow.profile.display_name,
              actor_avatar: follow.profile.profile_picture_url,
              created_at: follow.created_at,
              is_read: false,
            });
          }
        });
      }

      // Sort all notifications by date
      notifs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(notifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const handleNotificationPress = (notification: Notification) => {
    // Mark as read (TODO: implement read tracking) 
    
    // Navigate based on notification type
    if (notification.type === "follow") {
      router.push(`/profile/${notification.actor_id}`);
    } else if (notification.post_id) {
      router.push(`/post/${notification.post_id}`);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "like":
        return <Ionicons name="heart" size={28} color="#E53935" />;
      case "dislike":
        return <Ionicons name="heart-dislike" size={28} color="#E53935" />;
      case "reply":
        return <Ionicons name="chatbubble" size={28} color="#1DA1F2" />;
      case "repost":
        return <Ionicons name="repeat" size={28} color="#17BF63" />;
      case "follow":
        return <Ionicons name="person-add" size={28} color="#1DA1F2" />;
      case "quote":
        return <Ionicons name="share" size={28} color="#794BC4" />;
      case "mention":
        return <Ionicons name="at" size={28} color="#1DA1F2" />;
      default:
        return <Ionicons name="notifications" size={28} color="#657786" />;
    }
  };

  const getNotificationText = (notification: Notification) => {
    const actorName = notification.actor_display_name;
    const additionalText = notification.additional_actors
      ? ` and ${notification.additional_actors} other${notification.additional_actors > 1 ? "s" : ""}`
      : "";

    switch (notification.type) {
      case "like":
        return `${actorName}${additionalText} liked your post`;
      case "reply":
        return `${actorName} replied to your post`;
      case "repost":
        return `${actorName}${additionalText} reposted your post`;
      case "follow":
        return `${actorName} followed you`;
      case "quote":
        return `${actorName} quoted your post`;
      case "mention":
        return `${actorName} mentioned you`;
      default:
        return `${actorName} interacted with your post`;
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.is_read && styles.unreadNotification]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>{getNotificationIcon(item.type)}</View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          {item.actor_avatar ? (
            <Image source={{ uri: item.actor_avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={20} color="#657786" />
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.notificationText}>
              <Text style={styles.actorName}>{item.actor_display_name}</Text>
              <Text style={styles.actionText}> {getNotificationText(item).replace(item.actor_display_name, "").trim()}</Text>
            </Text>
            <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
          </View>
        </View>

        {item.post_content && (
          <View style={styles.postPreview}>
            <Text style={styles.postPreviewText} numberOfLines={2}>
              {item.post_content}
            </Text>
          </View>
        )}
      </View>

      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.activeTab]}
          onPress={() => setActiveTab("all")}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>
            All
          </Text>
          {activeTab === "all" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "mentions" && styles.activeTab]}
          onPress={() => setActiveTab("mentions")}
        >
          <Text style={[styles.tabText, activeTab === "mentions" && styles.activeTabText]}>
            Mentions
          </Text>
          {activeTab === "mentions" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>
    </View>
  );

  const filteredNotifications =
    activeTab === "mentions"
      ? notifications.filter((n) => n.type === "mention")
      : notifications;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      <FlatList
        data={filteredNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          filteredNotifications.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={64} color="#AAB8C2" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>
              When someone likes, replies, or follows you, you'll see it here.
            </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#EFF3F4",
    backgroundColor: "#FFFFFF",
  },
  tabContainer: {
    flexDirection: "row",
    height: 53,
  },
  tab: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  activeTab: {
    // Tab becomes active
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#536471",
  },
  activeTabText: {
    color: "#0F1419",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 4,
    width: "100%",
    backgroundColor: "#1DA1F2",
    borderRadius: 2,
  },
  notificationItem: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF3F4",
    backgroundColor: "#FFFFFF",
  },
  unreadNotification: {
    backgroundColor: "#F7F9FA",
  },
  iconContainer: {
    width: 40,
    alignItems: "center",
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: "#EFF3F4",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  notificationText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#0F1419",
  },
  actorName: {
    fontWeight: "700",
    color: "#0F1419",
  },
  actionText: {
    fontWeight: "400",
    color: "#0F1419",
  },
  timestamp: {
    fontSize: 13,
    color: "#536471",
    marginTop: 2,
  },
  postPreview: {
    marginTop: 8,
    marginLeft: 40,
    padding: 12,
    backgroundColor: "#F7F9FA",
    borderLeftWidth: 2,
    borderLeftColor: "#CFD9DE",
    borderRadius: 4,
  },
  postPreviewText: {
    fontSize: 14,
    color: "#536471",
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1DA1F2",
    marginLeft: 8,
    marginTop: 6,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F1419",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#536471",
    textAlign: "center",
    lineHeight: 20,
  },
});