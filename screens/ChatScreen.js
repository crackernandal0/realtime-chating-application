import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useChat, useSocket } from '../hooks/useApi';
import { useFocusEffect } from '@react-navigation/native';

const ChatScreen = ({ route, navigation }) => {
  const { user: chatUser, currentUser } = route.params;
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [inputHeight, setInputHeight] = useState(40);
  
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  const { messages, loading, getConversation, setMessages, markAsRead } = useChat();
  const { socket, isConnected } = useSocket();

  const getConversationId = (userId1, userId2) => {
    return [userId1, userId2].sort().join('_');
  };

  const conversationId = getConversationId(currentUser._id, chatUser._id);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      
      return () => {
        if (socket) {
          socket.emit('typing_stop', { receiverId: chatUser._id });
        }
      };
    }, [])
  );

  useEffect(() => {
    navigation.setOptions({
      title: chatUser.name,
      headerRight: () => (
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, chatUser.isOnline && styles.onlineDot]} />
          <Text style={styles.statusText}>
            {chatUser.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      ),
    });
  }, [chatUser, navigation]);

  useEffect(() => {
    if (socket) {
      socket.emit('join_conversation', {
        userId1: currentUser._id,
        userId2: chatUser._id,
      });

      socket.on('new_message', handleNewMessage);
      socket.on('user_typing', handleTypingStatus);
      socket.on('message_sent', handleMessageSent);
      socket.on('messages_read', handleMessagesRead);

      return () => {
        socket.off('new_message', handleNewMessage);
        socket.off('user_typing', handleTypingStatus);
        socket.off('message_sent', handleMessageSent);
        socket.off('messages_read', handleMessagesRead);
      };
    }
  }, [socket, conversationId]);

  const loadMessages = async (pageNum = 1) => {
    try {
      const response = await getConversation(chatUser._id, pageNum);
      setHasMoreMessages(response.pagination.hasMore);
      
      if (pageNum === 1) {
        await markAsRead(conversationId);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load messages');
    }
  };

  const loadMoreMessages = async () => {
    if (loading || !hasMoreMessages) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    await loadMessages(nextPage);
  };

  const handleNewMessage = (newMessage) => {
    if (newMessage.conversationId === conversationId) {
      setMessages(prev => [...prev, newMessage]);
      
      if (newMessage.sender._id === chatUser._id) {
        markAsRead(conversationId);
        if (socket) {
          socket.emit('mark_messages_read', { conversationId });
        }
      }
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleMessageSent = (data) => {
    if (data.success) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleMessagesRead = (data) => {
    if (data.conversationId === conversationId) {
      setMessages(prev => 
        prev.map(msg => 
          msg.sender._id === currentUser._id ? { ...msg, isRead: true } : msg
        )
      );
    }
  };

  const handleTypingStatus = (data) => {
    if (data.userId === chatUser._id) {
      setOtherUserTyping(data.isTyping);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !socket) return;

    const messageText = message.trim();
    setMessage('');
    setInputHeight(40); // Reset input height after sending
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    socket.emit('typing_stop', { receiverId: chatUser._id });
    setIsTyping(false);

    socket.emit('send_message', {
      receiverId: chatUser._id,
      content: messageText,
      messageType: 'text',
    });
  };

  const handleTextChange = (text) => {
    setMessage(text);
    
    if (socket && text.trim()) {
      if (!isTyping) {
        socket.emit('typing_start', { receiverId: chatUser._id });
        setIsTyping(true);
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { receiverId: chatUser._id });
        setIsTyping(false);
      }, 1000);
    } else if (isTyping) {
      socket.emit('typing_stop', { receiverId: chatUser._id });
      setIsTyping(false);
    }
  };

  const handleContentSizeChange = (event) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.max(40, Math.min(height + 20, 120)); // Min 40px, Max 120px
    setInputHeight(newHeight);
  };

  const renderMessage = ({ item, index }) => {
    const isCurrentUser = item.sender._id === currentUser._id;
    const showTimestamp = index === 0 || 
      new Date(item.createdAt).getTime() - new Date(messages[index - 1]?.createdAt).getTime() > 300000;

    return (
      <View>
        {showTimestamp && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestamp}>
              {formatMessageTime(item.createdAt)}
            </Text>
          </View>
        )}
        
        <View style={[
          styles.messageContainer,
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
        ]}>
          <View style={[
            styles.messageBubble,
            isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble
          ]}>
            <Text style={[
              styles.messageText,
              isCurrentUser ? styles.currentUserText : styles.otherUserText
            ]}>
              {item.content}
            </Text>
            
            <View style={styles.messageFooter}>
              <Text style={[
                styles.messageTime,
                isCurrentUser ? styles.currentUserTime : styles.otherUserTime
              ]}>
                {formatTime(item.createdAt)}
              </Text>
              
              {isCurrentUser && (
                <Text style={styles.readStatus}>
                  {item.isRead ? '✓✓' : '✓'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!otherUserTyping) return null;
    
    return (
      <View style={styles.typingContainer}>
        <View style={styles.typingBubble}>
          <Text style={styles.typingText}>{chatUser.name} is typing</Text>
          <View style={styles.typingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        </View>
      </View>
    );
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today ${formatTime(dateString)}`;
    } else {
      return date.toLocaleDateString() + ' ' + formatTime(dateString);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
      enabled
    >
      <View style={styles.messagesContainer}>
        {loading && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.messagesList}
            onEndReached={loadMoreMessages}
            onEndReachedThreshold={0.1}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Start your conversation with {chatUser.name}
                </Text>
              </View>
            }
            ListFooterComponent={renderTypingIndicator}
          />
        )}
      </View>

      <View style={[styles.inputContainer, { minHeight: inputHeight + 24 }]}>
        <View style={styles.connectionStatus}>
          <View style={[styles.connectionDot, isConnected && styles.connected]} />
          <Text style={styles.connectionText}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
        
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.textInput, { height: inputHeight }]}
            placeholder="Type a message..."
            placeholderTextColor="#000"
            value={message}
            onChangeText={handleTextChange}
            onContentSizeChange={handleContentSizeChange}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!message.trim() || !isConnected) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!message.trim() || !isConnected}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc3545',
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#28a745',
  },
  statusText: {
    fontSize: 12,
    color: '#000',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  timestampContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageContainer: {
    marginVertical: 2,
  },
  currentUserMessage: {
    alignItems: 'flex-end',
  },
  otherUserMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  currentUserBubble: {
    backgroundColor: '#007bff',
    borderBottomRightRadius: 4,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  currentUserText: {
    color: '#fff',
  },
  otherUserText: {
    color: '#333',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    marginRight: 4,
  },
  currentUserTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherUserTime: {
    color: '#999',
  },
  readStatus: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  typingContainer: {
    alignItems: 'flex-start',
    marginVertical: 8,
  },
  typingBubble: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typingText: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  typingDots: {
    flexDirection: 'row',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#999',
    marginHorizontal: 1,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc3545',
    marginRight: 6,
  },
  connected: {
    backgroundColor: '#28a745',
  },
  connectionText: {
    fontSize: 11,
    color: '#666',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f8f9fa',
    marginRight: 12,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#007bff',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default ChatScreen;