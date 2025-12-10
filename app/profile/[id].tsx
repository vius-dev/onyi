import { useAuth } from "@/contexts/AuthContext";
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from "expo-router";
import {
    useCallback,
    useEffect,
    useState,
} from "react";
import {
    BackHandler,
    FlatList,
    Image,
    ImageBackground,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import PostCard from "../../components/PostCard";
import { Poll } from "@/models/Poll";

// Map poll data from Supabase RPC to Poll interface
function mapPollData(rawPoll: any, currentUserId?: string): Poll | undefined {
    if (!rawPoll) return undefined;

    const options = (rawPoll.options || []).map((opt: any) => ({
        id: opt.id,
        text: opt.text,
        votes: opt.votes || 0,
    }));

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

// ---------------------------------------------------------------------
// Fetch Functions
// ---------------------------------------------------------------------

const fetchUser = async (userId: string): Promise<User | null> => {
    if (!userId) return null;

    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;
        return data as User;
    } catch (error) {
        console.error("Error fetching user:", error);
        return null;
    }
};

const fetchUserPosts = async (
    userId: string,
    currentUserId?: string
): Promise<Post[]> => {
    if (!userId) return [];

    try {
        const { data: postsData, error } = await supabase
            .from("posts")
            .select(`
                *,
                user:profiles(*),
                post_reactions(count),
                post_reposts(count),
                post_quotes:post_quotes!post_quotes_quote_post_id_fkey(count),
                thread_posts:posts!thread_id(count)
            `)
            .eq("author_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

        if (error) throw error;
        if (!postsData) return [];

        // Also fetch thread details for posts that belong to a thread
        const threadPosts = postsData.filter(p => p.thread_id);
        if (threadPosts.length > 0) {
            // We'll get the actual thread posts to count sequence numbers
            const threadIds = [...new Set(threadPosts.map(p => p.thread_id))];

            for (const threadId of threadIds) {
                const { data: threadData } = await supabase
                    .from("posts")
                    .select("id, sequence_number")
                    .eq("thread_id", threadId)
                    .eq("is_reply", false) // Only count thread posts
                    .order("sequence_number", { ascending: true });

                if (threadData) {
                    // Add thread_total to each post
                    postsData.forEach(post => {
                        if (post.thread_id === threadId) {
                            post.thread_total = threadData.length;
                        }
                    });
                }
            }
        }

        // Fetch current user's reactions
        const myReactionsMap = new Map<string, string>();
        if (currentUserId) {
            const postIds = postsData.map((p) => p.id);

            const { data: reactionsData } = await supabase
                .from("post_reactions")
                .select("post_id, type")
                .in("post_id", postIds)
                .eq("user_id", currentUserId);

            reactionsData?.forEach((r) =>
                myReactionsMap.set(r.post_id, r.type)
            );
        }

        // Fetch polls for all posts
        const postIds = postsData.map(p => p.id);
        const pollsMap = new Map<string, Poll>();

        const { data: pollsData } = await supabase
            .from("polls")
            .select("id, post_id")
            .in("post_id", postIds);

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

        // Map data to Post model
        return postsData.map((p: any) => {
            return {
                ...p,
                text: p.content,
                user: p.user,
                like_count: p.post_reactions?.[0]?.count || 0,
                repost_count: p.post_reposts?.[0]?.count || 0,
                quote_count: p.post_quotes?.[0]?.count || 0,
                reply_count: p.reply_count || 0,
                dislike_count: 0,
                is_deleted: !!p.deleted_at,
                my_reaction: myReactionsMap.get(p.id) || null,
                poll: pollsMap.get(p.id), // Attach poll data from RPC
                thread_id: p.thread_id,
                sequence_number: p.sequence_number,
                thread_total: p.thread_total || (p.thread_posts?.[0]?.count || 0),
                is_reply: p.is_reply,
            };
        });
    } catch (error) {
        console.error("Error fetching posts:", error);
        return [];
    }
};

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function ProfileScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const userId = Array.isArray(id) ? id[0] : id;

    const { user: authUser, signOut } = useAuth();

    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [currentProfile, setCurrentProfile] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState("Posts");
    const [loading, setLoading] = useState(true);

    const isOwnProfile = authUser?.id === userId;

    // Load logged-in profile
    useEffect(() => {
        if (!authUser) return;

        supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) setCurrentProfile(data as User);
            });
    }, [authUser]);

    // Load profile + posts on focus
    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const loadProfile = async () => {
                setLoading(true);
                const fetchedUser = await fetchUser(userId);
                const fetchedPosts = await fetchUserPosts(
                    userId as string,
                    authUser?.id
                );

                if (isActive) {
                    setUser(fetchedUser);
                    setPosts(fetchedPosts);
                    setLoading(false);
                }
            };

            loadProfile();
            return () => {
                isActive = false;
            };
        }, [userId, authUser?.id])
    );

    // Device back button handler (Android)
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace("/");
                }
                return true; // prevent default behavior
            };

            const subscription = BackHandler.addEventListener(
                "hardwareBackPress",
                onBackPress
            );

            return () => subscription.remove();
        }, [router])
    );


    // Reaction handlers
    const onLike = async (postId: string) => {
        if (!authUser) return;

        setPosts((prev) =>
            prev.map((p) => {
                if (p.id !== postId) return p;

                const wasLiked = p.my_reaction === "like";
                const wasDisliked = p.my_reaction === "dislike";

                return {
                    ...p,
                    my_reaction: wasLiked ? null : "like",
                    like_count: wasLiked ? p.like_count - 1 : p.like_count + 1,
                    dislike_count: wasDisliked ? p.dislike_count - 1 : p.dislike_count,
                };
            })
        );

        try {
            const existing = posts.find((p) => p.id === postId);
            const wasLiked = existing?.my_reaction === "like";

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
        } catch (e) {
            console.error("Error liking post", e);
        }
    };

    const onDislike = async (postId: string) => {
        if (!authUser) return;

        setPosts((prev) =>
            prev.map((p) => {
                if (p.id !== postId) return p;

                const wasLiked = p.my_reaction === "like";
                const wasDisliked = p.my_reaction === "dislike";

                return {
                    ...p,
                    my_reaction: wasDisliked ? null : "dislike",
                    dislike_count: wasDisliked ? p.dislike_count - 1 : p.dislike_count + 1,
                    like_count: wasLiked ? p.like_count - 1 : p.like_count,
                };
            })
        );

        try {
            const existing = posts.find((p) => p.id === postId);
            const wasDisliked = existing?.my_reaction === "dislike";

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
        } catch (e) {
            console.error("Error disliking post", e);
        }
    };

    // Render Posts
    const renderPost = useCallback(
        ({ item }: { item: Post }) => (
            <View style={styles.postContainer}>
                <PostCard
                    post={item}
                    currentUser={currentProfile || undefined}
                    onLike={onLike}
                    onDislike={onDislike}
                />
            </View>
        ),
        [currentProfile, posts]
    );

    // ------------------------------------------------------------------
    // Header Component
    // ------------------------------------------------------------------

    const ListHeader = () => (
        <View>
            {/* Cover Photo (no back button) */}
            <ImageBackground
                source={
                    user?.cover_photo_url
                        ? { uri: user.cover_photo_url }
                        : require("../../assets/images/default-cover.png")
                }
                style={styles.coverPhoto}
            />

            {/* Profile Header */}
            <View style={styles.profileHeader}>
                <Image
                    source={{
                        uri:
                            user?.profile_picture_url ||
                            "https://via.placeholder.com/150",
                    }}
                    style={styles.profilePicture}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 50 }}>
                    {isOwnProfile ? (
                        <>
                            {/* Edit Profile */}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => router.push("/edit-profile")}
                            >
                                <Text style={styles.actionButtonText}>
                                    Edit Profile
                                </Text>
                            </TouchableOpacity>

                            {/* Logout */}
                            <TouchableOpacity
                                style={[styles.actionButton, { borderColor: "red" }]}
                                onPress={signOut}
                            >
                                <Text
                                    style={[
                                        styles.actionButtonText,
                                        { color: "red" },
                                    ]}
                                >
                                    Logout
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity style={styles.actionButton}>
                            <Text style={styles.actionButtonText}>Follow</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* User Info */}
            <View style={styles.userInfo}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.displayName}>{user?.display_name}</Text>
                    <Text style={styles.username}>@{user?.username}</Text>
                </View>

                {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}

                <View style={styles.metaInfo}>
                    {user?.location && (
                        <Text style={styles.metaText}>
                            <Ionicons name="location-outline" size={14} />{" "}
                            {user.location}
                        </Text>
                    )}

                    {user?.website && (
                        <Text style={[styles.metaText, styles.link]}>
                            <Ionicons name="link-outline" size={14} />{" "}
                            {user.website}
                        </Text>
                    )}

                    <Text style={styles.metaText}>
                        <Ionicons name="calendar-outline" size={14} /> Joined{" "}
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString(
                            "en-US",
                            {
                                month: "long",
                                year: "numeric",
                            }
                        ) : null}
                    </Text>
                </View>

                <View style={styles.followStats}>
                    <Text style={styles.followText}>
                        <Text style={styles.followCount}>
                            {user?.following_count || 0}
                        </Text>{" "}
                        Following
                    </Text>

                    <Text style={styles.followText}>
                        <Text style={styles.followCount}>
                            {user?.followers_count || 0}
                        </Text>{" "}
                        Followers
                    </Text>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {[
                    "Posts",
                    ...(isOwnProfile ? ["Posts & replies"] : []),
                    "Media",
                ].map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        onPress={() => setActiveTab(tab)}
                        style={[
                            styles.tab,
                            activeTab === tab && styles.activeTab,
                        ]}
                    >
                        <Text
                            style={[
                                styles.tabText,
                                activeTab === tab && styles.activeTabText,
                            ]}
                        >
                            {tab}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {activeTab !== "Posts" && (
                <View style={styles.nonPostContent}>
                    <Text style={styles.tabContent}>
                        {activeTab} coming soon.
                    </Text>
                </View>
            )}
        </View>
    );

    // ------------------------------------------------------------------

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={{ alignSelf: "center", marginTop: 50 }}>
                    Loading profile...
                </Text>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.container}>
                <Text style={{ alignSelf: "center", marginTop: 50 }}>
                    User not found
                </Text>
            </View>
        );
    }

    return (
        <FlatList
            data={activeTab === "Posts" ? posts : []}
            renderItem={renderPost}
            keyExtractor={(item) => item.id.toString()}
            ListHeaderComponent={<ListHeader />}
            contentContainerStyle={{
                paddingBottom: 120,
                backgroundColor: "white",
            }}
            showsVerticalScrollIndicator={false}
        />
    );
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "white",
    },
    coverPhoto: {
        height: 150,
        backgroundColor: "#ccc",
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
        borderColor: "white",
    },
    actionButton: {
        borderColor: "#1DA1F2",
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 15,
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
        marginLeft: 5,
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
