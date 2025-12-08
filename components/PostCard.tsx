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
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
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
    setLiked(!liked);
    if (disliked) setDisliked(false);
    onLike(post.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDislike = () => {
    setDisliked(!disliked);
    if (liked) setLiked(false);
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
        <TouchableOpacity onPress={goToProfile}>
          <Text style={styles.displayName}>{post.user?.display_name || 'Unknown User'}</Text>
          <Text style={styles.username}>@{post.user?.username}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.timeAgo}>{formatRelativeTime(post.created_at)}</Text>
    </View>
  );

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
      {isOwner && (
        <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#E53935" />
        </TouchableOpacity>
      )}
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
            {firstChild?.text}
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
    if (!hasChildren || !isDetailView) return null;
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
            isDetailView={true}
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
        {renderHeader()}
        <Text style={styles.postText}>{post.text}</Text>
        {renderMedia()}
        {renderPoll()}
        {renderQuotedPost()}
        {renderActions()}
        {renderThreadChildPreview()}
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
    alignItems: 'flex-start',
    marginBottom: 10,
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
});

export default PostCard;