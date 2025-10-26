const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Question = require('../models/Question');
const ChatMessage = require('../models/ChatMessage');

// Store active users
const activeUsers = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return next(new Error('Authentication error: Invalid user'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
};

// Handle socket connections
const handleConnection = (io) => {
  return (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);

    // Add user to active users
    activeUsers.set(socket.user._id.toString(), {
      socketId: socket.id,
      user: {
        _id: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.profile.avatar
      },
      connectedAt: new Date(),
      currentRoom: null
    });

    // Join user's personal room for notifications
    socket.join(`user_${socket.user._id}`);

    // Emit user online status
    socket.broadcast.emit('user_online', {
      userId: socket.user._id,
      username: socket.user.username,
      avatar: socket.user.profile.avatar
    });

    // Handle joining question rooms
    socket.on('join_question', async (data) => {
      try {
        const { questionId } = data;
        
        // Validate question exists
        const question = await Question.findById(questionId);
        if (!question) {
          return socket.emit('error', { message: 'Question not found' });
        }

        // Leave previous room
        if (activeUsers.get(socket.user._id.toString())?.currentRoom) {
          const previousRoom = activeUsers.get(socket.user._id.toString()).currentRoom;
          socket.leave(previousRoom);
          socket.to(previousRoom).emit('user_left_room', {
            userId: socket.user._id,
            username: socket.user.username
          });
        }

        // Join new room
        const roomName = `question_${questionId}`;
        socket.join(roomName);
        
        // Update user's current room
        const userData = activeUsers.get(socket.user._id.toString());
        if (userData) {
          userData.currentRoom = roomName;
        }

        // Notify room members
        socket.to(roomName).emit('user_joined_room', {
          userId: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.profile.avatar
        });

        // Send current room stats
        const roomUsers = await getRoomUsers(io, roomName);
        socket.emit('room_joined', {
          questionId,
          activeUsers: roomUsers.length,
          users: roomUsers.slice(0, 10) // Limit to 10 users for performance
        });

      } catch (error) {
        console.error('Error joining question room:', error);
        socket.emit('error', { message: 'Failed to join question room' });
      }
    });

    // Handle leaving question rooms
    socket.on('leave_question', (data) => {
      const { questionId } = data;
      const roomName = `question_${questionId}`;
      
      socket.leave(roomName);
      socket.to(roomName).emit('user_left_room', {
        userId: socket.user._id,
        username: socket.user.username
      });

      // Update user's current room
      const userData = activeUsers.get(socket.user._id.toString());
      if (userData) {
        userData.currentRoom = null;
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { questionId } = data;
      const roomName = `question_${questionId}`;
      
      socket.to(roomName).emit('user_typing', {
        userId: socket.user._id,
        username: socket.user.username,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { questionId } = data;
      const roomName = `question_${questionId}`;
      
      socket.to(roomName).emit('user_typing', {
        userId: socket.user._id,
        username: socket.user.username,
        isTyping: false
      });
    });

    // Handle real-time voting
    socket.on('vote_cast', (data) => {
      const { questionId, choice } = data;
      const roomName = `question_${questionId}`;
      
      // This is handled by the vote controller, but we can emit additional events
      socket.to(roomName).emit('vote_activity', {
        userId: socket.user._id,
        username: socket.user.username,
        choice
      });
    });

    // Handle real-time messages
    socket.on('send_message', async (data) => {
      try {
        const { questionId, message, parentId } = data;
        
        // Basic validation (full validation is in controller)
        if (!message || message.trim().length === 0) {
          return socket.emit('error', { message: 'Message cannot be empty' });
        }

        if (message.length > 1000) {
          return socket.emit('error', { message: 'Message too long' });
        }

        // Create message (simplified - in production, use the controller)
        const chatMessage = await ChatMessage.create({
          questionId,
          userId: socket.user._id,
          message: message.trim(),
          parentId: parentId || null
        });

        await chatMessage.populate('userId', 'username profile.avatar profile.firstName profile.lastName stats.level');

        // Emit to room
        const roomName = `question_${questionId}`;
        io.to(roomName).emit('new_message', {
          message: chatMessage,
          questionId
        });

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle presence updates
    socket.on('update_presence', (data) => {
      const { status } = data; // online, away, busy
      
      const userData = activeUsers.get(socket.user._id.toString());
      if (userData) {
        userData.status = status;
        userData.lastSeen = new Date();
      }

      // Broadcast presence update
      socket.broadcast.emit('presence_updated', {
        userId: socket.user._id,
        status,
        lastSeen: new Date()
      });
    });

    // Handle getting online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(activeUsers.values()).map(userData => ({
        userId: userData.user._id,
        username: userData.user.username,
        avatar: userData.user.avatar,
        status: userData.status || 'online',
        lastSeen: userData.lastSeen || userData.connectedAt
      }));

      socket.emit('online_users', onlineUsers);
    });

    // Handle getting room users
    socket.on('get_room_users', async (data) => {
      const { questionId } = data;
      const roomName = `question_${questionId}`;
      
      const roomUsers = await getRoomUsers(io, roomName);
      socket.emit('room_users', {
        questionId,
        users: roomUsers
      });
    });

    // Handle private messaging (if implemented)
    socket.on('private_message', (data) => {
      const { recipientId, message } = data;
      
      // Send to recipient if online
      socket.to(`user_${recipientId}`).emit('private_message', {
        from: {
          userId: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.profile.avatar
        },
        message,
        timestamp: new Date()
      });
    });

    // Handle notifications acknowledgment
    socket.on('notification_read', (data) => {
      const { notificationId } = data;
      // Mark notification as read in database
      // This would be implemented based on your notification system
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.user.username} (${socket.id}) - Reason: ${reason}`);

      // Remove from active users
      activeUsers.delete(socket.user._id.toString());

      // Notify others of user going offline
      socket.broadcast.emit('user_offline', {
        userId: socket.user._id,
        username: socket.user.username,
        lastSeen: new Date()
      });

      // Leave all rooms and notify
      const userData = activeUsers.get(socket.user._id.toString());
      if (userData?.currentRoom) {
        socket.to(userData.currentRoom).emit('user_left_room', {
          userId: socket.user._id,
          username: socket.user.username
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.user.username}:`, error);
    });
  };
};

// Helper function to get users in a room
const getRoomUsers = async (io, roomName) => {
  try {
    const sockets = await io.in(roomName).fetchSockets();
    return sockets.map(socket => ({
      userId: socket.user._id,
      username: socket.user.username,
      avatar: socket.user.profile.avatar,
      socketId: socket.id
    }));
  } catch (error) {
    console.error('Error getting room users:', error);
    return [];
  }
};

// Helper function to send notification to user
const sendNotificationToUser = (io, userId, notification) => {
  io.to(`user_${userId}`).emit('notification', notification);
};

// Helper function to send notification to room
const sendNotificationToRoom = (io, roomName, notification) => {
  io.to(roomName).emit('room_notification', notification);
};

// Main socket handler
const socketHandler = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on('connection', handleConnection(io));

  // Global announcement (admin only)
  const sendGlobalAnnouncement = (message, type = 'info') => {
    io.emit('global_announcement', {
      message,
      type,
      timestamp: new Date()
    });
  };

  // Maintenance mode notification
  const notifyMaintenance = (startTime, duration) => {
    io.emit('maintenance_notification', {
      startTime,
      duration,
      timestamp: new Date()
    });
  };

  // Export helper functions for use in controllers
  io.sendNotificationToUser = sendNotificationToUser;
  io.sendNotificationToRoom = sendNotificationToRoom;
  io.sendGlobalAnnouncement = sendGlobalAnnouncement;
  io.notifyMaintenance = notifyMaintenance;
  io.getActiveUsers = () => Array.from(activeUsers.values());
};

module.exports = socketHandler;