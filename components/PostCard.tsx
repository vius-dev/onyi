import { Post } from '@/models/Post';
import { User } from '@/models/User';
import { formatRelativeTime } from '@/utils/time';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ImageViewer from './ImageViewer';
import Poll from './Poll';

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
  isNested?: boolean;
  depth?: number;
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
  isNested = false,
  depth = 0,
}) => {
  const router = useRouter();

  const liked = post.my_reaction === 'like';
  const disliked = post.my_reaction === 'dislike';
  const [reposted, setReposted] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [initialImageIndex, setInitialImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const isOwner = currentUser?.id === post?.user?.id;
  const hasChildren = Array.isArray(post.child_posts) && post.child_posts.length > 0;
  const maxDepth = 3; // Maximum nesting depth before collapsing

  const isThreadPost = post.thread_id && post.sequence_number && !post.is_reply; // Replies shouldn't show badges
  const showSequenceBadge = isThreadPost && post.thread_total && post.thread_total > 1;

  // Different background colors for different post types
  const getPostStyle = () => {
    const postStyles: any[] = [styles.container];

    if (post.is_reply) {
      postStyles.push(styles.replyPost);
    } else if (post.thread_id) {
      postStyles.push(styles.threadPost);
    } else {
      postStyles.push(styles.regularPost);
    }

    if (depth > 0) {
      postStyles.push(styles.nestedPost);
      if (depth >= maxDepth) {
        postStyles.push(styles.collapsedNesting);
      }
    }

    if (depth % 2 === 1) {
      postStyles.push(styles.oddDepth);
    } else {
      postStyles.push(styles.evenDepth);
    }

    return postStyles;
  };



  const goToProfile = () => {
    if (!post.user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${post.user.id}`);
  };

  const openPostDetail = () => {
    if (isDetailView) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/post/${post.id}`);
  };

  const handleLike = () => {
    onLike(post.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleDislike = () => {
    onDislike(post.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleRepost = () => {
    setReposted(true);
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
    const threadId = post.thread_id || post.id;
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

    Alert.alert('Post Options', 'Choose an action', options, { cancelable: true });
  };

  const handleVote = (pollId: string, optionIds: string[]) => {
    onVote(pollId, optionIds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openImageViewer = (index: number) => {
    setInitialImageIndex(index);
    setImageViewerVisible(true);
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
              style={[
                styles.mediaItem,
                post.media!.length === 1 && styles.mediaItemSingle,
                post.media!.length === 2 && styles.mediaItemDouble,
                post.media!.length === 3 && index === 0 && styles.mediaItemTripleLarge,
                post.media!.length === 3 && index > 0 && styles.mediaItemTripleSmall,
                post.media!.length === 4 && styles.mediaItemQuad,
              ]}
            >
              <Image source={{ uri: item.url }} style={styles.mediaImage} />
              {post.media!.length > 1 && index === 3 && (
                <View style={styles.moreImagesOverlay}>
                  <Text style={styles.moreImagesText}>+{post.media!.length - 4}</Text>
                </View>
              )}
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
          isNested={true}
          depth={depth + 1}
        />
      </View>
    );
  };

  const renderActionButton = (icon: string, count: number, active: boolean, onPress: () => void, color?: string) => {
    const isColored = count > 0 || active;
    return (
      <TouchableOpacity style={styles.actionButton} onPress={onPress}>
        <View style={[
          styles.actionIconWrapper,
          active && styles.actionIconWrapperActive,
          color && isColored && { backgroundColor: color + '15' }
        ]}>
          <Ionicons
            name={icon as any}
            size={20}
            color={active ? color || '#1DA1F2' : isColored ? color || '#657786' : '#AAB8C2'}
          />
        </View>
        {count > 0 && (
          <Text style={[
            styles.actionCount,
            active && styles.actionCountActive,
            color && isColored && { color }
          ]}>
            {count > 99 ? '99+' : count}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderActions = () => (
    <View style={styles.actionsContainer}>
      {renderActionButton('chatbubble-outline', post.reply_count || 0, false,
        () => router.push(`/create-post?reply_to=${post.id}`), '#1DA1F2')}

      {renderActionButton(
        liked ? 'heart' : 'heart-outline',
        post.like_count,
        liked,
        handleLike,
        '#E0245E'
      )}

      {renderActionButton(
        disliked ? 'heart-dislike' : 'heart-dislike-outline',
        post.dislike_count,
        disliked,
        handleDislike,
        '#1DA1F2'
      )}

      {renderActionButton(
        reposted ? 'repeat' : 'repeat-outline',
        post.repost_count,
        reposted,
        handleRepost,
        '#17BF63'
      )}

      <TouchableOpacity style={styles.actionButton} onPress={handleQuote}>
        <View style={styles.actionIconWrapper}>
          <Ionicons name="share-outline" size={20} color="#AAB8C2" />
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderThreadChildren = () => {
    if (!hasChildren) return null;

    // In feed view (not detail), show collapsed view actionsContainer
    if (!isDetailView) {
      return (
        <TouchableOpacity
          style={styles.collapsedReplies}
          onPress={openPostDetail}
        >
          <View style={styles.replyLine} />
          <View style={styles.collapsedContent}>
            <Image
              source={{ uri: post.child_posts![0].user?.profile_picture_url }}
              style={styles.collapsedAvatar}
            />
            <Text style={styles.collapsedText}>
              {post.child_posts!.length} {post.child_posts!.length === 1 ? 'reply' : 'replies'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#657786" />
          </View>
        </TouchableOpacity>
      );
    }

    // In detail view, show all children with proper nesting
    if (depth >= maxDepth && !expanded) {
      return (
        <TouchableOpacity
          style={styles.collapsedNested}
          onPress={() => setExpanded(true)}
        >
          <Text style={styles.collapsedNestedText}>
            Show {post.child_posts!.length} more {post.child_posts!.length === 1 ? 'reply' : 'replies'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#1DA1F2" />
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.childrenContainer}>
        <View style={[styles.threadLine, { height: '100%', top: 20 }]} />
        {post.child_posts!.map((child, index) => (
          <View key={child.id} style={styles.childWrapper}>
            {index < post.child_posts!.length - 1 && (
              <View style={[styles.threadLine, { height: '100%', top: 20 }]} />
            )}
            <PostCard
              post={child}
              currentUser={currentUser}
              onLike={onLike}
              onDislike={onDislike}
              onRepost={onRepost}
              onQuote={onQuote}
              onDelete={onDelete}
              onVote={onVote}
              isDetailView={isDetailView}
              isNested={true}
              depth={depth + 1}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Thread connection line for nested posts */}
      {isNested && depth > 0 && (
        <View style={[styles.threadConnector, { left: 20 + (depth - 1) * 30 }]} />
      )}

      <TouchableOpacity
        onPress={openPostDetail}
        activeOpacity={isDetailView ? 1 : 0.9}
        style={getPostStyle()}
      >
        {/* Post type indicator */}
        {post.is_reply && (
          <View style={styles.replyIndicator}>
            <Ionicons name="return-up-back" size={16} color="#657786" />
          </View>
        )}

        {/* Thread sequence badge */}
        {/* Thread sequence badge */}
        {showSequenceBadge && (
          <View style={[
            styles.sequenceBadge,
            {
              backgroundColor: post.sequence_number === post.thread_total
                ? '#E0245E' // Last post always Red/Pink
                : [
                  '#17BF63', // 1: Green
                  '#1DA1F2', // 2: Blue
                  '#FFAD1F', // 3: Orange
                  '#794BC4', // 4: Purple
                  '#F45D22', // 5: Deep Orange
                  '#E0245E', // 6: Pink (similar to last but distinct slot)
                  '#878A8C', // 7: Grey
                  '#F91880', // 8: Hot Pink
                  '#00BA7C', // 9: Teal
                  '#7856FF'  // 10: Indigo
                ][(post.sequence_number! - 1) % 10]
            }
          ]}>
            <Text style={styles.sequenceText}>
              {post.sequence_number}/{post.thread_total}
            </Text>
          </View>
        )}

        <View style={styles.postLayout}>
          {/* Avatar with online indicator */}
          <TouchableOpacity onPress={goToProfile} style={styles.avatarContainer}>
            <Image
              source={{ uri: post.user?.profile_picture_url || 'https://via.placeholder.com/150' }}
              style={styles.avatar}
            />
            {!!post.user?.is_online && (
              <View style={styles.onlineIndicator} />
            )}
          </TouchableOpacity>

          {/* Content */}
          <View style={styles.contentContainer}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={goToProfile}>
                <View style={styles.nameRow}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {post.user?.display_name || 'Unknown User'}
                  </Text>
                  {!!post.user?.is_verified && (
                    <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={styles.verifiedBadge} />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.metaRow}>
                <Text style={styles.username}>@{post.user?.username}</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.timeAgo}>{formatRelativeTime(post.created_at)}</Text>
              </View>

              {isOwner && (
                <TouchableOpacity onPress={handleMenu} style={styles.menuButton}>
                  <Ionicons name="ellipsis-horizontal" size={18} color="#657786" />
                </TouchableOpacity>
              )}
            </View>

            {/* Post Body */}
            <View style={styles.postBody}>
              {post.content ? (
                <Text style={styles.postText}>{post.content}</Text>
              ) : null}

              {renderMedia()}
              {renderPoll()}
              {renderQuotedPost()}
            </View>



            {/* Actions */}
            {!isNested && renderActions()}
          </View>
        </View>
      </TouchableOpacity>

      {/* Nested Children */}
      {renderThreadChildren()}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  container: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 0,
    borderRadius: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  regularPost: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 0,
  },
  replyPost: {
    backgroundColor: '#F7F9FA',
    borderLeftWidth: 4,
    borderLeftColor: '#1DA1F2',
  },
  threadPost: {
    backgroundColor: '#F0F8FF',
    borderLeftWidth: 1,
    borderLeftColor: '#17BF63',
  },
  nestedPost: {
    marginLeft: 40,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  collapsedNesting: {
    opacity: 0.9,
  },
  oddDepth: {
    backgroundColor: '#F9F9F9',
  },
  evenDepth: {
    backgroundColor: '#FEFEFE',
  },
  detailContainer: {
    borderBottomWidth: 0,
    marginBottom: 0,
  },
  deletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#F7F9FA',
    borderRadius: 12,
    gap: 8,
  },
  deletedText: {
    color: '#657786',
    fontStyle: 'italic',
    fontSize: 14,
  },
  threadConnector: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#E1E8ED',
    zIndex: -1,
  },
  replyIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  sequenceBadge: {
    position: 'absolute',
    top: 80,
    left: 30, // Typo 'leftt' in prompt fixed to 'left'
    backgroundColor: '#1DA1F2',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 10,
  },
  sequenceText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  postLayout: {
    flexDirection: 'row',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E1E8ED',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  contentContainer: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  displayName: {
    fontWeight: '700',
    fontSize: 16,
    color: '#0F1419',
    marginRight: 4,
  },
  verifiedBadge: {
    marginLeft: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  username: {
    color: '#657786',
    fontSize: 14,
    marginRight: 4,
  },
  separator: {
    color: '#657786',
    fontSize: 14,
    marginHorizontal: 4,
  },
  timeAgo: {
    color: '#657786',
    fontSize: 14,
  },
  menuButton: {
    padding: 4,
    marginLeft: 'auto',
  },
  postBody: {
    marginTop: 4,
  },
  postText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0F1419',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 2,
  },
  mediaItem: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaItemSingle: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaItemDouble: {
    width: '48%',
    aspectRatio: 1,
  },
  mediaItemTripleLarge: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaItemTripleSmall: {
    width: '48%',
    aspectRatio: 1,
  },
  mediaItemQuad: {
    width: '48%',
    aspectRatio: 1,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F3F4',
  },
  moreImagesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreImagesText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  quotedContainer: {
    borderLeftWidth: 3,
    borderLeftColor: '#1DA1F2',
    borderRadius: 12,
    marginTop: 12,
    overflow: 'hidden',
    padding: 12,
    backgroundColor: '#F7F9FA',
  },

  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F0F3F4',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapperActive: {
    backgroundColor: '#E8F5FD',
  },
  actionCount: {
    fontSize: 14,
    color: '#657786',
    fontWeight: '500',
    minWidth: 20,
  },
  actionCountActive: {
    fontWeight: '700',
  },
  childrenContainer: {
    marginLeft: 48,
    position: 'relative',
  },
  threadLine: {
    position: 'absolute',
    left: -24,
    width: 2,
    backgroundColor: '#E1E8ED',
  },
  childWrapper: {
    position: 'relative',
  },
  collapsedReplies: {
    marginTop: 8,
    marginLeft: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F7F9FA',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyLine: {
    width: 2,
    height: 24,
    backgroundColor: '#1DA1F2',
    marginRight: 12,
    borderRadius: 1,
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  collapsedAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E1E8ED',
  },
  collapsedText: {
    flex: 1,
    color: '#657786',
    fontSize: 14,
    fontWeight: '500',
  },
  collapsedNested: {
    marginTop: 8,
    marginLeft: 48,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  collapsedNestedText: {
    color: '#1DA1F2',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PostCard;