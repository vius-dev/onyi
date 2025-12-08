import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function FAB() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    Animated.spring(animation, {
      toValue,
      friction: 6,
      useNativeDriver: true,
    }).start();
    setIsOpen(!isOpen);
  };

  const navigateTo = (path: any) => {
    toggleMenu();
    router.push(path);
  };

  const postInterpolation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -60],
  });

  const pollInterpolation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });

  const postStyle = { transform: [{ translateY: postInterpolation }] };
  const pollStyle = { transform: [{ translateY: pollInterpolation }] };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.secondaryButton, pollStyle]}>
        <TouchableOpacity onPress={() => navigateTo('/create-poll')} style={styles.optionButton}>
          <Text style={styles.optionText}>Poll</Text>
          <Ionicons name="analytics" size={24} color="#1DA1F2" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[styles.secondaryButton, postStyle]}>
        <TouchableOpacity onPress={() => navigateTo('/create-post')} style={styles.optionButton}>
          <Text style={styles.optionText}>Post</Text>
          <Ionicons name="create" size={24} color="#1DA1F2" />
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity style={styles.fab} onPress={toggleMenu} activeOpacity={0.8}>
        <Animated.View style={{ transform: [{ rotate: animation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
          <Ionicons name="add" size={32} color="white" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    alignItems: 'center',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1DA1F2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  secondaryButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  optionText: {
    color: '#1DA1F2',
    fontWeight: 'bold',
    marginRight: 8,
  }
});
