import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { analyticsAPI } from '../../services/api';

export interface DashboardMetrics {
  totalQuestions: number;
  totalVotes: number;
  totalUsers: number;
  totalMessages: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  averageEngagement: number;
  topCategories: {
    category: string;
    count: number;
    percentage: number;
  }[];
  growthMetrics: {
    questionsGrowth: number;
    usersGrowth: number;
    engagementGrowth: number;
  };
}

export interface UserAnalytics {
  totalQuestions: number;
  totalVotes: number;
  totalMessages: number;
  points: number;
  rank: number;
  streak: number;
  favoriteCategory: string;
  activityPattern: {
    hourly: number[];
    daily: number[];
    monthly: number[];
  };
  votingPatterns: {
    optionAPreference: number;
    optionBPreference: number;
    categories: { [category: string]: number };
  };
  engagementScore: number;
  achievements: string[];
  comparisons: {
    avgQuestionsPerUser: number;
    avgVotesPerUser: number;
    avgMessagesPerUser: number;
  };
}

export interface QuestionAnalytics {
  views: number;
  votes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  votingPattern: {
    optionA: number;
    optionB: number;
    demographics: any;
  };
  timeSeriesData: {
    timestamp: Date;
    votes: number;
    views: number;
  }[];
  popularityScore: number;
  viralScore: number;
}

export interface VotingPatterns {
  byTime: {
    hourly: number[];
    daily: number[];
    weekly: number[];
  };
  byCategory: { [category: string]: number };
  byDifficulty: { [difficulty: string]: number };
  byDemographic: any;
  trends: {
    growing: string[];
    declining: string[];
    stable: string[];
  };
}

export interface EngagementMetrics {
  overallEngagement: number;
  questionEngagement: number;
  chatEngagement: number;
  voteEngagement: number;
  retentionRate: number;
  bounceRate: number;
  sessionDuration: number;
  pageViewsPerSession: number;
  conversionRate: number;
}

interface AnalyticsState {
  dashboard: DashboardMetrics | null;
  userAnalytics: UserAnalytics | null;
  questionAnalytics: { [questionId: string]: QuestionAnalytics };
  votingPatterns: VotingPatterns | null;
  engagementMetrics: EngagementMetrics | null;
  topQuestions: any[];
  topUsers: any[];
  isLoading: boolean;
  isLoadingDashboard: boolean;
  isLoadingUserAnalytics: boolean;
  isLoadingQuestionAnalytics: boolean;
  error: string | null;
  lastUpdated: Date | null;
  filters: {
    timeframe: 'day' | 'week' | 'month' | 'year' | 'all';
    category?: string;
    metric?: string;
  };
}

const initialState: AnalyticsState = {
  dashboard: null,
  userAnalytics: null,
  questionAnalytics: {},
  votingPatterns: null,
  engagementMetrics: null,
  topQuestions: [],
  topUsers: [],
  isLoading: false,
  isLoadingDashboard: false,
  isLoadingUserAnalytics: false,
  isLoadingQuestionAnalytics: false,
  error: null,
  lastUpdated: null,
  filters: {
    timeframe: 'week',
  },
};

// Async thunks
export const fetchDashboard = createAsyncThunk(
  'analytics/fetchDashboard',
  async (_, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getDashboard();
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch dashboard');
    }
  }
);

export const fetchUserAnalytics = createAsyncThunk(
  'analytics/fetchUserAnalytics',
  async (userId: string | undefined, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getUserAnalytics(userId);
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user analytics');
    }
  }
);

export const fetchQuestionAnalytics = createAsyncThunk(
  'analytics/fetchQuestionAnalytics',
  async (questionId: string, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getQuestionAnalytics(questionId);
      return { questionId, analytics: response.data.data };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch question analytics');
    }
  }
);

export const fetchVotingPatterns = createAsyncThunk(
  'analytics/fetchVotingPatterns',
  async (params: { timeframe?: string; category?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getVotingPatterns(params);
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch voting patterns');
    }
  }
);

export const fetchEngagementMetrics = createAsyncThunk(
  'analytics/fetchEngagementMetrics',
  async (_, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getEngagementMetrics();
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch engagement metrics');
    }
  }
);

export const fetchTopQuestions = createAsyncThunk(
  'analytics/fetchTopQuestions',
  async (params: { timeframe?: string; category?: string; limit?: number } | undefined, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getTopQuestions(params);
      return response.data.data.questions;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch top questions');
    }
  }
);

export const fetchTopUsers = createAsyncThunk(
  'analytics/fetchTopUsers',
  async (params: { timeframe?: string; metric?: string; limit?: number } | undefined, { rejectWithValue }) => {
    try {
      const response = await analyticsAPI.getTopUsers(params);
      return response.data.data.users;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch top users');
    }
  }
);

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateFilters: (state, action: PayloadAction<Partial<typeof initialState.filters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: (state) => {
      state.filters = { timeframe: 'week' };
    },
    clearQuestionAnalytics: (state, action: PayloadAction<string>) => {
      delete state.questionAnalytics[action.payload];
    },
    updateQuestionAnalytics: (state, action: PayloadAction<{
      questionId: string;
      analytics: Partial<QuestionAnalytics>;
    }>) => {
      const { questionId, analytics } = action.payload;
      if (state.questionAnalytics[questionId]) {
        state.questionAnalytics[questionId] = {
          ...state.questionAnalytics[questionId],
          ...analytics,
        };
      }
    },
    incrementQuestionView: (state, action: PayloadAction<string>) => {
      const questionId = action.payload;
      if (state.questionAnalytics[questionId]) {
        state.questionAnalytics[questionId].views += 1;
      }
    },
    incrementQuestionVote: (state, action: PayloadAction<{ questionId: string; option: 'A' | 'B' }>) => {
      const { questionId, option } = action.payload;
      if (state.questionAnalytics[questionId]) {
        state.questionAnalytics[questionId].votes += 1;
        if (option === 'A') {
          state.questionAnalytics[questionId].votingPattern.optionA += 1;
        } else {
          state.questionAnalytics[questionId].votingPattern.optionB += 1;
        }
      }
    },
    incrementQuestionComment: (state, action: PayloadAction<string>) => {
      const questionId = action.payload;
      if (state.questionAnalytics[questionId]) {
        state.questionAnalytics[questionId].comments += 1;
      }
    },
    incrementQuestionShare: (state, action: PayloadAction<string>) => {
      const questionId = action.payload;
      if (state.questionAnalytics[questionId]) {
        state.questionAnalytics[questionId].shares += 1;
      }
    },
    resetAnalyticsState: (state) => {
      state.dashboard = null;
      state.userAnalytics = null;
      state.questionAnalytics = {};
      state.votingPatterns = null;
      state.engagementMetrics = null;
      state.topQuestions = [];
      state.topUsers = [];
      state.error = null;
      state.lastUpdated = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Dashboard
      .addCase(fetchDashboard.pending, (state) => {
        state.isLoadingDashboard = true;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.isLoadingDashboard = false;
        state.dashboard = action.payload;
        state.lastUpdated = new Date();
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.isLoadingDashboard = false;
        state.error = action.payload as string;
      })
      // Fetch User Analytics
      .addCase(fetchUserAnalytics.pending, (state) => {
        state.isLoadingUserAnalytics = true;
        state.error = null;
      })
      .addCase(fetchUserAnalytics.fulfilled, (state, action) => {
        state.isLoadingUserAnalytics = false;
        state.userAnalytics = action.payload;
      })
      .addCase(fetchUserAnalytics.rejected, (state, action) => {
        state.isLoadingUserAnalytics = false;
        state.error = action.payload as string;
      })
      // Fetch Question Analytics
      .addCase(fetchQuestionAnalytics.pending, (state) => {
        state.isLoadingQuestionAnalytics = true;
        state.error = null;
      })
      .addCase(fetchQuestionAnalytics.fulfilled, (state, action) => {
        state.isLoadingQuestionAnalytics = false;
        const { questionId, analytics } = action.payload;
        state.questionAnalytics[questionId] = analytics;
      })
      .addCase(fetchQuestionAnalytics.rejected, (state, action) => {
        state.isLoadingQuestionAnalytics = false;
        state.error = action.payload as string;
      })
      // Fetch Voting Patterns
      .addCase(fetchVotingPatterns.fulfilled, (state, action) => {
        state.votingPatterns = action.payload;
      })
      // Fetch Engagement Metrics
      .addCase(fetchEngagementMetrics.fulfilled, (state, action) => {
        state.engagementMetrics = action.payload;
      })
      // Fetch Top Questions
      .addCase(fetchTopQuestions.fulfilled, (state, action) => {
        state.topQuestions = action.payload;
      })
      // Fetch Top Users
      .addCase(fetchTopUsers.fulfilled, (state, action) => {
        state.topUsers = action.payload;
      });
  },
});

export const {
  clearError,
  updateFilters,
  resetFilters,
  clearQuestionAnalytics,
  updateQuestionAnalytics,
  incrementQuestionView,
  incrementQuestionVote,
  incrementQuestionComment,
  incrementQuestionShare,
  resetAnalyticsState,
} = analyticsSlice.actions;

export default analyticsSlice.reducer;