const { OpenAI } = require('openai');
const Question = require('../models/Question');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting for AI requests
const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each user to 20 requests per hour
  message: {
    status: 'fail',
    message: 'Too many AI generation requests. Please try again later.'
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for premium users or admins
    return req.user?.role === 'admin' || req.user?.isPremium;
  }
});

// Question generation prompts by category
const categoryPrompts = {
  lifestyle: "Generate a lifestyle-related 'Would You Rather' question that explores personal preferences, daily habits, or life choices. Make the options equally appealing but distinctly different.",
  
  career: "Create a career-focused 'Would You Rather' question about professional choices, work environments, or career paths. Ensure both options represent valid career decisions.",
  
  relationships: "Generate a 'Would You Rather' question about relationships, friendships, or social situations. Make it thought-provoking but respectful and appropriate for all audiences.",
  
  entertainment: "Create an entertainment-related 'Would You Rather' question about movies, music, games, books, or other forms of entertainment. Make both options fun and engaging.",
  
  food: "Generate a food-related 'Would You Rather' question about cuisine, dining experiences, or culinary choices. Make both options appetizing but different.",
  
  travel: "Create a travel-themed 'Would You Rather' question about destinations, travel experiences, or vacation choices. Make both options exciting and appealing.",
  
  technology: "Generate a technology-related 'Would You Rather' question about gadgets, apps, or digital experiences. Focus on realistic tech choices people might face.",
  
  sports: "Create a sports-related 'Would You Rather' question about activities, competitions, or athletic experiences. Make it accessible to both athletes and non-athletes.",
  
  hypothetical: "Generate a creative hypothetical 'Would You Rather' question with imaginative scenarios. Be creative but keep it relatable and engaging.",
  
  moral: "Create a thought-provoking moral or ethical 'Would You Rather' question that explores values and decision-making. Keep it respectful and suitable for general audiences.",
  
  funny: "Generate a humorous 'Would You Rather' question that's entertaining and lighthearted. Make both options amusing but not offensive.",
  
  serious: "Create a serious, thought-provoking 'Would You Rather' question that encourages deep reflection. Make it meaningful without being heavy or depressing.",
  
  random: "Generate a completely random 'Would You Rather' question on any topic. Be creative and surprising while keeping it appropriate and engaging."
};

// Difficulty modifiers
const difficultyModifiers = {
  1: "Make this an easy choice with clearly different options.",
  2: "Make this a fairly easy choice but with some consideration needed.",
  3: "Make this a balanced choice where both options have clear pros and cons.",
  4: "Make this a difficult choice where both options are very appealing.",
  5: "Make this an extremely difficult choice where both options are nearly equally compelling."
};

// Content filtering keywords
const inappropriateKeywords = [
  'kill', 'die', 'death', 'suicide', 'murder', 'violence', 'hate', 'discrimination',
  'sexual', 'sex', 'explicit', 'adult', 'nsfw', 'drug', 'alcohol', 'gambling'
];

// Generate AI question
const generateAIQuestion = async (req, res, next) => {
  try {
    const { category = 'random', difficulty = 3, theme } = req.body;
    const userId = req.user.id;

    // Get user for personalization
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    // Build prompt
    const basePrompt = categoryPrompts[category] || categoryPrompts.random;
    const difficultyModifier = difficultyModifiers[difficulty] || difficultyModifiers[3];
    
    let prompt = `${basePrompt} ${difficultyModifier}`;
    
    if (theme) {
      prompt += ` The theme should relate to: ${theme}.`;
    }

    prompt += `

Format your response EXACTLY as follows:
Option A: [your first option here]
Option B: [your second option here]

Requirements:
- Keep each option under 150 characters
- Make both options family-friendly and appropriate
- Ensure options are balanced and equally compelling
- Avoid controversial topics like politics, religion, or sensitive social issues
- Be creative and engaging
- Don't include any additional text or explanations`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a creative assistant that generates engaging "Would You Rather" questions. Always follow the exact format requested and keep content appropriate for all audiences.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 200,
      temperature: 0.8,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error('No response from AI service');
    }

    // Parse the response
    const lines = response.trim().split('\n').filter(line => line.trim());
    let optionA = '';
    let optionB = '';

    for (const line of lines) {
      if (line.toLowerCase().startsWith('option a:')) {
        optionA = line.substring(9).trim();
      } else if (line.toLowerCase().startsWith('option b:')) {
        optionB = line.substring(9).trim();
      }
    }

    // Validate parsed options
    if (!optionA || !optionB) {
      throw new Error('Could not parse AI response properly');
    }

    // Content filtering
    const fullText = `${optionA} ${optionB}`.toLowerCase();
    const hasInappropriateContent = inappropriateKeywords.some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );

    if (hasInappropriateContent) {
      throw new Error('Generated content failed content filter');
    }

    // Validate option lengths
    if (optionA.length > 200 || optionB.length > 200) {
      throw new Error('Generated options are too long');
    }

    if (optionA.length < 10 || optionB.length < 10) {
      throw new Error('Generated options are too short');
    }

    // Create question in database
    const question = await Question.create({
      createdBy: userId,
      optionA,
      optionB,
      category,
      difficulty,
      type: 'ai',
      aiMetadata: {
        prompt: prompt.substring(0, 500), // Store truncated prompt
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        generatedAt: new Date(),
        tokens: completion.usage?.total_tokens || 0,
        cost: calculateCost(completion.usage?.total_tokens || 0)
      },
      moderation: {
        status: 'approved', // AI questions auto-approved after filtering
        moderatedAt: new Date()
      }
    });

    await question.populate('createdBy', 'username profile.avatar profile.firstName profile.lastName');

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: { 
        'stats.questionsCreated': 1,
        'stats.points': 25 // Fewer points for AI questions vs user-created
      }
    });

    res.status(201).json({
      status: 'success',
      data: {
        question,
        metadata: {
          model: completion.model,
          tokens: completion.usage?.total_tokens || 0,
          generatedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('AI question generation error:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({
        status: 'fail',
        message: 'AI service is temporarily overloaded. Please try again in a few minutes.'
      });
    }

    if (error.code === 'insufficient_quota') {
      return res.status(503).json({
        status: 'fail',
        message: 'AI service is temporarily unavailable. Please try again later.'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to generate AI question. Please try again.'
    });
  }
};

// Get AI generation statistics
const getAIStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const timeframe = req.query.timeframe || 'all'; // daily, weekly, monthly, all

    let dateFilter = {};
    if (timeframe !== 'all') {
      const now = new Date();
      switch (timeframe) {
        case 'daily':
          dateFilter = { createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) } };
          break;
        case 'weekly':
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          dateFilter = { createdAt: { $gte: weekStart } };
          break;
        case 'monthly':
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = { createdAt: { $gte: monthStart } };
          break;
      }
    }

    const stats = await Question.aggregate([
      {
        $match: {
          createdBy: userId,
          type: 'ai',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalGenerated: { $sum: 1 },
          totalTokens: { $sum: '$aiMetadata.tokens' },
          totalCost: { $sum: '$aiMetadata.cost' },
          avgVotes: { $avg: '$stats.totalVotes' },
          avgEngagement: { $avg: '$stats.engagementRate' },
          categories: { $push: '$category' }
        }
      },
      {
        $addFields: {
          categoryBreakdown: {
            $reduce: {
              input: '$categories',
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    $arrayToObject: [
                      [{
                        k: '$$this',
                        v: {
                          $add: [
                            { $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] },
                            1
                          ]
                        }
                      }]
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        stats: stats[0] || {
          totalGenerated: 0,
          totalTokens: 0,
          totalCost: 0,
          avgVotes: 0,
          avgEngagement: 0,
          categoryBreakdown: {}
        },
        timeframe
      }
    });

  } catch (error) {
    console.error('AI stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve AI statistics'
    });
  }
};

// Get AI usage limits for user
const getAILimits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    // Check how many AI questions generated today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await Question.countDocuments({
      createdBy: userId,
      type: 'ai',
      createdAt: { $gte: today }
    });

    // Define limits based on user role/subscription
    let dailyLimit = 5; // Default limit
    if (user.role === 'admin') {
      dailyLimit = 100;
    } else if (user.isPremium) {
      dailyLimit = 25;
    }

    res.status(200).json({
      status: 'success',
      data: {
        dailyLimit,
        usedToday: todayCount,
        remaining: Math.max(0, dailyLimit - todayCount),
        resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('AI limits error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve AI limits'
    });
  }
};

// Calculate cost based on tokens (example pricing)
const calculateCost = (tokens) => {
  const costPerToken = 0.0001; // Example: $0.0001 per token
  return tokens * costPerToken;
};

// Batch generate questions (admin only)
const batchGenerate = async (req, res, next) => {
  try {
    const { count = 10, categories = ['random'], difficulties = [3] } = req.body;
    const userId = req.user.id;

    if (count > 50) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot generate more than 50 questions at once'
      });
    }

    const questions = [];
    const errors = [];

    for (let i = 0; i < count; i++) {
      try {
        const category = categories[i % categories.length];
        const difficulty = difficulties[i % difficulties.length];

        // Use a simplified generation process for batch
        const prompt = `${categoryPrompts[category]} ${difficultyModifiers[difficulty]}

Format: Option A: [option] | Option B: [option]`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'Generate a "Would You Rather" question in the exact format requested.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 150,
          temperature: 0.9
        });

        const response = completion.choices[0]?.message?.content;
        if (response && response.includes('|')) {
          const [optionA, optionB] = response.split('|').map(s => s.replace(/Option [AB]:\s*/i, '').trim());
          
          if (optionA && optionB) {
            const question = await Question.create({
              createdBy: userId,
              optionA,
              optionB,
              category,
              difficulty,
              type: 'ai',
              aiMetadata: {
                model: 'gpt-3.5-turbo',
                generatedAt: new Date(),
                tokens: completion.usage?.total_tokens || 0
              }
            });
            
            questions.push(question);
          }
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        errors.push(`Question ${i + 1}: ${error.message}`);
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        generated: questions.length,
        questions,
        errors
      }
    });

  } catch (error) {
    console.error('Batch generation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Batch generation failed'
    });
  }
};

module.exports = {
  generateAIQuestion,
  getAIStats,
  getAILimits,
  batchGenerate,
  aiRateLimit
};