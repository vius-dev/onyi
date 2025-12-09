import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';
import { Text } from 'react-native';

export default function ProfileIndex() {
    const { user, isLoading } = useAuth();

    if (isLoading) return <Text>Loading...</Text>;
    if (!user) return <Redirect href="/(auth)/login" />;

    return <Redirect href={`/profile/${user.id}` as any} />;
}
