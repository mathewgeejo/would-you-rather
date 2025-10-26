import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { chatAPI } from '../../services/api';

export interface ChatMessage {
  _id: string;
  user: {
    _id: string;
    username: string;
    profile: {
      avatar?: string;
      firstName?: string;
      lastName?: string;
    };
  };
  questionId: string;
  message: string;
  parentId?: string;
  replies: ChatMessage[];
  reactions: {
    emoji: string;
    users: string[];
    count: number;
  }[];
  isEdited: boolean;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TypingUser {
  userId: string;
  username: string;
  timestamp: Date;
}

interface ChatState {
  messages: { [questionId: string]: ChatMessage[] };
  currentQuestionId: string | null;
  typingUsers: { [questionId: string]: TypingUser[] };
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  pagination: { [questionId: string]: {
    page: number;
    limit: number;
    hasMore: boolean;
  }};
  activeUsers: { [questionId: string]: string[] };
  lastMessageTime: Date | null;
}

const initialState: ChatState = {
  messages: {},
  currentQuestionId: null,
  typingUsers: {},
  isLoading: false,
  isSending: false,
  error: null,
  pagination: {},
  activeUsers: {},
  lastMessageTime: null,
};

// Async thunks
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (params: { questionId: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.getMessages(params.questionId, {
        page: params.page,
        limit: params.limit,
      });
      return {
        questionId: params.questionId,
        messages: response.data.data.messages,
        pagination: response.data.data.pagination,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch messages');
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (data: { questionId: string; message: string; parentId?: string }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.sendMessage(data);
      return response.data.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send message');
    }
  }
);

export const updateMessage = createAsyncThunk(
  'chat/updateMessage',
  async (data: { messageId: string; message: string }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.updateMessage(data.messageId, data.message);
      return response.data.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update message');
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async (messageId: string, { rejectWithValue }) => {
    try {
      await chatAPI.deleteMessage(messageId);
      return messageId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete message');
    }
  }
);

export const addReaction = createAsyncThunk(
  'chat/addReaction',
  async (data: { messageId: string; emoji: string }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.addReaction(data.messageId, data.emoji);
      return {
        messageId: data.messageId,
        reactions: response.data.data.reactions,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add reaction');
    }
  }
);

export const removeReaction = createAsyncThunk(
  'chat/removeReaction',
  async (data: { messageId: string; emoji: string }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.removeReaction(data.messageId, data.emoji);
      return {
        messageId: data.messageId,
        reactions: response.data.data.reactions,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove reaction');
    }
  }
);

export const reportMessage = createAsyncThunk(
  'chat/reportMessage',
  async (data: { messageId: string; reason: string }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.reportMessage(data.messageId, data.reason);
      return response.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to report message');
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentQuestionId: (state, action: PayloadAction<string | null>) => {
      state.currentQuestionId = action.payload;
    },
    addMessageReal: (state, action: PayloadAction<ChatMessage>) => {
      const message = action.payload;
      const questionId = message.questionId;
      
      if (!state.messages[questionId]) {
        state.messages[questionId] = [];
      }
      
      // Add message to the end (newest messages at bottom)
      state.messages[questionId].push(message);
      state.lastMessageTime = new Date();
    },
    updateMessageReal: (state, action: PayloadAction<ChatMessage>) => {
      const updatedMessage = action.payload;
      const questionId = updatedMessage.questionId;
      
      if (state.messages[questionId]) {
        const messageIndex = state.messages[questionId].findIndex(
          m => m._id === updatedMessage._id
        );
        if (messageIndex !== -1) {
          state.messages[questionId][messageIndex] = updatedMessage;
        }
      }
    },
    deleteMessageReal: (state, action: PayloadAction<{ messageId: string; questionId: string }>) => {
      const { messageId, questionId } = action.payload;
      
      if (state.messages[questionId]) {
        state.messages[questionId] = state.messages[questionId].filter(
          m => m._id !== messageId
        );
      }
    },
    updateReactionsReal: (state, action: PayloadAction<{
      messageId: string;
      questionId: string;
      reactions: ChatMessage['reactions'];
    }>) => {
      const { messageId, questionId, reactions } = action.payload;
      
      if (state.messages[questionId]) {
        const messageIndex = state.messages[questionId].findIndex(
          m => m._id === messageId
        );
        if (messageIndex !== -1) {
          state.messages[questionId][messageIndex].reactions = reactions;
        }
      }
    },
    addTypingUser: (state, action: PayloadAction<{
      questionId: string;
      user: { userId: string; username: string };
    }>) => {
      const { questionId, user } = action.payload;
      
      if (!state.typingUsers[questionId]) {
        state.typingUsers[questionId] = [];
      }
      
      // Remove existing entry for this user
      state.typingUsers[questionId] = state.typingUsers[questionId].filter(
        u => u.userId !== user.userId
      );
      
      // Add new entry
      state.typingUsers[questionId].push({
        userId: user.userId,
        username: user.username,
        timestamp: new Date(),
      });
    },
    removeTypingUser: (state, action: PayloadAction<{
      questionId: string;
      userId: string;
    }>) => {
      const { questionId, userId } = action.payload;
      
      if (state.typingUsers[questionId]) {
        state.typingUsers[questionId] = state.typingUsers[questionId].filter(
          u => u.userId !== userId
        );
      }
    },
    clearTypingUsers: (state, action: PayloadAction<string>) => {
      const questionId = action.payload;
      state.typingUsers[questionId] = [];
    },
    updateActiveUsers: (state, action: PayloadAction<{
      questionId: string;
      users: string[];
    }>) => {
      const { questionId, users } = action.payload;
      state.activeUsers[questionId] = users;
    },
    clearMessages: (state, action: PayloadAction<string>) => {
      const questionId = action.payload;
      delete state.messages[questionId];
      delete state.typingUsers[questionId];
      delete state.pagination[questionId];
      delete state.activeUsers[questionId];
    },
    resetChatState: (state) => {
      state.messages = {};
      state.currentQuestionId = null;
      state.typingUsers = {};
      state.error = null;
      state.pagination = {};
      state.activeUsers = {};
      state.lastMessageTime = null;
    },
    cleanupOldTypingUsers: (state) => {
      const now = new Date();
      const timeout = 5000; // 5 seconds
      
      Object.keys(state.typingUsers).forEach(questionId => {
        state.typingUsers[questionId] = state.typingUsers[questionId].filter(
          user => now.getTime() - user.timestamp.getTime() < timeout
        );
      });
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Messages
      .addCase(fetchMessages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        const { questionId, messages, pagination } = action.payload;
        
        if (pagination.page === 1) {
          state.messages[questionId] = messages;
        } else {
          // Prepend older messages
          if (state.messages[questionId]) {
            state.messages[questionId] = [...messages, ...state.messages[questionId]];
          } else {
            state.messages[questionId] = messages;
          }
        }
        
        state.pagination[questionId] = pagination;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Send Message
      .addCase(sendMessage.pending, (state) => {
        state.isSending = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isSending = false;
        const message = action.payload;
        const questionId = message.questionId;
        
        if (!state.messages[questionId]) {
          state.messages[questionId] = [];
        }
        
        state.messages[questionId].push(message);
        state.lastMessageTime = new Date();
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isSending = false;
        state.error = action.payload as string;
      })
      // Update Message
      .addCase(updateMessage.fulfilled, (state, action) => {
        const updatedMessage = action.payload;
        const questionId = updatedMessage.questionId;
        
        if (state.messages[questionId]) {
          const messageIndex = state.messages[questionId].findIndex(
            m => m._id === updatedMessage._id
          );
          if (messageIndex !== -1) {
            state.messages[questionId][messageIndex] = updatedMessage;
          }
        }
      })
      // Delete Message
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const messageId = action.payload;
        
        // Find and remove message from all question chats
        Object.keys(state.messages).forEach(questionId => {
          state.messages[questionId] = state.messages[questionId].filter(
            m => m._id !== messageId
          );
        });
      })
      // Add/Remove Reactions
      .addCase(addReaction.fulfilled, (state, action) => {
        const { messageId, reactions } = action.payload;
        
        // Update reactions for the message in all question chats
        Object.keys(state.messages).forEach(questionId => {
          const messageIndex = state.messages[questionId].findIndex(
            m => m._id === messageId
          );
          if (messageIndex !== -1) {
            state.messages[questionId][messageIndex].reactions = reactions;
          }
        });
      })
      .addCase(removeReaction.fulfilled, (state, action) => {
        const { messageId, reactions } = action.payload;
        
        // Update reactions for the message in all question chats
        Object.keys(state.messages).forEach(questionId => {
          const messageIndex = state.messages[questionId].findIndex(
            m => m._id === messageId
          );
          if (messageIndex !== -1) {
            state.messages[questionId][messageIndex].reactions = reactions;
          }
        });
      });
  },
});

export const {
  clearError,
  setCurrentQuestionId,
  addMessageReal,
  updateMessageReal,
  deleteMessageReal,
  updateReactionsReal,
  addTypingUser,
  removeTypingUser,
  clearTypingUsers,
  updateActiveUsers,
  clearMessages,
  resetChatState,
  cleanupOldTypingUsers,
} = chatSlice.actions;

export default chatSlice.reducer;