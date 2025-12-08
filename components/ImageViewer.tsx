import React from 'react';
import { Modal, View, Image, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageViewerProps {
  visible: boolean;
  images: { url: string }[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageViewer({ visible, images, initialIndex, onClose }: ImageViewerProps) {
  // For now, we'll just show the selected image.
  // Swipe and zoom functionality can be added later.
  const imageUrl = images[initialIndex]?.url;

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={32} color="white" />
        </TouchableOpacity>
        <View style={styles.imageContainer}>
          {imageUrl && <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});