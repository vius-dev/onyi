import FAB from '@/components/FAB';
import { HapticTab } from '@/components/HapticTab';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // ADD THIS
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }} edges={['top']}>
                <Tabs
                    screenOptions={{
                        headerShown: false,
                        tabBarButton: (props) => <HapticTab {...props} />,
                        tabBarActiveTintColor: '#1DA1F2',
                    }}
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
                        name="profile"
                        options={{
                            title: "Profile",
                            tabBarIcon: ({ focused, color, size }) => (
                                <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
                            ),
                        }}
                    />
                </Tabs>
                <FAB />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}
