import React, { useState, useRef } from "react";
import {
  Text,
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

type Message = {
  id: string;
  sender: string;
  content: string;
  time: string;
  avatar?: string;
  isMine?: boolean;
  quotedMessage?: {
    id: string;
    sender: string;
    content: string;
  } | null;
};

const dummyUsers = [
  { id: "u1", name: "Alice", avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: "u2", name: "Bob", avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: "u3", name: "Charlie", avatar: "https://randomuser.me/api/portraits/men/72.jpg" },
];

export default function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "Alice",
      content: "Hey! Have you seen the new hybrid chat idea?",
      time: "10:22 AM",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg",
      isMine: false,
      quotedMessage: null,
    },
    {
      id: "2",
      sender: "You",
      content: "Yes! We could mix WhatsApp and X-style threads!",
      time: "10:25 AM",
      isMine: true,
      quotedMessage: null,
    },
  ]);

  const [inputText, setInputText] = useState("");
  const [pendingQuote, setPendingQuote] = useState<Message | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const inputRef = useRef<TextInput | null>(null);

  const handleSend = () => {
    if (inputText.trim() === "" && !pendingQuote) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: "You",
      content: inputText.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isMine: true,
      quotedMessage: pendingQuote
        ? {
            id: pendingQuote.id,
            sender: pendingQuote.sender,
            content: pendingQuote.content,
          }
        : null,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    setPendingQuote(null);
    inputRef.current?.focus();
  };

  const handleQuoteSwipe = (message: Message) => {
    setPendingQuote(message);
    inputRef.current?.focus();
  };

  const renderRightActions = (message: Message) => (
    <View style={styles.swipeActionContainer}>
      <TouchableOpacity
        style={styles.quoteSwipe}
        onPress={() => handleQuoteSwipe(message)}
      >
        <Text style={styles.quoteSwipeText}>Reply</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMessage = ({ item }: { item: Message }) => (
    <Swipeable
      renderRightActions={() => renderRightActions(item)}
      overshootFriction={8}
    >
      <View
        style={[
          styles.messageWrapper,
          item.isMine ? styles.myMessageWrapper : styles.theirMessageWrapper,
        ]}
      >
        {!item.isMine && item.avatar && (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        )}

        <View style={styles.messageStack}>
          {item.quotedMessage && (
            <View
              style={[
                styles.quotedContainer,
                item.isMine ? styles.myQuoted : styles.theirQuoted,
              ]}
            >
              <Text style={styles.quotedSender}>
                {item.quotedMessage.sender}
              </Text>
              <Text style={styles.quotedContent} numberOfLines={3}>
                {item.quotedMessage.content}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.bubble,
              item.isMine ? styles.myBubble : styles.theirBubble,
            ]}
          >
            {!item.isMine && (
              <Text style={styles.sender}>{item.sender}</Text>
            )}
            {item.content.length > 0 && (
              <Text style={styles.content}>{item.content}</Text>
            )}
            <Text style={styles.time}>{item.time}</Text>
          </View>
        </View>
      </View>
    </Swipeable>
  );

  const clearPendingQuote = () => {
    setPendingQuote(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Messages</Text>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
        />

        {pendingQuote && (
          <View style={styles.pendingQuoteBar}>
            <View style={styles.pendingQuoteContent}>
              <Text style={styles.pendingQuoteLabel}>
                Replying to {pendingQuote.sender}
              </Text>
              <Text style={styles.pendingQuoteText} numberOfLines={2}>
                {pendingQuote.content}
              </Text>
            </View>
            <TouchableOpacity onPress={clearPendingQuote} style={styles.pendingQuoteClose}>
              <Text style={styles.pendingQuoteCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              pendingQuote ? "Write a reply…" : "Type a message…"
            }
            placeholderTextColor="#9CA3AF"
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendButton,
              inputText.trim() === "" && !pendingQuote && styles.sendButtonDisabled,
            ]}
            disabled={inputText.trim() === "" && !pendingQuote}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.newMessageButton}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.newMessageText}>＋</Text>
        </TouchableOpacity>

        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Start a New Chat</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search user..."
                value={searchText}
                onChangeText={setSearchText}
              />
              <FlatList
                data={
                  searchText
                    ? dummyUsers.filter((u) =>
                        u.name.toLowerCase().includes(searchText.toLowerCase())
                      )
                    : []
                }
                keyExtractor={(u) => u.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userItem}
                    onPress={() => {
                      setIsModalVisible(false);
                      setSearchText("");
                      // You can hook navigation or conversation creation here
                    }}
                  >
                    <Image
                      source={{ uri: item.avatar }}
                      style={styles.userAvatar}
                    />
                    <Text style={styles.userName}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  searchText ? (
                    <Text style={styles.noResults}>No user found</Text>
                  ) : (
                    <Text style={styles.noResults}>Type to search...</Text>
                  )
                }
              />
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                style={styles.closeModal}
              >
                <Text style={styles.closeModalText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1D1D1F",
    textAlign: "center",
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 90,
  },
  messageWrapper: {
    flexDirection: "row",
    marginVertical: 6,
    maxWidth: "100%",
  },
  myMessageWrapper: {
    alignSelf: "flex-end",
  },
  theirMessageWrapper: {
    alignSelf: "flex-start",
  },
  messageStack: {
    maxWidth: "80%",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
    marginTop: 4,
  },
  quotedContainer: {
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#6366F1",
  },
  myQuoted: {
    alignSelf: "flex-end",
  },
  theirQuoted: {
    alignSelf: "flex-start",
  },
  quotedSender: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4F46E5",
    marginBottom: 2,
  },
  quotedContent: {
    fontSize: 13,
    color: "#4B5563",
  },
  bubble: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  theirBubble: {
    backgroundColor: "#E5E7EB",
  },
  myBubble: {
    backgroundColor: "#DCF8C6",
  },
  sender: {
    fontWeight: "600",
    marginBottom: 2,
    color: "#111827",
  },
  content: {
    fontSize: 16,
    color: "#111827",
  },
  time: {
    fontSize: 11,
    color: "#6B7280",
    alignSelf: "flex-end",
    marginTop: 4,
  },
  swipeActionContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  quoteSwipe: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 6,
  },
  quoteSwipeText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
  pendingQuoteBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F1F5F9",
    borderTopWidth: 1,
    borderTopColor: "#CBD5F5",
  },
  pendingQuoteContent: {
    flex: 1,
  },
  pendingQuoteLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
    marginBottom: 2,
  },
  pendingQuoteText: {
    fontSize: 13,
    color: "#475569",
  },
  pendingQuoteClose: {
    padding: 4,
  },
  pendingQuoteCloseText: {
    fontSize: 16,
    color: "#64748B",
  },
  inputContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 120,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#0A84FF",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  sendText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  newMessageButton: {
    position: "absolute",
    right: 20,
    bottom: 90,
    backgroundColor: "#0A84FF",
    borderRadius: 30,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  newMessageText: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    width: "85%",
    maxHeight: "70%",
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  searchInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginBottom: 12,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    color: "#111827",
    flex: 1,
  },
  noResults: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 20,
    fontSize: 15,
  },
  closeModal: {
    marginTop: 16,
    alignSelf: "center",
    paddingVertical: 10,
  },
  closeModalText: {
    color: "#0A84FF",
    fontWeight: "600",
    fontSize: 16,
  },
});
