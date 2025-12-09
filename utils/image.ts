import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type ImageType = 'avatar' | 'cover';

export const pickImage = async (): Promise<ImagePicker.ImagePickerResult> => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        alert('Sorry, we need camera roll permissions to make this work!');
        return { canceled: true, assets: null };
    }

    // Pick image
    return await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true, // We need base64 for Supabase upload
    });
};

export const uploadImage = async (
    userId: string,
    base64Data: string,
    type: ImageType
): Promise<string | null> => {
    try {
        const fileName = `${userId}/${type}_${Date.now()}.jpg`;
        const filePath = `${fileName}`;

        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(filePath, decode(base64Data), {
                contentType: 'image/jpeg',
                upsert: true,
            });

        if (error) {
            console.error('Error uploading image:', error);
            throw error;
        }

        const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    } catch (error) {
        console.error('Upload failed:', error);
        return null;
    }
};
