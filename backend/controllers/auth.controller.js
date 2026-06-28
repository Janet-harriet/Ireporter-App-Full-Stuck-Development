const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const usersDal = require('../services/users');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934c',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// @route   POST /api/auth/signup
// @desc    Register new user (no OTP)
// @access  Public
const signup = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email, password, and name'
      });
    }

    // Check if user already exists
    const existingUser = await usersDal.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }

    // Create user (password hashing handled in DAL with 10 salt rounds)
    const user = await usersDal.create({ email, password, name, role: 'user' });

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating user',
      error: error.message
    });
  }
};

// @route   POST /api/auth/signin
// @desc    Login user with email/password (no OTP)
// @access  Public
const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    const user = await usersDal.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user.id);
    const { password: _pwd, ...userResponse } = user;

    res.json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error signing in',
      error: error.message
    });
  }
};

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await usersDal.findById(req.user.id);
    res.json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user data',
      error: error.message
    });
  }
};

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { name, email, profilePicture } = req.body;

    const user = await usersDal.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await usersDal.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already in use'
        });
      }
    }

    // Update user
    const updated = await usersDal.updateProfile(req.user.id, {
      name: name || user.name,
      email: email || user.email,
      profilePicture: profilePicture !== undefined ? profilePicture : user.profilePicture
    });

    res.json({
      status: 'success',
      message: 'Profile updated successfully',
      data: { user: updated }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile',
      error: error.message
    });
  }
};

module.exports = {
  signup,
  signin,
  getMe,
  updateProfile,
};
