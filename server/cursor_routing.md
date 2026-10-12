# API Documentation

## Authentication Routes

### Register
- **Route**: `/register`
- **Method**: POST
- **Body**:
  - `email` (string): User's email
  - `password` (string): User's password
- **Response**: Registration confirmation message

### Login
- **Route**: `/login`
- **Method**: POST
- **Body**:
  - `email` (string): User's email
  - `password` (string): User's password
- **Response**: JWT token

### Google Authentication
- **Route**: `/google/verify`
- **Method**: POST
- **Body**:
  - `credential` (string): Google OAuth token
- **Response**: JWT token

### Email Verification
- **Route**: `/verify-email`
- **Method**: POST
- **Body**:
  - `token` (string): Verification token
- **Response**: Verification status

### Resend Verification
- **Route**: `/resend-verification`
- **Method**: POST
- **Body**:
  - `email` (string): User's email
- **Response**: Confirmation message

### Password Reset
- **Route**: `/forgot-password`
- **Method**: POST
- **Body**:
  - `email` (string): User's email
- **Response**: Reset email confirmation

### Reset Password
- **Route**: `/reset-password`
- **Method**: POST
- **Body**:
  - `token` (string): Reset token
  - `newPassword` (string): New password
- **Response**: Password reset confirmation

## Book Routes

### Get All Books
- **Route**: `/books`
- **Method**: GET
- **Query Parameters**:
  - `page` (number, optional): Page number
  - `limit` (number, optional): Items per page
- **Response**: List of books with featured, popular, and other categories

### Search Books
- **Route**: `/books/search`
- **Method**: GET
- **Query Parameters**:
  - `query` (string): Search term
  - `page` (number, optional): Page number
  - `limit` (number, optional): Items per page
- **Response**: Search results with pagination

### Get Book Details
- **Route**: `/book/:bookId`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: Book details with access status

### Get Similar Books
- **Route**: `/book/:bookId/similar`
- **Method**: GET
- **Middleware**: `lightAuthenticate` (Optional authentication)
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: Array of similar books (by shared categories), excluding the current book. Returns user-specific `currentPage` and `isPurchased` when authenticated. Returns empty array when book has no categories.

### Get Similar Characters
- **Route**: `/book/:bookId/similar-characters`
- **Method**: GET
- **Middleware**: `lightAuthenticate` (Optional authentication)
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: Array of characters from books that share categories with the current book (excluding current book's characters). Each character includes `bookTitle` and `bookId`. Returns empty array when book has no categories.

### Add Book to Library
- **Route**: `/book/:bookId/add`
- **Method**: POST
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: Purchase confirmation

### Update Reading Progress
- **Route**: `/book/:bookId/progress`
- **Method**: POST
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Body**:
  - `pageNumber` (number): Current page number
- **Response**: Updated progress

### Get Current Reading Progress
- **Route**: `/user/current-reading`
- **Method**: GET
- **Authentication**: Required
- **Response**: Current reading progress with book details
  - `book` (object): Book details
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total pages in book
  - `lastReadAt` (date): Last reading timestamp
  - `progress` (number): Reading progress percentage (0-100)
- **Status Codes**:
  - 200: Success with reading progress
  - 204: No current reading progress (user hasn't started reading any books)
  - 404: User not found
  - 500: Server error

### Get Book Pages
- **Route**: `/book/:bookId/page`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: List of pages

### Get Specific Page
- **Route**: `/book/:bookId/page/:pageId`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
  - `pageId` (string): Page ID
- **Response**: Page details

### Get Page by Number
- **Route**: `/book/:bookId/pages/num/:pageNumber`
- **Method**: GET
- **Middleware**: `lightAuthenticate` (Optional authentication)
- **URL Parameters**:
  - `bookId` (string): Book ID
  - `pageNumber` (number): Page number
- **Response**: Page details
- **Access Control**: 
  - Pages 1-2: Available to all users (authenticated and unauthenticated)
  - Pages 3+: Requires user authentication
  - Returns 403 error with `requiresLogin: true` for unauthenticated users attempting to access page 3+

## Character Routes

### Get Book Characters
- **Route**: `/book/:bookId/characters`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: List of characters

### Get Character Details
- **Route**: `/book/:bookId/characters/:characterId`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
  - `characterId` (string): Character ID
- **Response**: Character details

### Chat with Character
- **Route**: `/book/:bookId/character/:characterId/chat`
- **Method**: POST
- **URL Parameters**:
  - `bookId` (string): Book ID
  - `characterId` (string): Character ID
- **Body**:
  - `prompt` (string): User message
  - `pageNumber` (number): Current page number
- **Response**: Character response

### Get Character Messages
- **Route**: `/book/:bookId/character/:characterId/messages`
- **Method**: GET
- **URL Parameters**:
  - `bookId` (string): Book ID
  - `characterId` (string): Character ID
- **Response**: Chat history

## Gallery Routes

### Get Gallery Images
- **Route**: `/gallery/images`
- **Method**: GET
- **Auth**: Optional (lightAuthenticate)
- **Query Parameters**:
  - `page` (number, optional): Page number (default: 1)
  - `limit` (number, optional): Items per page (default: 20)
- **Response**: Paginated gallery images with like/comment counts
- **Note**: Excludes character-specific images (characterId must not exist)

### Get Single Gallery Image
- **Route**: `/gallery/images/:imageId`
- **Method**: GET
- **Auth**: Optional (lightAuthenticate)
- **URL Parameters**:
  - `imageId` (string): Image ID
- **Response**: Image details with comments, likes, and navigation IDs
- **Note**: Returns 404 for character-specific images

### Like/Unlike Gallery Image
- **Route**: `/gallery/images/:imageId/like`
- **Method**: POST
- **Auth**: Required (authenticate)
- **URL Parameters**:
  - `imageId` (string): Image ID
- **Response**: Like status (liked/unliked)

### Add Comment to Gallery Image
- **Route**: `/gallery/images/:imageId/comments`
- **Method**: POST
- **Auth**: Required (authenticate)
- **URL Parameters**:
  - `imageId` (string): Image ID
- **Body**:
  - `content` (string): Comment text (max 500 characters)
- **Response**: Created comment with user info

## Subscription Routes

### Get Subscription Plans
- **Route**: `/subscriptions`
- **Method**: GET
- **Response**: Available subscription plans

### Subscribe to Plan
- **Route**: `/subscription/subscribe`
- **Method**: POST
- **Body**:
  - `planId` (string): Plan ID
- **Response**: Subscription details

### Cancel Subscription
- **Route**: `/subscription/cancel`
- **Method**: POST
- **Response**: Cancellation confirmation

### Get Subscription Details
- **Route**: `/subscription/details`
- **Method**: GET
- **Response**: Current subscription details

### Update Auto-renewal
- **Route**: `/subscription/auto-renewal`
- **Method**: POST
- **Body**:
  - `autoRenew` (boolean): Auto-renewal status
- **Response**: Updated subscription details

## Token Management

### Check Token Availability
- **Route**: `/tokens/check/:action`
- **Method**: GET
- **URL Parameters**:
  - `action` (string): Action type
- **Response**: Token availability status

### Get Token Costs
- **Route**: `/token-costs`
- **Method**: GET
- **Response**: List of token costs

## Admin Routes

### Get Admin Analytics
- **Route**: `/admin/analytics`
- **Method**: GET
- **Query Parameters**:
  - `timeRange` (string): Time range for analytics
- **Response**: Analytics data

### Get Cost Analysis
- **Route**: `/admin/cost-analysis`
- **Method**: GET
- **Query Parameters**:
  - `period` (number): Analysis period in days
  - `userId` (string, optional): Specific user ID
- **Response**: Cost analysis data

### Get Service Rates
- **Route**: `/admin/service-rates`
- **Method**: GET
- **Response**: Current service rates

### Get Featured Content
- **Route**: `/admin/featured-content`
- **Method**: GET
- **Query Parameters**:
  - `contentType` (string): Type of content
  - `type` (string): Featured type
- **Response**: Featured content list

### Manage Featured Content
- **Route**: `/admin/featured-content`
- **Method**: POST
- **Body**:
  - `contentType` (string): Type of content
  - `contentId` (string): Content ID
  - `type` (string): Featured type
  - `order` (number): Display order
  - `startDate` (date, optional): Start date
  - `endDate` (date, optional): End date
- **Response**: Created featured content

### Reformat Book Text
- **Route**: `/book/:bookId/reformat`
- **Method**: POST
- **Authentication**: Admin required
- **URL Parameters**:
  - `bookId` (string): Book ID
- **Response**: Reformatting results
  - `success` (boolean): Operation success status
  - `message` (string): Result message
  - `pagesUpdated` (number): Number of pages that were reformatted
  - `totalPages` (number): Total number of pages in the book
- **Description**: Reformats clumped text in book pages by breaking it into proper paragraphs. Uses intelligent text processing to:
  - Normalize line endings and whitespace
  - Split text into logical sentences
  - Identify natural paragraph breaks (dialogue, chapter breaks, scene transitions)
  - Maintain proper spacing between paragraphs
- **Status Codes**:
  - 200: Success
  - 404: Book not found
  - 400: No pages found for book
  - 500: Server error

## Book Request Routes

### Submit Book Request
- **Route**: `/book-request`
- **Method**: POST
- **Body**:
  - `title` (string): Book title
  - `author` (string): Book author
- **Response**: Request confirmation

### Get User Book Requests
- **Route**: `/book-requests`
- **Method**: GET
- **Response**: List of user's book requests

### Get All Book Requests (Admin)
- **Route**: `/admin/book-requests`
- **Method**: GET
- **Response**: List of all book requests

### Update Book Request Status (Admin)
- **Route**: `/admin/book-request/:id`
- **Method**: PUT
- **URL Parameters**:
  - `id` (string): Request ID
- **Body**:
  - `status` (string): New status
  - `notes` (string, optional): Admin notes
- **Response**: Updated request details

## Scripts

### Regenerate Character Intros
- **Script**: `server/scripts/regenerateCharacterIntros.js`
- **Purpose**: Regenerates intro quips for all characters in the database using AI
- **Usage**: `node server/scripts/regenerateCharacterIntros.js`
- **Description**: 
  - Fetches all characters from the database
  - Uses the Privateer API to generate new intro quips based on character details
  - Updates each character's intro field in the database
  - Includes error handling and progress reporting
  - Adds 1-second delay between API calls to avoid rate limits
- **Features**:
  - Processes characters one by one to avoid overwhelming the API
  - Shows old vs new intro for comparison
  - Provides summary statistics at completion
  - Gracefully handles errors for individual characters
  - Exports functions for potential integration with other scripts

### Detect Character Gender
- **Script**: `server/scripts/detectCharacterGender.js`
- **Purpose**: Automatically detects and assigns gender to characters by analyzing existing properties
- **Usage**: `node server/scripts/detectCharacterGender.js`
- **Description**: 
  - Analyzes character names, descriptions, and other text for gender indicators
  - Uses rule-based detection (pronouns, titles, common names) instead of AI
  - Calculates confidence scores for each detection
  - Updates characters with gender and genderConfidence fields
  - Provides detailed analysis and reporting
- **Features**:
  - No AI or API costs - uses rule-based analysis
  - Analyzes multiple text sources (intro, description, events, traits, etc.)
  - Weighted scoring system for different types of indicators
  - Highlights low-confidence detections for manual review
  - Lists characters with unknown gender for further investigation
  - Fast processing without rate limiting concerns

### Clean Unknown Names
- **Script**: `server/scripts/cleanUnknownNames.js`
- **Purpose**: Finds and cleans characters with 'unknown' first or last names by setting them to null
- **Usage**: `node server/scripts/cleanUnknownNames.js`
- **Description**: 
  - Identifies characters with 'unknown' as firstName or lastName (case insensitive)
  - Updates these fields to null for better data consistency
  - Provides detailed reporting of all changes made
  - Helps clean up placeholder data from imports or incomplete generation
- **Features**:
  - Case insensitive detection of 'unknown' names
  - Selective updates (only changes fields that need it)
  - Detailed change tracking and reporting
  - Safe operation with no API costs or rate limits
  - Fast execution with comprehensive logging 