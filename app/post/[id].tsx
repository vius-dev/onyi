import PostCard from '@/components/PostCard';
import { Post } from '@/models/Post';
import { User } from '@/models/User';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Mock current user for demonstration
const currentUser: User = {
  id: "1",
  username: "current_user",
  display_name: "Current User",
  profile_picture_url: "https://randomuser.me/api/portraits/men/1.jpg",
  email: "current_user@example.com",
  created_at: new Date().toISOString(),
};

export default function PostDetailScreen() {
  const { post: postString } = useLocalSearchParams();

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
        currentUser={currentUser}
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
