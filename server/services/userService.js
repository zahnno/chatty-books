const User = require('../models/userModel');
const { s3 } = require('./cloud-services');
const { uploadOptimizedImage } = require('./imageOptimization');

/**
 * Updates a user's profile with the provided data and optional profile image
 * @param {string} userId - The ID of the user to update
 * @param {Object} updateData - The data to update (gender, dateOfBirth, characteristics, description, moods)
 * @param {Object} [file] - Optional file object containing profile image data
 * @returns {Promise<Object>} Updated user data
 */
async function updateUserProfile(userId, updateData, file = null) {
  try {
    // Create a copy of update data to avoid modifying the original
    const processedData = { ...updateData };

    // Convert characteristics and moods to arrays if they're single values
    if (processedData.characteristics && !Array.isArray(processedData.characteristics)) {
      processedData.characteristics = [processedData.characteristics];
    }
    if (processedData.moods && !Array.isArray(processedData.moods)) {
      processedData.moods = [processedData.moods];
    }

    // Handle profile image upload if present
    if (file) {
      try {
        const baseKey = `profile-${userId}-${Date.now()}`;
        const uploadResult = await uploadOptimizedImage(file.buffer, baseKey, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 85,
          format: 'webp'
        });
        processedData.profileImage = uploadResult.mainUrl;
      } catch (uploadErr) {
        console.error('Error uploading optimized profile image:', uploadErr);
        throw new Error('Failed to upload profile image');
      }
    }

    // Update user profile
    const user = await User.findByIdAndUpdate(
      userId,
      processedData,
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Return formatted user data
    return {
      username: user.username,
      email: user.email,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      characteristics: user.characteristics,
      description: user.description,
      moods: user.moods,
      profileImage: user.profileImage
    };
  } catch (error) {
    console.error('Profile update error:', error);
    throw error;
  }
}

// Export the service object directly
const userService = {
  updateUserProfile
};

module.exports = userService; 