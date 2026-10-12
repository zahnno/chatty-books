const privateer = require('./privateerClient');
const { TEXT_MODEL } = require('../constants');
const Character = require('../models/characterModel');
const Book = require('../models/bookModel');
const Page = require('../models/pageModel');
const Message = require('../models/messageModel');
const CostEstimateService = require('./costEstimateService');
const Publishing = require('./solana/publishing');
const ActivityService = require('./activityService');
const { requireFeature } = require('./features');
const User = require('../models/userModel');
const UserPersonality = require('../models/userPersonalityModel');
const PersonalityService = require('./personalityService');

// Spoken replies are streamed as plain text, then this marker, then the
// suggestions as a JSON array — so the reply can be spoken before it's finished.
const SUGGESTIONS_MARKER = '###';
// A spoken reply (at most 60 words) plus its suggestions, with headroom.
const SPOKEN_REPLY_TOKENS = 300;

function describeUser(userProfile, userPersonality) {
  if (userPersonality) {
    const contextParts = [
      `Name: ${userProfile.username}`,
      `Cognitive Style: ${userPersonality.cognitiveStyle}`,
      `Interaction Style: ${userPersonality.interactionStyle}`,
    ];
    if (userPersonality.emotionalTendencies?.length) {
      contextParts.push(`Emotional Tendencies: ${userPersonality.emotionalTendencies.join(', ')}`);
    }
    if (userPersonality.motivations?.length) {
      contextParts.push(`Motivations: ${userPersonality.motivations.join(', ')}`);
    }
    if (userPersonality.dialoguePreferences) {
      contextParts.push(`Dialogue Preferences: Length - ${userPersonality.dialoguePreferences.length}, Tone - ${userPersonality.dialoguePreferences.tone}, Uses Emojis - ${userPersonality.dialoguePreferences.emojiUse ? 'Yes' : 'No'}`);
    }
    if (userPersonality.alignment) {
      contextParts.push(`Alignment: ${userPersonality.alignment.order} ${userPersonality.alignment.moral}`);
    }
    return `\n\nInformation about the user you're talking to:\n${contextParts.join('\n')}`;
  }

  // Fallback to original user profile if no personality model exists yet.
  let userContextParts = [];
  if (userProfile.username) {
    userContextParts.push(`Name: ${userProfile.username}`);
  }
  if (userProfile.characteristics?.length) {
    userContextParts.push(`Characteristics: ${userProfile.characteristics.join(', ')}`);
  }
  if (userProfile.moods?.length) {
    userContextParts.push(`Current Moods: ${userProfile.moods.join(', ')}`);
  }
  if (userProfile.gender && userProfile.gender !== 'prefer not to say') {
    userContextParts.push(`Gender: ${userProfile.gender}`);
  }
  if (userProfile.age) {
    userContextParts.push(`Age: ${userProfile.age}`);
  }
  if (userProfile.description) {
    userContextParts.push(`Description: ${userProfile.description}`);
  }

  return userContextParts.length
    ? `\n\nInformation about the user you're talking to:\n${userContextParts.join('\n')}`
    : '';
}

// Instructions for the reply's format. `spoken` replies are read aloud;
// `speechTags` lets the model add vocal cues the TTS model can perform.
function formatInstructions(spoken, speechTags) {
  if (!spoken) {
    return `IMPORTANT: Format your response as a clean JSON object with no markdown formatting, no backticks, and no language identifiers. The response should be a single JSON object with exactly these fields:
        {
          "response": "your character's response here",
          "suggestions": ["first follow-up question or statement", "second follow-up question or statement", "third follow-up question or statement"]
        }`;
  }
  return `The user is talking to you out loud and your response will be spoken aloud in your voice. Write it the way you would say it: one to three natural spoken sentences and never more than 60 words, with no emojis, lists, or stage directions in asterisks or parentheses.${speechTags ? ' You may add at most two vocal cues in square brackets where they fit your delivery, e.g. [laughs], [sighs], [whispers], [chuckles], [excited], [sarcastic].' : ' Do not use square brackets.'}

        IMPORTANT: Write your spoken response first, as plain text. Then, on a new line, write ${SUGGESTIONS_MARKER} followed by a JSON array of three short things the user might say out loud next, e.g.
        Your spoken response here.
        ${SUGGESTIONS_MARKER} ["first follow-up", "second follow-up", "third follow-up"]`;
}

async function buildContextPrompt({ userId, bookId, characterId, pageNumber, userProfile, spoken, speechTags }) {
  const [character, book, recentMessages, userPersonality, currentPage, previousPage] = await Promise.all([
    Character.findById(characterId),
    Book.findById(bookId),
    // Recent chat history (last 10 messages)
    Message.find({ bookId, characterId, userId }).sort({ createdAt: -1 }).limit(10).lean(),
    UserPersonality.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    pageNumber ? Page.findOne({ bookId, pageNumber }) : null,
    pageNumber ? Page.findOne({ bookId, pageNumber: pageNumber - 1 }) : null
  ]);

  const userContext = describeUser(userProfile, userPersonality);

  let contextPrompt = `
        Moving forward you will be a character in the story or book titled ${book.title} by author: ${book.author} talking to a user giving answers to the questions they have or conversating with them with the intent to keep the conversation going. Your name is ${character.firstName + character.lastName}.
        This is your backstory: ${character.description}
        This is your introduction: ${character.intro}
        This is your chronological list of key events: ${character.events}
        This is your physical description: ${character.appearance}
        This is your personality traits: ${character.personalityTraits}
        This is your strengths: ${character.strengths}
        This is your weaknesses: ${character.weaknesses}
        This is your goals: ${character.goals}${userContext}

        Attempt to be engaging with the user in conversation.
        If your character tends towards negative emotions, do not ask them questions about their life or anything that could make the user feel worse.
        Keep your response short. Do not be too verbose. Do not be too wordy.

        Previous conversation history:
        ${recentMessages.reverse().map(msg =>
          `${userProfile.username}: ${msg.userMessage}\n${character.firstName}: ${msg.modelResponse}`
        ).join('\n')}

        Understand that you are this character and should respond in character with the context you understand of the book they are in. Do not mention the book or author in your responses. Do not mention that the user is reading a book. Do not return any form of markdown in your responses. ${userContext ? ' Consider the user\'s profile information when crafting your responses to make them more personalized and engaging.' : ''}
        Your answers shouldn't be too long unless the users personality is verbose.
        Suggestions should consider the user's personality and the context of the conversation as if written by the user, if applicable.

        ${formatInstructions(spoken, speechTags)}
      `;

  if (pageNumber) {
    contextPrompt += `
          The user is currently reading page ${pageNumber} of the book.

          Previous page content:
          ${previousPage?.pageText || 'No previous page'}

          Current page content:
          ${currentPage?.pageText || 'No current page'}

          Please consider this context when responding and avoid spoiling future events. If the user asks about events happening in these pages, you can discuss them naturally as if they are happening now or have just happened, do not answer questions about the future.
        `;
  }

  return { character, book, contextPrompt };
}

function parseJsonReply(text) {
  try {
    // Clean the response text by removing any markdown formatting
    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
    // Validate the response structure
    if (!parsed.response || !Array.isArray(parsed.suggestions)) {
      throw new Error('Invalid response structure');
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse response:', e);
    // Fallback to treating the entire response as the message
    return { response: text.replace(/```json\s*|\s*```/g, '').trim(), suggestions: [] };
  }
}

function parseSpokenReply(text) {
  const [response, rest = ''] = text.split(SUGGESTIONS_MARKER);
  let suggestions = [];
  try {
    const parsed = JSON.parse(privateer.cleanJson(rest));
    if (Array.isArray(parsed)) suggestions = parsed.filter(s => typeof s === 'string').slice(0, 3);
  } catch {
    // Suggestions are optional; the spoken reply is what matters.
  }
  return { response: response.trim(), suggestions };
}

// Streams only the spoken part of a reply to `onText`, holding back anything
// that could be the start of the suggestions marker, and calls `onSpokenEnd`
// once the spoken part is complete (before the suggestions are written).
function spokenTextStreamer(onText, onSpokenEnd) {
  let raw = '';
  let emitted = 0;
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      onSpokenEnd();
    }
  };
  return {
    push(delta) {
      if (ended) return;
      raw += delta;
      const cut = raw.indexOf(SUGGESTIONS_MARKER);
      const visible = cut >= 0 ? raw.slice(0, cut) : raw.replace(/#+$/, '');
      if (visible.length > emitted) {
        onText(visible.slice(emitted));
        emitted = visible.length;
      }
      if (cut >= 0) end();
    },
    end
  };
}

class ChatService {
  // Typed chat: one JSON reply with suggestions.
  chatWithCharacter(userId, bookId, characterId, prompt, pageNumber, userProfile) {
    return this.#converse({
      userId, bookId, characterId, prompt, pageNumber, userProfile,
      model: TEXT_MODEL,
      rateService: 'text',
      action: 'CHAT_WITH_CHARACTER',
      spoken: false,
      generate: async (messages) => {
        const result = await privateer.chat(messages, { model: TEXT_MODEL, maxTokens: 5000 });
        return { ...parseJsonReply(result.text), usage: result.usage };
      }
    });
  }

  // Voice chat: the reply is streamed to `onText` as it's written so it can be
  // spoken sentence by sentence; `onSpokenEnd` fires when the spoken part is
  // done. `speechTags` allows [laughs]-style vocal cues (only for TTS models
  // that perform them); the caller strips them for display.
  streamSpokenReply(userId, bookId, characterId, prompt, pageNumber, userProfile, {
    model, reasoning, rateService, action, speechTags, onText, onSpokenEnd
  }) {
    return this.#converse({
      userId, bookId, characterId, prompt, pageNumber, userProfile,
      model, rateService, action, speechTags,
      spoken: true,
      generate: async (messages) => {
        const streamer = spokenTextStreamer(onText, onSpokenEnd);
        const result = await privateer.chatStream(messages, { model, reasoning, maxTokens: 1024 }, streamer.push);
        streamer.end();
        return { ...parseSpokenReply(result.text), usage: result.usage };
      }
    });
  }

  async #converse({ userId, bookId, characterId, prompt, pageNumber, userProfile, model, rateService, action, spoken, speechTags, generate }) {
    let costEstimate = null;
    let activityLog = null;
    let activityLogPromise = null;
    try {
      if (!prompt) {
        throw new Error("No prompt provided");
      }
      // Spoken prompts run longer than typed ones for the same thought.
      if (prompt.length > (spoken ? 1000 : 500)) {
        throw new Error(`Prompt exceeds ${spoken ? 1000 : 500} character limit`);
      }

      await requireFeature(action, 'Chat with character is not available at this time');

      const { character, book, contextPrompt } = await buildContextPrompt({
        userId, bookId, characterId, pageNumber, userProfile, spoken, speechTags
      });

      // Log chat activity without holding up the reply
      activityLogPromise = ActivityService.logActivity(userId, 'CHAT_WITH_CHARACTER', {
        resourceId: characterId,
        resourceModel: 'Character',
        metadata: {
          bookId,
          bookTitle: book.title,
          characterName: `${character.firstName} ${character.lastName}`,
          pageNumber,
          promptLength: prompt.length,
          mode: spoken ? 'voice' : 'text'
        }
      }).catch(err => console.error('Failed to log chat activity:', err));

      // Create cost estimate for the chat interaction
      costEstimate = await CostEstimateService.estimateTextCost(
        userId,
        contextPrompt + prompt,
        model,
        action,
        rateService,
        spoken ? SPOKEN_REPLY_TOKENS : null
      );

      const reply = await generate([
        { role: "user", content: contextPrompt },
        { role: "assistant", content: "Great to meet you. What would you like to know?" },
        { role: "user", content: prompt },
      ]);
      activityLog = await activityLogPromise;

      // Update cost estimate with actual usage
      await CostEstimateService.updateTextActualCost(costEstimate._id, reply.usage);

      // Save the message
      const savedMessage = await Message.create({
        bookId,
        characterId,
        modelResponse: reply.response,
        userMessage: prompt,
        userId,
        pageNumber,
        suggestions: reply.suggestions
      });

      // Check if it's time to update the user's personality profile
      const messageCount = await Message.countDocuments({ userId });
      if (messageCount > 0 && messageCount % 10 === 0) {
        // Non-blocking call to update personality
        PersonalityService.updatePersonality(userId)
          .catch(err => console.error(`Failed to trigger personality update for user ${userId}:`, err));
      }

      // Deduct tokens after successful generation
      const tokenResult = await costEstimate.checkAndDeductTokens();

      if (!tokenResult.success) {
        // Delete the saved message since we couldn't complete the transaction
        await Message.findByIdAndDelete(savedMessage._id);
        throw new Error(tokenResult.message);
      }
      Publishing.recordInteraction({ bookId, characterId, tokens: tokenResult.transaction?.amount });

      // Update activity log with response details
      if (activityLog) {
        activityLog.metadata = {
          ...activityLog.metadata,
          responseLength: reply.response.length,
          messageId: savedMessage._id,
          success: true
        };
        await activityLog.save();
      }

      return {
        message: reply.response,
        characterName: `${character.firstName} ${character.lastName}`,
        bookTitle: book.title,
        suggestions: reply.suggestions
      };
    } catch (error) {
      // Update cost estimate as failed if there was an error
      if (costEstimate) {
        await CostEstimateService.updateActualCost(
          costEstimate._id,
          null,
          'failed'
        );
      }

      // Update activity log with error details if it exists
      try {
        if (!activityLog && activityLogPromise) activityLog = await activityLogPromise;
        if (activityLog) {
          activityLog.metadata = {
            ...activityLog.metadata,
            error: error.message,
            success: false
          };
          await activityLog.save();
        }
      } catch (logError) {
        console.error('Failed to update activity log:', logError);
      }

      throw error;
    }
  }
}

module.exports = new ChatService();
