import { io, Socket } from 'socket.io-client';
import { store } from '../store';
import { 
  addMessageReal, 
  updateMessageReal, 
  deleteMessageReal, 
  updateReactionsReal,
  addTypingUser,
  removeTypingUser,
  updateActiveUsers 
} from '../store/slices/chatSlice';
import { updateQuestionStats } from '../store/slices/questionsSlice';
import { updateVoteStats } from '../store/slices/votesSlice';
import { showSuccessNotification, showInfoNotification } from '../store/slices/uiSlice';

class SocketServiceClass {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(token: string) {
    const serverUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
    
    this.socket = io(serverUrl, {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    this.setupEventListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      
      store.dispatch(showSuccessNotification({
        title: 'Connected',
        message: 'Real-time features are now active'
      }));
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.handleReconnect();
    });

    // Authentication events
    this.socket.on('authenticated', (data) => {
      console.log('Socket authenticated:', data.userId);
    });

    this.socket.on('auth_error', (error) => {
      console.error('Socket auth error:', error);
      this.disconnect();
    });

    // Question room events
    this.socket.on('user_joined', (data) => {
      const { questionId, user } = data;
      
      store.dispatch(showInfoNotification({
        title: 'User Joined',
        message: `${user.username} joined the discussion`
      }));
    });

    this.socket.on('user_left', (data) => {
      const { questionId, user } = data;
      
      store.dispatch(showInfoNotification({
        title: 'User Left',
        message: `${user.username} left the discussion`
      }));
    });

    this.socket.on('room_users_updated', (data) => {
      const { questionId, users } = data;
      store.dispatch(updateActiveUsers({ questionId, users }));
    });

    // Chat events
    this.socket.on('new_message', (message) => {
      store.dispatch(addMessageReal(message));
    });

    this.socket.on('message_updated', (message) => {
      store.dispatch(updateMessageReal(message));
    });

    this.socket.on('message_deleted', (data) => {
      const { messageId, questionId } = data;
      store.dispatch(deleteMessageReal({ messageId, questionId }));
    });

    this.socket.on('message_reaction_updated', (data) => {
      const { messageId, questionId, reactions } = data;
      store.dispatch(updateReactionsReal({ messageId, questionId, reactions }));
    });

    // Typing events
    this.socket.on('user_typing', (data) => {
      const { questionId, user } = data;
      store.dispatch(addTypingUser({ questionId, user }));
    });

    this.socket.on('user_stopped_typing', (data) => {
      const { questionId, userId } = data;
      store.dispatch(removeTypingUser({ questionId, userId }));
    });

    // Vote events
    this.socket.on('vote_updated', (data) => {
      const { questionId, stats } = data;
      
      // Update question stats
      store.dispatch(updateQuestionStats({ id: questionId, stats }));
      
      // Update vote stats
      store.dispatch(updateVoteStats({ questionId, stats }));
    });

    // Notification events
    this.socket.on('notification', (notification) => {
      const { type, title, message } = notification;
      
      switch (type) {
        case 'success':
          store.dispatch(showSuccessNotification({ title, message }));
          break;
        case 'info':
          store.dispatch(showInfoNotification({ title, message }));
          break;
        default:
          store.dispatch(showInfoNotification({ title, message }));
      }
    });

    // Presence events
    this.socket.on('user_online', (data) => {
      console.log('User came online:', data.userId);
    });

    this.socket.on('user_offline', (data) => {
      console.log('User went offline:', data.userId);
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.socket?.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  // Question room methods
  joinQuestion(questionId: string) {
    if (this.socket) {
      this.socket.emit('join_question', { questionId });
    }
  }

  leaveQuestion(questionId: string) {
    if (this.socket) {
      this.socket.emit('leave_question', { questionId });
    }
  }

  // Chat methods
  sendMessage(questionId: string, message: string, parentId?: string) {
    if (this.socket) {
      this.socket.emit('send_message', {
        questionId,
        message,
        parentId
      });
    }
  }

  startTyping(questionId: string) {
    if (this.socket) {
      this.socket.emit('typing_start', { questionId });
    }
  }

  stopTyping(questionId: string) {
    if (this.socket) {
      this.socket.emit('typing_stop', { questionId });
    }
  }

  // Vote methods
  broadcastVote(questionId: string, option: 'A' | 'B') {
    if (this.socket) {
      this.socket.emit('vote_cast', {
        questionId,
        option
      });
    }
  }

  // Private message methods
  sendPrivateMessage(toUserId: string, message: string) {
    if (this.socket) {
      this.socket.emit('private_message', {
        toUserId,
        message
      });
    }
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // Event emission helpers
  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export const SocketService = new SocketServiceClass();