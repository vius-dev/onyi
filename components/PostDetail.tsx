import PostCard from '@/components/PostCard';
import { useAuth } from '@/contexts/AuthContext';
import { Post } from '@/models/Post';
import { User } from '@/models/User';
import { fetchPostDetail } from '@/utils/postUtils';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PostDetailProps {
    postId: string;
}

export default function PostDetail({ postId }: PostDetailProps) {
    const router = useRouter();
    const { user: authUser } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const [scrolledToMain, setScrolledToMain] = useState(false);
    const itemLayouts = useRef<{ [key: string]: number }>({}); // Store Y positions

    const [currentProfile, setCurrentProfile] = useState<User | null>(null);
    const [mainPost, setMainPost] = useState<Post | null>(null);
    const [parentPost, setParentPost] = useState<Post | null>(null);
    const [threadStack, setThreadStack] = useState<Post[]>([]);
    const [replies, setReplies] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    // Fetch post detail
    useEffect(() => {
        if (!postId) return;

        const load = async () => {
            setLoading(true);
            setError(null);
            const result = await fetchPostDetail(postId, authUser?.id);

            if (!result) {
                setError("Post not found");
                setLoading(false);
                return;
            }

            setMainPost(result.mainPost);
            setParentPost(result.parentPost);
            setThreadStack(result.threadStack || []);
            setReplies(result.replies);
            setLoading(false);
        };

        load();
    }, [postId, authUser?.id]);

    // Interaction handlers
    const handleLike = async (targetPostId: string) => {
        if (!authUser) return;

        // Optimistic update
        const updatePost = (p: Post): Post => {
            if (p.id !== targetPostId) return p;
            const wasLiked = p.my_reaction === "like";
            const wasDisliked = p.my_reaction === "dislike";
            if (wasLiked) {
                return { ...p, my_reaction: null as null, like_count: p.like_count - 1 };
            } else {
                return { ...p, my_reaction: "like" as const, like_count: p.like_count + 1, dislike_count: wasDisliked ? p.dislike_count - 1 : p.dislike_count };
            }
        };

        if (mainPost?.id === targetPostId) setMainPost(updatePost(mainPost));
        if (parentPost?.id === targetPostId) setParentPost(updatePost(parentPost));
        setThreadStack(current => current.map(updatePost));
        setReplies(current => current.map(updatePost));

        // Persist
        try {
            const wasLiked = (mainPost?.id === targetPostId ? mainPost : replies.find(r => r.id === targetPostId))?.my_reaction === "like";
            if (wasLiked) {
                await supabase.from("post_reactions").delete().eq("post_id", targetPostId).eq("user_id", authUser.id).eq("type", "like");
            } else {
                await supabase.from("post_reactions").delete().eq("post_id", targetPostId).eq("user_id", authUser.id);
                await supabase.from("post_reactions").insert({ post_id: targetPostId, user_id: authUser.id, type: "like" });
            }
        } catch (e) {
            console.error("Error liking post", e);
        }
    };

    const handleDislike = async (targetPostId: string) => {
        if (!authUser) return;

        const updatePost = (p: Post): Post => {
            if (p.id !== targetPostId) return p;
            const wasLiked = p.my_reaction === "like";
            const wasDisliked = p.my_reaction === "dislike";
            if (wasDisliked) {
                return { ...p, my_reaction: null as null, dislike_count: p.dislike_count - 1 };
            } else {
                return { ...p, my_reaction: "dislike" as const, dislike_count: p.dislike_count + 1, like_count: wasLiked ? p.like_count - 1 : p.like_count };
            }
        };

        if (mainPost?.id === targetPostId) setMainPost(updatePost(mainPost));
        if (parentPost?.id === targetPostId) setParentPost(updatePost(parentPost));
        setThreadStack(current => current.map(updatePost));
        setReplies(current => current.map(updatePost));

        try {
            const wasDisliked = (mainPost?.id === targetPostId ? mainPost : replies.find(r => r.id === targetPostId))?.my_reaction === "dislike";
            if (wasDisliked) {
                await supabase.from("post_reactions").delete().eq("post_id", targetPostId).eq("user_id", authUser.id).eq("type", "dislike");
            } else {
                await supabase.from("post_reactions").delete().eq("post_id", targetPostId).eq("user_id", authUser.id);
                await supabase.from("post_reactions").insert({ post_id: targetPostId, user_id: authUser.id, type: "dislike" });
            }
        } catch (e) {
            console.error("Error disliking post", e);
        }
    };

    const handleRepost = (postId: string) => console.log('Repost', postId);
    const handleQuote = (post: Post) => router.push(`/create-post?quote=${post.id}`);
    const handleDelete = (postId: string) => console.log('Delete', postId);
    const handleVote = (pollId: string, optionIds: string[]) => console.log('Vote', pollId, optionIds);

    // Loading state
    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#1DA1F2" style={{ marginTop: 50 }} />
            </View>
        );
    }

    // Error state
    if (error || !mainPost) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>{error || "Post not found"}</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            {/* Parent context (only if parent is NOT part of the thread stack) */}
            {parentPost && (!threadStack.some(p => p.id === parentPost.id)) && (
                <TouchableOpacity
                    onPress={() => router.push(`/post/${parentPost.id}`)}
                    style={styles.parentContext}
                >
                    <Text style={styles.replyingTo}>
                        Replying to @{parentPost.user.username}
                    </Text>
                    <PostCard
                        post={parentPost}
                        currentUser={currentProfile || undefined}
                        onLike={handleLike}
                        onDislike={handleDislike}
                    />
                </TouchableOpacity>
            )}

            {/* Thread Stack or Single Main Post */}
            {threadStack.length > 0 ? (
                <View style={styles.threadContainer}>
                    {threadStack.map((post, index) => {
                        const isMain = post.id === mainPost.id;
                        return (
                            <View key={post.id} style={!isMain ? styles.threadItem : undefined}>
                                <PostCard
                                    post={post}
                                    isDetailView={isMain}
                                    currentUser={currentProfile || undefined}
                                    onLike={handleLike}
                                    onDislike={handleDislike}
                                    onRepost={handleRepost}
                                    onQuote={handleQuote}
                                    onDelete={handleDelete}
                                    onVote={handleVote}
                                />
                                {/* Connector line could go here */}
                                {index < threadStack.length - 1 && (
                                    <View style={styles.threadConnector} />
                                )}
                            </View>
                        );
                    })}
                </View>
            ) : (
                <PostCard
                    post={mainPost}
                    isDetailView={true}
                    currentUser={currentProfile || undefined}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onRepost={handleRepost}
                    onQuote={handleQuote}
                    onDelete={handleDelete}
                    onVote={handleVote}
                />
            )}

            {/* Reply input */}
            <TouchableOpacity
                style={styles.replyButton}
                onPress={() => router.push(`/create-post?reply_to=${postId}`)}
            >
                <Ionicons name="chatbubble-outline" size={20} color="#1DA1F2" />
                <Text style={styles.replyButtonText}>Reply to this post</Text>
            </TouchableOpacity>

            {/* Replies section */}
            {replies.length > 0 && (
                <View style={styles.repliesSection}>
                    <Text style={styles.repliesHeader}>Replies ({mainPost.reply_count})</Text>
                    {replies.map(reply => (
                        <View key={reply.id} style={styles.replyContainer}>
                            <PostCard
                                post={reply}
                                currentUser={currentProfile || undefined}
                                onLike={handleLike}
                                onDislike={handleDislike}
                                onRepost={handleRepost}
                                onQuote={handleQuote}
                                onDelete={handleDelete}
                                onVote={handleVote}
                            />

                            {/* Show more replies button (if reply has children) */}
                            {(reply.reply_count ?? 0) > 0 && (
                                <TouchableOpacity
                                    onPress={() => router.push(`/post/${reply.id}`)}
                                    style={styles.showMoreButton}
                                >
                                    <Text style={styles.showMoreText}>
                                        View {reply.reply_count} {reply.reply_count === 1 ? 'reply' : 'replies'}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={16} color="#1DA1F2" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            )}

            {/* No replies state */}
            {replies.length === 0 && (
                <View style={styles.noReplies}>
                    <Text style={styles.noRepliesText}>No replies yet. Be the first to reply!</Text>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    parentContext: {
        padding: 15,
        backgroundColor: '#f8f9fa',
        borderBottomWidth: 1,
        borderBottomColor: '#e1e8ed',
    },
    replyingTo: {
        fontSize: 14,
        color: '#657786',
        marginBottom: 10,
    },
    replyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e1e8ed',
        gap: 10,
    },
    replyButtonText: {
        fontSize: 16,
        color: '#1DA1F2',
        fontWeight: '600',
    },
    repliesSection: {
        marginTop: 10,
    },
    repliesHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        padding: 15,
        backgroundColor: '#f8f9fa',
    },
    replyContainer: {
        borderBottomWidth: 1,
        borderBottomColor: '#e1e8ed',
    },
    showMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingLeft: 60,
        gap: 5,
    },
    showMoreText: {
        fontSize: 14,
        color: '#1DA1F2',
        fontWeight: '600',
    },
    noReplies: {
        padding: 40,
        alignItems: 'center',
    },
    noRepliesText: {
        fontSize: 16,
        color: '#657786',
        textAlign: 'center',
    },
    errorText: {
        textAlign: 'center',
        marginTop: 50,
        fontSize: 18,
        color: '#e0245e',
        fontWeight: '600',
    },
    backButton: {
        marginTop: 20,
        alignSelf: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#1DA1F2',
        borderRadius: 20,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    threadContainer: {
        backgroundColor: '#fff',
    },
    threadItem: {
        // Optional: add opacity or specific style for non-main posts
    },
    threadConnector: {
        width: 2,
        backgroundColor: '#e1e8ed',
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 20, // Adjust based on avatar position
        zIndex: -1,
    }
});
