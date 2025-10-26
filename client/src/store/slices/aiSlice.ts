import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { aiAPI } from '../../services/api';

export interface AIQuestion {
  _id: string;
  optionA: string;
  optionB: string;
  category: string;
  difficulty: number;
  aiMetadata: {
    prompt: string;
    model: string;
    generatedAt: Date;
    tokens: number;
    cost: number;
  };
  createdAt: Date;
}

export interface AIStats {
  totalGenerated: number;
  totalTokens: number;
  totalCost: number;
  avgVotes: number;
  avgEngagement: number;
  categoryBreakdown: { [category: string]: number };
  timeframe: string;
}

export interface AILimits {
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  resetTime: Date;
}

export interface GenerationRequest {
  category?: string;
  difficulty?: number;
  theme?: string;
}

interface AIState {
  generatedQuestions: AIQuestion[];
  currentRequest: GenerationRequest | null;
  stats: AIStats | null;
  limits: AILimits | null;
  isGenerating: boolean;
  isLoadingStats: boolean;
  isLoadingLimits: boolean;
  error: string | null;
  lastGenerated: Date | null;
  generationHistory: {
    timestamp: Date;
    request: GenerationRequest;
    success: boolean;
    questionId?: string;
    error?: string;
  }[];
  preferences: {
    favoriteCategories: string[];
    preferredDifficulty: number;
    autoSave: boolean;
    notifications: boolean;
  };
}

const initialState: AIState = {
  generatedQuestions: [],
  currentRequest: null,
  stats: null,
  limits: null,
  isGenerating: false,
  isLoadingStats: false,
  isLoadingLimits: false,
  error: null,
  lastGenerated: null,
  generationHistory: [],
  preferences: {
    favoriteCategories: [],
    preferredDifficulty: 3,
    autoSave: true,
    notifications: true,
  },
};

// Async thunks
export const generateQuestion = createAsyncThunk(
  'ai/generateQuestion',
  async (request: GenerationRequest, { rejectWithValue }) => {
    try {
      const response = await aiAPI.generateQuestion(request);
      return {
        question: response.data.data.question,
        metadata: response.data.data.metadata,
        request,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to generate question');
    }
  }
);

export const fetchAIStats = createAsyncThunk(
  'ai/fetchStats',
  async (timeframe: string | undefined, { rejectWithValue }) => {
    try {
      const response = await aiAPI.getAIStats(timeframe);
      return response.data.data.stats;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch AI stats');
    }
  }
);

export const fetchAILimits = createAsyncThunk(
  'ai/fetchLimits',
  async (_, { rejectWithValue }) => {
    try {
      const response = await aiAPI.getAILimits();
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch AI limits');
    }
  }
);

export const batchGenerate = createAsyncThunk(
  'ai/batchGenerate',
  async (data: { count: number; categories?: string[]; difficulties?: number[] }, { rejectWithValue }) => {
    try {
      const response = await aiAPI.batchGenerate(data);
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to batch generate questions');
    }
  }
);

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentRequest: (state, action: PayloadAction<GenerationRequest | null>) => {
      state.currentRequest = action.payload;
    },
    addGeneratedQuestion: (state, action: PayloadAction<AIQuestion>) => {
      state.generatedQuestions.unshift(action.payload);
      state.lastGenerated = new Date();
    },
    removeGeneratedQuestion: (state, action: PayloadAction<string>) => {
      state.generatedQuestions = state.generatedQuestions.filter(
        q => q._id !== action.payload
      );
    },
    clearGeneratedQuestions: (state) => {
      state.generatedQuestions = [];
    },
    addToHistory: (state, action: PayloadAction<{
      request: GenerationRequest;
      success: boolean;
      questionId?: string;
      error?: string;
    }>) => {
      const historyEntry = {
        timestamp: new Date(),
        ...action.payload,
      };
      
      state.generationHistory.unshift(historyEntry);
      
      // Keep only last 50 entries
      if (state.generationHistory.length > 50) {
        state.generationHistory = state.generationHistory.slice(0, 50);
      }
    },
    clearHistory: (state) => {
      state.generationHistory = [];
    },
    updatePreferences: (state, action: PayloadAction<Partial<AIState['preferences']>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
      
      // Save to localStorage
      try {
        localStorage.setItem('ai-preferences', JSON.stringify(state.preferences));
      } catch (error) {
        console.warn('Failed to save AI preferences to localStorage');
      }
    },
    loadPreferences: (state) => {
      try {
        const saved = localStorage.getItem('ai-preferences');
        if (saved) {
          const preferences = JSON.parse(saved);
          state.preferences = { ...state.preferences, ...preferences };
        }
      } catch (error) {
        console.warn('Failed to load AI preferences from localStorage');
      }
    },
    addFavoriteCategory: (state, action: PayloadAction<string>) => {
      const category = action.payload;
      if (!state.preferences.favoriteCategories.includes(category)) {
        state.preferences.favoriteCategories.push(category);
      }
    },
    removeFavoriteCategory: (state, action: PayloadAction<string>) => {
      const category = action.payload;
      state.preferences.favoriteCategories = state.preferences.favoriteCategories.filter(
        c => c !== category
      );
    },
    updateLimitsUsage: (state, action: PayloadAction<{ used: number }>) => {
      if (state.limits) {
        state.limits.usedToday = action.payload.used;
        state.limits.remaining = Math.max(0, state.limits.dailyLimit - action.payload.used);
      }
    },
    resetAIState: (state) => {
      state.generatedQuestions = [];
      state.currentRequest = null;
      state.stats = null;
      state.error = null;
      state.lastGenerated = null;
      state.generationHistory = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // Generate Question
      .addCase(generateQuestion.pending, (state, action) => {
        state.isGenerating = true;
        state.error = null;
        state.currentRequest = action.meta.arg;
      })
      .addCase(generateQuestion.fulfilled, (state, action) => {
        state.isGenerating = false;
        const { question, metadata, request } = action.payload;
        
        // Add question to generated list
        state.generatedQuestions.unshift(question);
        state.lastGenerated = new Date();
        
        // Add to history
        state.generationHistory.unshift({
          timestamp: new Date(),
          request,
          success: true,
          questionId: question._id,
        });
        
        // Update limits if available
        if (state.limits) {
          state.limits.usedToday += 1;
          state.limits.remaining = Math.max(0, state.limits.dailyLimit - state.limits.usedToday);
        }
        
        // Keep only last 50 history entries
        if (state.generationHistory.length > 50) {
          state.generationHistory = state.generationHistory.slice(0, 50);
        }
      })
      .addCase(generateQuestion.rejected, (state, action) => {
        state.isGenerating = false;
        state.error = action.payload as string;
        
        // Add to history
        if (state.currentRequest) {
          state.generationHistory.unshift({
            timestamp: new Date(),
            request: state.currentRequest,
            success: false,
            error: action.payload as string,
          });
        }
        
        state.currentRequest = null;
      })
      // Fetch AI Stats
      .addCase(fetchAIStats.pending, (state) => {
        state.isLoadingStats = true;
        state.error = null;
      })
      .addCase(fetchAIStats.fulfilled, (state, action) => {
        state.isLoadingStats = false;
        state.stats = action.payload;
      })
      .addCase(fetchAIStats.rejected, (state, action) => {
        state.isLoadingStats = false;
        state.error = action.payload as string;
      })
      // Fetch AI Limits
      .addCase(fetchAILimits.pending, (state) => {
        state.isLoadingLimits = true;
        state.error = null;
      })
      .addCase(fetchAILimits.fulfilled, (state, action) => {
        state.isLoadingLimits = false;
        state.limits = action.payload;
      })
      .addCase(fetchAILimits.rejected, (state, action) => {
        state.isLoadingLimits = false;
        state.error = action.payload as string;
      })
      // Batch Generate
      .addCase(batchGenerate.pending, (state) => {
        state.isGenerating = true;
        state.error = null;
      })
      .addCase(batchGenerate.fulfilled, (state, action) => {
        state.isGenerating = false;
        const { generated, questions } = action.payload;
        
        // Add all generated questions
        questions.forEach((question: AIQuestion) => {
          state.generatedQuestions.unshift(question);
        });
        
        state.lastGenerated = new Date();
        
        // Update limits
        if (state.limits) {
          state.limits.usedToday += generated;
          state.limits.remaining = Math.max(0, state.limits.dailyLimit - state.limits.usedToday);
        }
      })
      .addCase(batchGenerate.rejected, (state, action) => {
        state.isGenerating = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  setCurrentRequest,
  addGeneratedQuestion,
  removeGeneratedQuestion,
  clearGeneratedQuestions,
  addToHistory,
  clearHistory,
  updatePreferences,
  loadPreferences,
  addFavoriteCategory,
  removeFavoriteCategory,
  updateLimitsUsage,
  resetAIState,
} = aiSlice.actions;

export default aiSlice.reducer;