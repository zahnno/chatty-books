const CostEstimate = require('../models/costEstimateModel');
const { TEXT_MODEL, IMAGE_MODEL, VIDEO_MODEL } = require('../constants');
const User = require('../models/userModel');
const rateCache = require('./rateCache');

// Fallback rates used only if cache is empty (e.g. DB unavailable at startup)
const FALLBACK = {
  text_input: 0.00025,
  text_output: 0.0005,
  image_standard: 0.040,
  tts_standard: 0.000004,
  tts_hd: 0.000016,
  tts_elevenlabs_turbo: 0.00007,
  tts_deepgram_aura2: 0.00004,
  tts_qwen3: 0.00007,
  stt_standard: 0.0084,
  voice_input: 0.007,
  voice_output: 0.035,
  video_720p: 0.50,
  video_1080p: 0.75,
  video_4k: 1.25,
};

function rate(service, key) {
  return rateCache.get(service, key) ?? FALLBACK[`${service}_${key}`];
}

class CostEstimateService {
  // GetImg API pricing (stable-diffusion-xl not in DB — internal formula only)
  static GETIMG_RATES = {
    'stable-diffusion-xl': {
      base_rate: 0.000075,
      min_steps: 20,
      sizes: {
        '768x768': 0.00088,
        '1024x1024': 0.00157,
        '1024x768': 0.00118
      }
    }
  };

  // Token conversion rate constant (e.g., 10000 tokens per $1)
  static TOKEN_TO_USD_RATE = 10000; // Adjust this value based on your needs

  // Operating cost markup percentage
  static OPERATING_COST_MARKUP = 2; // 200% markup for operating costs

  // Calculate token quote with operating cost markup
  static calculateTokenQuote(estimatedCost) {
    const baseTokens = Math.ceil(estimatedCost * this.TOKEN_TO_USD_RATE);
    const operatingCostTokens = Math.ceil(baseTokens * this.OPERATING_COST_MARKUP);
    return {
      baseTokens,
      operatingCostTokens,
      totalTokens: baseTokens + operatingCostTokens,
      baseUSD: estimatedCost,
      operatingCostUSD: estimatedCost * this.OPERATING_COST_MARKUP,
      totalUSD: estimatedCost * (1 + this.OPERATING_COST_MARKUP)
    };
  }

  // Estimate text generation cost from prompt length (~4 chars per token).
  // `rateService` selects the input/output rates: 'text' for the default text
  // model, 'voice' for the (pricier) voice chat model. Pass `outputTokens` when
  // the reply length is known to be bounded (e.g. short spoken replies).
  static async estimateTextCost(userId, prompt, model = TEXT_MODEL, action = 'text_generation', rateService = 'text', outputTokens = null) {
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    // Estimate output tokens (typically 1.5x input, but can be adjusted based on your data)
    const estimatedOutputTokens = outputTokens ?? Math.ceil(estimatedInputTokens * 1.5);

    const inputCost = (estimatedInputTokens / 1000) * rate(rateService, 'input');
    const outputCost = (estimatedOutputTokens / 1000) * rate(rateService, 'output');
    const totalEstimatedCost = inputCost + outputCost;
    const tokenQuote = this.calculateTokenQuote(totalEstimatedCost);

    const costEstimate = await CostEstimate.create({
      userId,
      service: 'text',
      action,
      prompt,
      estimatedCost: totalEstimatedCost,
      tokenQuote,
      parameters: {
        model,
        rateService,
        estimatedInputTokens,
        estimatedOutputTokens,
        inputCost,
        outputCost
      }
    });

    return costEstimate;
  }

  // Estimate GetImg API cost
  static async estimateGetImgCost(userId, prompt, imageGenerationId, parameters) {
    const { width, height, steps } = parameters;
    
    // Calculate cost using GetImg's exact formula
    const estimatedCost = this.calculateGetImgCost(width, height, steps);
    const tokenQuote = this.calculateTokenQuote(estimatedCost);

    // Validate against reference prices for common sizes
    const size = `${width}x${height}`;
    const referencePrice = this.GETIMG_RATES['stable-diffusion-xl'].sizes[size];
    if (referencePrice) {
      const stepsRatio = steps / this.GETIMG_RATES['stable-diffusion-xl'].min_steps;
      const expectedPrice = referencePrice * stepsRatio;
      
      // If our calculation differs significantly from reference price, log it
      const priceDiff = Math.abs(estimatedCost - expectedPrice);
      if (priceDiff > 0.0001) {
        console.warn(`GetImg price calculation difference detected for ${size}:`, {
          calculated: estimatedCost,
          expected: expectedPrice,
          difference: priceDiff
        });
      }
    }

    const costEstimate = await CostEstimate.create({
      userId,
      service: 'getimg',
      action: 'image_generation',
      prompt,
      estimatedCost,
      tokenQuote,
      parameters: {
        width,
        height,
        steps,
        pixelSteps: width * height * steps,
        baseRate: this.GETIMG_RATES['stable-diffusion-xl'].base_rate
      },
      imageGenerationId
    });

    return costEstimate;
  }

  // Estimate TTS cost based on character count
  static async estimateTTSCost(userId, text, voiceType = 'hd', action = 'audio_generation') {
    const charCount = text.length;
    const estimatedCost = charCount * rate('tts', voiceType);
    const tokenQuote = this.calculateTokenQuote(estimatedCost);

    const costEstimate = await CostEstimate.create({
      userId,
      service: 'tts',
      action,
      prompt: text.substring(0, 1000),
      estimatedCost,
      tokenQuote,
      parameters: {
        voiceType,
        characterCount: charCount,
        baseRate: rate('tts', voiceType)
      }
    });

    return costEstimate;
  }

  // Estimate speech-to-text cost from the recording's duration (billed per minute)
  static async estimateTranscriptionCost(userId, durationSeconds, action = 'speech_transcription') {
    const minutes = durationSeconds / 60;
    const estimatedCost = minutes * rate('stt', 'standard');
    const tokenQuote = this.calculateTokenQuote(estimatedCost);

    return CostEstimate.create({
      userId,
      service: 'stt',
      action,
      estimatedCost,
      tokenQuote,
      parameters: {
        durationSeconds,
        baseRate: rate('stt', 'standard')
      }
    });
  }

  // Update cost estimate with actual cost
  static async updateActualCost(estimateId, actualCost, status = 'completed', tokenTransactionId = null, tokenCostId = null) {
    const updateData = {
      actualCost,
      status
    };

    if (tokenTransactionId) {
      updateData.tokenTransactionId = tokenTransactionId;
    }

    if (tokenCostId) {
      updateData.tokenCostId = tokenCostId;
    }

    return await CostEstimate.findByIdAndUpdate(
      estimateId,
      updateData,
      { new: true }
    );
  }

  // Update text cost estimate with actual usage (OpenAI-style usage block from Privateer)
  static async updateTextActualCost(estimateId, usage, tokenTransactionId = null, tokenCostId = null) {
    try {
      if (!usage) {
        throw new Error('No usage metadata available');
      }

      const { prompt_tokens, completion_tokens, total_tokens } = usage;
      const estimate = await CostEstimate.findById(estimateId);
      const rateService = estimate?.parameters?.get('rateService') || 'text';

      const inputCost = (prompt_tokens / 1000) * rate(rateService, 'input');
      const outputCost = (completion_tokens / 1000) * rate(rateService, 'output');
      // Privateer reports what the call actually cost; prefer it over our rates.
      const actualCost = typeof usage.cost === 'number' ? usage.cost : inputCost + outputCost;

      const updateData = {
        actualCost,
        status: 'completed',
        parameters: {
          model: estimate?.parameters?.get('model'),
          rateService,
          actualInputTokens: prompt_tokens,
          actualOutputTokens: completion_tokens,
          totalTokens: total_tokens,
          actualInputCost: inputCost,
          actualOutputCost: outputCost
        }
      };

      if (tokenTransactionId) {
        updateData.tokenTransactionId = tokenTransactionId;
      }

      if (tokenCostId) {
        updateData.tokenCostId = tokenCostId;
      }

      return await CostEstimate.findByIdAndUpdate(
        estimateId,
        updateData,
        { new: true }
      );
    } catch (error) {
      console.error('Error updating text actual cost:', error);
      // If we can't get actual usage, mark the estimate as completed with estimated cost
      return this.updateActualCost(estimateId, null, 'completed', tokenTransactionId, tokenCostId);
    }
  }

  // Calculate GetImg cost using their exact pricing formula
  static calculateGetImgCost(width, height, steps) {
    const pixelSteps = width * height * steps;
    const model = this.GETIMG_RATES['stable-diffusion-xl'];
    return (pixelSteps * model.base_rate) / 1_000_000;
  }

  // Get cost estimates for a user
  static async getUserEstimates(userId, options = {}) {
    const query = { userId };
    
    if (options.service) {
      query.service = options.service;
    }
    
    if (options.status) {
      query.status = options.status;
    }
    
    return await CostEstimate.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100);
  }

  // Get aggregated statistics for cost analysis
  static async getAggregatedStats(userId, periodDays = 30) {
    const query = {
      status: 'completed',
      createdAt: {
        $gte: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
      }
    };

    if (userId) {
      query.userId = userId;
    }

    return await CostEstimate.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            service: '$service',
            action: '$action'
          },
          totalEstimatedCost: { $sum: '$estimatedCost' },
          totalActualCost: { $sum: '$actualCost' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.service': 1, '_id.action': 1 } }
    ]);
  }

  // Estimate video generation cost
  static async estimateVideoCost(userId, durationSeconds, resolution = '720p') {
    const videoRate = rate('video', resolution) ?? rate('video', '720p');
    const estimatedCost = videoRate * durationSeconds;
    const tokenQuote = this.calculateTokenQuote(estimatedCost);

    return await CostEstimate.create({
      userId,
      service: 'video',
      action: 'video_generation',
      estimatedCost,
      tokenQuote,
      parameters: { model: VIDEO_MODEL, durationSeconds, resolution },
      status: 'estimated'
    });
  }

  // Estimate image generation cost
  static async estimateImageCost(userId, prompt, imageGenerationId = null, parameters = {}) {
    const { numberOfImages = 1 } = parameters;
    const estimatedCost = rate('image', 'standard') * numberOfImages;
    const tokenQuote = this.calculateTokenQuote(estimatedCost);

    const costEstimate = await CostEstimate.create({
      userId,
      service: 'image',
      action: 'image_generation',
      prompt,
      estimatedCost,
      tokenQuote,
      parameters: {
        model: IMAGE_MODEL,
        numberOfImages,
        baseRate: rate('image', 'standard')
      },
      imageGenerationId
    });

    return costEstimate;
  }
}

module.exports = CostEstimateService; 