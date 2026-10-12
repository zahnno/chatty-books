const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Book = require('../models/bookModel');
const Subscription = require('../models/subscriptionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const ActivityService = require('../services/activityService');
const EmailService = require('../services/emailService');
const { renewFreeTierIfExpired } = require('../services/subscriptionService');

const { validateEmail, validatePassword } = require('../services/validation');

// Register a new user
const register = async (req, res, next) => {
  const { email, password } = req.body;
  if (!validateEmail(email)) return res.status(400).json({ message: 'Invalid email' });
  if (!validatePassword(password)) return res.status(400).json({ message: 'Invalid password' });
  
  try {
    // Check for existing email
    const emailUser = await User.findOne({ email });
    if (emailUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Generate verification token
    const verificationToken = await EmailService.generateVerificationToken();
    
    // Create new user with verification token
    const user = new User({
      email,
      password,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });
    await user.save();

    // Create auditable initial token grant for new user
    const freePlan = await Subscription.findById(user.subscription.plan);
    if (freePlan) {
      await TokenTransaction.createTransaction({
        userId: user._id,
        amount: freePlan.tokensPerMonth,
        type: 'credit',
        action: 'subscription_purchase',
        description: `Initial tokens from ${freePlan.name} subscription`,
        relatedEntityId: freePlan._id,
        relatedEntityModel: 'Subscription',
        metadata: { planName: freePlan.name, planTier: freePlan.tier, isInitial: true }
      });
    }

    // Send verification email
    await EmailService.sendVerificationEmail(user);

    // Log registration activity
    await ActivityService.logActivity(user._id, 'REGISTER', {
      resourceId: user._id,
      resourceModel: 'User',
      metadata: { email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ 
      message: 'Registration successful. Please check your email to verify your account.',
      requiresVerification: true
    });
  } catch (error) {
    // Handle MongoDB duplicate key errors explicitly
    if (error.code === 11000) {
      if (error.keyPattern.email) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      return res.status(400).json({ message: 'Duplicate value detected' });
    }
    next(error);
  }
};

// Login with an existing user
const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).populate('subscription.plan');
    if (!user) return res.status(400).json({ message: 'User not found' });
    
    // Check if user was created with Google authentication
    if (user.googleId) {
      return res.status(400).json({ 
        message: 'This email is associated with a Google account. Please sign in with Google.'
      });
    }
    
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) return res.status(401).json({ message: 'Incorrect password' });

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email address before logging in',
        requiresVerification: true
      });
    }

    await renewFreeTierIfExpired(user);

    const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
      expiresIn: '23 hours'
    });

    // Log login activity
    await ActivityService.logActivity(user._id, 'LOGIN', {
      resourceId: user._id,
      resourceModel: 'User',
      metadata: { email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ token });
  } catch (error) {
    next(error);
  }
};

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findById(decodedToken.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Please sign in.' });
  }
};

const lightAuthenticate = async(req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findById(decodedToken.userId);
    if (!user) return next();

    req.user = user;
    return next();
  } catch (error) {
    // If token verification fails, just continue without user
    return next();
  }
};

const authenticateAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findById(decodedToken.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role != 'admin') {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Please sign in.' });
  }
};

const checkBookUpdateAuthority = async (req, res, next) => {
  authenticateAdmin(req, res, async (err) => {
    if (err) return next(err);

    try {
      const book = await Book.findById(req.params.bookId);

      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      // Check if the user is the creator of the book
      if (book.created_by.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'User not authorized to access this book' });
      }

      // Proceed if the user is the creator of the book
      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });
};

const checkBookOwnership = async (req, res, next) => {
  authenticate(req, res, async (err) => {
    if (err) return next(err);

    try {
      const user = await User.findById(req.user._id).populate('purchasedBooks');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const book = await Book.findById(req.params.bookId);

      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const hasPurchasedBook = user.purchasedBooks.some(purchasedBook => purchasedBook._id.equals(book._id));

      if (!hasPurchasedBook) {
        return res.status(403).json({ message: 'User not authorized to access this book' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });
};

// Allows chatting with characters without requiring the book to be in the
// user's library. Access is granted for public books, purchased books, or admins.
const checkBookAccess = async (req, res, next) => {
  authenticate(req, res, async (err) => {
    if (err) return next(err);

    try {
      const user = await User.findById(req.user._id).populate('purchasedBooks');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const book = await Book.findById(req.params.bookId);

      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const hasPurchasedBook = user.purchasedBooks.some(purchasedBook => purchasedBook._id.equals(book._id));
      const canAccess = book.is_public || hasPurchasedBook || user.role === 'admin';

      if (!canAccess) {
        return res.status(403).json({ message: 'User not authorized to access this book' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });
};

const checkBookCreator = async (req, res, next) => {
  authenticate(req, res, async (err) => {
    if (err) return next(err);

    try {
      const book = await Book.findById(req.params.bookId);

      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      // Check if the user is the creator of the book
      if (book.created_by.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Only the book creator can perform this action' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });
};


module.exports = { 
  register, 
  login, 
  lightAuthenticate, 
  authenticate, 
  authenticateAdmin, 
  checkBookUpdateAuthority, 
  checkBookOwnership,
  checkBookAccess,
  checkBookCreator,
};