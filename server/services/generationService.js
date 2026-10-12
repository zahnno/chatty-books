const privateer = require('./privateerClient');
const Character = require('../models/characterModel');
const ImageGeneration = require('../models/imageGenerationModel');
const { s3, ttsClient, uploadVideo } = require('./cloud-services');
const { uploadOptimizedImage } = require('./imageOptimization');
const Page = require('../models/pageModel');
const Book = require('../models/bookModel');
const CostEstimateService = require('./costEstimateService');
const Audio = require('../models/audioModel');
const { requireFeature } = require('./features');

class GenerationService {
  async generateCharactersForBook(book, pages) {
    try {
      if (!book) {
        throw new Error("Book not found");
      }

      const bookContent = pages.map(page => page.pageText).join('\n\n');
      
      const conceptPrompt = `Based on the following book content:
      
      Title: "${book.title}"
      Description: "${book.description}"
      
      Content:
      ${bookContent}
      
      Generate the main characters that appear in or would fit naturally in this story.
      These characters should be consistent with the story's content, themes, and setting.
      
      Respond with ONLY a JSON array. Do not include any other text, markdown, or formatting.
      Each object in the array should have exactly these fields:
      - firstName (string)
      - lastName (string)
      - description (string: detailed background story)
      - intro (string: one-line introduction as if you were the character)
      - events (string: chronological list of key events)
      - appearance (string: detailed physical description for text to image generation, emphasis on race, gender, age, sexuality, and any other relevant details)
      - personalityTraits (array of strings: 5-7 key personality traits)
      - strengths (array of strings: 3-4 main strengths)
      - weaknesses (array of strings: 3-4 main weaknesses)
      - goals (array of strings: 2-3 main goals or motivations)
 
      Example of the exact format expected:
      [
        {
          "firstName": "John",
          "lastName": "Smith",
          "description": "A former soldier turned merchant who...",
          "intro": "Hello there friend, what brings you here?",
          "events": "Chapter 2: First appears in the marketplace, Chapter 3: Helps during storm, Chapter 5: Reveals secret",
          "appearance": "Tall and weathered, with a distinctive scar across his left cheek. Gray-streaked dark hair and alert brown eyes.",
          "personalityTraits": ["Cautious", "Resourceful", "Loyal", "Reserved", "Strategic"],
          "strengths": ["Combat expertise", "Quick thinking", "Leadership"],
          "weaknesses": ["Trust issues", "Haunted by past", "Overprotective"],
          "goals": ["Redeem past mistakes", "Protect the town", "Find lost sister"]
        }
      ]

      Keep descriptions under 500 words, intros under 50 words.
      Ensure all arrays contain the specified number of items.
      IMPORTANT: Return ONLY the JSON object, with no additional text, markdown formatting, or code block markers.`;

      const { text } = await privateer.generateText(conceptPrompt);
      const cleanedText = privateer.cleanJson(text);
      
      let charactersData;
      try {
        charactersData = JSON.parse(cleanedText);
        
        // Validate the structure of the generated data
        if (!Array.isArray(charactersData) || charactersData.length === 0) {
          throw new Error('Invalid response format: expected non-empty array');
        }
        
        for (const char of charactersData) {
          if (!char.description || !char.intro || 
              !char.events || !char.appearance || !Array.isArray(char.personalityTraits)) {
            throw new Error('Invalid character data: missing required fields');
          }
        }

        // Add the book agent character
        charactersData.unshift(this.createBookAgent(book));

        // Create all characters in the database and generate their images
        const createdCharacters = await Promise.all(
          charactersData.map(charData => this.createCharacterWithImage(charData, book))
        );

        return createdCharacters;
      } catch (parseError) {
        // Update cost estimate status to failed if there was an error
        console.error('Error parsing or creating characters:', parseError);
        throw parseError;
      }
    } catch (error) {
      console.error('Error generating characters:', error);
      throw error;
    }
  }

  createBookAgent(book) {
    return {
      firstName: "Guide",
      lastName: book.title,
      description: `As an expert on "${book.title}", I am a specialized literary companion with comprehensive knowledge of the work. I understand the nuances of the plot, characters, and themes throughout the narrative. My role is to enhance your reading experience by offering informed insights, contextual understanding, and thoughtful analysis.`,
      intro: `A knowledgeable literary guide for your reading journey`,
      events: `Present as a reference throughout the book, with detailed understanding of the complete narrative structure`,
      appearance: `A professional robot with a scholarly demeanor, with a well-worn copy of a book`,
      personalityTraits: [
        "Analytical",
        "Articulate",
        "Approachable",
        "Observant",
        "Precise",
        "Thoughtful",
        "Professional"
      ],
      strengths: [
        "Comprehensive story knowledge",
        "Literary analysis expertise",
        "Clear communication",
        "Contextual awareness"
      ],
      weaknesses: [
        "Limited to book content",
        "Maintains narrative pacing",
        "Avoids speculation"
      ],
      goals: [
        "Enhance reading comprehension",
        "Provide relevant context",
        "Support reader engagement"
      ]
    };
  }

  async createCharacterWithImage(charData, book) {
    let costEstimate = null;
    try {
      // Create the character first
      const character = await Character.create({
        ...charData,
        bookId: book._id
      });

      // Create an ImageGeneration record
      const imageGeneration = await ImageGeneration.create({
        userId: book.created_by,
        prompt: `close up portrait of ${character.appearance} in the style of ${book.style}`,
        status: 'processing',
        characterId: character._id
      });

      // Create cost estimate for image generation
      const imageParameters = {
        numberOfImages: 1
      };

      const imageBytes = await privateer.generateImage(imageGeneration.prompt);
      await this.handleImageUpload(character, imageBytes, imageGeneration);

      return character;
    } catch (error) {
      console.error(`Failed to generate image for character:`, error);
      if (costEstimate) {
        await CostEstimateService.updateActualCost(
          costEstimate._id,
          null,
          'failed'
        );
      }
      throw error;
    }
  }

  async handleImageUpload(character, imageBase64, imageGeneration) {
    // Convert base64 to buffer
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
  }

  async handleImageGenerationError(characterId, error) {
    try {
      const failedGeneration = await ImageGeneration.findOne({ 
        characterId: characterId,
        status: 'processing'
      });
      if (failedGeneration) {
        failedGeneration.status = 'failed';
        failedGeneration.error = error.message;
        await failedGeneration.save();
      }
    } catch (err) {
      console.error('Error updating image generation status:', err);
    }
  }

  async generateBookDetails(bookContent, userId) {
    try {
      const prompt = `Analyze the following book content and generate a detailed description of the book. Include:
      1. The book title
      2. The book author
      3. A concise but engaging description (200-300 words)
      4. Appropriate categories/genres (as a JSON array)
      5. A short tagline (10-15 words)
      6. The target age group
      7. Reading time calculation:
         - The text has ${bookContent.length} characters
         - Consider average reading speed varies by age group
         - Factor in complexity of the content
         - Return estimated reading time in minutes
      8. A consistent art style for book illustrations (describe the style in 10-20 words)

      Format the response as a valid JSON object with these exact keys:
      {
        "title": string,
        "author": string,
        "description": string,
        "categories": string[],
        "tagline": string,
        "ageGroup": string,
        "readingTime": number,
        "style": string,
      }

      Book content to analyze:
      ${bookContent.substring(0, 15000)} // Limit content to avoid token limits
      
      For the style field, consider the book's genre, tone, and target audience. The style should be consistent and appropriate for all illustrations.
      Example styles:
      - "dark fantasy digital art, moody lighting, detailed textures, gothic atmosphere, professional quality"
      - "whimsical children's book illustration, bright colors, soft edges, storybook style, friendly appearance"
      - "realistic oil painting, classical portrait style, rich colors, dramatic lighting, fine art quality"
      
      IMPORTANT: Return ONLY the JSON object, with no additional text, markdown formatting, or code block markers.`;

      const result = await privateer.generateText(prompt);
      const text = privateer.cleanJson(result.text);
      
      let bookDetails;
      try {
        bookDetails = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON Parse Error. Raw text:', text);
        throw new Error('Failed to parse AI response into valid JSON');
      }

      // Validate required fields
      const requiredFields = ['title', 'author', 'description', 'categories', 'tagline', 'ageGroup', 'readingTime', 'style'];
      const missingFields = requiredFields.filter(field => !bookDetails[field]);
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in AI response: ${missingFields.join(', ')}`);
      }

      return bookDetails;
    } catch (error) {
      console.error('Error generating book details:', error);
      throw error;
    }
  }

  async generateSceneImage(bookId, userId, prompt, paragraphId, pageNumber, style, aspectRatio = '1:1') {
    // Add validation for bookId
    if (!bookId) {
      throw new Error("bookId is required");
    }

    console.log('Attempting to find book with ID:', bookId);
    
    // Get the book to use its style
    const book = await Book.findById(bookId);
    console.log('Book lookup result:', book);
    
    if (!book) {
      throw new Error(`Book not found for ID: ${bookId}`);
    }

    if (!prompt || !paragraphId || !pageNumber) {
      throw new Error("Missing required parameters");
    }

    await requireFeature('TEXT_GENERATION', 'Scene image generation is not available at this time');

    // Get current and previous page content for context
    const currentPage = await Page.findOne({ 
      bookId: bookId, 
      pageNumber: parseInt(pageNumber) 
    });

    // Get all characters for the book
    const characters = await Character.find({ bookId: bookId });

    // Create the analysis prompt
    const analysisPrompt = `Analyze this paragraph and surrounding context to identify any characters mentioned or implied in the scene. Include characters even when they are referenced indirectly or vaguely (e.g., through pronouns, titles, roles, or contextual clues). If a character is potentially present in the scene, we want to just use their appearance in the image generation.

    Current paragraph which our user is looking to generate an image for: "${prompt}"

    Current page context: "${currentPage?.pageText || 'No current page'}"

    Available characters and their appearances:
    ${characters.map(char => `name: ${char.firstName} ${char.lastName}, appearance: ${char.appearance}, race: ${char.race}, gender: ${char.gender}`).join('\n')}

    When analyzing the text:
    1. Include characters that are directly named in the text
    2. Include characters referenced by pronouns if you can determine who they are from context
    3. Include characters that would logically be present in the scene based on the context
    4. Include characters race and gender or make a guess based on what you know of the book or the books universe.

    Respond with a JSON object in this exact format:
    {
      "suggestedPrompt": "a detailed prompt for image generation that combines the scene and character appearance."
    }
    
    Use what ever you know to make the image truly magnificent and correlated to the paragraph text.
    `;
    
    // Create cost estimate for the analysis prompt
    let analysisCostEstimate = await CostEstimateService.estimateTextCost(
      userId,
      analysisPrompt
    );

    // Analyze the text and identify characters
    const result = await privateer.generateText(analysisPrompt);
    const analysisText = result.text;

    // Update analysis cost estimate with actual usage
    analysisCostEstimate = await CostEstimateService.updateTextActualCost(
      analysisCostEstimate._id,
      result.usage
    );

    await analysisCostEstimate.checkAndDeductTokens();
    
    // Clean and parse the analysis result
    const analysis = JSON.parse(privateer.cleanJson(analysisText));

    // Determine the style to use
    let finalStyle;
    if (style) {
      // If a custom style is provided, use it directly
      finalStyle = style;
    } else {
      // Fallback to the book's default style
      finalStyle = book.style || 'realistic art, highly detailed, professional quality';
    }
    
    // Construct the final prompt for image generation
    const finalPrompt = `${analysis.suggestedPrompt} in the style of ${finalStyle}`;

    // Create cost estimate for image generation
    const imageParameters = {
      numberOfImages: 1
    };

    let imageCostEstimate;
    try {
      imageCostEstimate = await CostEstimateService.estimateImageCost(
        userId,
        finalPrompt,
        null, // We don't have the imageGenerationId yet
        imageParameters
      );

      if (!imageCostEstimate || !imageCostEstimate._id) {
        throw new Error('Failed to create cost estimate');
      }
    } catch (error) {
      console.error('Error creating cost estimate:', error);
      throw new Error('Failed to create cost estimate: ' + error.message);
    }

    try {
      // Check token availability BEFORE generating the image
      const tokenResult = await imageCostEstimate.checkAndDeductTokens();

      if (!tokenResult.success) {
        throw new Error(tokenResult.message);
      }

      const imageBase64 = await privateer.generateImage(finalPrompt, { aspectRatio });
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Generate unique base key for optimized upload
      const baseKey = `scene-${book._id}-${pageNumber}-${Date.now()}`;

      // Upload optimized image to S3
      const uploadResult = await uploadOptimizedImage(imageBuffer, baseKey, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 85,
        format: 'webp'
      });

      // Create ImageGeneration record
      const imageGeneration = await ImageGeneration.create({
        userId: userId,
        bookId: book._id,
        pageNumber: pageNumber,
        paragraphId: paragraphId,
        paragraphText: prompt,
        prompt: finalPrompt,
        style: finalStyle, // Store the style used
        aspectRatio: aspectRatio, // Store the aspect ratio used
        status: 'completed',
        imageUrl: uploadResult.mainUrl
      });

      return {
        imageUrl: uploadResult.mainUrl,
        analysis: {
          characters: analysis.mentionedCharacters,
          scene: analysis.sceneDescription,
          prompt: finalPrompt,
          style: finalStyle
        }
      };
    } catch (error) {
      // Update cost estimate as failed
      await CostEstimateService.updateActualCost(
        imageCostEstimate._id,
        0,
        'failed'
      );
      throw error;
    }
  }

  async generateSceneVideo(bookId, userId, prompt, paragraphId, pageNumber, style, durationSeconds = 6, aspectRatio = '16:9', resolution = '720p') {
    if (!bookId) throw new Error('bookId is required');
    if (!prompt || !paragraphId || !pageNumber) throw new Error('Missing required parameters');

    const book = await Book.findById(bookId);
    if (!book) throw new Error(`Book not found for ID: ${bookId}`);

    await requireFeature('VIDEO_GENERATION', 'Video generation is not available at this time');

    const currentPage = await Page.findOne({ bookId, pageNumber: parseInt(pageNumber) });
    const characters = await Character.find({ bookId });

    const analysisPrompt = `Analyze this paragraph and surrounding context to identify any characters mentioned or implied in the scene. Include characters even when they are referenced indirectly or vaguely.

    Current paragraph: "${prompt}"
    Current page context: "${currentPage?.pageText || 'No current page'}"
    Available characters:
    ${characters.map(c => `name: ${c.firstName} ${c.lastName}, appearance: ${c.appearance}`).join('\n')}

    Respond with a JSON object:
    {
      "suggestedPrompt": "a detailed prompt for video generation that combines the scene and character appearances."
    }
    IMPORTANT: Return ONLY the JSON object.`;

    let analysisCostEstimate = await CostEstimateService.estimateTextCost(userId, analysisPrompt);

    const result = await privateer.generateText(analysisPrompt);

    analysisCostEstimate = await CostEstimateService.updateTextActualCost(analysisCostEstimate._id, result.usage);
    await analysisCostEstimate.checkAndDeductTokens();

    const analysis = JSON.parse(privateer.cleanJson(result.text));
    const finalStyle = style || book.style || 'cinematic, realistic, high quality';
    const enhancedPrompt = `${analysis.suggestedPrompt} in the style of ${finalStyle}`;

    // Estimate and deduct tokens for video generation upfront
    const videoCostEstimate = await CostEstimateService.estimateVideoCost(
      userId, durationSeconds, resolution
    );
    const tokenResult = await videoCostEstimate.checkAndDeductTokens();
    if (!tokenResult.success) {
      throw new Error(tokenResult.message || 'Insufficient tokens for video generation');
    }

    // Create the ImageGeneration record immediately (processing state)
    const imageGeneration = await ImageGeneration.create({
      userId,
      bookId: book._id,
      pageNumber,
      paragraphId,
      paragraphText: prompt,
      prompt: enhancedPrompt,
      status: 'processing',
      mediaType: 'video'
    });

    // Run video generation + polling in background — don't await
    (async () => {
      try {
        const validDurations = [4, 6, 8];
        const effectiveDuration = validDurations.includes(durationSeconds) ? durationSeconds : 6;

        const validResolutions = ['720p', '1080p', '4k'];
        let effectiveResolution = validResolutions.includes(resolution) ? resolution : '720p';
        if (effectiveResolution !== '720p' && effectiveDuration !== 8) {
          effectiveResolution = '720p'; // 1080p and 4k require 8s
        }

        const videoBuffer = await privateer.generateVideo(enhancedPrompt, {
          seconds: effectiveDuration,
          aspectRatio: ['16:9', '9:16'].includes(aspectRatio) ? aspectRatio : '16:9',
          resolution: effectiveResolution
        });

        const key = `scene-video-${book._id}-${pageNumber}-${Date.now()}.mp4`;
        const videoUrl = await uploadVideo(videoBuffer, key);

        imageGeneration.status = 'completed';
        imageGeneration.videoUrl = videoUrl;
        await imageGeneration.save();
      } catch (err) {
        console.error('Video generation failed:', err);
        imageGeneration.status = 'failed';
        imageGeneration.error = err.message;
        await imageGeneration.save();
      }
    })();

    return {
      imageGenerationId: imageGeneration._id,
      status: 'processing'
    };
  }

  async generateAudio(userId, bookId, pageNumber) {
    let audio = null;
    let costEstimate = null;
    try {
      // Check if Text-to-Speech client is initialized
      const ttsClientInstance = ttsClient();
      if (!ttsClientInstance) {
        throw new Error('Text-to-Speech service is not available. Please try again later.');
      }

      // Check if audio already exists
      audio = await Audio.findOne({
        bookId,
        pageNumber: parseInt(pageNumber),
        status: 'completed'
      });

      if (audio) {
        return { audioUrl: audio.audioUrl };
      }

      // Get the page content
      const page = await Page.findOne({ 
        bookId, 
        pageNumber: parseInt(pageNumber)
      });

      if (!page) {
        throw new Error('Page not found');
      }

      await requireFeature('TEXT_TO_SPEECH', 'Text-to-speech generation is not available at this time');

      // Create cost estimate for TTS generation
      costEstimate = await CostEstimateService.estimateTTSCost(
        userId,
        page.pageText,
        'hd' // We're using HD voice
      );

      // Create audio record
      audio = await Audio.create({
        userId,
        bookId,
        pageNumber: parseInt(pageNumber),
        status: 'processing',
        costEstimateId: costEstimate._id
      });

      // Configure the request with WaveNet voice
      const request = {
        input: { text: page.pageText },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Chirp3-HD-Charon',
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: 0,
          speakingRate: 1.0,
          volumeGainDb: 0,
          effectsProfileId: ['headphone-class-device']
        },
      };

      // Generate audio using the instance
      const [response] = await ttsClientInstance.synthesizeSpeech(request);
      
      if (!response || !response.audioContent) {
        throw new Error('Failed to generate audio content');
      }

      const audioBuffer = response.audioContent;

      // Generate unique filename
      const filename = `audio-${bookId}-${pageNumber}-${Date.now()}.mp3`;

      // Upload to S3
      const uploadParams = {
        Bucket: 'talkingbooks',
        Key: filename,
        Body: audioBuffer,
        ContentType: 'audio/mpeg'
      };

      const uploadResult = await s3.upload(uploadParams).promise();

      // Update audio record
      audio.audioUrl = uploadResult.Location;
      audio.status = 'completed';
      await audio.save();

      // Deduct tokens
      // const tokenResult = await costEstimate.checkAndDeductTokens();

      // if (!tokenResult.success) {
      //   throw new Error(tokenResult.message);
      // }

      return { audioUrl: audio.audioUrl };
    } catch (error) {
      if (audio) {
        audio.status = 'failed';
        audio.error = error.message;
        await audio.save();
      }

      if (costEstimate) {
        await CostEstimateService.updateActualCost(
          costEstimate._id,
          null,
          'failed'
        );
      }

      throw error;
    }
  }

  async getExistingAudio(bookId, pageNumber) {
    const audio = await Audio.findOne({
      bookId,
      pageNumber: parseInt(pageNumber),
      status: 'completed'
    });

    return { audioUrl: audio ? audio.audioUrl : null };
  }

  async getBookAudioFiles(bookId) {
    const audioFiles = await Audio.find({
      bookId
    }).sort({ pageNumber: 1 });

    return audioFiles;
  }
}

module.exports = new GenerationService(); 