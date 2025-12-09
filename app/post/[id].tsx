import PostCard from '@/components/PostCard';
import { useAuth } from '@/contexts/AuthContext';
import { Post } from '@/models/Post';
import { User } from '@/models/User';
import { supabase } from '@/utils/supabase';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';



export default function PostDetailScreen() {
  const { post: postString } = useLocalSearchParams();
  const { user: authUser } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);

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

  let post: Post;
  try {
    post = JSON.parse(postString as string);
  } catch (e) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Could not load post.</Text>
      </View>
    );
  }

  // Dummy actions for demonstration
  const onLike = (id: string) => console.log('Liked', id);
  const onDislike = (id: string) => console.log('Disliked', id);
  const onRepost = (id: string) => console.log('Reposted', id);
  const onQuote = (p: Post) => console.log('Quoted', p.id);
  const onDelete = (id: string) => console.log('Deleted', id);
  const onVote = (pollId: string, optionIds: string[]) => console.log('Voted', pollId, optionIds);

  return (
    <ScrollView style={styles.container}>
      <PostCard
        post={post}
        currentUser={currentProfile || undefined}
        onLike={onLike}
        onDislike={onDislike}
        onRepost={onRepost}
        onQuote={onQuote}
        onDelete={onDelete}
        onVote={onVote}
        isDetailView={true}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: 'red',
  },
});
