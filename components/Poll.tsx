
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PollOption, Poll as PollType } from '../app/models/Poll';

interface PollProps {
  poll: PollType;
  onVote: (pollId: string, optionIds: string[]) => void;
}

const Poll: React.FC<PollProps> = ({ poll, onVote }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const hasVoted = poll.viewer_selected_options && poll.viewer_selected_options.length > 0;
  const hasEnded = new Date(poll.expires_at).getTime() < Date.now();
  const showResults = hasVoted || hasEnded;

  useEffect(() => {
    if (hasEnded) {
      setTimeLeft('Final results');
      progressAnim.setValue(0);
      return;
    }

    const startTime = poll.created_at ? new Date(poll.created_at).getTime() : Date.now() - 24 * 60 * 60 * 1000; // Default to 24h ago if missing
    const totalDuration = new Date(poll.expires_at).getTime() - startTime;

    const updateTimer = () => {
      const now = Date.now();
      const difference = new Date(poll.expires_at).getTime() - now;

      if (difference > 0) {
        // Update progress bar
        const progress = (difference / totalDuration) * 100;
        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 1000,
          useNativeDriver: false,
        }).start();

        // Update time left text
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);

        if (days > 0) setTimeLeft(`${days}d left`);
        else if (hours > 0) setTimeLeft(`${hours}h left`);
        else setTimeLeft(`${minutes}m left`);

        // Handle pulsing animation
        if (difference < 60000) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 0.6, duration: 500, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
          ).start();
        } else {
          pulseAnim.setValue(1); // Reset pulse
        }

      } else {
        setTimeLeft('Final results');
        progressAnim.setValue(0);
      }
    };

    updateTimer(); // Initial call
    const timer = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(timer);
  }, [poll.created_at, poll.expires_at, hasEnded]);

  const getProgressBarColor = () => {
    const remainingTime = new Date(poll.expires_at).getTime() - Date.now();
    if (remainingTime < 60000) return '#ff3838'; // Red
    if (remainingTime < 300000) return '#ffab00'; // Yellow
    return '#1DA1F2'; // Blue
  };

  const handleOptionPress = (optionId: string) => {
    if (showResults) return;
    if (poll.allows_multiple_choices) {
      setSelectedOptions(prev =>
        prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
      );
    } else {
      onVote(poll.id, [optionId]);
    }
  };

  const handleSubmitMultipleChoice = () => {
    if (selectedOptions.length > 0) {
      onVote(poll.id, selectedOptions);
    }
  };

  const renderOption = (option: PollOption, index: number) => {
    const isSelected = poll.viewer_selected_options?.includes(option.id) ?? false;
    const percentage = poll.total_votes > 0 ? (option.votes / poll.total_votes) * 100 : 0;
    const isMultipleChoiceSelection = !showResults && poll.allows_multiple_choices && selectedOptions.includes(option.id);

    return (
      <TouchableOpacity
        key={option.id}
        style={styles.optionContainer}
        onPress={() => handleOptionPress(option.id)}
        disabled={showResults}
        accessible={true}
        accessibilityLabel={showResults ? `Option ${option.text}, ${percentage}%` : `Vote for ${option.text}`}
      >
        {showResults && (
          <View style={[styles.progressBar, { width: `${percentage}%` }]} />
        )}
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionText}>{option.text}</Text>
          {showResults && <Text style={styles.percentageText}>{percentage.toFixed(1)}%</Text>}
        </View>
        {(showResults && isSelected) && (
          <Ionicons name="checkmark-circle" size={24} color="#1DA1F2" style={styles.checkIcon} />
        )}
        {isMultipleChoiceSelection && (
          <Ionicons name="checkbox" size={24} color="#1DA1F2" style={styles.checkIcon} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {!hasEnded && (
        <View style={styles.expirationBarContainer}>
          <Animated.View
            style={[
              styles.expirationBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: getProgressBarColor(),
                opacity: pulseAnim,
              },
            ]}
          />
        </View>
      )}

      <Text style={styles.question}>{poll.question}</Text>

      {poll.media && (
        <TouchableOpacity
          style={styles.mediaContainer}
          onPress={() => poll.media?.type === 'link' && poll.media.url && Linking.openURL(poll.media.url)}
          disabled={poll.media.type !== 'link'}
        >
          {poll.media.type === 'image' ? (
            <Image source={{ uri: poll.media.url }} style={styles.image} />
          ) : (
            <Text style={styles.link}>{poll.media.url}</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.optionsContainer}>
        {poll.options.map(renderOption)}
      </View>

      {poll.allows_multiple_choices && !showResults && (
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmitMultipleChoice} disabled={selectedOptions.length === 0}>
          <Text style={styles.submitButtonText}>Submit Vote</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <Text style={styles.totalVotes}>{showResults ? `${poll.total_votes.toLocaleString()} votes` : ''}</Text>
        <Text style={styles.timeRemaining}>{timeLeft}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
  },
  expirationBarContainer: {
    height: 4,
    backgroundColor: '#e1e8ed',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  expirationBar: {
    height: '100%',
  },
  question: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  mediaContainer: {
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 10,
  },
  link: {
    color: '#1DA1F2',
    textDecorationLine: 'underline',
  },
  optionsContainer: {
    marginBottom: 10,
  },
  optionContainer: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#1DA1F2',
    opacity: 0.2,
  },
  optionTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    paddingRight: 5, // Space for checkmark
  },
  optionText: {
    fontSize: 16,
    flexShrink: 1,
  },
  percentageText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkIcon: {
    marginLeft: 10,
  },
  submitButton: {
    backgroundColor: '#1DA1F2',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  totalVotes: {
    fontSize: 14,
    color: 'gray',
  },
  timeRemaining: {
    fontSize: 14,
    color: 'gray',
  },
});

export default Poll;
