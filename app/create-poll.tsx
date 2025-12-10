import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const MAX_OPTIONS = 4;

export default function CreatePollScreen() {
  const { user } = useAuth();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState({ days: 1, hours: 0, minutes: 0 });
  const [posting, setPosting] = useState(false);
  const router = useRouter();

  const handleAddOption = () => {
    if (options.length < MAX_OPTIONS) {
      setOptions([...options, '']);
    } else {
      Alert.alert(`You can only add up to ${MAX_OPTIONS} options.`);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = [...options];
      newOptions.splice(index, 1);
      setOptions(newOptions);
    } else {
      Alert.alert('A poll must have at least 2 options.');
    }
  };

  const handlePost = async () => {
    // Basic validation
    if (!question.trim()) {
      Alert.alert('Please enter a question for your poll.');
      return;
    }
    if (options.some(opt => !opt.trim())) {
      Alert.alert('Please make sure all poll options are filled in.');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a poll.');
      return;
    }

    setPosting(true);

    try {
      // Calculate expiration date
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() +
        (duration.days * 24 * 60 * 60 * 1000) +
        (duration.hours * 60 * 60 * 1000) +
        (duration.minutes * 60 * 1000)
      );

      // 1. Create a post for the poll
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          content: question,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (postError) throw postError;

      // 2. Create the poll
      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .insert({
          post_id: postData.id,
          question: question,
          allows_multiple_choices: false,
          total_votes: 0,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (pollError) throw pollError;

      // 3. Create poll options
      const pollOptions = options.map((text, index) => ({
        poll_id: pollData.id,
        text: text.trim(),
        votes: 0,
        position: index,
      }));

      const { error: optionsError } = await supabase
        .from('poll_options')
        .insert(pollOptions);

      if (optionsError) throw optionsError;

      console.log('✅ Poll created successfully!');
      Alert.alert('Success', 'Your poll has been posted!', [
        { text: 'OK', onPress: () => router.back() }
      ]);

    } catch (error) {
      console.error('❌ Error creating poll:', error);
      Alert.alert('Error', 'Failed to create poll. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={30} color="#1DA1F2" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.postButton, posting && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={posting}
        >
          {posting ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Ask a question..."
          value={question}
          onChangeText={setQuestion}
          style={styles.questionInput}
          multiline
        />
      </View>

      <Text style={styles.optionsTitle}>Options</Text>

      {options.map((option, index) => (
        <View key={index} style={styles.optionContainer}>
          <TextInput
            placeholder={`Option ${index + 1}`}
            value={option}
            onChangeText={(text) => {
              const newOptions = [...options];
              newOptions[index] = text;
              setOptions(newOptions);
            }}
            style={styles.optionInput}
          />
          {options.length > 2 && (
            <TouchableOpacity onPress={() => handleRemoveOption(index)} style={styles.removeButton}>
              <Ionicons name="remove-circle" size={24} color="#ff3838" />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {options.length < MAX_OPTIONS && (
        <TouchableOpacity onPress={handleAddOption} style={styles.addButton}>
          <Ionicons name="add-circle-outline" size={28} color="#1DA1F2" />
          <Text style={styles.addButtonText}>Add Option</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.durationTitle}>Poll Duration</Text>
      <View style={styles.durationContainer}>
        <View style={styles.durationInputContainer}>
          <Text>Days</Text>
          <TextInput
            style={styles.durationInput}
            keyboardType='numeric'
            maxLength={1}
            defaultValue='1'
            onChangeText={(text) => setDuration(d => ({ ...d, days: parseInt(text) || 0 }))}
          />
        </View>
        <View style={styles.durationInputContainer}>
          <Text>Hours</Text>
          <TextInput
            style={styles.durationInput}
            keyboardType='numeric'
            maxLength={2}
            defaultValue='0'
            onChangeText={(text) => setDuration(d => ({ ...d, hours: parseInt(text) || 0 }))}
          />
        </View>
        <View style={styles.durationInputContainer}>
          <Text>Minutes</Text>
          <TextInput
            style={styles.durationInput}
            keyboardType='numeric'
            maxLength={2}
            defaultValue='0'
            onChangeText={(text) => setDuration(d => ({ ...d, minutes: parseInt(text) || 0 }))}
          />
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  postButton: {
    backgroundColor: '#1DA1F2',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  inputContainer: {
    paddingVertical: 15,
  },
  questionInput: {
    fontSize: 20,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  optionInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
  removeButton: {
    marginLeft: 10,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#1DA1F2',
  },
  durationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 30,
    marginBottom: 15,
  },
  durationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  durationInputContainer: {
    alignItems: 'center',
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 10,
    marginTop: 5,
    width: 60,
    textAlign: 'center',
    fontSize: 16,
  },
});
