import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3000/api';
// const SOCKET_URL = 'https://chat-backend-e49f.onrender.com';
const SOCKET_URL = 'http://localhost:3000';
const TEST_API_URL = 'http://localhost:3000';
class ApiService {
  constructor() {
    this.token = null;
    this.socket = null;
    this.baseURL = API_BASE_URL;
  }

  async setToken(token) {
    this.token = token;
    if (token) {
      await AsyncStorage.setItem('authToken', token);
    } else {
      await AsyncStorage.removeItem('authToken');
    }
  }

  async getToken() {
    if (!this.token) {
      this.token = await AsyncStorage.getItem('authToken');
    }
    return this.token;
  }
  async testApi() {
    try {
      console.log('Testing JSONPlaceholder API at:', TEST_API_URL);
      const response = await fetch(`${TEST_API_URL}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('Test API Status:', response.status);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Test API error! status: ${response.status}`);
      }
      return { success: true, data };
    } catch (error) {
      console.error('Test API Error:', error);
      return { success: false, error: error.message };
    }
  }

  async request(endpoint, options = {}) {
    const token = await this.getToken();
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        console.log('data.error: ', data.error);
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data,
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data,
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  initializeSocket(token) {
    // Clean up existing connection
    if (this.socket) {
      console.log('Cleaning up existing socket connection');
      this.socket.disconnect();
      this.socket = null;
    }

    console.log('Initializing new socket connection to:', SOCKET_URL);
    
    this.socket = io(SOCKET_URL, {
      auth: token ? { token } : {}, // Optional token for anonymous connections
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    // Enhanced event listeners
    this.socket.on('connect', () => {
      console.log('Socket connected successfully:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
    });

    return this.socket;
  }

  getSocket() {
    return this.socket;
  }

  disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

const apiService = new ApiService();

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await apiService.getToken();
      if (token) {
        const response = await apiService.get('/auth/me');
        setUser(response.user);
        apiService.initializeSocket(token);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await apiService.setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.post('/auth/login', { email, password });
      
      await apiService.setToken(response.token);
      setUser(response.user);
      apiService.initializeSocket(response.token);
      
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email, password, name) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.post('/auth/signup', { email, password, name });
      
      await apiService.setToken(response.token);
      setUser(response.user);
      apiService.initializeSocket(response.token);
      
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiService.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await apiService.setToken(null);
      setUser(null);
      apiService.disconnectSocket();
    }
  };

  return {
    user,
    loading,
    error,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
  };
};

export const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsers = async (search = '') => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.get(`/users?search=${encodeURIComponent(search)}`);
      setUsers(response.users);
      
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getOnlineUsers = async () => {
    try {
      const response = await apiService.get('/users/online');
      return response.users;
    } catch (error) {
      console.error('Get online users error:', error);
      throw error;
    }
  };

  return {
    users,
    loading,
    error,
    fetchUsers,
    getOnlineUsers,
  };
};

export const useChat = () => {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Set());

  const sendMessage = async (receiverId, content, messageType = 'text') => {
    try {
      const response = await apiService.post('/chat/send', {
        receiverId,
        content,
        messageType,
      });
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const getConversation = async (userId, page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.get(`/chat/conversation/${userId}?page=${page}`);
      
      if (page === 1) {
        setMessages(response.messages);
      } else {
        setMessages(prev => [...response.messages, ...prev]);
      }
      
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getConversations = async () => {
    try {
      const response = await apiService.get('/chat/conversations');
      setConversations(response.conversations);
      return response;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const markAsRead = async (conversationId) => {
    try {
      await apiService.put(`/chat/mark-read/${conversationId}`);
    } catch (error) {
      // console.error('Mark as read error:', error);
    }
  };

  return {
    messages,
    conversations,
    loading,
    error,
    typingUsers,
    sendMessage,
    getConversation,
    getConversations,
    markAsRead,
    setMessages,
    setTypingUsers,
  };
};

export const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = apiService.getSocket();
    if (socketInstance) {
      setSocket(socketInstance);
      setIsConnected(socketInstance.connected);

      socketInstance.on('connect', () => setIsConnected(true));
      socketInstance.on('disconnect', () => setIsConnected(false));

      return () => {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
      };
    }
  }, []);

  return {
    socket,
    isConnected,
  };
};



  

export default apiService;