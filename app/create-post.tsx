
import { User } from '@/models/User';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Hardcoded test user ID until auth is fully implemented
const TEST_USER_ID = 'f358fafe-e96e-4731-9360-03be395efded';

// Mock current user data - in real app, fetch this from Supabase using TEST_USER_ID
const currentUser: User = {
  id: TEST_USER_ID,
  username: 'test_user',
  display_name: 'Test User',
  profile_picture_url: 'https://randomuser.me/api/portraits/men/1.jpg',
  email: 'test@example.com',
  created_at: new Date().toISOString(),
};

const MAX_CHARACTERS = 280;

interface PostInput {
  key: string;
  text: string;
}

export default function NewPostScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostInput[]>([{ key: `post-${Date.now()}`, text: '' }]);

  const totalCharCount = useMemo(() => posts.reduce((sum, p) => sum + p.text.length, 0), [posts]);
  const hasExceededLimit = useMemo(() => posts.some(p => p.text.length > MAX_CHARACTERS), [posts]);
  const isPostDisabled = totalCharCount === 0 || hasExceededLimit;

  const handlePost = async () => {
    try {
      let threadRootId: string | null = null;
      let parentPostId: string | null = null;

      // Filter out empty posts
      const validPosts = posts.filter(p => p.text.trim().length > 0);
      if (validPosts.length === 0) return;

      for (let i = 0; i < validPosts.length; i++) {
        const postInput = validPosts[i];

        const { data, error } = await supabase
          .from('posts')
          .insert({
            author_id: TEST_USER_ID,
            content: postInput.text,
            type: i === 0 ? 'normal' : 'reply', // First is normal (or reply if replying to another), subsequent are thread replies
            parent_post_id: parentPostId,
            thread_root_id: threadRootId,
          })
          .select()
          .single() as { data: { id: string } | null; error: any };

        if (error) throw error;
        if (!data) throw new Error("No data returned from insert");

        const newPostId = data.id;

        // If this is the first post, it might be the root (unless we are replying to *another* thread, which isn't handled here yet)
        if (i === 0) {
          threadRootId = newPostId;
        } else {
          // For subsequent posts in thread, insert into post_threads
          await supabase.from('post_threads').insert({
            parent_post_id: parentPostId,
            child_post_id: newPostId
          });
        }

        // The current post becomes parent for the next
        parentPostId = newPostId;
      }

      console.log('Thread posted successfully');
      router.back();
    } catch (e) {
      console.error("Error posting thread:", e);
      alert("Failed to post. Check console.");
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

  const renderPostInput = ({ item, index }: { item: PostInput, index: number }) => {
    const characterCount = item.text.length;
    const charCountColor = characterCount > MAX_CHARACTERS ? '#d9534f' : '#6c757d';
    const isLastPost = index === posts.length - 1;

    return (
      <View>
        <View style={styles.composerContainer}>
          <Image source={{ uri: currentUser.profile_picture_url }} style={styles.profilePicture} />
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              multiline
              placeholder="What's happening?"
              placeholderTextColor="#999"
              value={item.text}
              onChangeText={(text) => updatePostText(index, text)}
              maxLength={MAX_CHARACTERS + 20} // Allow over-typing to show error
              accessibilityLabel={`Compose new post, part ${index + 1} of ${posts.length}`}
            />
          </View>
        </View>
        <View style={styles.inputFooter}>
          <Text style={[styles.characterCount, { color: charCountColor }]}>
            {MAX_CHARACTERS - characterCount}
          </Text>
        </View>
        {isLastPost && (
          <View style={styles.addPostContainer}>
            <TouchableOpacity onPress={addPostInput} style={styles.addPostButton} accessibilityLabel="Add another post to the thread">
              <Ionicons name="add-circle-outline" size={30} color="#1DA1F2" />
            </TouchableOpacity>
          </View>
        )}
        {!isLastPost && <View style={styles.threadConnector} />}
      </View>
    );
  };

  return (
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
          style={[styles.postButton, isPostDisabled && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={isPostDisabled}
          accessibilityRole="button"
          accessibilityLabel="Post your new thread"
        >
          <Text style={styles.postButtonText}>{posts.length > 1 ? "Post All" : "Post"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        renderItem={renderPostInput}
        keyExtractor={item => item.key}
        style={styles.scrollView}
      />

      <View style={styles.footer}>
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} accessibilityLabel="Add image">
            <Ionicons name="image-outline" size={24} color="#1DA1F2" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} accessibilityLabel="Add GIF">
            <Ionicons name="gift-outline" size={24} color="#1DA1F2" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} accessibilityLabel="Add poll">
            <Ionicons name="stats-chart-outline" size={24} color="#1DA1F2" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
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
  cancelButton: {
    fontSize: 16,
    color: '#1DA1F2',
  },
  postButton: {
    backgroundColor: '#1DA1F2',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
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
  inputContainer: {
    flex: 1,
  },
  textInput: {
    fontSize: 18,
    lineHeight: 24,
    minHeight: 80,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  characterCount: {
    fontSize: 14,
    color: '#6c757d',
  },
  addPostContainer: {
    paddingLeft: 78, // Aligns with the start of the text input
    paddingBottom: 15,
  },
  addPostButton: {
    // Styling for the '+' button if needed
  },
  threadConnector: {
    position: 'absolute',
    left: 38, // (48/2) + 15 - 1
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
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginRight: 20,
  },
});
