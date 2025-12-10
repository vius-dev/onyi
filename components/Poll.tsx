import { PollOption, Poll as PollType } from '@/models/Poll';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PollProps {
  poll: PollType;
  onVote: (pollId: string, optionIds: string[]) => void;
}

// Vibrant color palette for poll options
const POLL_COLORS = [
  '#1DA1F2', // Twitter Blue
  '#17BF63', // Green
  '#F91880', // Pink
  '#FFAD1F', // Orange
  '#7856FF', // Purple
  '#FF6B6B', // Red
  '#20C997', // Teal
  '#6C5CE7', // Indigo
];

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

    const startTime = poll.created_at ? new Date(poll.created_at).getTime() : Date.now() - 24 * 60 * 60 * 1000;
    const totalDuration = new Date(poll.expires_at).getTime() - startTime;

    const updateTimer = () => {
      const now = Date.now();
      const difference = new Date(poll.expires_at).getTime() - now;

      if (difference > 0) {
        const progress = (difference / totalDuration) * 100;
        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 1000,
          useNativeDriver: false,
        }).start();

        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);

        if (days > 0) setTimeLeft(`${days}d left`);
        else if (hours > 0) setTimeLeft(`${hours}h left`);
        else setTimeLeft(`${minutes}m left`);

        if (difference < 60000) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 0.6, duration: 500, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
          ).start();
        } else {
          // Stop any running animations before setting value
          pulseAnim.stopAnimation(() => {
            pulseAnim.setValue(1);
          });
        }
      } else {
        setTimeLeft('Final results');
        progressAnim.setValue(0);
        // Stop pulse animation when poll ends
        pulseAnim.stopAnimation(() => {
          pulseAnim.setValue(1);
        });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [poll.created_at, poll.expires_at, hasEnded]);

  const getProgressBarColor = () => {
    const remainingTime = new Date(poll.expires_at).getTime() - Date.now();
    if (remainingTime < 60000) return '#FF3838';
    if (remainingTime < 300000) return '#FFAB00';
    return '#1DA1F2';
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

    // Assign color based on index
    const optionColor = POLL_COLORS[index % POLL_COLORS.length];

    return (
      <TouchableOpacity
        key={option.id}
        style={[
          styles.optionContainer,
          isSelected && styles.optionContainerSelected,
          isMultipleChoiceSelection && styles.optionContainerSelected,
        ]}
        onPress={() => handleOptionPress(option.id)}
        disabled={showResults}
        accessible={true}
        accessibilityLabel={showResults ? `Option ${option.text}, ${percentage}%` : `Vote for ${option.text}`}
      >
        {showResults && (
          <View
            style={[
              styles.progressBar,
              {
                width: `${percentage}%`,
                backgroundColor: optionColor,
              }
            ]}
          />
        )}
        <View style={styles.optionTextContainer}>
          <Text style={[styles.optionText, showResults && styles.optionTextBold]}>
            {option.text}
          </Text>
          {showResults && (
            <Text style={[styles.percentageText, { color: optionColor }]}>
              {percentage.toFixed(1)}%
            </Text>
          )}
        </View>
        {showResults && isSelected && (
          <Ionicons name="checkmark-circle" size={20} color={optionColor} style={styles.checkIcon} />
        )}
        {isMultipleChoiceSelection && (
          <Ionicons name="checkbox" size={20} color="#1DA1F2" style={styles.checkIcon} />
        )}
      </TouchableOpacity>
    );
  };

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
              },
            ]}
          />
        </View>
      )}

      {poll.question && (
        <Text style={styles.question}>{poll.question}</Text>
      )}

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
        <TouchableOpacity
          style={[
            styles.submitButton,
            selectedOptions.length === 0 && styles.submitButtonDisabled
          ]}
          onPress={handleSubmitMultipleChoice}
          disabled={selectedOptions.length === 0}
        >
          <Text style={styles.submitButtonText}>Submit Vote</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <Text style={styles.totalVotes}>
          {poll.total_votes > 0 ? `${poll.total_votes.toLocaleString()} ${poll.total_votes === 1 ? 'vote' : 'votes'}` : ''}
        </Text>
        <Text style={styles.timeRemaining}>{timeLeft}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#CFD9DE',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  expirationBarContainer: {
    height: 3,
    backgroundColor: '#EFF3F4',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  expirationBar: {
    height: '100%',
    borderRadius: 2,
  },
  question: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    color: '#0F1419',
    lineHeight: 20,
  },
  mediaContainer: {
    marginBottom: 12,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#EFF3F4',
  },
  link: {
    color: '#1DA1F2',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  optionsContainer: {
    gap: 8,
  },
  optionContainer: {
    borderWidth: 1,
    borderColor: '#CFD9DE',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
  },
  optionContainerSelected: {
    borderColor: '#1DA1F2',
    borderWidth: 2,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.15,
    borderRadius: 7,
  },
  optionTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
    zIndex: 1,
  },
  optionText: {
    fontSize: 15,
    flexShrink: 1,
    color: '#0F1419',
    lineHeight: 20,
  },
  optionTextBold: {
    fontWeight: '500',
  },
  percentageText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
  },
  checkIcon: {
    marginLeft: 8,
    zIndex: 1,
  },
  submitButton: {
    backgroundColor: '#1DA1F2',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#AAB8C2',
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalVotes: {
    fontSize: 13,
    color: '#536471',
  },
  timeRemaining: {
    fontSize: 13,
    color: '#536471',
    fontWeight: '500',
  },
});

export default Poll;