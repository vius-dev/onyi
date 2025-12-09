import { useAuth } from '@/contexts/AuthContext';
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import PostCard from "../../components/PostCard";

const fetchUser = async (userId: string): Promise<User | null> => {
    // Basic validation
    if (!userId) return null;

    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;
        return data as User;
    } catch (error: any) {
        console.error("Error fetching user:", error);
        return null;
    }
};

const fetchUserPosts = async (userId: string, currentUserId?: string): Promise<Post[]> => {
    if (!userId) return [];

    try {
        // Fetch posts with joined user and counts AND POLLS
        const { data: postsData, error } = await supabase
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
            .eq("author_id", userId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        if (!postsData) return [];

        // Fetch current user's reactions
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

        // Map data to Post model
        return postsData.map((p: any) => {
            // Handle Poll Mapping
            let poll = undefined;
            if (p.post_polls && p.post_polls.length > 0) {
                const rawPoll = p.post_polls[0];
                const options = rawPoll.options || [];
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
                text: p.content,
                user: p.user, // User is joined
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
            };
        }) as Post[];

    } catch (error: any) {
        console.error("Error fetching posts:", error);
        return [];
    }
};

export default function ProfileScreen() {
    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [activeTab, setActiveTab] = useState("Posts");
    const [loading, setLoading] = useState(true);
    const [currentProfile, setCurrentProfile] = useState<User | null>(null);

    const router = useRouter();
    const { id } = useLocalSearchParams();
    const userId = Array.isArray(id) ? id[0] : id;
    const { user: authUser, signOut } = useAuth();

    const isOwnProfile = authUser?.id === userId;

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

    useFocusEffect(
        useCallback(() => {
            if (!userId) return;

            const load = async () => {
                setLoading(true);
                const u = await fetchUser(userId);
                setUser(u);
                const p = await fetchUserPosts(userId, authUser?.id);
                setPosts(p);
                setLoading(false);
            };

            load();
        }, [userId, authUser?.id])
    );

    const onLike = async (postId: string) => {
        if (!authUser) return;
        setPosts((current) => current.map((p) => {
            if (p.id !== postId) return p;
            const wasLiked = p.my_reaction === "like";
            const wasDisliked = p.my_reaction === "dislike";
            if (wasLiked) {
                return { ...p, my_reaction: null, like_count: p.like_count - 1 };
            } else {
                return { ...p, my_reaction: "like", like_count: p.like_count + 1, dislike_count: wasDisliked ? p.dislike_count - 1 : p.dislike_count };
            }
        }));

        try {
            const post = posts.find(p => p.id === postId);
            const wasLiked = post?.my_reaction === "like";
            if (wasLiked) {
                await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", authUser.id).eq("type", "like");
            } else {
                await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", authUser.id);
                await supabase.from("post_reactions").insert({ post_id: postId, user_id: authUser.id, type: "like" });
            }
        } catch (e) {
            console.error("Error liking post", e);
        }
    };

    const onDislike = async (postId: string) => {
        if (!authUser) return;
        setPosts((current) => current.map((p) => {
            if (p.id !== postId) return p;
            const wasLiked = p.my_reaction === "like";
            const wasDisliked = p.my_reaction === "dislike";
            if (wasDisliked) {
                return { ...p, my_reaction: null, dislike_count: p.dislike_count - 1 };
            } else {
                return { ...p, my_reaction: "dislike", dislike_count: p.dislike_count + 1, like_count: wasLiked ? p.like_count - 1 : p.like_count };
            }
        }));

        try {
            const post = posts.find(p => p.id === postId);
            const wasDisliked = post?.my_reaction === "dislike";
            if (wasDisliked) {
                await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", authUser.id).eq("type", "dislike");
            } else {
                await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", authUser.id);
                await supabase.from("post_reactions").insert({ post_id: postId, user_id: authUser.id, type: "dislike" });
            }
        } catch (e) {
            console.error("Error disliking post", e);
        }
    };

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

    if (loading) return <View style={styles.container}><Text style={{ alignSelf: 'center', marginTop: 50 }}>Loading profile...</Text></View>;
    if (!user) return <View style={styles.container}><Text style={{ alignSelf: 'center', marginTop: 50 }}>User not found</Text></View>;

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

                {isOwnProfile && (
                    <TouchableOpacity onPress={signOut} style={styles.logoutButton}>
                        <Ionicons name="log-out-outline" size={24} color="white" />
                    </TouchableOpacity>
                )}
            </ImageBackground>

            {/* Profile picture & button */}
            <View style={styles.profileHeader}>
                <Image
                    source={{
                        uri: user.profile_picture_url || "https://via.placeholder.com/150",
                    }}
                    style={styles.profilePicture}
                />

                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={isOwnProfile ? () => router.push('/edit-profile') : () => { }}
                >
                    <Text style={styles.actionButtonText}>
                        {isOwnProfile ? "Edit Profile" : "Follow"}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Basic Info */}
            <View style={styles.userInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.displayName}>{user.display_name}</Text>
                    <Text style={[styles.username, { marginLeft: 5 }]}>@{user.username}</Text>
                </View>

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
            contentContainerStyle={{ paddingBottom: 120, backgroundColor: 'white' }}
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
    logoutButton: {
        position: "absolute",
        top: 40,
        right: 10,
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
