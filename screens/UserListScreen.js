import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth, useUsers, useSocket } from '../hooks/useApi';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native'; // Import useNavigation

const UserListScreen = () => {
    const navigation = useNavigation(); // Use the top-level navigation object

  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const { user, logout } = useAuth();
  const { users, loading, fetchUsers } = useUsers();
  const { socket, isConnected } = useSocket();
  console.log('socket: ', socket);
  // console.log('isConnected: ', isConnected);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [])
  );

  useEffect(() => {
    if (socket) {
      socket.on('user_online', (data) => {
        setOnlineUsers(prev => new Set([...prev, data.userId]));
      });

      socket.on('user_offline', (data) => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      });

      socket.on('online_users', (userIds) => {
        setOnlineUsers(new Set(userIds));
      });

      socket.emit('get_online_users');

      return () => {
        socket.off('user_online');
        socket.off('user_offline');
        socket.off('online_users');
      };
    }
  }, [socket]);

  const loadUsers = async () => {
    try {
      await fetchUsers(searchQuery);
    } catch (error) {
      Alert.alert('Error', 'Failed to load users');
    }
  };

  const handleSearch = useCallback(
    debounce((query) => {
      fetchUsers(query);
    }, 300),
    []
  );

  useEffect(() => {
    handleSearch(searchQuery);
  }, [searchQuery, handleSearch]);

  const handleUserPress = (selectedUser) => {
    navigation.navigate('Chat', {
      user: selectedUser,
      currentUser: user,
    });
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.navigate('Login');
          },
        },
      ]
    );
  };

  const renderUser = ({ item }) => {
    const isOnline = onlineUsers.has(item._id);
    
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleUserPress(item)}
      >
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, isOnline && styles.onlineAvatar]}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            {isOnline && <View style={styles.onlineIndicator} />}
          </View>
          
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            <Text style={[styles.userStatus, isOnline && styles.onlineStatus]}>
              {isOnline ? 'Online' : `Last seen ${formatLastSeen(item.lastSeen)}`}
            </Text>
          </View>
        </View>
        
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const formatLastSeen = (lastSeen) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'recently';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return `${Math.floor(diffInHours / 24)}d ago`;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={styles.connectionStatus}>
            <View style={[styles.connectionDot, isConnected && styles.connected]} />
            <Text style={styles.connectionText}>
              {isConnected ? 'Connected' : 'Connecting...'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput

            placeholderTextColor="#000"
          style={styles.searchInput}
          placeholder="Search users..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading && users.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadUsers} />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No users found' : 'No users available'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc3545',
    marginRight: 6,
  },
  connected: {
    backgroundColor: '#28a745',
  },
  connectionText: {
    fontSize: 12,
    color: '#666',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#dc3545',
    borderRadius: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  listContainer: {
    paddingVertical: 8,
  },
  userItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineAvatar: {
    borderWidth: 2,
    borderColor: '#28a745',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#28a745',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  userStatus: {
    fontSize: 12,
    color: '#999',
  },
  onlineStatus: {
    color: '#28a745',
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 8,
  },
  chevronText: {
    fontSize: 20,
    color: '#ccc',
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

export default UserListScreen;