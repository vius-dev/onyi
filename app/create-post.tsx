import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MAX_CHARACTERS = 280;

interface PostInput {
  key: string;
  text: string;
}

export default function CreatePostScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  // Thread continuation params
  const threadId = Array.isArray(params.thread_id)
    ? params.thread_id[0]
    : params.thread_id;

  const startSequence = params.sequence
    ? parseInt(
      Array.isArray(params.sequence)
        ? params.sequence[0]
        : params.sequence
    )
    : 1;

  const isThreadContinuation = !!threadId && !params.reply_to;

  // Reply params
  const replyToPostId = Array.isArray(params.reply_to)
    ? params.reply_to[0]
    : params.reply_to;

  const isReply = !!replyToPostId;

  const [posts, setPosts] = useState<PostInput[]>([
    { key: `post-${Date.now()}`, text: '' },
  ]);

  // Derived state
  const totalCharCount = useMemo(
    () => posts.reduce((sum, p) => sum + p.text.length, 0),
    [posts]
  );

  const hasExceededLimit = useMemo(
    () => posts.some((p) => p.text.length > MAX_CHARACTERS),
    [posts]
  );

  const isPostDisabled = totalCharCount === 0 || hasExceededLimit;

  // Profile pic state
  const [profilePic, setProfilePic] = useState(
    'https://randomuser.me/api/portraits/lego/1.jpg'
  );

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('profile_picture_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.profile_picture_url) {
            setProfilePic(data.profile_picture_url);
          }
        });
    }
  }, [user]);

  const handlePost = async () => {
    if (!user) return;

    try {
      const validPosts = posts.filter((p) => p.text.trim().length > 0);
      if (validPosts.length === 0) return;

      let resolvedThreadId = threadId;

      // 🔵 REPLY LOGIC (Twitter-style)
      if (isReply) {
        // 1. Fetch parent post to find its root thread
        const { data: parentPost } = await supabase
          .from('posts')
          .select('id, thread_id')
          .eq('id', replyToPostId)
          .single();

        if (!parentPost) throw new Error('Parent post not found');

        // 2. If no thread yet, parent becomes the root
        resolvedThreadId = parentPost.thread_id || parentPost.id;

        // 3. Insert reply as a single post
        const { error } = await supabase.from('posts').insert({
          author_id: user.id,
          content: validPosts[0].text,
          type: 'normal',
          is_reply: true,
          parent_post_id: replyToPostId,
          thread_id: resolvedThreadId,
          sequence_number: null, // Twitter-style replies DO NOT participate in thread sequencing
        });

        if (error) throw error;

        router.back();
        return;
      }

      // 🔵 THREAD CREATION or CONTINUATION
      for (let i = 0; i < validPosts.length; i++) {
        const postInput = validPosts[i];

        const isFirstPost = i === 0;
        const isNewThread = !isThreadContinuation && validPosts.length > 1;

        const sequenceNum = isThreadContinuation
          ? startSequence + i
          : isNewThread
            ? i + 1 // For new multi-post thread
            : 1;

        const { data, error } = await supabase
          .from('posts')
          .insert({
            author_id: user.id,
            content: postInput.text,
            type: 'normal',
            thread_id: resolvedThreadId,
            sequence_number: isThreadContinuation ? sequenceNum : sequenceNum,
            is_reply: false,
            parent_post_id: null,
          })
          .select()
          .single();

        if (error) throw error;

        // If new thread: first post becomes the root thread_id
        if (isFirstPost && !isThreadContinuation && validPosts.length > 1) {
          resolvedThreadId = data.id;
          await supabase
            .from('posts')
            .update({ thread_id: resolvedThreadId })
            .eq('id', data.id);
        }
      }

      router.back();
    } catch (e) {
      console.error('Error posting:', e);
      alert('Failed to post. Check console.');
    }
  };

  const addPostInput = () => {
    setPosts([...posts, { key: `post-${Date.now()}`, text: '' }]);
  };

  const updatePostText = (index: number, text: string) => {
    const newPosts = [...posts];
    newPosts[index].text = text;
    setPosts(newPosts);
  };

  const renderPostInput = ({ item, index }: { item: PostInput; index: number }) => {
    const characterCount = item.text.length;
    const charCountColor =
      characterCount > MAX_CHARACTERS ? '#d9534f' : '#6c757d';
    const isLastPost = index === posts.length - 1;

    return (
      <View>
        <View style={styles.composerContainer}>
          <Image source={{ uri: profilePic }} style={styles.profilePicture} />
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              multiline
              placeholder={
                isReply ? 'Write your reply…' : "What's happening?"
              }
              placeholderTextColor="#999"
              value={item.text}
              onChangeText={(text) => updatePostText(index, text)}
              maxLength={MAX_CHARACTERS + 20}
            />
          </View>
        </View>

        <View style={styles.inputFooter}>
          <Text style={[styles.characterCount, { color: charCountColor }]}>
            {MAX_CHARACTERS - characterCount}
          </Text>
        </View>

        {!isReply && isLastPost && (
          <View style={styles.addPostContainer}>
            <TouchableOpacity onPress={addPostInput}>
              <Ionicons
                name="add-circle-outline"
                size={30}
                color="#1DA1F2"
              />
            </TouchableOpacity>
          </View>
        )}

        {!isLastPost && !isReply && <View style={styles.threadConnector} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.postButton,
              isPostDisabled && styles.postButtonDisabled,
            ]}
            onPress={handlePost}
            disabled={isPostDisabled}
          >
            <Text style={styles.postButtonText}>
              {isReply
                ? 'Reply'
                : posts.length > 1
                  ? 'Post All'
                  : 'Post'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={posts}
          renderItem={renderPostInput}
          keyExtractor={(item) => item.key}
          style={styles.scrollView}
        />

        {!isReply && (
          <View style={styles.footer}>
            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="image-outline" size={24} color="#1DA1F2" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="gift-outline" size={24} color="#1DA1F2" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons
                  name="stats-chart-outline"
                  size={24}
                  color="#1DA1F2"
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  cancelButton: { fontSize: 16, color: '#1DA1F2' },
  postButton: {
    backgroundColor: '#1DA1F2',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postButtonDisabled: { opacity: 0.5 },
  postButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  scrollView: { flex: 1 },
  composerContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  profilePicture: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 15,
  },
  inputContainer: { flex: 1 },
  textInput: {
    fontSize: 18,
    lineHeight: 24,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  characterCount: { fontSize: 14, color: '#6c757d' },
  addPostContainer: { paddingLeft: 78, paddingBottom: 15 },
  threadConnector: {
    position: 'absolute',
    left: 38,
    top: 60,
    bottom: -20,
    width: 2,
    backgroundColor: '#ccc',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  actionsContainer: { flexDirection: 'row', alignItems: 'center' },
  actionButton: { marginRight: 20 },
});
