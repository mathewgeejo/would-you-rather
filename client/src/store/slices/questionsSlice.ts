import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { questionsAPI } from '../../services/api';

export interface Question {
  _id: string;
  createdBy: {
    _id: string;
    username: string;
    profile: {
      avatar?: string;
      firstName?: string;
      lastName?: string;
    };
  };
  optionA: string;
  optionB: string;
  category: string;
  difficulty: number;
  type: 'user' | 'ai';
  aiMetadata?: {
    prompt: string;
    model: string;
    generatedAt: Date;
    tokens: number;
    cost: number;
  };
  stats: {
    totalVotes: number;
    optionAVotes: number;
    optionBVotes: number;
    shares: number;
    comments: number;
    engagementRate: number;
    trending: boolean;
  };
  moderation: {
    status: 'pending' | 'approved' | 'rejected';
    moderatedBy?: string;
    moderatedAt?: Date;
    reason?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionFilters {
  category?: string;
  difficulty?: number;
  type?: 'user' | 'ai';
  sortBy?: 'newest' | 'oldest' | 'trending' | 'popular';
  search?: string;
  timeframe?: 'day' | 'week' | 'month' | 'year' | 'all';
}

interface QuestionsState {
  questions: Question[];
  currentQuestion: Question | null;
  userQuestions: Question[];
  trendingQuestions: Question[];
  filters: QuestionFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  error: string | null;
  searchResults: Question[];
  isSearching: boolean;
  lastFetch: Date | null;
}

const initialState: QuestionsState = {
  questions: [],
  currentQuestion: null,
  userQuestions: [],
  trendingQuestions: [],
  filters: {
    sortBy: 'newest',
    timeframe: 'all',
  },
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    hasMore: true,
  },
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,
  searchResults: [],
  isSearching: false,
  lastFetch: null,
};

// Async thunks
export const fetchQuestions = createAsyncThunk(
  'questions/fetchQuestions',
  async (params: { page?: number; filters?: QuestionFilters }, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.getQuestions(params);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch questions');
    }
  }
);

export const fetchQuestion = createAsyncThunk(
  'questions/fetchQuestion',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.getQuestion(id);
      return response.data.data.question;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch question');
    }
  }
);

export const createQuestion = createAsyncThunk(
  'questions/createQuestion',
  async (questionData: {
    optionA: string;
    optionB: string;
    category: string;
    difficulty: number;
  }, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.createQuestion(questionData);
      return response.data.data.question;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create question');
    }
  }
);

export const updateQuestion = createAsyncThunk(
  'questions/updateQuestion',
  async (params: { id: string; data: Partial<Question> }, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.updateQuestion(params.id, params.data);
      return response.data.data.question;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update question');
    }
  }
);

export const deleteQuestion = createAsyncThunk(
  'questions/deleteQuestion',
  async (id: string, { rejectWithValue }) => {
    try {
      await questionsAPI.deleteQuestion(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete question');
    }
  }
);

export const searchQuestions = createAsyncThunk(
  'questions/searchQuestions',
  async (query: string, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.searchQuestions(query);
      return response.data.data.questions;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Search failed');
    }
  }
);

export const fetchTrendingQuestions = createAsyncThunk(
  'questions/fetchTrendingQuestions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.getTrendingQuestions();
      return response.data.data.questions;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch trending questions');
    }
  }
);

export const fetchUserQuestions = createAsyncThunk(
  'questions/fetchUserQuestions',
  async (userId: string, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.getUserQuestions(userId);
      return response.data.data.questions;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user questions');
    }
  }
);

export const reportQuestion = createAsyncThunk(
  'questions/reportQuestion',
  async (params: { id: string; reason: string }, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.reportQuestion(params.id, params.reason);
      return response.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to report question');
    }
  }
);

export const shareQuestion = createAsyncThunk(
  'questions/shareQuestion',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await questionsAPI.shareQuestion(id);
      return { id, shares: response.data.data.shares };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to share question');
    }
  }
);

const questionsSlice = createSlice({
  name: 'questions',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentQuestion: (state, action: PayloadAction<Question | null>) => {
      state.currentQuestion = action.payload;
    },
    updateFilters: (state, action: PayloadAction<Partial<QuestionFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: (state) => {
      state.filters = {
        sortBy: 'newest',
        timeframe: 'all',
      };
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.page = action.payload;
    },
    resetPagination: (state) => {
      state.pagination = {
        page: 1,
        limit: 10,
        total: 0,
        hasMore: true,
      };
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.isSearching = false;
    },
    updateQuestionStats: (state, action: PayloadAction<{ id: string; stats: Partial<Question['stats']> }>) => {
      const { id, stats } = action.payload;
      
      // Update in main questions array
      const questionIndex = state.questions.findIndex(q => q._id === id);
      if (questionIndex !== -1) {
        state.questions[questionIndex].stats = { 
          ...state.questions[questionIndex].stats, 
          ...stats 
        };
      }
      
      // Update current question if it matches
      if (state.currentQuestion?._id === id) {
        state.currentQuestion.stats = { 
          ...state.currentQuestion.stats, 
          ...stats 
        };
      }
      
      // Update in trending questions
      const trendingIndex = state.trendingQuestions.findIndex(q => q._id === id);
      if (trendingIndex !== -1) {
        state.trendingQuestions[trendingIndex].stats = { 
          ...state.trendingQuestions[trendingIndex].stats, 
          ...stats 
        };
      }
    },
    addQuestion: (state, action: PayloadAction<Question>) => {
      state.questions.unshift(action.payload);
    },
    removeQuestion: (state, action: PayloadAction<string>) => {
      state.questions = state.questions.filter(q => q._id !== action.payload);
      state.userQuestions = state.userQuestions.filter(q => q._id !== action.payload);
      state.trendingQuestions = state.trendingQuestions.filter(q => q._id !== action.payload);
      if (state.currentQuestion?._id === action.payload) {
        state.currentQuestion = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Questions
      .addCase(fetchQuestions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchQuestions.fulfilled, (state, action) => {
        state.isLoading = false;
        const { questions, pagination } = action.payload.data;
        
        if (action.meta.arg.page === 1) {
          state.questions = questions;
        } else {
          state.questions.push(...questions);
        }
        
        state.pagination = pagination;
        state.lastFetch = new Date();
      })
      .addCase(fetchQuestions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch Single Question
      .addCase(fetchQuestion.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchQuestion.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentQuestion = action.payload;
      })
      .addCase(fetchQuestion.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Create Question
      .addCase(createQuestion.pending, (state) => {
        state.isCreating = true;
        state.error = null;
      })
      .addCase(createQuestion.fulfilled, (state, action) => {
        state.isCreating = false;
        state.questions.unshift(action.payload);
        state.userQuestions.unshift(action.payload);
      })
      .addCase(createQuestion.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload as string;
      })
      // Update Question
      .addCase(updateQuestion.pending, (state) => {
        state.isUpdating = true;
        state.error = null;
      })
      .addCase(updateQuestion.fulfilled, (state, action) => {
        state.isUpdating = false;
        const updatedQuestion = action.payload;
        
        // Update in questions array
        const index = state.questions.findIndex(q => q._id === updatedQuestion._id);
        if (index !== -1) {
          state.questions[index] = updatedQuestion;
        }
        
        // Update current question
        if (state.currentQuestion?._id === updatedQuestion._id) {
          state.currentQuestion = updatedQuestion;
        }
      })
      .addCase(updateQuestion.rejected, (state, action) => {
        state.isUpdating = false;
        state.error = action.payload as string;
      })
      // Delete Question
      .addCase(deleteQuestion.fulfilled, (state, action) => {
        const questionId = action.payload;
        state.questions = state.questions.filter(q => q._id !== questionId);
        state.userQuestions = state.userQuestions.filter(q => q._id !== questionId);
        if (state.currentQuestion?._id === questionId) {
          state.currentQuestion = null;
        }
      })
      // Search Questions
      .addCase(searchQuestions.pending, (state) => {
        state.isSearching = true;
        state.error = null;
      })
      .addCase(searchQuestions.fulfilled, (state, action) => {
        state.isSearching = false;
        state.searchResults = action.payload;
      })
      .addCase(searchQuestions.rejected, (state, action) => {
        state.isSearching = false;
        state.error = action.payload as string;
      })
      // Fetch Trending Questions
      .addCase(fetchTrendingQuestions.fulfilled, (state, action) => {
        state.trendingQuestions = action.payload;
      })
      // Fetch User Questions
      .addCase(fetchUserQuestions.fulfilled, (state, action) => {
        state.userQuestions = action.payload;
      })
      // Share Question
      .addCase(shareQuestion.fulfilled, (state, action) => {
        const { id, shares } = action.payload;
        const question = state.questions.find(q => q._id === id);
        if (question) {
          question.stats.shares = shares;
        }
        if (state.currentQuestion?._id === id) {
          state.currentQuestion.stats.shares = shares;
        }
      });
  },
});

export const {
  clearError,
  setCurrentQuestion,
  updateFilters,
  resetFilters,
  setPage,
  resetPagination,
  clearSearchResults,
  updateQuestionStats,
  addQuestion,
  removeQuestion,
} = questionsSlice.actions;

export default questionsSlice.reducer;