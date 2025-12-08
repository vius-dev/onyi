
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { SplashScreen, Tabs } from "expo-router";
import { useEffect } from 'react';
import { View } from "react-native";
import FAB from "../components/FAB";
import { HapticTab } from '../components/HapticTab';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...Ionicons.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarButton: (props) => <HapticTab {...props} />,
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "search" : "search-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: "Notifications",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "notifications" : "notifications-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Messages",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "mail" : "mail-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile/index"
          options={{
            title: "Profile",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="create-post"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="create-poll"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="post/[id]"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile/[id]"
          options={{
            href: null,
          }}
        />
      </Tabs>
      <FAB />
    </View>
  );
}
