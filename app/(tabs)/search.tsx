import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Keyboard,
  Platform,
  StatusBar,
  ActivityIndicator
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/utils/supabase"; // path to supabase client file

// Type definition for your DB row
type Profile = {
  id: string;
  username: string; // e.g. @01x00100
  full_name: string; // e.g. Dev Team
  avatar_url: string | null;
};

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]); // Storing strings for history 
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Load search history from local storage on mount (Optional but recommended)
  // For now, we will just start empty.

  // --- Database Fetch Logic ---
  const fetchProfiles = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);

    try {
      // Searches for users where username OR full_name matches the query (case insensitive)
      const { data, error } = await supabase
        .from('profiles') 
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(20);

      if (error) {
        console.error('Error fetching profiles:', error);
      } else {
        setSearchResults(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Debounce Logic ---
  // This prevents the DB query from firing on every single keypress
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery) {
        fetchProfiles(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
  };

  const addToRecent = (text: string) => {
    // Add to local history state (in a real app, save this to AsyncStorage)
    if (!recentSearches.includes(text)) {
        setRecentSearches(prev => [text, ...prev].slice(0, 5));
    }
  };

  // Render a User Row (Result)
  const renderResultItem = ({ item }: { item: Profile }) => (
    <TouchableOpacity 
      style={styles.resultItem} 
      onPress={() => addToRecent(item.username)} // Add logic to navigate to profile here
    >
      <Image 
        source={{ uri: item.avatar_url || 'https://i.pravatar.cc/150' }} // Fallback image
        style={styles.avatar} 
      />
      <View style={styles.textContainer}>
        <Text style={styles.name}>{item.full_name}</Text>
        <Text style={styles.handle}>@{item.username}</Text>
      </View>
    </TouchableOpacity>
  );

  // Render a Recent Search Row
  const renderRecentItem = ({ item }: { item: string }) => (
    <TouchableOpacity style={styles.recentItem} onPress={() => setSearchQuery(item)}>
      <Ionicons name="time-outline" size={20} color="#657786" style={styles.recentIcon} />
      <Text style={styles.recentText}>{item}</Text>
      <Ionicons name="arrow-up-outline" size={16} color="#657786" style={{ marginLeft: 'auto', transform: [{ rotate: '-45deg' }] }} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Twitter-style Search Bar Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#657786" />
          <TextInput
            style={styles.input}
            placeholder="Search Vius"
            placeholderTextColor="#657786"
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={20} color="#1DA1F2" />
            </TouchableOpacity>
          )}
        </View>
        
        {isFocused && (
          <TouchableOpacity onPress={() => {
            Keyboard.dismiss();
            setIsFocused(false);
          }}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {loading ? (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1DA1F2" />
            </View>
        ) : searchQuery.length === 0 ? (
          // Empty State: Show Recent Searches
          <View>
             {recentSearches.length > 0 && (
                <>
                    <Text style={[styles.title, styles.sectionTitle]}>Recent searches</Text>
                    <FlatList
                    data={recentSearches}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={renderRecentItem}
                    keyboardShouldPersistTaps="handled"
                    />
                </>
             )}
          </View>
        ) : (
          // Active Search: Show Results
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderResultItem}
            keyboardShouldPersistTaps="handled"
            onScroll={() => Keyboard.dismiss()} 
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No results for "{searchQuery}"</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E1E8ED",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#EFF3F4", 
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#14171A",
  },
  cancelButton: {
    marginLeft: 10,
    color: "#14171A",
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    paddingTop: 20,
    alignItems: 'center',
  },
  // Recycled 'title' style
  title: {
    fontSize: 20, 
    fontWeight: "bold",
    color: "#14171A",
  },
  sectionTitle: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F8FA",
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  recentIcon: {
    marginRight: 15,
    backgroundColor: "#EFF3F4",
    borderRadius: 15,
    padding: 5,
    overflow: 'hidden'
  },
  recentText: {
    fontSize: 16,
    color: "#14171A",
  },
  resultItem: {
    flexDirection: "row",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F8FA",
    alignItems: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#E1E8ED', // Placeholder color while loading image
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#14171A",
  },
  handle: {
    fontSize: 15,
    color: "#657786",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyStateText: {
    color: "#657786",
    fontSize: 16,
  },
});