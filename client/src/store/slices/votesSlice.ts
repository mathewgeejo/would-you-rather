import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { votesAPI } from '../../services/api';

export interface Vote {
  _id: string;
  userId: string;
  questionId: string;
  option: 'A' | 'B';
  createdAt: Date;
  updatedAt: Date;
}

export interface VoteStats {
  questionId: string;
  totalVotes: number;
  optionAVotes: number;
  optionBVotes: number;
  optionAPercentage: number;
  optionBPercentage: number;
  userChoice?: 'A' | 'B';
  trends: {
    hourly: number[];
    daily: number[];
    demographic: any;
  };
}

interface VotesState {
  userVotes: Vote[];
  questionVotes: { [questionId: string]: VoteStats };
  currentVote: Vote | null;
  isLoading: boolean;
  isVoting: boolean;
  error: string | null;
  votingTrends: any[];
  lastVoteTime: Date | null;
}

const initialState: VotesState = {
  userVotes: [],
  questionVotes: {},
  currentVote: null,
  isLoading: false,
  isVoting: false,
  error: null,
  votingTrends: [],
  lastVoteTime: null,
};

// Async thunks
export const submitVote = createAsyncThunk(
  'votes/submitVote',
  async (data: { questionId: string; option: 'A' | 'B' }, { rejectWithValue }) => {
    try {
      const response = await votesAPI.vote(data.questionId, data.option);
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit vote');
    }
  }
);

export const updateVote = createAsyncThunk(
  'votes/updateVote',
  async (data: { voteId: string; option: 'A' | 'B' }, { rejectWithValue }) => {
    try {
      const response = await votesAPI.updateVote(data.voteId, data.option);
      return response.data.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update vote');
    }
  }
);

export const deleteVote = createAsyncThunk(
  'votes/deleteVote',
  async (voteId: string, { rejectWithValue }) => {
    try {
      await votesAPI.deleteVote(voteId);
      return voteId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete vote');
    }
  }
);

export const fetchUserVotes = createAsyncThunk(
  'votes/fetchUserVotes',
  async (userId: string | undefined, { rejectWithValue }) => {
    try {
      const response = await votesAPI.getUserVotes(userId);
      return response.data.data.votes;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user votes');
    }
  }
);

export const fetchQuestionVotes = createAsyncThunk(
  'votes/fetchQuestionVotes',
  async (questionId: string, { rejectWithValue }) => {
    try {
      const response = await votesAPI.getQuestionVotes(questionId);
      return { questionId, votes: response.data.data.votes };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch question votes');
    }
  }
);

export const fetchVoteStats = createAsyncThunk(
  'votes/fetchVoteStats',
  async (questionId: string, { rejectWithValue }) => {
    try {
      const response = await votesAPI.getVoteStats(questionId);
      return { questionId, stats: response.data.data };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch vote stats');
    }
  }
);

export const fetchVotingTrends = createAsyncThunk(
  'votes/fetchVotingTrends',
  async (params: { timeframe?: string; category?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await votesAPI.getVotingTrends(params);
      return response.data.data.trends;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch voting trends');
    }
  }
);

const votesSlice = createSlice({
  name: 'votes',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentVote: (state, action: PayloadAction<Vote | null>) => {
      state.currentVote = action.payload;
    },
    updateVoteStats: (state, action: PayloadAction<{ questionId: string; stats: Partial<VoteStats> }>) => {
      const { questionId, stats } = action.payload;
      if (state.questionVotes[questionId]) {
        state.questionVotes[questionId] = {
          ...state.questionVotes[questionId],
          ...stats,
        };
      } else {
        state.questionVotes[questionId] = stats as VoteStats;
      }
    },
    addVote: (state, action: PayloadAction<Vote>) => {
      const newVote = action.payload;
      
      // Add to user votes
      const existingVoteIndex = state.userVotes.findIndex(
        v => v.questionId === newVote.questionId
      );
      
      if (existingVoteIndex !== -1) {
        state.userVotes[existingVoteIndex] = newVote;
      } else {
        state.userVotes.push(newVote);
      }
      
      // Update vote stats
      const questionId = newVote.questionId;
      if (state.questionVotes[questionId]) {
        const stats = state.questionVotes[questionId];
        stats.userChoice = newVote.option;
        stats.totalVotes += 1;
        
        if (newVote.option === 'A') {
          stats.optionAVotes += 1;
        } else {
          stats.optionBVotes += 1;
        }
        
        // Recalculate percentages
        stats.optionAPercentage = (stats.optionAVotes / stats.totalVotes) * 100;
        stats.optionBPercentage = (stats.optionBVotes / stats.totalVotes) * 100;
      }
      
      state.lastVoteTime = new Date();
    },
    removeVote: (state, action: PayloadAction<string>) => {
      const voteId = action.payload;
      const voteIndex = state.userVotes.findIndex(v => v._id === voteId);
      
      if (voteIndex !== -1) {
        const vote = state.userVotes[voteIndex];
        const questionId = vote.questionId;
        
        // Remove from user votes
        state.userVotes.splice(voteIndex, 1);
        
        // Update vote stats
        if (state.questionVotes[questionId]) {
          const stats = state.questionVotes[questionId];
          stats.userChoice = undefined;
          stats.totalVotes -= 1;
          
          if (vote.option === 'A') {
            stats.optionAVotes -= 1;
          } else {
            stats.optionBVotes -= 1;
          }
          
          // Recalculate percentages
          if (stats.totalVotes > 0) {
            stats.optionAPercentage = (stats.optionAVotes / stats.totalVotes) * 100;
            stats.optionBPercentage = (stats.optionBVotes / stats.totalVotes) * 100;
          } else {
            stats.optionAPercentage = 0;
            stats.optionBPercentage = 0;
          }
        }
      }
    },
    clearUserVotes: (state) => {
      state.userVotes = [];
    },
    clearQuestionVotes: (state, action: PayloadAction<string>) => {
      delete state.questionVotes[action.payload];
    },
    resetVotesState: (state) => {
      state.userVotes = [];
      state.questionVotes = {};
      state.currentVote = null;
      state.error = null;
      state.votingTrends = [];
      state.lastVoteTime = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Submit Vote
      .addCase(submitVote.pending, (state) => {
        state.isVoting = true;
        state.error = null;
      })
      .addCase(submitVote.fulfilled, (state, action) => {
        state.isVoting = false;
        const newVote = action.payload.vote;
        const stats = action.payload.stats;
        
        // Add vote to user votes
        const existingVoteIndex = state.userVotes.findIndex(
          v => v.questionId === newVote.questionId
        );
        
        if (existingVoteIndex !== -1) {
          state.userVotes[existingVoteIndex] = newVote;
        } else {
          state.userVotes.push(newVote);
        }
        
        // Update question vote stats
        state.questionVotes[newVote.questionId] = stats;
        state.lastVoteTime = new Date();
      })
      .addCase(submitVote.rejected, (state, action) => {
        state.isVoting = false;
        state.error = action.payload as string;
      })
      // Update Vote
      .addCase(updateVote.pending, (state) => {
        state.isVoting = true;
        state.error = null;
      })
      .addCase(updateVote.fulfilled, (state, action) => {
        state.isVoting = false;
        const updatedVote = action.payload.vote;
        const stats = action.payload.stats;
        
        // Update in user votes
        const voteIndex = state.userVotes.findIndex(v => v._id === updatedVote._id);
        if (voteIndex !== -1) {
          state.userVotes[voteIndex] = updatedVote;
        }
        
        // Update question vote stats
        state.questionVotes[updatedVote.questionId] = stats;
      })
      .addCase(updateVote.rejected, (state, action) => {
        state.isVoting = false;
        state.error = action.payload as string;
      })
      // Delete Vote
      .addCase(deleteVote.fulfilled, (state, action) => {
        const voteId = action.payload;
        state.userVotes = state.userVotes.filter(v => v._id !== voteId);
      })
      // Fetch User Votes
      .addCase(fetchUserVotes.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUserVotes.fulfilled, (state, action) => {
        state.isLoading = false;
        state.userVotes = action.payload;
      })
      .addCase(fetchUserVotes.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch Vote Stats
      .addCase(fetchVoteStats.fulfilled, (state, action) => {
        const { questionId, stats } = action.payload;
        state.questionVotes[questionId] = stats;
      })
      // Fetch Voting Trends
      .addCase(fetchVotingTrends.fulfilled, (state, action) => {
        state.votingTrends = action.payload;
      });
  },
});

export const {
  clearError,
  setCurrentVote,
  updateVoteStats,
  addVote,
  removeVote,
  clearUserVotes,
  clearQuestionVotes,
  resetVotesState,
} = votesSlice.actions;

export default votesSlice.reducer;