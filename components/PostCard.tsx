import { Post } from '@/models/Post';
import { User } from '@/models/User';
import { formatRelativeTime } from '@/utils/time';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ImageViewer from './ImageViewer';
import Poll from './Poll'; // Assuming you have a Poll component

interface PostCardProps {
  post: Post;
  currentUser?: User;
  isDetailView?: boolean;
  onLike?: (postId: string) => void;
  onDislike?: (postId: string) => void;
  onRepost?: (postId: string) => void;
  onQuote?: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onVote?: (pollId: string, optionIds: string[]) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  isDetailView = false,
  onLike = () => { },
  onDislike = () => { },
  onRepost = () => { },
  onQuote = () => { },
  onDelete = () => { },
  onVote = () => { },
}) => {
  const router = useRouter();

  // -----------------------------------------------------------
  // State
  // -----------------------------------------------------------
  // Derived state from props
  const liked = post.my_reaction === 'like';
  const disliked = post.my_reaction === 'dislike';
  const [reposted, setReposted] = useState(false);

  // Image viewer state
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [initialImageIndex, setInitialImageIndex] = useState(0);

  // Helpers
  const isOwner = currentUser?.id === post?.user?.id;
  const hasChildren = Array.isArray(post.child_posts) && post.child_posts.length > 0;
  const firstChild = hasChildren ? post.child_posts![0] : null;
  const childCount = hasChildren ? post.child_posts!.length : 0;

  // If post is soft-deleted, render placeholder (deleted node)
  if (post.is_deleted) {
    return (
      <View style={[styles.container, styles.deletedContainer]}>
        <Text style={styles.deletedText}>This post was deleted.</Text>
      </View>
    );
  }

  // Navigation handlers
  const goToProfile = () => {
    if (!post.user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${post.user.id}`);
  };

  const openPostDetail = () => {
    // Don't navigate if already in detail view
    if (isDetailView) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/post/${post.id}`);
  };

  // -----------------------------------------------------------
  // Action Handlers
  // -----------------------------------------------------------
  const handleLike = () => {
    onLike(post.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDislike = () => {
    onDislike(post.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRepost = () => {
    setReposted(true); // Immediate feedback
    onRepost(post.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleQuote = () => {
    onQuote(post);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(post.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
      { cancelable: true }
    );

  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/edit-post?id=${post.id}` as any);
  };

  const handleContinueThread = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to create post with thread context
    const threadId = post.thread_id || post.id; // Use existing thread_id or start new thread
    const nextSequence = (post.sequence_number || 0) + 1;
    router.push(`/create-post?thread_id=${threadId}&sequence=${nextSequence}` as any);
  };

  const handleMenu = () => {
    if (!isOwner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const options = [
      { text: 'Edit Post', onPress: handleEdit },
      { text: 'Continue Thread', onPress: handleContinueThread },
      { text: 'Delete Post', onPress: handleDelete, style: 'destructive' as const },
      { text: 'Cancel', style: 'cancel' as const },
    ];

    Alert.alert(
      'Post Options',
      'Choose an action',
      options,
      { cancelable: true }
    );
  };

  const handleVote = (pollId: string, optionIds: string[]) => {
    onVote(pollId, optionIds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openImageViewer = (index: number) => {
    setInitialImageIndex(index);
    setImageViewerVisible(true);
  };

  // -----------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={goToProfile} style={styles.avatarContainer}>
        {post.user?.profile_picture_url && (
          <Image source={{ uri: post.user.profile_picture_url }} style={styles.avatar} />
        )}
      </TouchableOpacity>
      <View style={styles.userInfo}>
        <TouchableOpacity onPress={goToProfile} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.displayName}>{post.user?.display_name || 'Unknown User'}</Text>
          <Text style={[styles.username, { marginLeft: 5 }]}>@{post.user?.username}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.timeAgo}>{formatRelativeTime(post.created_at)}</Text>
      {/* Thread indicator */}
      {post.thread_id && post.sequence_number && (
        <View style={styles.threadBadge}>
          <Text style={styles.threadBadgeText}>{post.sequence_number}/{post.thread_posts?.length || '?'}</Text>
        </View>
      )}
      {isOwner && (
        <TouchableOpacity onPress={handleMenu} style={{ padding: 5, marginLeft: 'auto' }}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#657786" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderThreadIndicator = () => {
    if (!post.thread_id || !post.sequence_number) return null;

    const totalInThread = post.thread_posts?.length || post.sequence_number;
    const isFirstInThread = post.sequence_number === 1;
    const isLastInThread = post.sequence_number === totalInThread;

    return (
      <View style={styles.threadIndicatorContainer}>
        {!isFirstInThread && <View style={styles.threadLineTop} />}
        <View style={styles.threadDot} />
        {!isLastInThread && <View style={styles.threadLineBottom} />}
      </View>
    );
  };


  const renderMedia = () => {
    if (!post.media || post.media.length === 0) return null;

    const images = post.media.map((m) => ({ url: m.url }));

    return (
      <>
        <View style={styles.mediaContainer}>
          {post.media.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => openImageViewer(index)}
              style={styles.mediaItem}
            >
              <Image source={{ uri: item.url }} style={styles.mediaImage} />
            </TouchableOpacity>
          ))}
        </View>
        <ImageViewer
          images={images}
          visible={imageViewerVisible}
          initialIndex={initialImageIndex}
          onClose={() => setImageViewerVisible(false)}
        />
      </>
    );
  };

  const renderPoll = () => {
    if (!post.poll) return null;
    return <Poll poll={post.poll} onVote={(pollId, optionIds) => handleVote(pollId, optionIds)} />;
  };

  const renderQuotedPost = () => {
    if (!post.quoted_post) return null;
    return (
      <View style={styles.quotedContainer}>
        <PostCard
          post={post.quoted_post}
          currentUser={currentUser}
        // Pass down handlers if needed, or disable actions on quoted posts
        />
      </View>
    );
  };

  const renderActions = () => (
    <View style={styles.actionsContainer}>
      <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? '#E53935' : '#657786'}
        />
        <Text style={styles.actionCount}>{post.like_count}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleDislike}>
        <Ionicons
          name={disliked ? 'heart-dislike' : 'heart-dislike-outline'}
          size={20}
          color={disliked ? '#1DA1F2' : '#657786'}
        />
        <Text style={styles.actionCount}>{post.dislike_count}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={() => router.push(`/create-post?reply_to=${post.id}`)}>
        <Ionicons name="chatbubble-outline" size={20} color="#657786" />
        <Text style={styles.actionCount}>{post.reply_count || 0}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleRepost}>
        <Ionicons name="repeat-outline" size={20} color="#657786" />
        <Text style={styles.actionCount}>{post.repost_count}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleQuote}>
        <Ionicons name="share-outline" size={20} color="#657786" />
      </TouchableOpacity>
    </View>
  );

  // Preview of the thread child (in feed view)
  const renderThreadChildPreview = () => {
    if (!hasChildren || isDetailView) return null;
    return (
      <View style={styles.childPreviewContainer}>
        <View style={styles.childAvatarContainer}>
          {firstChild?.user?.profile_picture_url && (
            <Image
              source={{ uri: firstChild.user.profile_picture_url }}
              style={styles.childAvatar}
            />
          )}
        </View>
        <View style={styles.childTextContainer}>
          <Text style={styles.childText}>
            Replying to <Text style={styles.parentUsername}>@{post.user.username}</Text>
          </Text>
          <Text numberOfLines={2} style={styles.childSnippet}>
            {firstChild?.content}
          </Text>
          {childCount > 1 && (
            <Text style={styles.moreReplies}>View {childCount - 1} more replies</Text>
          )}
        </View>
      </View>
    );
  };

  // Full thread children (detail view): render recursively below this card
  const renderThreadChildren = () => {
    // Always show nested comments/replies, not just in detail view
    console.log(`🔍 PostCard ${post.id}: hasChildren=${hasChildren}, child_posts=${post.child_posts?.length || 0}`);
    if (!hasChildren) return null;

    console.log(`✅ Rendering ${post.child_posts!.length} children for post ${post.id}`);
    return (
      <View style={styles.childrenContainer}>
        {post.child_posts!.map((ch, idx) => (
          <PostCard
            key={ch.id}
            post={ch}
            currentUser={currentUser}
            onLike={onLike}
            onDislike={onDislike}
            onRepost={onRepost}
            onQuote={onQuote}
            onDelete={onDelete}
            onVote={onVote}
            isDetailView={isDetailView}
          />
        ))}
      </View>
    );
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPostDetail}
        activeOpacity={isDetailView ? 1 : 0.9}
        style={[styles.container, isDetailView && styles.detailContainer]}
      >
        <View style={{ flexDirection: 'row' }}>
          {renderThreadIndicator()}
          <View style={{ flex: 1 }}>
            {renderHeader()}
            <Text style={styles.postText}>{post.content}</Text>
            {renderMedia()}
            {renderPoll()}
            {renderQuotedPost()}
            {renderActions()}
            {renderThreadChildPreview()}
          </View>
        </View>
      </TouchableOpacity>
      {renderThreadChildren()}
    </>
  );
};


const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
    padding: 15,
    backgroundColor: 'white',
  },
  detailContainer: {
    borderBottomWidth: 0, // No bottom border in detail view 
  },
  deletedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  deletedText: {
    color: '#657786',
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  username: {
    color: '#657786',
    fontSize: 15,
  },
  timeAgo: {
    color: '#657786',
    fontSize: 14,
  },
  postText: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    margin: -2, // Offset the padding of the items
    marginBottom: 10,
  },
  mediaItem: {
    padding: 2,
    width: '50%', // Two images per row
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1, // Square images
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  quotedContainer: {
    borderWidth: 1,
    borderColor: '#E1E8ED',
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden', // Clip the child PostCard
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCount: {
    marginLeft: 5,
    color: '#657786',
    fontSize: 14,
  },
  childPreviewContainer: {
    flexDirection: 'row',
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E1E8ED',
  },
  childAvatarContainer: {
    marginRight: 10,
  },
  childAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  childTextContainer: {
    flex: 1,
  },
  childText: {
    color: '#657786',
    marginBottom: 4,
  },
  parentUsername: {
    color: '#1DA1F2', // Or your theme's primary color
  },
  childSnippet: {
    color: '#14171A',
  },
  moreReplies: {
    color: '#1DA1F2',
    marginTop: 4,
  },
  childrenContainer: {
    paddingLeft: 20, // Indent child posts
    borderLeftWidth: 2,
    borderLeftColor: '#E1E8ED',
    marginLeft: 30, // Align with avatar center
  },
  // Thread styles
  threadBadge: {
    backgroundColor: '#1DA1F2',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  threadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  threadIndicatorContainer: {
    width: 4,
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  threadLineTop: {
    width: 2,
    flex: 1,
    backgroundColor: '#1DA1F2',
    position: 'absolute',
    top: 0,
    bottom: '50%',
  },
  threadLineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: '#1DA1F2',
    position: 'absolute',
    top: '50%',
    bottom: 0,
  },
  threadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1DA1F2',
    position: 'absolute',
    top: '50%',
    marginTop: -4,
  },
});

export default PostCard;