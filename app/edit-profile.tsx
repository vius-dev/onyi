import { useAuth } from '@/contexts/AuthContext';
import { pickImage, uploadImage } from '@/utils/image';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
    const router = useRouter();
    const { user: authUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    // Form state
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [location, setLocation] = useState('');
    const [website, setWebsite] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);

    // Load initial data
    useEffect(() => {
        if (!authUser) return;

        const loadProfile = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (data) {
                setDisplayName(data.display_name || '');
                setUsername(data.username || '');
                setBio(data.bio || '');
                setLocation(data.location || '');
                setWebsite(data.website || '');
                setAvatarUrl(data.profile_picture_url);
                setCoverUrl(data.cover_photo_url);
            } else if (authUser.email) {
                // Default username for new profiles
                setUsername(authUser.email.split('@')[0]);
            }
            setInitialLoading(false);
        };

        loadProfile();
    }, [authUser]);

    const handleSave = async () => {
        if (!authUser) return;
        setLoading(true);

        try {
            const updates = {
                id: authUser.id,
                username,
                display_name: displayName,
                bio,
                location,
                website,
                profile_picture_url: avatarUrl,
                cover_photo_url: coverUrl,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updates);

            if (error) throw error;

            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePickImage = async (type: 'avatar' | 'cover') => {
        if (!authUser) return;

        try {
            const result = await pickImage();
            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];

                // Show local preview immediately (optional, or wait for upload)
                // For simplified UX, let's upload immediately
                setLoading(true);

                if (asset.base64) {
                    const publicUrl = await uploadImage(authUser.id, asset.base64, type);
                    if (publicUrl) {
                        if (type === 'avatar') setAvatarUrl(publicUrl);
                        else setCoverUrl(publicUrl);
                    } else {
                        Alert.alert('Upload Failed', 'Could not upload image.');
                    }
                }
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to pick image');
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1DA1F2" />
            </View>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.cancelButton}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={handleSave} disabled={loading}>
                    <Text style={[styles.saveButton, loading && styles.disabled]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                {/* Cover Photo */}
                <TouchableOpacity onPress={() => handlePickImage('cover')}>
                    <View style={styles.coverContainer}>
                        {coverUrl ? (
                            <Image source={{ uri: coverUrl }} style={styles.coverPhoto} />
                        ) : (
                            <View style={[styles.coverPhoto, styles.placeholderCover]}>
                                <Ionicons name="camera-outline" size={30} color="#fff" />
                            </View>
                        )}
                        <View style={styles.overlay}>
                            <Ionicons name="camera" size={24} color="#fff" />
                        </View>
                    </View>
                </TouchableOpacity>

                {/* Avatar */}
                <View style={styles.avatarWrapper}>
                    <TouchableOpacity onPress={() => handlePickImage('avatar')}>
                        <Image
                            source={{ uri: avatarUrl || 'https://via.placeholder.com/150' }}
                            style={styles.avatar}
                        />
                        <View style={styles.avatarOverlay}>
                            <Ionicons name="camera" size={20} color="#fff" />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Form Fields */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Username</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Username"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                            style={styles.input}
                            value={displayName}
                            onChangeText={setDisplayName}
                            placeholder="Display Name"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Bio</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Add a bio to your profile"
                            multiline
                            numberOfLines={3}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Location</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="Location"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Website</Text>
                        <TextInput
                            style={styles.input}
                            value={website}
                            onChangeText={setWebsite}
                            placeholder="Website"
                            autoCapitalize="none"
                        />
                    </View>
                </View>
            </ScrollView>

            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.loadingText}>Saving...</Text>
                </View>
            )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    cancelButton: {
        fontSize: 16,
        color: '#000',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    saveButton: {
        fontSize: 16,
        color: '#000',
        fontWeight: 'bold',
    },
    disabled: {
        opacity: 0.5,
    },
    content: {
        flex: 1,
    },
    coverContainer: {
        height: 150,
        backgroundColor: '#ccc',
        position: 'relative',
    },
    coverPhoto: {
        width: '100%',
        height: '100%',
    },
    placeholderCover: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarWrapper: {
        marginTop: -40,
        marginLeft: 15,
        width: 80,
        height: 80,
        position: 'relative',
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: '#fff',
    },
    avatarOverlay: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
        padding: 5,
    },
    form: {
        padding: 15,
        paddingTop: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        color: '#657786',
        fontWeight: 'bold',
        marginBottom: 5,
    },
    input: {
        fontSize: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingVertical: 8,
        color: '#000',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 10,
        fontWeight: 'bold',
    },
});
