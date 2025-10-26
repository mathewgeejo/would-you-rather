const Joi = require('joi');

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message.replace(/"/g, ''))
        .join(', ');

      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, ''),
          value: detail.context.value
        }))
      });
    }

    next();
  };
};

// Auth validation schemas
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(20)
    .required()
    .messages({
      'string.alphanum': 'Username can only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 20 characters',
      'any.required': 'Username is required'
    }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required'
    }),
  firstName: Joi.string()
    .min(2)
    .max(50)
    .optional(),
  lastName: Joi.string()
    .min(2)
    .max(50)
    .optional()
});

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

const resetPasswordSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required'
    }),
  passwordConfirm: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Password confirmation does not match password',
      'any.required': 'Password confirmation is required'
    })
});

// User validation schemas
const updateProfileSchema = Joi.object({
  firstName: Joi.string()
    .min(2)
    .max(50)
    .optional(),
  lastName: Joi.string()
    .min(2)
    .max(50)
    .optional(),
  bio: Joi.string()
    .max(500)
    .optional(),
  socialLinks: Joi.object({
    twitter: Joi.string().uri().optional(),
    instagram: Joi.string().uri().optional(),
    linkedin: Joi.string().uri().optional(),
    website: Joi.string().uri().optional()
  }).optional(),
  preferences: Joi.object({
    emailNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    publicProfile: Joi.boolean().optional()
  }).optional()
});

// Question validation schemas
const createQuestionSchema = Joi.object({
  optionA: Joi.string()
    .min(10)
    .max(200)
    .required()
    .messages({
      'string.min': 'Option A must be at least 10 characters long',
      'string.max': 'Option A cannot exceed 200 characters',
      'any.required': 'Option A is required'
    }),
  optionB: Joi.string()
    .min(10)
    .max(200)
    .required()
    .messages({
      'string.min': 'Option B must be at least 10 characters long',
      'string.max': 'Option B cannot exceed 200 characters',
      'any.required': 'Option B is required'
    }),
  category: Joi.string()
    .valid(
      'lifestyle',
      'career',
      'relationships',
      'entertainment',
      'food',
      'travel',
      'technology',
      'sports',
      'hypothetical',
      'moral',
      'funny',
      'serious',
      'random'
    )
    .required()
    .messages({
      'any.only': 'Invalid category selected',
      'any.required': 'Category is required'
    }),
  tags: Joi.array()
    .items(
      Joi.string()
        .max(20)
        .pattern(/^[a-zA-Z0-9-_]+$/)
    )
    .max(5)
    .optional()
    .messages({
      'array.max': 'Maximum 5 tags allowed',
      'string.max': 'Tag cannot exceed 20 characters',
      'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores'
    }),
  difficulty: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
});

// Vote validation schemas
const voteSchema = Joi.object({
  choice: Joi.string()
    .valid('optionA', 'optionB')
    .required()
    .messages({
      'any.only': 'Choice must be either optionA or optionB',
      'any.required': 'Vote choice is required'
    }),
  decisionTime: Joi.number()
    .integer()
    .min(0)
    .max(300000) // 5 minutes max
    .optional(),
  confidence: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional()
});

// Chat message validation schemas
const chatMessageSchema = Joi.object({
  message: Joi.string()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 1000 characters',
      'any.required': 'Message content is required'
    }),
  parentId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid parent message ID'
    })
});

const reactionSchema = Joi.object({
  type: Joi.string()
    .valid('like', 'love', 'laugh', 'wow', 'sad', 'angry')
    .required()
    .messages({
      'any.only': 'Invalid reaction type',
      'any.required': 'Reaction type is required'
    })
});

// AI question generation schema
const aiQuestionSchema = Joi.object({
  category: Joi.string()
    .valid(
      'lifestyle',
      'career',
      'relationships',
      'entertainment',
      'food',
      'travel',
      'technology',
      'sports',
      'hypothetical',
      'moral',
      'funny',
      'serious',
      'random'
    )
    .optional(),
  difficulty: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .optional(),
  theme: Joi.string()
    .max(100)
    .optional()
});

// Query validation schemas
const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),
  sort: Joi.string()
    .valid('newest', 'oldest', 'popular', 'trending')
    .default('newest'),
  category: Joi.string()
    .valid(
      'lifestyle',
      'career',
      'relationships',
      'entertainment',
      'food',
      'travel',
      'technology',
      'sports',
      'hypothetical',
      'moral',
      'funny',
      'serious',
      'random'
    )
    .optional(),
  search: Joi.string()
    .max(100)
    .optional()
});

// MongoDB ObjectId validation
const objectIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid ID format',
      'any.required': 'ID is required'
    })
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  createQuestionSchema,
  voteSchema,
  chatMessageSchema,
  reactionSchema,
  aiQuestionSchema,
  paginationSchema,
  objectIdSchema
};