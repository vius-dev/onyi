import PostDetail from '@/components/PostDetail';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const postId = Array.isArray(id) ? id[0] : id;

  if (!postId) return null;

  return <PostDetail postId={postId} />;
}
