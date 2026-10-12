const Book = require('../models/bookModel');
const Page = require('../models/pageModel');
const EPub = require('epub');
const util = require('util');
const pdfParse = require('pdf-parse');
const { uploadOptimizedImage } = require('./imageOptimization');
const { processContentIntoPages } = require('../helpers/bookHelper');
const User = require('../models/userModel');
const ActivityService = require('../services/activityService');
const { JSDOM } = require('jsdom');
const { DOMParser, Node } = new JSDOM().window;
const privateer = require('./privateerClient');

class BookService {
  async extractBookContent(file) {
    // Create a temporary book to process the file
    const tempBook = { _id: 'temp' };
    let bookContent = '';

    try {
      // Create a temporary array to store pages
      const pages = [];
      
      // Override Page.create to collect pages instead of saving to DB
      const originalPageCreate = Page.create;
      Page.create = async function(pageData) {
        pages.push(pageData);
        return pageData;
      };

      // Process the file using BookService
      await this.processBookFile(tempBook, file);

      // Restore original Page.create
      Page.create = originalPageCreate;

      // Combine all page content
      bookContent = pages
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(page => page.pageText)
        .join('\n\n');

      return bookContent;
    } catch (error) {
      console.error('Error extracting book content:', error);
      throw error;
    }
  }

  async createBook(bookData, files, userId) {
    try {
      const newBook = {
        ...bookData,
        created_by: userId
      };

      // Safely parse categories if it's a string, otherwise use as is
      if (typeof bookData.categories === 'string') {
        try {
          newBook.categories = JSON.parse(bookData.categories);
        } catch (parseError) {
          console.error('Error parsing categories:', parseError);
          // If parsing fails, treat it as a single category
          newBook.categories = [bookData.categories];
        }
      } else if (Array.isArray(bookData.categories)) {
        // If it's already an array, use it as is
        newBook.categories = bookData.categories;
      } else if (bookData.categories) {
        // If it's neither a string nor an array but exists, convert to array
        newBook.categories = [bookData.categories];
      } else {
        // If no categories provided, use empty array
        newBook.categories = [];
      }

      let result = await Book.create(newBook);
      
      // Handle cover image upload
      if (files?.image?.[0]) {
        await this.uploadCoverImage(result, files.image[0]);
      }

      // Process book file if provided
      if (files?.bookFile?.[0]) {
        await this.processBookFile(result, files.bookFile[0]);
      }
      
      // Log book creation activity
      await ActivityService.logActivity(userId, 'BOOK_UPLOAD', {
        resourceId: result._id,
        resourceModel: 'Book',
        metadata: {
          title: result.title,
          author: result.author
        }
      });

      return result;
    } catch (error) {
      console.error('Error in createBook:', error);
      throw error;
    }
  }

  async updateReadingProgress(userId, bookId, pageNumber) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error("User not found");
    }

    // Find existing progress
    const progressIndex = user.readingProgress.findIndex(p => p.book.equals(bookId));
    
    if (progressIndex === -1) {
      // Create new progress entry
      user.readingProgress.push({
        book: bookId,
        currentPage: pageNumber,
        lastReadAt: new Date()
      });
    } else {
      // Update existing progress
      user.readingProgress[progressIndex].currentPage = pageNumber;
      user.readingProgress[progressIndex].lastReadAt = new Date();
    }

    await user.save();

    // Log book view activity
    await ActivityService.logActivity(userId, 'VIEW_BOOK', {
      resourceId: bookId,
      resourceModel: 'Book',
      metadata: {
        pageNumber,
        timestamp: new Date()
      }
    });

    return { message: "Reading progress updated successfully", currentPage: pageNumber };
  }

  async purchaseBook(userId, bookId) {
    // Find user and book
    const user = await User.findById(userId);
    const book = await Book.findById(bookId);
    
    if (!book) {
      throw new Error("Book not found");
    }

    // Check if book is already purchased
    if (user.purchasedBooks.includes(book._id)) {
      throw new Error("Book already purchased");
    }

    // // Get token cost for book purchase
    // const tokenCost = await TokenCost.findOne({ action: 'BOOK_PURCHASE', isActive: true });
    // if (!tokenCost) {
    //   throw new Error("Book purchase is not available at this time");
    // }

    // Add book to user's library
    user.purchasedBooks.push(book._id);
    await user.save();

    // Get the user's reading progress for this book
    const progress = user.readingProgress.find(p => p.book.equals(book._id));

    // Log book purchase activity
    await ActivityService.logActivity(userId, 'PURCHASE_BOOK', {
      resourceId: book._id,
      resourceModel: 'Book',
      metadata: {
        title: book.title,
        author: book.author
      }
    });

    // Return the book with purchase status and reading progress
    return {
      ...book.toObject(),
      isPurchased: true,
      currentPage: progress ? progress.currentPage : 1,
      lastReadAt: progress ? progress.lastReadAt : null
    };
  }

  async removeBook(userId, bookId) {
    const user = await User.findById(userId);
    const book = await Book.findById(bookId);

    if (!book) {
      throw new Error("Book not found");
    }

    const idx = user.purchasedBooks.findIndex(id => id.equals(book._id));
    if (idx === -1) {
      throw new Error("Book not in library");
    }

    user.purchasedBooks.splice(idx, 1);
    await user.save();

    return {
      ...book.toObject(),
      isPurchased: false,
    };
  }

  async editBook(bookId, bookData, imageFile, bookFile) {
    try {
      // Parse categories from JSON string if present
      if (bookData.categories) {
        bookData.categories = JSON.parse(bookData.categories);
      }

      // Get current book to check image
      const currentBook = await Book.findById(bookId);
      if (!currentBook) {
        throw new Error("Book not found");
      }

      const clearImage = bookData.clearImage === 'true' || bookData.clearImage === true;
      delete bookData.clearImage;

      // Handle image upload if provided, or clear the cover when asked to
      if (imageFile) {
        await this.uploadCoverImage(currentBook, imageFile);
        bookData.image_url = currentBook.image_url;
      } else if (clearImage) {
        bookData.image_url = '';
      }

      // Handle book file upload if provided
      if (bookFile) {
        // Delete existing pages
        await Page.deleteMany({ bookId });
        
        // Process the new book file
        await this.processBookFile(currentBook, bookFile);
      }

      // Update the book data
      const updatedBook = await Book.findByIdAndUpdate(bookId, bookData, { new: true });
      return updatedBook;
    } catch (error) {
      throw error;
    }
  }

  async uploadCoverImage(book, imageFile) {
    try {
      // Generate unique base key for optimized upload
      const baseKey = `book-${book._id}-${Date.now()}`;
      
      // Upload optimized image to S3
      const uploadResult = await uploadOptimizedImage(imageFile.buffer, baseKey, {
        maxWidth: 1200,
        maxHeight: 1800,
        quality: 90,
        format: 'webp'
      });

      // Update book with optimized image URL
      book.image_url = uploadResult.mainUrl;
      await book.save();
      
      return book;
    } catch (error) {
      console.error('Error uploading optimized book cover:', error);
      throw error;
    }
  }

  async processBookFile(book, file) {
    if (file.mimetype === 'application/pdf') {
      await this.processPdfFile(book, file);
    } else if (file.mimetype === 'application/epub+zip') {
      await this.processEpubFile(book, file);
    } else {
      await this.processTextFile(book, file);
    }
  }

  async processPdfFile(book, file) {
    let currentPage = 1;
    const options = {
      pagerender: async function(pageData) {
        const textContent = await pageData.getTextContent();
        const sections = [];
        const currentSection = [];
        let lastY = null;
        
        // Sort items by vertical position (top to bottom) and then by horizontal position
        const sortedItems = textContent.items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) < 1) {
            return a.transform[4] - b.transform[4];
          }
          return yDiff;
        });

        // First pass: group items by vertical position
        sortedItems.forEach((item) => {
          const y = item.transform[5];
          const text = item.str;
          
          if (!text.trim()) {
            return;
          }

          if (lastY === null || Math.abs(y - lastY) > 1) {
            if (currentSection.length > 0) {
              sections.push(currentSection.join('').trim());
              currentSection.length = 0;
            }
          }
          
          currentSection.push(text);
          lastY = y;
        });

        if (currentSection.length > 0) {
          sections.push(currentSection.join('').trim());
        }

        // Second pass: process sections into final text
        const finalSections = [];
        const buffer = [];
        
        sections.forEach((section, index) => {
          if (!section.trim()) {
            return;
          }

          const isTitle = section.length < 50 && (
            section === section.toUpperCase() || 
            /^(Chapter|Book|Part|\d+|[IVXLC]+)/i.test(section) ||
            /^[A-Z][a-z]*((\s|-)[A-Z][a-z]*)*$/.test(section)
          );

          if (isTitle) {
            if (buffer.length > 0) {
              finalSections.push(buffer.join(' '));
              buffer.length = 0;
            }
            finalSections.push(section);
          } else if (/[.!?]$/.test(section) || index === sections.length - 1) {
            buffer.push(section);
            finalSections.push(buffer.join(' '));
            buffer.length = 0;
          } else {
            buffer.push(section);
          }
        });

        const text = finalSections
          .filter(section => section.trim().length > 0)
          .map(section => section.trim())
          .join('\n\n');

        await Page.create({
          pageText: text,
          pageNumber: currentPage++,
          bookId: book._id
        });

        return true;
      }
    };

    await pdfParse(file.buffer, options);
  }

  async processEpubFile(book, file) {
    try {
      // Create a new EPUB instance
      const epub = new EPub(file.buffer);
      
      // Parse the EPUB
      await new Promise((resolve, reject) => {
        epub.parse();
        epub.on('end', resolve);
        epub.on('error', reject);
      });

      // Get all chapters
      const chapters = epub.flow;
      let currentPage = 1;
      let currentPageContent = '';
      let pageCount = 0;
      const MAX_WORDS_PER_PAGE = 350; // Much stricter word limit
      const MAX_CHARS_PER_PAGE = 2500; // Much stricter character limit

      // Helper function to count words
      const countWords = (text) => text.trim().split(/\s+/).length;

      // Helper function to create a new page
      const createNewPage = async () => {
        if (currentPageContent.trim()) {
          const wordCount = countWords(currentPageContent);
          const charCount = currentPageContent.length;
          
          // Debug logging
          console.log(`Creating page ${currentPage}:`, {
            wordCount,
            charCount,
            contentLength: currentPageContent.length
          });

          await Page.create({
            pageText: currentPageContent.trim(),
            pageNumber: currentPage++,
            bookId: book._id
          });
          pageCount++;
          currentPageContent = '';
        }
      };

      // Process each chapter
      for (const chapter of chapters) {
        // Get chapter content
        const chapterContent = await new Promise((resolve, reject) => {
          epub.getChapter(chapter.id, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });

        // Create a DOM parser to handle HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(chapterContent, 'text/html');

        // Process each element in the chapter
        const elements = doc.body.children;
        for (const element of elements) {
          // Skip empty elements
          if (!element.textContent.trim()) continue;

          const text = element.textContent.trim();
          if (!text) continue;

          // Split text into sentences for finer control
          const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
          
          for (const sentence of sentences) {
            // Check if adding this sentence would exceed limits
            const newContent = currentPageContent + sentence + ' ';
            const wordCount = countWords(newContent);
            const charCount = newContent.length;

            // Create new page if either limit would be exceeded
            if (wordCount > MAX_WORDS_PER_PAGE || charCount > MAX_CHARS_PER_PAGE) {
              await createNewPage();
            }

            // Add the sentence
            currentPageContent += sentence + ' ';

            // Force new page if we're getting close to limits
            if (countWords(currentPageContent) > MAX_WORDS_PER_PAGE * 0.8 || 
                currentPageContent.length > MAX_CHARS_PER_PAGE * 0.8) {
              await createNewPage();
            }
          }

          // Add appropriate spacing based on element type
          if (element.tagName === 'P' || element.tagName === 'DIV') {
            currentPageContent += '\n\n';
          } else if (element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3') {
            currentPageContent += '\n\n\n';
          }

          // Final check after adding content
          if (countWords(currentPageContent) > MAX_WORDS_PER_PAGE || 
              currentPageContent.length > MAX_CHARS_PER_PAGE) {
            await createNewPage();
          }
        }
      }

      // Create the last page if there's remaining content
      if (currentPageContent.trim()) {
        await Page.create({
          pageText: currentPageContent.trim(),
          pageNumber: currentPage,
          bookId: book._id
        });
        pageCount++;
      }

      return pageCount;
    } catch (error) {
      console.error('Error processing EPUB file:', error);
      throw error;
    }
  }

  async processTextFile(book, file) {
    const bookContent = file.buffer.toString('utf-8');
    const pages = processContentIntoPages(bookContent);
    
    // Create pages sequentially
    for (let i = 0; i < pages.length; i++) {
      await Page.create({
        pageText: pages[i],
        pageNumber: i + 1,
        bookId: book._id
      });
    }
  }
    // Helper function to analyze pages using AI
  async analyzePagePatternsWithAI(pages) {
    try {
      // Take a sample of pages from different parts of the book
      const sampleSize = Math.min(5, Math.floor(pages.length / 4));
      const samplePages = [];
      
      // Get pages from different parts of the book for better analysis
      for (let i = 0; i < sampleSize; i++) {
        const index = Math.floor((i / sampleSize) * pages.length);
        samplePages.push({
          pageNumber: index + 1,
          content: pages[index]
        });
      }

      const prompt = `Analyze these sample pages from a book to identify repetitive elements like headers, footers, and page numbers.
      Look for patterns that appear consistently across pages but are not part of the main content (This also may include incrementing page numbers attached to text).

      Sample pages to analyze:
      ${samplePages.map(p => `
      --- Page ${p.pageNumber} ---
      ${p.content}
      `).join('\n')}

      Respond with a JSON object in this exact format:
      {
        "headers": [
          {
            "pattern": "exact text that repeats at the top",
            "description": "what this pattern represents (e.g. chapter title, book title)"
          }
        ],
        "footers": [
          {
            "pattern": "exact text that repeats at the bottom",
            "description": "what this pattern represents (e.g. page number, copyright, name)"
          }
        ],
        "inlinePatterns": [
          {
            "pattern": "any other repetitive text pattern",
            "description": "what this pattern represents",
            "shouldRemove": boolean
          }
        ],
        "analysis": "brief explanation of the patterns found"
      }

      Only include patterns that appear consistently and are clearly not part of the main content.
      For patterns, provide the exact text as it appears in the pages.
      For inlinePatterns, set shouldRemove to true only if you're very confident it's not content.`;

      const { text } = await privateer.generateText(prompt);
      return JSON.parse(privateer.cleanJson(text));
    } catch (error) {
      console.error('Error analyzing patterns with AI:', error);
      return {
        headers: [],
        footers: [],
        inlinePatterns: [],
        analysis: "Failed to analyze patterns"
      };
    }
  }

  // Helper function to clean text using AI-detected patterns
  cleanPageTextAI(text, patterns) {
    let cleanedText = text;
    
    // Remove headers
    for (const header of patterns.headers) {
      const escapedPattern = header.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const headerRegex = new RegExp(`^\\s*${escapedPattern}\\s*\\n?`, 'gm');
      cleanedText = cleanedText.replace(headerRegex, '');
    }
    
    // Remove footers
    for (const footer of patterns.footers) {
      const escapedPattern = footer.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const footerRegex = new RegExp(`\\n?\\s*${escapedPattern}\\s*$`, 'gm');
      cleanedText = cleanedText.replace(footerRegex, '');
    }
    
    // Remove inline patterns that should be removed
    for (const pattern of patterns.inlinePatterns) {
      if (pattern.shouldRemove) {
        const escapedPattern = pattern.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const inlineRegex = new RegExp(escapedPattern, 'g');
        cleanedText = cleanedText.replace(inlineRegex, '');
      }
    }
    
    // Clean up any resulting multiple newlines and trim
    return cleanedText
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

module.exports = new BookService(); 