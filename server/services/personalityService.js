const privateer = require('./privateerClient');
const UserPersonality = require('../models/userPersonalityModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
const Character = require('../models/characterModel');

class PersonalityService {
    async updatePersonality(userId) {
        try {
            const last10Messages = await Message.find({ userId })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('characterId', 'firstName')
                .lean();

            // The check in chatService should prevent this, but as a safeguard:
            if (last10Messages.length === 0) {
                return;
            }

            const user = await User.findById(userId).lean();
            
            const previousPersonality = await UserPersonality.findOne({ userId })
                .sort({ createdAt: -1 })
                .lean();

            const conversationHistory = last10Messages.reverse().map(msg => {
                const characterName = msg.characterId && msg.characterId.firstName ? msg.characterId.firstName : 'Character';
                return `${user.username || 'User'}: ${msg.userMessage}\n${characterName}: ${msg.modelResponse}`;
            }).join('\n');

            const personalityPrompt = `
                Based on the following conversation history and the user's previous personality profile, please analyze and update the user's personality traits.

                Conversation History (last 10 messages):
                ${conversationHistory}

                Previous Personality Profile:
                ${previousPersonality ? JSON.stringify(previousPersonality, null, 2) : "No previous personality profile available. This is the first analysis."}

                Analyze the user's messages and determine their personality based on the following categories.
                - Cognitive Style: (one of: logical, imaginative, analytical, intuitive, practical)
                - Emotional Tendencies: (any of: reflective, excitable, stoic, calm, passionate, reserved)
                - Interaction Style: (one of: gives feedback, roleplays, observes, asks questions, direct)
                - Motivations: (any of: romance, solving mysteries, learning, adventure, friendship, power)
                - Dialogue Preferences: (length: short/medium/long/varied, tone: formal/informal/humorous/serious/mixed, emojiUse: true/false)
                - Alignment: (moral: Good/Neutral/Evil, order: Lawful/Neutral/Chaotic)

                IMPORTANT: Your response must be a single, clean JSON object with no markdown, backticks, or other formatting. The JSON object should have the following structure and keys. Only use the provided enum values for each field.

                {
                  "cognitiveStyle": "...",
                  "emotionalTendencies": ["...", "..."],
                  "interactionStyle": "...",
                  "motivations": ["...", "..."],
                  "dialoguePreferences": {
                    "length": "...",
                    "tone": "...",
                    "emojiUse": ...
                  },
                  "alignment": {
                    "moral": "...",
                    "order": "..."
                  }
                }
            `;

            const { text } = await privateer.generateText(personalityPrompt);

            let newPersonalityData;
            try {
                const cleanText = text.replace(/```json\s*|\s*```/g, '').trim();
                newPersonalityData = JSON.parse(cleanText);

            } catch (e) {
                console.error("Failed to parse personality update response from AI:", e);
                console.error("Raw response:", text);
                return;
            }
            
            await UserPersonality.create({
                userId,
                ...newPersonalityData
            });

            console.log(`Successfully updated personality for user ${userId}`);

        } catch (error) {
            console.error(`Error updating personality for user ${userId}:`, error);
        }
    }
}

module.exports = new PersonalityService(); 