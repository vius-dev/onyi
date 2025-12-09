import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

export default function EditPostScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id && user) {
            fetchPost();
        }
    }, [id, user]);

    const fetchPost = async () => {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select('content, author_id')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) throw new Error('Post not found');

            if (data.author_id !== user?.id) {
                Alert.alert('Error', 'You can only edit your own posts');
                router.back();
                return;
            }

            setContent(data.content);
        } catch (error: any) {
            Alert.alert('Error', error.message);
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setSaving(true);

        try {
            const { error } = await supabase
                .from('posts')
                .update({ content, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            router.back();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    };

    const characterCount = content.length;
    const charCountColor = characterCount > MAX_CHARACTERS ? '#d9534f' : '#6c757d';
    const isSaveDisabled = characterCount === 0 || characterCount > MAX_CHARACTERS || saving;

    if (loading) {
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
                    <Text style={styles.headerTitle}>Edit Post</Text>
                    <TouchableOpacity onPress={handleSave} disabled={isSaveDisabled}>
                        <Text style={[styles.saveButton, isSaveDisabled && styles.disabled]}>Save</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={content}
                        onChangeText={setContent}
                        multiline
                        placeholder="What's happening?"
                        autoFocus
                    />
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.characterCount, { color: charCountColor }]}>
                        {MAX_CHARACTERS - characterCount}
                    </Text>
                </View>
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
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    cancelButton: {
        fontSize: 16,
        color: '#000',
    },
    saveButton: {
        fontSize: 16,
        color: '#1DA1F2',
        fontWeight: 'bold',
    },
    disabled: {
        opacity: 0.5,
    },
    inputContainer: {
        flex: 1,
        padding: 15,
    },
    input: {
        fontSize: 18,
        lineHeight: 24,
        textAlignVertical: 'top',
        height: '100%',
    },
    footer: {
        padding: 15,
        alignItems: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    characterCount: {
        fontSize: 14,
        color: '#657786',
    },
});
