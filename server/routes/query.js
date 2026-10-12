const express = require("express");
const queryRoutes = express.Router();
const privateer = require("../services/privateerClient");
const upload = require("../services/ImageUpload");
const Book = require("../models/bookModel");
const Page = require("../models/pageModel");
const Message = require("../models/messageModel");
const Character = require("../models/characterModel");
const User = require("../models/userModel");
const Audio = require("../models/audioModel");
const BookRequest = require("../models/bookRequestModel");
const AuthorInquiry = require("../models/authorInquiryModel");
const EmailService = require("../services/emailService");
const { register, login, lightAuthenticate, authenticate, authenticateAdmin, checkBookUpdateAuthority, checkBookOwnership, checkBookAccess, checkBookCreator } = require('../controllers/auth');
const ImageGeneration = require("../models/imageGenerationModel");
const ImageLike = require("../models/imageLikeModel");
const ImageComment = require("../models/imageCommentModel");
const { imageVisibilityQuery, commentVisibilityQuery } = require('../services/moderationService');
const userService = require('../services/userService');  // Updated import
const { 
  getSubscriptionPlans, 
  getSubscriptionDetails, 
  subscribeToPlan, 
  cancelSubscription, 
  updateAutoRenewal,
} = require('../controllers/subscriptionController');
const { getAdminSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan } = require('../controllers/subscriptionController');
const Feature = require('../models/featureModel');
const { FEATURES } = require('../services/features');
const { ttsClient, s3 } = require('../services/cloud-services');
const { uploadOptimizedImage } = require('../services/imageOptimization');
const {fetchBookCover} = require('../helpers/bookHelper');
const bookService = require('../services/bookService');
const chatService = require('../services/chatService');
const { assignVoice } = require('../services/characterVoices');
const generationService = require('../services/generationService');
const CostEstimateService = require('../services/costEstimateService');
const CostEstimate = require('../models/costEstimateModel');
const ActivityService = require('../services/activityService');
const AnalyticsService = require('../services/analyticsService');
const TokenTransaction = require('../models/tokenTransactionModel');
const Subscription = require('../models/subscriptionModel');
const { sendFacebookEvent, createEventData } = require('../services/facebookConversion');
const FeaturedContent = require('../models/featuredContentModel');
const mongoose = require('mongoose');
const ServiceRate = require('../models/serviceRateModel');
const rateCache = require('../services/rateCache');

queryRoutes.route("/register").post(async (req, res) => {
  try {
    const result = await register(req, res);
    
    // Prepare base event data
    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: '/register'
    };

    // Add user-specific data if registration was successful
    if (result && result.user) {
      baseEventData.userId = result.user._id;
      baseEventData.email = result.user.email;
    }
    
    // Send CompleteRegistration event to Facebook
    const eventData = createEventData('CompleteRegistration', baseEventData, {
      content_type: 'user_registration'
    });
    
    await sendFacebookEvent(eventData);
    
    return result;
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message || 'Failed to process registration' });
  }
});

queryRoutes.route("/login").post(login);
queryRoutes.route("/update-profile").put(authenticate, upload.single('profileImage'), async(req, res) => {
  try {
    const updateData = {
      username: req.body.username,
      gender: req.body.gender,
      dateOfBirth: req.body.dateOfBirth,
      characteristics: req.body.characteristics,
      description: req.body.description,
      moods: req.body.moods
    };
    console.log('updateData', updateData)
    const updatedUser = await userService.updateUserProfile(req.user._id, updateData, req.file);

    res.json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: "Error updating profile" });
  }
});

queryRoutes.route("/authenticate").get(authenticate, async(req, res) => {  
  res.json({
    authenticated: true,
    _id: req.user._id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    gender: req.user.gender,
    dateOfBirth: req.user.dateOfBirth,
    characteristics: req.user.characteristics,
    description: req.user.description,
    moods: req.user.moods,
    profileImage: req.user.profileImage,
    aiConsentAt: req.user.aiConsentAt || null
  });
});

queryRoutes.route("/book/new").post(
  authenticateAdmin,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 }
  ]),
  async (req, response) => {
    try {
      const result = await bookService.createBook({
        ...req.body,
        is_public: req.body.is_public === 'true' || req.body.is_public === true,
        is_featured: req.body.is_featured === 'true' || req.body.is_featured === true
      }, req.files, req.user._id);
      response.status(201).json(result);
    } catch (err) {
      console.error(err);
      response.status(500).json({ message: "Internal server error." });
    }
  }
);

queryRoutes.route("/book/:bookId/edit").post(
  authenticateAdmin, 
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 }
  ]), 
  async (req, response) => {
    try {
      const book = await bookService.editBook(
        req.params.bookId, 
        {
          ...req.body,
          is_public: req.body.is_public === 'true' || req.body.is_public === true,
          is_featured: req.body.is_featured === 'true' || req.body.is_featured === true
        }, 
        req.files?.image?.[0],
        req.files?.bookFile?.[0]
      );
      response.status(201).json(book);
    } catch (err) {
      console.error(err);
      if (err.message === "Unable to upload file") {
        response.status(500).json({ message: "Internal server error - Unable to upload file" });
      } else {
        response.status(500).json({ message: "Internal server error." });
      }
    }
  }
);

queryRoutes.route("/books").get(lightAuthenticate, async (req, response) => {
  const baseEventData = {
    userAgent: req.headers['user-agent'],
    sourceUrl: `/books`,
    clientIpAddress: req.ip || req.connection.remoteAddress
  };

  // Add user-specific data if authenticated
  if (req.user) {
    const user = await User.findById(req.user._id);
    if (user) {
      baseEventData.userId = user._id;
      baseEventData.email = user.email;
    }
  }

  // Send ViewContent event to Facebook
  const eventData = createEventData('ViewContent', baseEventData, {
    content_type: 'home',
    content_name: 'HomePage',
    content_ids: ['homepage']
  });
  
  await sendFacebookEvent(eventData);
  try {
    // Get featured books
    const featuredBooks = await FeaturedContent.find({
      contentType: 'book',
      type: 'featured',
      isActive: true,
      $or: [
        { endDate: { $gt: new Date() } },
        { endDate: null }
      ]
    })
    .populate('contentId')
    .sort({ order: 1 })
    .limit(5);

    // Get popular books
    const popularBooks = await FeaturedContent.find({
      contentType: 'book',
      type: 'popular',
      isActive: true,
      $or: [
        { endDate: { $gt: new Date() } },
        { endDate: null }
      ]
    })
    .populate('contentId')
    .sort({ order: 1 })
    .limit(5);

    // Get the IDs of featured and popular books, filtering out any null contentId
    const featuredAndPopularIds = [
      ...featuredBooks.filter(fb => fb.contentId && fb.contentId._id).map(fb => fb.contentId._id),
      ...popularBooks.filter(pb => pb.contentId && pb.contentId._id).map(pb => pb.contentId._id)
    ];

    let otherBooks = [];
    if (req.user) {
      // For authenticated users, prioritize purchased books
      const user = await User.findById(req.user._id).populate('purchasedBooks');
      
      // Get purchased books first
      const purchasedBooks = await Book.find({
        _id: { $in: user.purchasedBooks }
      }).limit(30);
      
      // If we have less than 30 purchased books, get additional public books
      if (purchasedBooks.length < 30) {
        const remainingLimit = 30 - purchasedBooks.length;
        const additionalBooks = await Book.find({
          _id: { $nin: [...user.purchasedBooks, ...featuredAndPopularIds] },
          is_public: true
        }).limit(remainingLimit);
        
        otherBooks = [...purchasedBooks, ...additionalBooks];
      } else {
        otherBooks = purchasedBooks;
      }
      
      // Add reading progress and isPurchased flag
      otherBooks = otherBooks.map(book => {
        const progress = user.readingProgress.find(p => p.book.equals(book._id));
        const isPurchased = user.purchasedBooks.some(purchasedBook => 
          purchasedBook.equals(book._id)
        );
        return {
          ...book.toObject(),
          currentPage: progress ? progress.currentPage : 1,
          lastReadAt: progress ? progress.lastReadAt : null,
          isPurchased: isPurchased
        };
      });
    } else {
      // For unauthenticated users, get public books
      otherBooks = await Book.find({
        _id: { $nin: featuredAndPopularIds },
        is_public: true
      })
      .sort({ createdAt: -1 })
      .limit(30);
    }

    // Transform featured and popular books to include user-specific data
    const transformFeaturedBooks = featuredBooks
      .filter(fb => fb.contentId) // Filter out null contentId
      .map(fb => {
        const book = fb.contentId.toObject();
        if (req.user) {
          const user = req.user;
          const progress = user.readingProgress?.find(p => p.book.equals(book._id));
          const isPurchased = user.purchasedBooks?.some(pb => pb.equals(book._id));
          return {
            ...book,
            currentPage: progress ? progress.currentPage : 1,
            lastReadAt: progress ? progress.lastReadAt : null,
            isPurchased: isPurchased
          };
        }
        return book;
      });

    const transformPopularBooks = popularBooks
      .filter(pb => pb.contentId) // Filter out null contentId
      .map(pb => {
        const book = pb.contentId.toObject();
        if (req.user) {
          const user = req.user;
          const progress = user.readingProgress?.find(p => p.book.equals(book._id));
          const isPurchased = user.purchasedBooks?.some(pb => pb.equals(book._id));
          return {
            ...book,
            currentPage: progress ? progress.currentPage : 1,
            lastReadAt: progress ? progress.lastReadAt : null,
            isPurchased: isPurchased
          };
        }
        return book;
      });

    // Flag books that have at least one completed audio profile
    const audioBookIds = await Audio.distinct('bookId', { status: 'completed' });
    const audioIdSet = new Set(audioBookIds.map(id => id.toString()));
    const flagAudio = (book) => ({ ...book, hasAudio: audioIdSet.has(book._id?.toString()) });

    response.status(200).json({
      featured: transformFeaturedBooks.map(flagAudio),
      popular: transformPopularBooks.map(flagAudio),
      other: otherBooks.map(b => flagAudio(b.toObject ? b.toObject() : b)),
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/mybooks").get(authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('purchasedBooks')
      .populate('readingProgress.book');

    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }

    // Filter out any null values from purchasedBooks and map books with their reading progress
    const books = user.purchasedBooks
      .filter(book => book !== null) // Filter out null values
      .map(book => {
        const progress = user.readingProgress.find(p => p && p.book && p.book._id.equals(book._id));
        return {
          ...book.toObject(),
          currentPage: progress ? progress.currentPage : 1,
          lastReadAt: progress ? progress.lastReadAt : null
        };
      });

    // Send the purchasedBooks as the response
    res.status(200).send({ books });
  } catch (error) {
    console.log('error', error)
    res.status(500).send({ error: error.message });
  }
});

queryRoutes.route("/admin/books").get(authenticateAdmin, async (req, response) => {
  try {
    let result = await Book.find().sort({ updatedAt: -1 });
    response.status(201).json(result);
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/add").post(authenticate, async (req, res) => {
  try {
    const book = await bookService.purchaseBook(req.user._id, req.params.bookId);
    
    // Prepare base event data
    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: `/books/${req.params.bookId}/add`
    };

    // Add user-specific data if authenticated
    if (req.user) {
      baseEventData.userId = req.user._id;
      baseEventData.email = req.user.email;
    }
    
    // Send Purchase event to Facebook
    const eventData = createEventData('Purchase', baseEventData, {
      content_type: 'product',
      order_id: book._id.toString(),
      value: book.price || 0,
      currency: 'USD'
    });
    
    await sendFacebookEvent(eventData);
    
    res.status(200).send({ 
      message: "Book added to purchased books", 
      book 
    });
  } catch (error) {
    console.log(error);
    if (error.message === "Book not found") {
      res.status(404).send({ error: error.message });
    } else if (error.message === "Book already purchased" || 
               error.message === "Book purchase is not available at this time") {
      res.status(400).send({ error: error.message });
    } else if (error.message === "Insufficient tokens") {
      res.status(400).send({ 
        error: error.message,
        required: error.details.required,
        current: error.details.current
      });
    } else {
      res.status(500).send({ error: "An error occurred while adding the book" });
    }
  }
});

queryRoutes.route("/book/:bookId/remove").delete(authenticate, async (req, res) => {
  try {
    const book = await bookService.removeBook(req.user._id, req.params.bookId);
    res.status(200).send({ message: "Book removed from library", book });
  } catch (error) {
    if (error.message === "Book not found") {
      res.status(404).send({ error: error.message });
    } else if (error.message === "Book not in library") {
      res.status(400).send({ error: error.message });
    } else {
      res.status(500).send({ error: "An error occurred while removing the book" });
    }
  }
});

queryRoutes.route("/book/:bookId").get(lightAuthenticate, async (req, res) => {
  try {
    let book_ = await Book.findById(req.params.bookId);

    if (!book_) {
      return res.status(404).json({ message: "Book not found." });
    }

    // Prepare base event data
    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: `/books/${req.params.bookId}`,
      clientIpAddress: req.ip || req.connection.remoteAddress
    };

    // Add user-specific data if authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        baseEventData.userId = user._id;
        baseEventData.email = user.email;
      }
    }

    // Send ViewContent event to Facebook
    const eventData = createEventData('ViewContent', baseEventData, {
      content_type: 'book',
      content_name: book_.title,
      content_ids: [book_._id.toString()]
    });
    
    await sendFacebookEvent(eventData);

    let isPurchased = false;
    let currentPage = 1;
    let canAccess = book_.is_public;

    // Get total pages and character count
    const [totalPages, characterCount] = await Promise.all([
      Page.countDocuments({ bookId: req.params.bookId }),
      Character.countDocuments({ bookId: req.params.bookId })
    ]);

    if (req.user) {
      const user = await User.findById(req.user._id).populate('purchasedBooks');
      if (user) {
        isPurchased = user.purchasedBooks.some(purchasedBook => purchasedBook._id.equals(book_._id));
        canAccess = canAccess || isPurchased || user.role === 'admin'; // Can access if public OR purchased
        const progress = user.readingProgress.find(p => p.book.equals(book_._id));
        if (progress) {
          currentPage = progress.currentPage;
        }
      }
    }

    if (!canAccess) {
      return res.status(403).json({ message: "You don't have access to this book." });
    }

    const book = {
      ...book_.toObject(),
      isPurchased,
      currentPage,
      canAccess,
      totalPages,
      characterCount
    };
    res.status(200).json(book);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err });
  }
});

// Get similar books (by categories)
queryRoutes.route("/book/:bookId/similar").get(lightAuthenticate, async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ message: "Book not found." });
    }

    const categories = book.categories || [];
    let similarBooks = [];

    if (categories.length > 0) {
      similarBooks = await Book.find({
        _id: { $ne: req.params.bookId },
        is_public: true,
        categories: { $in: categories }
      })
        .sort({ createdAt: -1 })
        .limit(16)
        .lean();
    }

    // Add user-specific progress and isPurchased for authenticated users
    if (req.user && similarBooks.length > 0) {
      const user = await User.findById(req.user._id).populate('purchasedBooks');
      if (user) {
        similarBooks = similarBooks.map(bookDoc => {
          const progress = user.readingProgress.find(p => p.book.equals(bookDoc._id));
          const isPurchased = user.purchasedBooks.some(pb => pb && pb.equals(bookDoc._id));
          return {
            ...bookDoc,
            currentPage: progress ? progress.currentPage : 1,
            lastReadAt: progress ? progress.lastReadAt : null,
            isPurchased: isPurchased
          };
        });
      }
    }

    res.status(200).json(similarBooks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Get similar characters (from books that share categories)
queryRoutes.route("/book/:bookId/similar-characters").get(lightAuthenticate, async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ message: "Book not found." });
    }

    const categories = book.categories || [];
    let similarCharacters = [];

    if (categories.length > 0) {
      const similarBookIds = await Book.find({
        _id: { $ne: req.params.bookId },
        is_public: true,
        categories: { $in: categories }
      })
        .select('_id')
        .limit(20)
        .lean();

      const bookIds = similarBookIds.map(b => b._id);

      if (bookIds.length > 0) {
        similarCharacters = await Character.find({ bookId: { $in: bookIds } })
          .populate('bookId', 'title')
          .sort({ createdAt: 1 })
          .limit(16)
          .lean();

        similarCharacters = similarCharacters?.map(char => {
          const bid = char.bookId?._id || char.bookId;
          return {
            ...char,
            bookTitle: char.bookId?.title,
            bookId: bid ? { _id: bid } : undefined
          };
        });
      }
    }

    res.status(200).json(similarCharacters);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Update reading progress endpoint
queryRoutes.route("/book/:bookId/progress").post(authenticate, async (req, res) => {
  try {
    const result = await bookService.updateReadingProgress(req.user._id, req.params.bookId, req.body.pageNumber);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    if (err.message === "User not found") {
      res.status(404).json({ message: err.message });
    } else {
      res.status(500).json({ message: "Internal server error." });
    }
  }
});

// Get user's current reading progress (last read book)
queryRoutes.route("/user/current-reading").get(authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('readingProgress.book')
      .select('readingProgress');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Filter out null books and sort by lastReadAt (most recent first)
    const validProgress = user.readingProgress
      .filter(progress => progress.book && progress.currentPage > 1)
      .sort((a, b) => new Date(b.lastReadAt) - new Date(a.lastReadAt));

    if (validProgress.length === 0) {
      return res.status(204).json(null);
    }

    // Get the most recent book
    const currentReading = validProgress[0];
    
    // Get total pages for the book
    const totalPages = await Page.countDocuments({ bookId: currentReading.book._id });
    
    const result = {
      book: currentReading.book,
      currentPage: currentReading.currentPage,
      totalPages: totalPages,
      lastReadAt: currentReading.lastReadAt,
      progress: totalPages > 0 ? Math.round((currentReading.currentPage / totalPages) * 100) : 0
    };

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/delete").post(authenticateAdmin, async (req, response) => {
  try {
    const bookId = req.params.bookId;
    const book = await Book.findById(bookId);
    if (!book) {
      return response.status(404).json({ message: "Book not found." });
    }
    await Page.deleteMany({ bookId });
    await Character.deleteMany({ bookId });
    await Book.findByIdAndDelete(bookId);
    response.status(200).json({ message: 'Book deleted.'});
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/page").get(async (req, response) => {
  try {
    let result = await Page.find({ bookId: req.params.bookId }).sort({ pageNumber: 1 });
    response.status(201).json(result);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/page/:pageId").get(async (req, response) => {
  try {
    let result = await Page.findById(req.params.pageId);
    response.status(201).json(result);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/page/:pageId/delete").post(authenticateAdmin, async (req, response) => {
  try {
    let result = await Page.findById(req.params.pageId);
    if (!result) return response.status(404).json({ message: "Page not found." });
    
    // Get the page number of the page being deleted
    const deletedPageNumber = result.pageNumber;
    
    // Delete the page
    await Page.findByIdAndDelete(req.params.pageId);
    
    // Find all pages in the same book with page numbers greater than the deleted page
    const subsequentPages = await Page.find({
      bookId: req.params.bookId,
      pageNumber: { $gt: deletedPageNumber }
    }).sort({ pageNumber: 1 });
    
    // Update the page numbers of subsequent pages
    for (let i = 0; i < subsequentPages.length; i++) {
      await Page.findByIdAndUpdate(
        subsequentPages[i]._id,
        { pageNumber: deletedPageNumber + i }
      );
    }
    
    response.status(201).json({ message: 'Page deleted and subsequent pages renumbered.' });
  } catch (err) {
    console.log(err)
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/pages/num/:pageNumber").get(lightAuthenticate, async (req, response) => {
  try {
    const pageNumber = parseInt(req.params.pageNumber);
    
    // Check if user is trying to access page 3+ without being logged in
    if (pageNumber > 2 && !req.user) {
      return response.status(403).json({ 
        message: "Please sign in to continue reading",
        requiresLogin: true,
        maxFreePages: 2
      });
    }

    let result = await Page.findOne({ bookId: req.params.bookId, pageNumber: req.params.pageNumber });
    response.status(201).json(result);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/page/new").post(authenticateAdmin, upload.single('image'), async (req, response) => {
  try {
    req.body.bookId = req.params.bookId;
    let page = await Page.create(req.body);
    if (req.file) {
      try {
        const baseKey = `page-${page._id}-${Date.now()}`;
        const uploadResult = await uploadOptimizedImage(req.file.buffer, baseKey, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 85,
          format: 'webp'
        });
        page.image_url = uploadResult.mainUrl;
        await page.save();
      } catch (uploadErr) {
        console.error('Error uploading optimized page image:', uploadErr);
        return response.status(500).json({ message: "Internal server error - Unable to upload file" });
      }
    }
    response.status(201).json(page);
  } catch (err) {
    console.error('Error creating page:', err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/page/:pageId/edit").post(authenticateAdmin, upload.single('image'), async (req, response) => {
  try {
    req.body.bookId = req.params.bookId;
    let page = await Page.findByIdAndUpdate(req.params.pageId, req.body, { new: true });
    if (req.file) {
      try {
        const baseKey = `page-${req.params.pageId}-${Date.now()}`;
        const uploadResult = await uploadOptimizedImage(req.file.buffer, baseKey, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 85,
          format: 'webp'
        });
        page.image_url = uploadResult.mainUrl;
        await page.save();
      } catch (uploadErr) {
        console.error('Error uploading optimized page image:', uploadErr);
        return response.status(500).json({ message: "Internal server error - unable to upload file." });
      }
    }
    response.status(201).json(page);
  } catch (err) {
    console.error('Error editing page:', err);
    response.status(500).json({ message: "Internal server error." });
  }
});

// Character list fields arrive from multipart forms as a JSON array string (so an
// emptied list still clears), or as repeated/single values from older clients.
const CHARACTER_LIST_FIELDS = ['personalityTraits', 'strengths', 'weaknesses', 'goals'];
function normalizeCharacterLists(body) {
  CHARACTER_LIST_FIELDS.forEach(field => {
    const value = body[field];
    if (value === undefined) return;
    if (typeof value === 'string') {
      if (value.trim().startsWith('[')) {
        try { body[field] = JSON.parse(value); return; } catch (e) { /* fall through */ }
      }
      body[field] = value.trim() ? [value] : [];
    }
  });
  return body;
}

queryRoutes.route("/book/:bookId/character/new").post(authenticateAdmin, upload.single('image'), async (req, response) => {
  try {
    req.body.bookId = req.params.bookId;
    normalizeCharacterLists(req.body);
    let character = await Character.create(req.body);
    // Match a voice for voice chat in the background.
    assignVoice(character).catch(err => console.error('Error assigning character voice:', err));
    if (req.file) {
      try {
        const baseKey = `character-${character._id}-${Date.now()}`;
        const uploadResult = await uploadOptimizedImage(req.file.buffer, baseKey, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 90,
          format: 'webp'
        });
        character.image_url = uploadResult.mainUrl;
        await character.save();
      } catch (uploadErr) {
        console.error('Error uploading optimized character image:', uploadErr);
        return response.status(500).json({ message: "Internal server error - Upload file" });
      }
    }
    response.status(201).json(character);
  } catch (err) {
    console.error('Error creating character:', err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/character/:characterId/edit").post(authenticateAdmin, upload.single('image'), async (req, response) => {
  try {
    req.body.bookId = req.params.bookId;
    normalizeCharacterLists(req.body);
    let character = await Character.findByIdAndUpdate(req.params.characterId, req.body, { new: true });
    if (req.file) {
      try {
        const baseKey = `character-${req.params.characterId}-${Date.now()}`;
        const uploadResult = await uploadOptimizedImage(req.file.buffer, baseKey, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 90,
          format: 'webp'
        });
        character.image_url = uploadResult.mainUrl;
        await character.save();
      } catch (uploadErr) {
        console.error('Error uploading optimized character image:', uploadErr);
        return response.status(500).json({ message: "Internal server error - Upload file" });
      }
    }
    response.status(201).json(character);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/characters").get(async (req, response) => {
  try {
    let result = await Character.find({ bookId: req.params.bookId });
    response.status(201).json(result);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/characters/:characterId/delete").post(authenticateAdmin, async (req, response) => {
  try {
    let result = await Character.findById(req.params.characterId);
    if (!result) return response.status(404).json({ message: "Character not found." });
    await Character.findByIdAndDelete(req.params.characterId);
    response.status(201).json({ message: 'Character deleted.'});
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/characters/:characterId").get(async (req, response) => {
  try {
    let result = await Character.findById(req.params.characterId);

    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: `/books/${req.params.bookId}/characters/${req.params.characterId}`,
      clientIpAddress: req.ip || req.connection.remoteAddress
    };

    // Add user-specific data if authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        baseEventData.userId = user._id;
        baseEventData.email = user.email;
      }
    }

    // Send ViewContent event to Facebook
    const eventData = createEventData('ViewContent', baseEventData, {
      content_type: 'character',
      content_name: result.name,
      content_ids: [result._id.toString()]
    });
    
    await sendFacebookEvent(eventData);
    response.status(201).json(result);
  } catch (err) {
   response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/book/:bookId/character/:characterId/chat").post(checkBookAccess, async (req, response) => {
  try {
    const result = await chatService.chatWithCharacter(
      req.user._id,
      req.params.bookId,
      req.params.characterId,
      req.body.prompt,
      req.body.pageNumber,
      req.user
    );

    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: `/books/${req.params.bookId}/character/${req.params.characterId}/chat`,
      clientIpAddress: req.ip || req.connection.remoteAddress
    };

    // Add user-specific data if authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        baseEventData.userId = user._id;
        baseEventData.email = user.email;
      }
    }

    // // Send ViewContent event to Facebook
    // const eventData = createEventData('ViewContent', baseEventData, {
    //   content_type: 'characterChat',
    //   content_name: 'Chat with ' + result.characterName + ' from ' + result.bookTitle,
    //   content_ids: [result.bookTitle]
    // });
    
    // await sendFacebookEvent(eventData);
    
    response.status(201).json(result);
  } catch (err) {
    console.log(err);
    if (err.message === "No prompt provided" || err.message === "Prompt exceeds 500 character limit") {
      response.status(400).json({ message: err.message });
    } else if (err.message.includes('tokens')) {
      response.status(400).json({ message: err.message });
    } else {
      response.status(500).json({ message: "Internal server error: " + err.message });
    }
  }
});

queryRoutes.route("/book/:bookId/character/:characterId/messages").get(checkBookAccess, async (req, response) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalMessages = await Message.countDocuments({
      bookId: req.params.bookId,
      characterId: req.params.characterId,
      userId: req.user._id
    });

    // Fetch messages with pagination, ordered by newest first for pagination
    const messages = await Message.find({
      bookId: req.params.bookId,
      characterId: req.params.characterId,
      userId: req.user._id
    })
    .sort({ createdAt: -1 }) // Newest first for pagination
    .skip(skip)
    .limit(limit);

    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      userMessage: msg.userMessage,
      modelResponse: msg.modelResponse,
      timestamp: msg.createdAt,
      pageNumber: msg.pageNumber,
      suggestions: msg.suggestions
    }));

    // Reverse to show oldest first in the chat (but we paginated newest first)
    formattedMessages.reverse();

    const totalPages = Math.ceil(totalMessages / limit);
    const hasMore = page < totalPages;

    response.status(200).json({
      messages: formattedMessages || [], // Ensure messages is always an array
      pagination: {
        page,
        limit,
        totalMessages,
        totalPages,
        hasMore
      }
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/characters").get(async (req, response) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12; // Number of characters per page
    const skip = (page - 1) * limit;
    const searchQuery = req.query.query || '';

    // Create search criteria
    const searchCriteria = searchQuery
      ? {
          $or: [
            { firstName: { $regex: searchQuery, $options: 'i' } },
            { lastName: { $regex: searchQuery, $options: 'i' } },
            { description: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      : {};

    // Get total count for pagination
    const total = await Character.countDocuments(searchCriteria);

    // Fetch characters with pagination, ensure consistent ordering
    const characters = await Character.find(searchCriteria)
      .populate('bookId', 'title')
      .sort({ _id: 1 }) // Use _id for consistent ordering
      .skip(skip)
      .limit(limit)
      .lean();

    const charactersWithBookTitle = characters.map(character => ({
      ...character,
      bookTitle: character.bookId?.title
    }));

    response.status(200).json({
      characters: charactersWithBookTitle,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

// Characters grouped by book (the /characters page): 6 books per page, newest first,
// each with its full cast ordered by how often readers talk to them. A search matches
// character names or the book's title/author.
queryRoutes.route("/characters/by-book").get(async (req, response) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const searchQuery = (req.query.query || '').trim();

    const match = {};
    if (searchQuery) {
      const pattern = new RegExp(escapeRegex(searchQuery), 'i');
      const bookIds = await Book.find({ $or: [{ title: pattern }, { author: pattern }] }).distinct('_id');
      match.$or = [{ firstName: pattern }, { lastName: pattern }, { bookId: { $in: bookIds } }];
    }

    const [result] = await Character.aggregate([
      { $match: match },
      { $group: { _id: '$bookId' } },
      { $sort: { _id: -1 } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          books: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);
    const total = result.total[0]?.count || 0;
    const pageBookIds = result.books.map((b) => b._id);

    const [books, characters] = await Promise.all([
      Book.find({ _id: { $in: pageBookIds } }).select('title author image_url description').lean(),
      Character.find({ bookId: { $in: pageBookIds } }).lean(),
    ]);

    const counts = await Message.aggregate([
      { $match: { characterId: { $in: characters.map((c) => c._id) } } },
      { $group: { _id: '$characterId', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    const bookById = new Map(books.map((b) => [String(b._id), b]));

    const groups = pageBookIds
      .map((id) => bookById.get(String(id)))
      .filter(Boolean)
      .map((book) => ({
        book,
        characters: characters
          .filter((c) => String(c.bookId) === String(book._id))
          // The generated narrator ("Guide") goes last so the top tiles are story characters.
          // Stable: generation order (main characters first) breaks ties.
          .sort(
            (a, b) =>
              (a.firstName === 'Guide') - (b.firstName === 'Guide') ||
              (countById.get(String(b._id)) || 0) - (countById.get(String(a._id)) || 0)
          )
          .map((c) => ({ ...c, bookId: { _id: book._id, title: book.title }, bookTitle: book.title })),
      }));

    response.status(200).json({
      books: groups,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

// Update the book upload endpoint to use the new function
queryRoutes.route("/book/upload").post(authenticateAdmin, upload.single('bookFile'), async (req, response) => {
  try {
    // Check if user has enough tokens
    const user = await User.findById(req.user._id);
    
    // Get token cost for book upload

    // Check if user has enough tokens
    // if (user.tokenBalance < tokenCost.cost) {
    //   return response.status(400).json({ 
    //     error: "Insufficient tokens",
    //     required: tokenCost.cost,
    //     current: user.tokenBalance
    //   });
    // }

    if (!req.file) {
      return response.status(400).json({ message: "No file uploaded" });
    }

    // Extract book content using BookService
    const bookContent = await bookService.extractBookContent(req.file);

    // Generate book details using AI
    const bookDetails = await generationService.generateBookDetails(bookContent, user._id);

    // Create the book using BookService
    const newBook = await bookService.createBook({
      ...bookDetails,
      created_by: req.user._id
    }, {
      bookFile: [req.file]
    }, req.user._id);

    // Try to fetch book cover
    const coverUrl = await fetchBookCover(bookDetails.title, bookDetails.author);
    if (coverUrl) {
      newBook.image_url = coverUrl;
      await newBook.save();
    }

    // Add book to user's purchased books
    const uploadingUser = await User.findById(req.user._id);
    if (!uploadingUser.purchasedBooks.includes(newBook._id)) {
      uploadingUser.purchasedBooks.push(newBook._id);
      await uploadingUser.save();
    }

    try {
      // Generate characters using the GenerationService
      const pages = await Page.find({ bookId: newBook._id }).sort('pageNumber');
      await generationService.generateCharactersForBook(newBook, pages);
    } catch (characterError) {
      console.error('Failed to generate characters:', characterError);
      // Don't throw the error - we still want to return the book even if character generation fails
    }

    response.status(201).json(newBook);
  } catch (err) {
    console.error('Error processing book upload:', err);
    response.status(500).json({ 
      message: err.message || "Error processing book upload"
    });
  }
});

// Update the generate-characters endpoint to use checkBookCreator
queryRoutes.route("/book/:bookId/generate-characters").post(checkBookCreator, async (req, response) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return response.status(404).json({ message: "Book not found." });
    }

    const pages = await Page.find({ bookId: req.params.bookId }).sort('pageNumber');
    const characters = await generationService.generateCharactersForBook(book, pages);

    response.status(201).json(characters);
  } catch (err) {
    console.error('Error generating characters:', err);
    response.status(500).json({ 
      message: err.message || "Error generating characters" 
    });
  }
});

queryRoutes.route("/characters/top").get(async (req, response) => {
  try {
    // Get admin-selected featured characters
    const featuredCharacters = await FeaturedContent.find({
      contentType: 'character',
      type: 'featured',
      isActive: true,
      $or: [
        { endDate: { $gt: new Date() } },
        { endDate: null }
      ]
    })
    .populate({
      path: 'contentId',
      populate: {
        path: 'bookId',
        select: 'title'
      }
    })
    .sort({ order: 1 })
    .limit(10);

    // Get popular characters
    const popularCharacters = await FeaturedContent.find({
      contentType: 'character',
      type: 'popular',
      isActive: true,
      $or: [
        { endDate: { $gt: new Date() } },
        { endDate: null }
      ]
    })
    .populate({
      path: 'contentId',
      populate: {
        path: 'bookId',
        select: 'title'
      }
    })
    .sort({ order: 1 })
    .limit(10);

    // If we don't have enough featured/popular characters, get additional ones based on message count
    if (featuredCharacters.length + popularCharacters.length < 20) {
      const remainingCount = 20 - (featuredCharacters.length + popularCharacters.length);
      
      const additionalCharacters = await Character.aggregate([
        {
          $match: {
            _id: { 
              $nin: [
                ...featuredCharacters.map(fc => fc.contentId._id),
                ...popularCharacters.map(pc => pc.contentId._id)
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'books',
            localField: 'bookId',
            foreignField: '_id',
            as: 'book'
          }
        },
        {
          $unwind: '$book'
        },
        {
          $lookup: {
            from: 'messages',
            let: { characterId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$characterId', '$$characterId'] }
                }
              },
              {
                $count: 'count'
              }
            ],
            as: 'messageCount'
          }
        },
        {
          $addFields: {
            messageCount: { $ifNull: [{ $arrayElemAt: ['$messageCount.count', 0] }, 0] }
          }
        },
        {
          $sort: { messageCount: -1 }
        },
        {
          $limit: remainingCount
        }
      ]);

      // Combine all characters
      const allCharacters = [
        ...featuredCharacters.map(fc => ({
          ...fc.contentId.toObject(),
          bookTitle: fc.contentId.bookId.title,
          bookId: fc.contentId.bookId._id
        })),
        ...popularCharacters.map(pc => ({
          ...pc.contentId.toObject(),
          bookTitle: pc.contentId.bookId.title,
          bookId: pc.contentId.bookId._id
        })),
        ...additionalCharacters.map(ac => ({
          ...ac,
          bookTitle: ac.book.title,
          bookId: ac.book._id
        }))
      ];

      response.status(200).json(allCharacters);
    } else {
      response.status(200).json([
        ...featuredCharacters.map(fc => ({
          ...fc.contentId.toObject(),
          bookTitle: fc.contentId.bookId.title,
          bookId: fc.contentId.bookId._id
        })),
        ...popularCharacters.map(pc => ({
          ...pc.contentId.toObject(),
          bookTitle: pc.contentId.bookId.title,
          bookId: pc.contentId.bookId._id
        }))
      ]);
    }
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

queryRoutes.route("/books/search").get(lightAuthenticate, async (req, response) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.query || '';

    // Prepare base event data
    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: '/search'
    };

    // Add user-specific data if authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        baseEventData.userId = user._id;
        baseEventData.email = user.email;
      }
    }

    // Send Search event to Facebook if there's a search query
    if (searchQuery) {
      const eventData = createEventData('Search', baseEventData, {
        content_type: 'book',
        search_string: searchQuery
      });
      
      await sendFacebookEvent(eventData);
    }

    // Create search criteria
    const searchCriteria = searchQuery
      ? {
          $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { author: { $regex: searchQuery, $options: 'i' } },
            { description: { $regex: searchQuery, $options: 'i' } },
            { categories: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      : {};

    // Get total count for pagination
    const total = await Book.countDocuments(searchCriteria);

    // Fetch books with pagination
    const books = await Book.find(searchCriteria)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // If user is authenticated, add reading progress and isPurchased flag
    if (req.user) {
      const user = await User.findById(req.user._id).populate('purchasedBooks');
      const booksWithProgress = books.map(book => {
        const progress = user.readingProgress.find(p => p.book && p.book.equals(book._id));
        const isPurchased = user.purchasedBooks.some(purchasedBook => 
          purchasedBook && purchasedBook.equals(book._id)
        );
        return {
          ...book,
          currentPage: progress ? progress.currentPage : 1,
          lastReadAt: progress ? progress.lastReadAt : null,
          isPurchased: isPurchased
        };
      });
      return response.status(200).json({
        books: booksWithProgress,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      });
    } else {
      return response.status(200).json({
        books,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      });
    }
  } catch (err) {
    console.error('Search error:', err);
    return response.status(500).json({ message: "Internal server error.", error: err.message });
  }
});

queryRoutes.route("/book/:bookId/characters/in-pages/:pageNumber").get(async (req, response) => {
  try {
    const pageNumber = parseInt(req.params.pageNumber);
    const bookId = req.params.bookId;
    
    // Fetch current and previous page
    const currentPage = await Page.findOne({ 
      bookId: bookId, 
      pageNumber: pageNumber 
    });
    
    const previousPage = await Page.findOne({ 
      bookId: bookId, 
      pageNumber: pageNumber - 1 
    });

    // Fetch all characters for the book
    const characters = await Character.find({ bookId: bookId });

    // Function to check if a character appears in text
    const characterAppearsInText = (character, text) => {
      if (!text) return false;
      
      const textLower = text.toLowerCase();
      const nameMatches = [];
      
      if (character.firstName && character.lastName) {
        const fullName = `${character.firstName} ${character.lastName}`.toLowerCase();
        nameMatches.push(fullName);
      }
      
      if (character.firstName) nameMatches.push(character.firstName.toLowerCase());
      if (character.lastName) nameMatches.push(character.lastName.toLowerCase());
      
      return nameMatches.length > 0 && nameMatches.some(name => textLower.includes(name));
    };

    // Check character presence in both pages
    const characterPresence = characters.map(character => ({
      ...character.toObject(),
      presentInCurrentPage: characterAppearsInText(character, currentPage?.pageText),
      presentInPreviousPage: characterAppearsInText(character, previousPage?.pageText)
    }));

    response.status(200).json(characterPresence);
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

// Generate character image using SDXL
queryRoutes.route("/book/:bookId/character/:characterId/generate-image").post(authenticateAdmin, async (req, res) => {
  try {
    // Get character details
    const character = await Character.findById(req.params.characterId);
    if (!character) {
      return res.status(404).json({ success: false, message: "Character not found" });
    }

    // Get book details to use its style
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }

    // Construct a detailed prompt based on character details and book style
    const prompt = `close up portrait of ${character.appearance} in the style of ${book.style}, ${character.race}, ${character.gender}`;

    try {
      // Create an ImageGeneration record
      const imageGeneration = await ImageGeneration.create({
        userId: req.user._id,
        prompt,
        status: 'processing',
        characterId: character._id
      });

      const imageBase64 = await privateer.generateImage(prompt);
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Generate unique base key for optimized upload
      const baseKey = `character-${character._id}-${Date.now()}`;

      // Upload optimized image to S3
      const uploadResult = await uploadOptimizedImage(imageBuffer, baseKey, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 90,
        format: 'webp'
      });

      // Update character with new image URL
      character.image_url = uploadResult.mainUrl;
      await character.save();

      // Update ImageGeneration record with success
      imageGeneration.status = 'completed';
      imageGeneration.imageUrl = uploadResult.mainUrl;
      await imageGeneration.save();

      // Return success response
      res.status(200).json({
        success: true,
        imageUrl: uploadResult.Location,
        message: 'Character image generated successfully'
      });

    } catch (genError) {
      // Update ImageGeneration record with error if it exists
      try {
        const failedGeneration = await ImageGeneration.findOne({ 
          characterId: character._id,
          status: 'processing'
        });
        if (failedGeneration) {
          failedGeneration.status = 'failed';
          failedGeneration.error = genError.message;
          await failedGeneration.save();
        }
      } catch (err) {
        console.error('Error updating image generation status:', err);
      }

      console.error('Image generation error:', genError);
      throw new Error(`Image generation failed: ${genError.message}`);
    }

  } catch (error) {
    console.error('Character image generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate character image'
    });
  }
});

// Get all generated images for a book
queryRoutes.route("/book/:bookId/generated-images").get(authenticate, async (req, res) => {
  try {
    const images = await ImageGeneration.find({
      ...(await imageVisibilityQuery(req.user)),
      bookId: req.params.bookId,
      status: 'completed'
    }).sort({ createdAt: -1 });

    // Format the response
    const formattedImages = images.map(img => ({
      _id: img._id,
      imageUrl: img.imageUrl || null,
      videoUrl: img.videoUrl || null,
      mediaType: img.mediaType || (img.videoUrl ? 'video' : 'image'),
      paragraphId: img.paragraphId,
      paragraphText: img.paragraphText,
      pageNumber: img.pageNumber,
      text: img.prompt
    }));
    console.log('Formatted Images: ', formattedImages);

    res.status(200).json(formattedImages);
  } catch (error) {
    console.error('Error fetching generated images:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch generated images'
    });
  }
});

// Get generated images for a specific page
queryRoutes.route("/book/:bookId/generated-images/page/:pageNumber").get(authenticate, async (req, res) => {
  try {
    const images = await ImageGeneration.find({
      ...(await imageVisibilityQuery(req.user)),
      bookId: req.params.bookId,
      pageNumber: parseInt(req.params.pageNumber),
      $or: [
        { status: 'completed' },
        { status: 'processing', mediaType: 'video' }
      ]
    }).sort({ createdAt: -1 });

    // Format the response
    const formattedImages = images.map(img => ({
      _id: img._id,
      status: img.status,
      imageUrl: img.imageUrl || null,
      videoUrl: img.videoUrl || null,
      mediaType: img.mediaType || (img.videoUrl ? 'video' : 'image'),
      paragraphId: img.paragraphId,
      paragraphText: img.paragraphText,
      pageNumber: img.pageNumber,
      text: img.prompt
    }));

    res.status(200).json(formattedImages);
  } catch (error) {
    console.error('Error fetching generated images:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch generated images'
    });
  }
});

// Subscription routes
queryRoutes.route("/subscriptions").get(async (req, res) => {
  await getSubscriptionPlans(req, res);
});

queryRoutes.route("/subscription/subscribe").post(authenticate, async (req, res) => {
  try {
    // Call subscribeToPlan which handles the response directly
    await subscribeToPlan(req, res);
    
    // Get the subscription plan name for Facebook tracking
    let planName = 'Unknown Plan';
    if (req.body.planId) {
      try {
        const plan = await Subscription.findById(req.body.planId);
        if (plan) {
          planName = plan.name;
        }
      } catch (planError) {
        console.log('Could not retrieve plan name for tracking:', planError);
      }
    }
    
    // Prepare base event data
    const baseEventData = {
      userAgent: req.headers['user-agent'],
      sourceUrl: '/subscribe'
    };

    // Add user-specific data if authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        baseEventData.userId = user._id;
        baseEventData.email = user.email;
      }
    }
    
    // Send StartTrial event to Facebook
    const eventData = createEventData('StartTrial', baseEventData, {
      content_type: 'subscription',
      order_id: req.user?._id?.toString() || 'unknown',
      content_name: planName
    });
    
    await sendFacebookEvent(eventData);
    
  } catch (error) {
    console.error('Subscription error:', error);
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || 'Failed to process subscription' });
    }
  }
});

queryRoutes.route("/subscription/cancel").post(authenticate, async (req, res) => {
  await cancelSubscription(req, res);
});

queryRoutes.route("/subscription/details").get(authenticate, async (req, res) => {
  await getSubscriptionDetails(req, res);
});

queryRoutes.route("/subscription/auto-renewal").post(authenticate, async (req, res) => {
  await updateAutoRenewal(req, res);
});

// Feature switches (admin → Features): each paid feature runs only while its
// record is active.
queryRoutes.route("/admin/features").get(authenticateAdmin, async (req, res) => {
  try {
    const records = await Feature.find({ action: { $in: FEATURES.map(f => f.key) }, bookId: null }).lean();
    res.json(FEATURES.map(feature => {
      const record = records.find(r => r.action === feature.key);
      return { ...feature, enabled: !!record?.isActive, updatedAt: record?.updatedAt || null };
    }));
  } catch (error) {
    console.error('Error fetching features:', error);
    res.status(500).json({ message: 'Could not load features' });
  }
});

// Body: { enabled: boolean }
queryRoutes.route("/admin/features/:key").put(authenticateAdmin, async (req, res) => {
  try {
    const feature = FEATURES.find(f => f.key === req.params.key);
    if (!feature) return res.status(404).json({ message: 'Unknown feature' });
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be true or false' });
    }
    const record = await Feature.findOneAndUpdate(
      { action: feature.key, bookId: null },
      { $set: { isActive: req.body.enabled }, $setOnInsert: { description: feature.label } },
      { upsert: true, new: true }
    );
    res.json({ ...feature, enabled: record.isActive, updatedAt: record.updatedAt });
  } catch (error) {
    console.error('Error updating feature:', error);
    res.status(500).json({ message: 'Could not update the feature' });
  }
});

// Admin subscription routes
queryRoutes.route("/admin/subscriptions").get(authenticateAdmin, async (req, res) => {
  await getAdminSubscriptionPlans(req, res);
});

queryRoutes.route("/subscription/create").post(authenticateAdmin, async (req, res) => {
  await createSubscriptionPlan(req, res);
});

queryRoutes.route("/subscription/:id/update").post(authenticateAdmin, async (req, res) => {
  await updateSubscriptionPlan(req, res);
});

queryRoutes.route("/subscription/:id/delete").post(authenticateAdmin, async (req, res) => {
  await deleteSubscriptionPlan(req, res);
});

queryRoutes.route("/book/:bookId/generate-image").post(authenticate, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { prompt, paragraphId, pageNumber, style, aspectRatio } = req.body;
    console.log(req.params)
    console.log(req.body)
    if (!bookId || !prompt || !paragraphId || !pageNumber) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const result = await generationService.generateSceneImage(
      bookId,
      req.user._id,
      prompt,
      paragraphId,
      pageNumber,
      style,
      aspectRatio
    );

    res.status(200).json({
      success: true,
      imageUrl: result.imageUrl,
      message: 'Scene image generated successfully',
      analysis: result.analysis
    });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ message: error.message });
  }
});

queryRoutes.route("/book/:bookId/generate-video").post(authenticate, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { prompt, paragraphId, pageNumber, style, durationSeconds, aspectRatio, resolution } = req.body;
    if (!bookId || !prompt || !paragraphId || !pageNumber) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const result = await generationService.generateSceneVideo(
      bookId,
      req.user._id,
      prompt,
      paragraphId,
      pageNumber,
      style,
      durationSeconds,
      aspectRatio,
      resolution
    );

    res.status(200).json({
      success: true,
      imageGenerationId: result.imageGenerationId,
      status: 'processing',
      message: 'Video generation started'
    });
  } catch (error) {
    console.error('Error generating video:', error);
    res.status(500).json({ message: error.message });
  }
});

queryRoutes.route("/video-status/:imageGenerationId").get(authenticate, async (req, res) => {
  try {
    const record = await ImageGeneration.findById(req.params.imageGenerationId).select('status videoUrl error');
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json({ status: record.status, videoUrl: record.videoUrl || null, error: record.error || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add new route for generating audio
// queryRoutes.route("/book/:bookId/page/:pageNumber/audio").post(authenticate, async (req, res) => {
//   try {
//     const result = await generationService.generateAudio(
//       req.user._id,
//       req.params.bookId,
//       req.params.pageNumber
//     );
    
//     res.json(result);
//   } catch (error) {
//     console.error('Audio generation error:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to generate audio'
//     });
//   }
// });

// // Add GET endpoint to check for existing audio
// queryRoutes.route("/book/:bookId/page/:pageNumber/audio").get(authenticate, async (req, res) => {
//   try {
//     const result = await generationService.getExistingAudio(
//       req.params.bookId,
//       req.params.pageNumber
//     );
    
//     res.json(result);
//   } catch (error) {
//     console.error('Error checking audio:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to check audio status'
//     });
//   }
// });

// // Get all audio files for a book
// queryRoutes.route("/book/:bookId/audio").get(authenticate, async (req, res) => {
//   try {
//     const audioFiles = await generationService.getBookAudioFiles(req.params.bookId);
//     res.status(200).json(audioFiles);
//   } catch (error) {
//     console.error('Error fetching audio files:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to fetch audio files'
//     });
//   }
// });

// Cost Analysis Routes
queryRoutes.route("/admin/cost-analysis").get(authenticateAdmin, async (req, res) => {
  try {
    const { period = 30, userId } = req.query;
    
    // Get aggregated stats
    const stats = await CostEstimateService.getAggregatedStats(userId, Math.min(Math.max(parseInt(period) || 30, 1), 365));
    
    const periodDays = Math.min(Math.max(parseInt(period) || 30, 1), 365);
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const periodMatch = {
      ...(userId && mongoose.Types.ObjectId.isValid(userId) && { userId: new mongoose.Types.ObjectId(userId) }),
      status: 'completed',
      createdAt: { $gte: since }
    };

    // Recent estimates within the period, and actual cost per day and service (UTC days)
    const [recentEstimates, dailyRows] = await Promise.all([
      CostEstimate.find(periodMatch)
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('userId', 'username email')
        .lean(),
      CostEstimate.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, service: '$service' },
            actualCost: { $sum: '$actualCost' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.day': 1 } }
      ])
    ]);
    const daily = dailyRows.map(row => ({
      date: row._id.day,
      service: row._id.service,
      actualCost: row.actualCost,
      count: row.count
    }));

    // Calculate overall totals
    const totals = stats.reduce((acc, stat) => {
      acc.estimatedCost += stat.totalEstimatedCost;
      acc.actualCost += stat.totalActualCost;
      acc.count += stat.count;
      return acc;
    }, { estimatedCost: 0, actualCost: 0, count: 0 });

    // Group by service
    const serviceBreakdown = stats.reduce((acc, stat) => {
      const service = stat._id.service;
      if (!acc[service]) {
        acc[service] = {
          estimatedCost: 0,
          actualCost: 0,
          count: 0,
          actions: []
        };
      }
      acc[service].estimatedCost += stat.totalEstimatedCost;
      acc[service].actualCost += stat.totalActualCost;
      acc[service].count += stat.count;
      acc[service].actions.push({
        action: stat._id.action,
        estimatedCost: stat.totalEstimatedCost,
        actualCost: stat.totalActualCost,
        count: stat.count
      });
      return acc;
    }, {});

    res.json({
      period: periodDays,
      totals,
      serviceBreakdown,
      daily,
      recentEstimates
    });
  } catch (error) {
    console.error('Error fetching cost analysis:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch cost analysis' 
    });
  }
});

// Service rates — DB-backed, admin editable
queryRoutes.route("/admin/service-rates").get(authenticateAdmin, async (req, res) => {
  try {
    const rates = await ServiceRate.getAllGrouped();
    res.json({ success: true, rates });
  } catch (error) {
    console.error('Error fetching service rates:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch service rates' });
  }
});

queryRoutes.route("/admin/service-rates/:service/:key").put(authenticateAdmin, async (req, res) => {
  try {
    const { service, key } = req.params;
    const { rate } = req.body;
    if (rate === undefined || isNaN(Number(rate)) || Number(rate) < 0) {
      return res.status(400).json({ success: false, message: 'Invalid rate value' });
    }
    const updated = await ServiceRate.findOneAndUpdate(
      { service, key },
      { rate: Number(rate) },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Rate not found' });
    }
    await rateCache.refresh();
    res.json({ success: true, rate: updated });
  } catch (error) {
    console.error('Error updating service rate:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update rate' });
  }
});

// Activity tracking routes

// Get all activities (admin only)
queryRoutes.route("/admin/activities").get(authenticateAdmin, async (req, res) => {
  try {
    const {
      userId,
      startDate,
      endDate,
      actions,
      page,
      limit
    } = req.query;

    const result = await ActivityService.getUserActivities(userId, {
      startDate,
      endDate,
      actions: actions ? actions.split(',') : undefined,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch activities'
    });
  }
});

// Get activity statistics (admin only)
queryRoutes.route("/admin/activity-stats").get(authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    
    const stats = await ActivityService.getActivityStats({
      startDate,
      endDate,
      groupBy
    });

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch activity statistics'
    });
  }
});

// Get popular resources (admin only)
queryRoutes.route("/admin/popular-resources").get(authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate, resourceModel, limit } = req.query;
    
    const resources = await ActivityService.getPopularResources({
      startDate,
      endDate,
      resourceModel,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      resources
    });
  } catch (error) {
    console.error('Error fetching popular resources:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch popular resources'
    });
  }
});

// Analytics routes

// Get analytics data
queryRoutes.route("/admin/analytics").get(authenticateAdmin, async (req, res) => {
  try {
    const { timeRange } = req.query;
    const analytics = await AnalyticsService.getAnalytics(timeRange);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch analytics'
    });
  }
});

// Export analytics data as CSV
queryRoutes.route("/admin/analytics/export").get(authenticateAdmin, async (req, res) => {
  try {
    const { timeRange } = req.query;
    const csv = await AnalyticsService.exportAnalytics(timeRange);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${timeRange}_${new Date().toISOString()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export analytics'
    });
  }
});

// Token transactions route
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toObjectIds = (ids) => ids
  .map(id => id?.toString())
  .filter(id => id && mongoose.Types.ObjectId.isValid(id))
  .map(id => new mongoose.Types.ObjectId(id));

// Token transactions (admin): paged, filtered and sorted on the server, with cost
// estimate details attached and totals for the whole filtered set.
queryRoutes.route("/transactions").get(authenticateAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const { type, q } = req.query;
    const sortField = req.query.sort === 'amount' ? 'amount' : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const filter = {};
    if (type === 'credit' || type === 'debit') filter.type = type;
    if (q && q.trim()) {
      const pattern = new RegExp(escapeRegex(q.trim()), 'i');
      const users = await User.find({ $or: [{ email: pattern }, { username: pattern }] }).select('_id').limit(500).lean();
      filter.userId = { $in: users.map(u => u._id) };
    }

    const [total, transactions, debitRefs] = await Promise.all([
      TokenTransaction.countDocuments(filter),
      TokenTransaction.find(filter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username email')
        .lean(),
      filter.type === 'credit'
        ? []
        : TokenTransaction.find({ ...filter, type: 'debit', 'metadata.costEstimateId': { $exists: true } })
          .select('metadata.costEstimateId')
          .lean(),
    ]);

    // Attach cost estimate details to this page's transactions
    const pageEstimateIds = toObjectIds(transactions.map(t => t.metadata?.costEstimateId));
    const costEstimates = pageEstimateIds.length
      ? await CostEstimate.find({ _id: { $in: pageEstimateIds } }).lean()
      : [];
    const costEstimateMap = new Map(costEstimates.map(ce => [ce._id.toString(), ce]));

    const enhancedTransactions = transactions.map(transaction => {
      const costEstimate = costEstimateMap.get(transaction.metadata?.costEstimateId?.toString());
      if (!costEstimate) return transaction;
      return {
        ...transaction,
        metadata: {
          ...transaction.metadata,
          service: costEstimate.service,
          action: costEstimate.action,
          estimatedCost: costEstimate.estimatedCost,
          actualCost: costEstimate.actualCost,
          tokenQuote: costEstimate.tokenQuote,
          status: costEstimate.status,
          parameters: costEstimate.parameters,
          partialTokensUsed: costEstimate.partialTokensUsed
        }
      };
    });

    // Totals across every debit matching the filter, not just this page
    const debitEstimateIds = toObjectIds(debitRefs.map(t => t.metadata?.costEstimateId));
    const [totals] = debitEstimateIds.length
      ? await CostEstimate.aggregate([
        { $match: { _id: { $in: debitEstimateIds } } },
        {
          $group: {
            _id: null,
            baseTokens: { $sum: '$tokenQuote.baseTokens' },
            operatingTokens: { $sum: '$tokenQuote.operatingCostTokens' },
            totalTokens: { $sum: '$tokenQuote.totalTokens' },
            baseUSD: { $sum: '$tokenQuote.baseUSD' },
            operatingUSD: { $sum: '$tokenQuote.operatingCostUSD' },
            totalUSD: { $sum: '$tokenQuote.totalUSD' },
            actualUSD: { $sum: '$actualCost' }
          }
        }
      ])
      : [];

    res.json({
      transactions: enhancedTransactions,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      metrics: {
        baseTokens: totals?.baseTokens || 0,
        operatingTokens: totals?.operatingTokens || 0,
        totalTokens: totals?.totalTokens || 0,
        baseUSD: totals?.baseUSD || 0,
        operatingUSD: totals?.operatingUSD || 0,
        totalUSD: totals?.totalUSD || 0,
        actualUSD: totals?.actualUSD || 0
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch transactions' 
    });
  }
});

queryRoutes.route("/user-characters").get(authenticate, async (req, response) => {
  try {
    const userId = req.user._id;

    // Get all characters
    const characters = await Character.find()
      .populate('bookId', 'title')
      .lean();

    // Get user's message counts and interactions
    const messageCounts = await Message.aggregate([
      { 
        $match: { userId: userId }
      },
      { 
        $group: {
          _id: "$characterId",
          messageCount: { $sum: 1 },
          lastInteraction: { $max: "$createdAt" }
        }
      }
    ]);

    // Create a map of character IDs to message counts
    const messageCountMap = new Map(
      messageCounts.map(item => [item._id.toString(), {
        count: item.messageCount,
        lastInteraction: item.lastInteraction
      }])
    );

    // Add user-specific stats to characters
    const charactersWithStats = characters.map(character => ({
      ...character,
      bookTitle: character.bookId.title,
      messageCount: messageCountMap.get(character._id.toString())?.count || 0,
      lastInteraction: messageCountMap.get(character._id.toString())?.lastInteraction || null
    }));

    // Sort by last interaction date and message count
    charactersWithStats.sort((a, b) => {
      if (b.lastInteraction && a.lastInteraction) {
        return new Date(b.lastInteraction) - new Date(a.lastInteraction);
      }
      return b.messageCount - a.messageCount;
    });

    response.status(200).json(charactersWithStats);
  } catch (err) {
    console.error(err);
    response.status(500).json({ message: "Internal server error." });
  }
});

// Featured Content Management Routes

// Get featured content
queryRoutes.route("/admin/featured-content").get(authenticateAdmin, async (req, res) => {
  try {
    const { contentType, type } = req.query;
    
    const query = {
      isActive: true,
      ...(contentType && { contentType }),
      ...(type && { type })
    };

    const featuredContent = await FeaturedContent.find(query)
      .populate({
        path: 'contentId',
        populate: contentType === 'character' ? {
          path: 'bookId',
          select: 'title'
        } : undefined
      })
      .populate('createdBy', 'username')
      .sort({ order: 1, createdAt: -1 });

    // Transform the response to include book title for characters
    const transformedContent = featuredContent.map(item => {
      const content = item.toObject();
      if (content.contentType === 'character' && content.contentId) {
        content.contentId.bookTitle = content.contentId.bookId?.title;
        delete content.contentId.bookId;
      }
      return content;
    });

    res.json(transformedContent);
  } catch (error) {
    console.error('Error fetching featured content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add content to featured/popular
queryRoutes.route("/admin/featured-content").post(authenticateAdmin, async (req, res) => {
  try {
    const { contentType, contentId, type, order, startDate, endDate } = req.body;

    // Map contentType to model name
    const contentTypeModel = contentType === 'book' ? 'Books' : 'Characters';

    // Validate content exists
    const content = contentType === 'book' 
      ? await Book.findById(contentId)
      : await Character.findById(contentId);
    
    if (!content) {
      return res.status(404).json({ message: `${contentType} not found` });
    }

    const featuredContent = await FeaturedContent.create({
      contentType,
      contentId,
      contentTypeModel,
      type,
      order,
      startDate,
      endDate,
      createdBy: req.user._id
    });

    res.status(201).json(featuredContent);
  } catch (error) {
    console.error('Error adding featured content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update featured content
queryRoutes.route("/admin/featured-content/:id").put(authenticateAdmin, async (req, res) => {
  try {
    const { order, isActive, startDate, endDate } = req.body;
    
    const featuredContent = await FeaturedContent.findByIdAndUpdate(
      req.params.id,
      { order, isActive, startDate, endDate },
      { new: true }
    );

    res.json(featuredContent);
  } catch (error) {
    console.error('Error updating featured content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Remove from featured/popular
queryRoutes.route("/admin/featured-content/:id").delete(authenticateAdmin, async (req, res) => {
  try {
    await FeaturedContent.findByIdAndDelete(req.params.id);
    res.json({ message: 'Featured content removed successfully' });
  } catch (error) {
    console.error('Error removing featured content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add book request route
queryRoutes.route("/book-request").post(authenticate, async (req, res) => {
  try {
    const { title, author } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({ message: "Title and author are required" });
    }

    const bookRequest = await BookRequest.create({
      title,
      author,
      userId: req.user._id
    });

    res.status(201).json({
      success: true,
      message: "Book request submitted successfully",
      bookRequest
    });
  } catch (error) {
    console.error('Error submitting book request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to submit book request' 
    });
  }
});

// Author inquiry route (no authentication required)
queryRoutes.route("/author-inquiry").post(async (req, res) => {
  try {
    const { name, email, bookTitle, message } = req.body;

    if (!name || !email || !bookTitle) {
      return res.status(400).json({ message: "Name, email, and book title are required" });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const inquiry = await AuthorInquiry.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      bookTitle: bookTitle.trim(),
      message: message?.trim() || ''
    });

    // Send email notification to admin
    try {
      await EmailService.sendAuthorInquiryNotification(inquiry);
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails - inquiry is still saved
    }

    res.status(201).json({
      success: true,
      message: "Thank you! Your inquiry has been submitted successfully."
    });
  } catch (error) {
    console.error('Error submitting author inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit inquiry. Please try again later.'
    });
  }
});

// Reformat book text route
queryRoutes.route("/book/:bookId/reformat").post(authenticateAdmin, async (req, res) => {
  try {
    const { bookId } = req.params;

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Get all pages for the book
    const pages = await Page.find({ bookId }).sort({ pageNumber: 1 });
    
    if (!pages.length) {
      return res.status(400).json({ message: "No pages found for this book" });
    }

    let pagesUpdated = 0;

    // Process each page
    for (const page of pages) {
      if (page.pageText && page.pageText.trim()) {
        const originalText = page.pageText;
        const reformattedText = reformatTextIntoParagraphs(originalText);
        
        // Only update if the text actually changed
        if (reformattedText !== originalText) {
          page.pageText = reformattedText;
          await page.save();
          pagesUpdated++;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully reformatted ${pagesUpdated} pages`,
      pagesUpdated,
      totalPages: pages.length
    });

  } catch (error) {
    console.error('Error reformatting book:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to reformat book' 
    });
  }
});

/**
 * Reformats clumped text into proper paragraphs
 * @param {string} text - The original text to reformat
 * @returns {string} - The reformatted text with proper paragraphs
 */
function reformatTextIntoParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // First, clean up the text by removing excessive whitespace
  let cleanText = text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\r/g, '\n')    // Handle old Mac line endings
    .replace(/\n+/g, '\n')   // Collapse multiple newlines into single ones
    .replace(/\t/g, ' ')     // Replace tabs with spaces
    .replace(/ +/g, ' ')     // Collapse multiple spaces into single spaces
    .trim();

  // Split into sentences based on punctuation followed by spaces/newlines
  const sentences = cleanText.split(/([.!?]+)(?=\s+[A-Z]|\s*\n|\s*$)/);
  
  let result = '';
  let currentParagraph = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    if (!sentence || !sentence.trim()) {
      continue;
    }
    
    // If it's a punctuation mark, add it to current sentence
    if (/^[.!?]+$/.test(sentence.trim())) {
      currentParagraph += sentence;
      
      // Check if we should start a new paragraph
      const nextSentence = sentences[i + 1];
      if (nextSentence && shouldStartNewParagraph(currentParagraph, nextSentence)) {
        result += currentParagraph.trim() + '\n\n';
        currentParagraph = '';
      }
    } else {
      // It's a regular sentence
      if (currentParagraph && !currentParagraph.endsWith(' ')) {
        currentParagraph += ' ';
      }
      currentParagraph += sentence.trim();
      
      // If this sentence doesn't end with punctuation, check if next part is punctuation
      if (!/[.!?]$/.test(sentence.trim()) && i + 1 < sentences.length && /^[.!?]+$/.test(sentences[i + 1]?.trim())) {
        // Continue to add the punctuation
        continue;
      }
      
      // Check for natural paragraph breaks (dialogue, chapter breaks, etc.)
      if (shouldStartNewParagraph(currentParagraph)) {
        result += currentParagraph.trim() + '\n\n';
        currentParagraph = '';
      }
    }
  }
  
  // Add any remaining text
  if (currentParagraph.trim()) {
    result += currentParagraph.trim();
  }
  
  // Final cleanup: ensure proper spacing between paragraphs
  result = result
    .replace(/\n{3,}/g, '\n\n')  // No more than double newlines
    .replace(/^\n+|\n+$/g, '')   // Remove leading/trailing newlines
    .trim();
    
  return result;
}

/**
 * Determines if a new paragraph should be started
 * @param {string} currentParagraph - The current paragraph text
 * @param {string} nextSentence - The next sentence (optional)
 * @returns {boolean} - Whether to start a new paragraph
 */
function shouldStartNewParagraph(currentParagraph, nextSentence = '') {
  if (!currentParagraph) return false;
  
  const paragraph = currentParagraph.trim();
  const next = nextSentence ? nextSentence.trim() : '';
  
  // Start new paragraph for dialogue
  if (paragraph.includes('"') && paragraph.match(/"/g)?.length >= 2) {
    return true;
  }
  
  // Start new paragraph for chapter/section headers
  if (/^(Chapter|CHAPTER|Part|PART|\d+\.?\s)/i.test(next)) {
    return true;
  }
  
  // Start new paragraph if current one is getting long (over 400 characters)
  if (paragraph.length > 400) {
    return true;
  }
  
  // Start new paragraph for scene transitions (often indicated by time/place changes)
  if (/\b(Meanwhile|Later|The next day|That evening|In the morning|Suddenly)\b/i.test(next)) {
    return true;
  }
  
  // Start new paragraph if there's a clear topic shift
  if (paragraph.length > 200 && /^(But|However|Nevertheless|Meanwhile|Then|Now|After)/i.test(next)) {
    return true;
  }
  
  return false;
}

// Get user's book requests
queryRoutes.route("/book-requests").get(authenticate, async (req, res) => {
  try {
    const bookRequests = await BookRequest.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json(bookRequests);
  } catch (error) {
    console.error('Error fetching book requests:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch book requests' 
    });
  }
});

// Admin route to get all book requests
queryRoutes.route("/admin/book-requests").get(authenticateAdmin, async (req, res) => {
  try {
    const bookRequests = await BookRequest.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 });
    
    res.json(bookRequests);
  } catch (error) {
    console.error('Error fetching book requests:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch book requests' 
    });
  }
});

// Gallery routes
// Hash a string to a number in [0, 1) (FNV-1a). Used for repeatable "random" ordering.
function seededUnitInterval(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

queryRoutes.route("/gallery/images").get(lightAuthenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    // Shuffle seed: stable across pages so pagination is consistent. Defaults to the
    // current UTC day, so the order still varies day to day; clients may pass ?seed=.
    const orderSeed = String(req.query.seed || new Date().toISOString().slice(0, 10));

    // Get image generations with populated book and character data
    // Exclude images that have a characterId (these are character-specific images)
    const allImages = await ImageGeneration.find({
      ...(await imageVisibilityQuery(req.user)), // hidden, blocked authors, reported by viewer
      status: 'completed',
      characterId: { $exists: false } // Only include images without characterId
    })
    .populate('bookId', 'title author image_url')
    .populate('characterId', 'firstName lastName')
    .populate('userId', 'username profileImage');

    // Get like counts for all images to calculate popularity
    const imageIds = allImages.map(img => img._id);
    const likeCounts = await ImageLike.aggregate([
      { $match: { imageGenerationId: { $in: imageIds } } },
      { $group: { _id: '$imageGenerationId', count: { $sum: 1 } } }
    ]);

    // Create a map of image ID to like count for quick lookup
    const likeCountMap = new Map(likeCounts.map(item => [item._id.toString(), item.count]));

    // Add scoring to images for intelligent sorting
    const scoredImages = allImages.map(img => {
      const daysSinceCreation = Math.floor((Date.now() - img.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const likeCount = likeCountMap.get(img._id.toString()) || 0;

      // Scoring algorithm: recency + popularity + randomness
      // - Recency score: newer images get higher scores (decay over 30 days)
      // - Popularity score: more likes = higher score
      // - Random factor: adds variety
      const recencyScore = Math.max(0, 100 - (daysSinceCreation * 3)); // Decay over ~30 days
      const popularityScore = Math.min(likeCount * 5, 50); // Cap at 50 points
      // Deterministic per seed (not Math.random()): every page request re-sorts the whole
      // gallery, so a fresh random factor per request reshuffled it between pages —
      // items repeated on later pages and others were never returned at all.
      const randomFactor = seededUnitInterval(`${orderSeed}:${img._id}`) * 80; // 0-80 points of variety

      const totalScore = recencyScore + popularityScore + randomFactor;

      return {
        ...img.toObject(),
        score: totalScore,
        likeCount: likeCount
      };
    });

    // Sort by score (highest first) and apply pagination
    scoredImages.sort((a, b) => b.score - a.score);

    // Apply pagination after scoring
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedImages = scoredImages.slice(startIndex, endIndex);

    // Get total count for pagination (excluding character-specific images)
    const total = scoredImages.length;

    // Format images with like and comment counts
    const commentFilter = await commentVisibilityQuery(req.user);
    const formattedImages = await Promise.all(paginatedImages.map(async (img) => {
      const commentCount = await ImageComment.countDocuments({ ...commentFilter, imageGenerationId: img._id });

      // Check if current user liked this image
      let isLiked = false;
      if (req.user) {
        isLiked = await ImageLike.exists({
          imageGenerationId: img._id,
          userId: req.user._id
        });
      }

      return {
        _id: img._id,
        imageUrl: img.imageUrl || null,
        videoUrl: img.videoUrl || null,
        mediaType: img.mediaType || (img.videoUrl ? 'video' : 'image'),
        prompt: img.prompt,
        paragraphText: img.paragraphText,
        pageNumber: img.pageNumber,
        style: img.style || 'Default',
        createdAt: img.createdAt,
        book: img.bookId ? {
          _id: img.bookId._id,
          title: img.bookId.title,
          author: img.bookId.author,
          image_url: img.bookId.image_url
        } : null,
        character: img.characterId ? {
          _id: img.characterId._id,
          name: `${img.characterId.firstName} ${img.characterId.lastName}`.trim()
        } : null,
        user: img.userId ? {
          _id: img.userId._id,
          username: img.userId.username,
          profileImage: img.userId.profileImage
        } : null,
        likeCount: img.likeCount,
        commentCount,
        isLiked
      };
    }));

    res.json({
      images: formattedImages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: endIndex < total
      }
    });
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    res.status(500).json({ message: 'Failed to fetch images' });
  }
});

queryRoutes.route("/gallery/images/:imageId").get(lightAuthenticate, async (req, res) => {
  try {
    const image = await ImageGeneration.findById(req.params.imageId)
      .populate('bookId', 'title author image_url')
      .populate('characterId', 'firstName lastName')
      .populate('userId', 'username profileImage');

    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Exclude character-specific images from gallery viewer
    if (image.characterId) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Hidden by a moderator, by an author the viewer blocked, or reported by the viewer.
    const visibility = await imageVisibilityQuery(req.user);
    if (!(await ImageGeneration.exists({ $and: [visibility, { _id: image._id }] }))) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Get all completed images for navigation (exclude character images)
    const allImages = await ImageGeneration.find({
      ...visibility,
      status: 'completed',
      characterId: { $exists: false }
    })
      .sort({ createdAt: -1 })
      .select('_id');

    const imageIds = allImages.map(img => img._id.toString());
    const currentIndex = imageIds.indexOf(req.params.imageId);

    let previousImageId = null;
    let nextImageId = null;

    if (currentIndex > 0) {
      previousImageId = imageIds[currentIndex - 1];
    }

    if (currentIndex < imageIds.length - 1) {
      nextImageId = imageIds[currentIndex + 1];
    }

    const commentFilter = await commentVisibilityQuery(req.user);
    const likeCount = await ImageLike.countDocuments({ imageGenerationId: image._id });
    const commentCount = await ImageComment.countDocuments({ ...commentFilter, imageGenerationId: image._id });

    // Check if current user liked this image
    let isLiked = false;
    if (req.user) {
      isLiked = await ImageLike.exists({
        imageGenerationId: image._id,
        userId: req.user._id
      });
    }

    // Get comments for this image
    const comments = await ImageComment.find({ ...commentFilter, imageGenerationId: image._id })
      .populate('userId', 'username profileImage email')
      .sort({ createdAt: -1 })
      .limit(50);

    const formattedComments = comments.map(comment => {
      // Get username with fallback to email prefix
      const displayName = comment.userId?.username || 
                         (comment.userId?.email ? comment.userId.email.split('@')[0] : 'User');
      
      return {
        _id: comment._id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: comment.userId ? {
          _id: comment.userId._id,
          username: displayName,
          profileImage: comment.userId.profileImage
        } : null
      };
    });

    const formattedImage = {
      _id: image._id,
      imageUrl: image.imageUrl || null,
      videoUrl: image.videoUrl || null,
      mediaType: image.mediaType || (image.videoUrl ? 'video' : 'image'),
      prompt: image.prompt,
      paragraphText: image.paragraphText,
      pageNumber: image.pageNumber,
      style: image.style || 'Default',
      createdAt: image.createdAt,
      book: image.bookId ? {
        _id: image.bookId._id,
        title: image.bookId.title,
        author: image.bookId.author,
        image_url: image.bookId.image_url
      } : null,
      character: image.characterId ? {
        _id: image.characterId._id,
        name: `${image.characterId.firstName} ${image.characterId.lastName}`.trim()
      } : null,
      user: image.userId ? {
        _id: image.userId._id,
        username: image.userId.username,
        profileImage: image.userId.profileImage
      } : null,
      likeCount,
      commentCount,
      isLiked,
      comments: formattedComments,
      previousImageId,
      nextImageId
    };

    res.json(formattedImage);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ message: 'Failed to fetch image' });
  }
});

// Like/Unlike image routes
queryRoutes.route("/gallery/images/:imageId/like").post(authenticate, async (req, res) => {
  try {
    const imageId = req.params.imageId;
    const userId = req.user._id;

    // Check if image exists
    const image = await ImageGeneration.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Check if user already liked this image
    const existingLike = await ImageLike.findOne({
      imageGenerationId: imageId,
      userId: userId
    });

    if (existingLike) {
      // Unlike the image
      await ImageLike.findByIdAndDelete(existingLike._id);
      return res.json({ action: 'unliked', liked: false });
    } else {
      // Like the image
      await ImageLike.create({
        imageGenerationId: imageId,
        userId: userId
      });
      return res.json({ action: 'liked', liked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: 'Failed to toggle like' });
  }
});

queryRoutes.route("/gallery/images/:imageId/comments").post(authenticate, async (req, res) => {
  try {
    const imageId = req.params.imageId;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    // Check if image exists
    const image = await ImageGeneration.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const comment = await ImageComment.create({
      imageGenerationId: imageId,
      userId: userId,
      content: content.trim()
    });

    // Populate user data for response (include email for fallback)
    await comment.populate('userId', 'username profileImage email');

    // Get username with fallback to email prefix
    const displayName = comment.userId.username || 
                       (comment.userId.email ? comment.userId.email.split('@')[0] : 'User');

    const response = {
      _id: comment._id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: comment.userId ? {
        _id: comment.userId._id,
        username: displayName,
        profileImage: comment.userId.profileImage
      } : null
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// Admin route to update book request status
queryRoutes.route("/admin/book-request/:id").put(authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const bookRequest = await BookRequest.findByIdAndUpdate(
      req.params.id,
      { status, notes },
      { new: true }
    ).populate('userId', 'username email');

    if (!bookRequest) {
      return res.status(404).json({ message: "Book request not found" });
    }

    res.json(bookRequest);
  } catch (error) {
    console.error('Error updating book request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update book request' 
    });
  }
});

// ========================
// Audio Profile Endpoints
// ========================

// Get all audio profiles for a book
// Public: narration is free to everyone, signed in or not.
queryRoutes.route("/book/:bookId/audio-profiles").get(lightAuthenticate, async (req, res) => {
  try {
    const AudioProfile = require("../models/audioModel");
    const Page = require("../models/pageModel");

    const audioProfiles = await AudioProfile.find({
      bookId: req.params.bookId
    }).lean();

    // Compute pageTimestamps (normalized 0–1) for completed profiles missing them
    const profilesToUpdate = audioProfiles.filter(
      p => p.status === 'completed' && (!p.pageTimestamps || p.pageTimestamps.length === 0)
    );

    if (profilesToUpdate.length > 0) {
      const pages = await Page.find({ bookId: req.params.bookId }).sort({ pageNumber: 1 }).lean();
      if (pages.length > 0) {
        const totalChars = pages.reduce((s, p) => s + (p.pageText || '').length, 0);
        let cumChars = 0;
        const pts = pages.map(p => {
          const startTime = totalChars > 0 ? cumChars / totalChars : 0;
          cumChars += (p.pageText || '').length;
          return { pageNumber: p.pageNumber, startTime };
        });

        // Cache in memory and persist (fire-and-forget)
        for (const profile of profilesToUpdate) {
          profile.pageTimestamps = pts;
          AudioProfile.findByIdAndUpdate(profile._id, { pageTimestamps: pts }).catch(() => {});
        }
      }
    }

    res.json(audioProfiles.map(p => ({
      _id: p._id,
      voiceId: p.voiceId,
      voiceName: p.voiceName,
      audioUrl: p.audioUrl,
      status: p.status,
      s3Key: p.s3Key,
      duration: p.duration,
      pageTimestamps: p.pageTimestamps || [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    })));
  } catch (error) {
    console.error('Error fetching audio profiles:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch audio profiles'
    });
  }
});

// Get all available voices
queryRoutes.route("/voices").get(async (req, res) => {
  try {
    const Voice = require("../models/voiceModel");
    const voices = await Voice.find({ isActive: true }).lean();
    
    if (voices.length === 0) {
      // Return default voices if none in DB
      return res.json({
        'en_US-lessac': { name: 'Lessac (Warm Male)', model: 'en_US-lessac-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-amy': { name: 'Amy (Female)', model: 'en_US-amy-medium.onnx', gender: 'female', accent: 'US' },
        'en_US-kusal': { name: 'Kusal (Male)', model: 'en_US-kusal-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-joe': { name: 'Joe (Male)', model: 'en_US-joe-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-hfc_female': { name: 'HFC Female', model: 'en_US-hfc_female-medium.onnx', gender: 'female', accent: 'US' },
        'en_US-bryce': { name: 'Bryce (Male)', model: 'en_US-bryce-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-john': { name: 'John (Male)', model: 'en_US-john-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-kristin': { name: 'Kristin (Female)', model: 'en_US-kristin-medium.onnx', gender: 'female', accent: 'US' },
        'en_US-ryan': { name: 'Ryan (Male)', model: 'en_US-ryan-medium.onnx', gender: 'male', accent: 'US' },
        'en_US-libritts_r': { name: 'LibriTTS (Female)', model: 'en_US-libritts_r-medium.onnx', gender: 'female', accent: 'US' },
        'en_GB-alba': { name: 'Alba (Scottish Female)', model: 'en_GB-alba-medium.onnx', gender: 'female', accent: 'UK' },
        'en_GB-alan': { name: 'Alan (Male)', model: 'en_GB-alan-medium.onnx', gender: 'male', accent: 'UK' },
        'en_GB-cori': { name: 'Cori (Female)', model: 'en_GB-cori-medium.onnx', gender: 'female', accent: 'UK' },
        'en_GB-northern_english_male': { name: 'Northern English Male', model: 'en_GB-northern_english_male-medium.onnx', gender: 'male', accent: 'UK' },
        'en_GB-southern_english_female': { name: 'Southern English Female', model: 'en_GB-southern_english_female-low.onnx', gender: 'female', accent: 'UK' },
        'en_GB-vctk': { name: 'VCTK (Multi-Voice)', model: 'en_GB-vctk-medium.onnx', gender: 'multi', accent: 'UK' }
      });
    }
    
    // Convert to object format
    const voicesObj = {};
    voices.forEach(v => {
      voicesObj[v.voiceId] = {
        name: v.name,
        model: v.model,
        gender: v.gender,
        accent: v.accent
      };
    });
    
    res.json(voicesObj);
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch voices' 
    });
  }
});

module.exports = queryRoutes;