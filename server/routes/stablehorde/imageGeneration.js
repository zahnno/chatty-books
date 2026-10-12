// const express = require("express");
// const imageRoutes = express.Router();
// const { authenticate } = require('../../controllers/auth');
// const aws = require("aws-sdk");
// const fetch = require('node-fetch');
// const ImageGeneration = require('../../models/imageGenerationModel');
// const Character = require('../../models/characterModel');
// const Book = require('../../models/bookModel');

// // Configure AWS
// aws.config.update({
//   secretAccessKey: process.env.S3_ACCESS_SECRET,
//   accessKeyId: process.env.S3_ACCESS_KEY,
//   region: "us-east-1",
// });

// const s3 = new aws.S3();

// // Add polling lock
// let isPolling = false;

// // StableHorde API endpoints
// const STABLEHORDE_API = 'https://stablehorde.net/api/v2';
// const STABLEHORDE_API_KEY = process.env.STABLEHORDE_API_KEY || '0000000000'; // Anonymous key if not provided

// // Helper function to check if polling should be running
// async function shouldPollBeRunning() {
//   const pendingCount = await ImageGeneration.countDocuments({
//     status: { $in: ['pending', 'processing'] }
//   });
//   return pendingCount > 0;
// }

// // Helper function to cancel a Horde job
// async function cancelHordeJob(id) {
//   try {
//     const response = await fetch(`${STABLEHORDE_API}/generate/status/${id}`, {
//       method: 'DELETE',
//       headers: {
//         'Content-Type': 'application/json',
//         'apikey': STABLEHORDE_API_KEY,
//       }
//     });
//     console.log(`Cancelled Horde job ${id}`);
//     return response.ok;
//   } catch (error) {
//     console.error(`Error cancelling Horde job ${id}:`, error);
//     return false;
//   }
// }

// // Helper function to check generation status
// async function checkGenerationStatus(id) {
//   try {
//     const response = await fetch(`${STABLEHORDE_API}/generate/check/${id}`);
//     const data = await response.json();
    
//     // Check if the response indicates the request was not found
//     if (data.rc === 'RequestNotFound') {
//       console.log(`Job ${id} not found in StableHorde - it may have expired or been cleaned up`);
//       throw new Error('HORDE_REQUEST_NOT_FOUND');
//     }
    
//     return data;
//   } catch (error) {
//     console.error('Error checking generation status:', error);
//     throw error;
//   }
// }

// // Helper function to get generation result
// async function getGenerationResult(id) {
//   try {
//     const response = await fetch(`${STABLEHORDE_API}/generate/status/${id}`);
//     return await response.json();
//   } catch (error) {
//     console.error('Error getting generation result:', error);
//     throw error;
//   }
// }

// // Helper function to upload image to S3
// async function uploadToS3(imageBuffer, filename) {
//   const params = {
//     Bucket: 'talkingbooks',
//     Key: `generated-images/${filename}`,
//     Body: imageBuffer,
//     ContentType: 'image/png'
//   };

//   return new Promise((resolve, reject) => {
//     s3.upload(params, (err, data) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(data.Location);
//       }
//     });
//   });
// }

// // Main polling function that handles all pending jobs
// async function pollPendingJobs() {
//   if (isPolling) {
//     console.log('Polling already in progress, skipping');
//     return;
//   }

//   if (!(await shouldPollBeRunning())) {
//     console.log('No pending jobs, not starting polling');
//     return;
//   }

//   try {
//     isPolling = true;
//     console.log('Starting polling process');

//     while (await shouldPollBeRunning()) {
//       const pendingJobs = await ImageGeneration.find({
//         status: { $in: ['pending', 'processing'] }
//       });

//       console.log(`Processing ${pendingJobs.length} pending jobs`);

//       await Promise.all(pendingJobs.map(async (job) => {
//         try {
//           // First check if the job was created with no workers
//           if (job.hordeResponse?.message?.includes("No available workers")) {
//             console.log(`Job ${job.hordeJobId} was created with no workers available, marking as failed`);
//             await cancelHordeJob(job.hordeJobId);
//             await ImageGeneration.findByIdAndUpdate(job._id, {
//               status: 'failed',
//               error: 'No workers available for this request'
//             });
//             return;
//           }

//           const status = await checkGenerationStatus(job.hordeJobId);
//           console.log(`Job ${job.hordeJobId} status:`, status);

//           // Check if there are no workers available for this job
//           if (status.message && status.message.includes("No available workers")) {
//             console.log(`No workers available for job ${job.hordeJobId}, cancelling`);
//             await cancelHordeJob(job.hordeJobId);
//             await ImageGeneration.findByIdAndUpdate(job._id, {
//               status: 'failed',
//               error: 'No workers available for this request'
//             });
//             return;
//           }

//           if (status.done) {
//             console.log(`Job ${job.hordeJobId} is done, fetching result`);
//             const result = await getGenerationResult(job.hordeJobId);
            
//             if (result.generations && result.generations.length > 0) {
//               console.log(`Job ${job.hordeJobId} has generations, processing image`);
//               const imageResponse = await fetch(result.generations[0].img);
//               const imageBuffer = await imageResponse.buffer();

//               const filename = `${job.hordeJobId}-${Date.now()}.png`;
//               const imageUrl = await uploadToS3(imageBuffer, filename);

//               // Update job status
//               await ImageGeneration.findByIdAndUpdate(job._id, {
//                 status: 'completed',
//                 imageUrl
//               });

//               // If this was a character image generation, update the character
//               if (job.characterId) {
//                 console.log(`Updating character ${job.characterId} with new image`);
//                 await Character.findByIdAndUpdate(job.characterId, {
//                   image_url: imageUrl
//                 });
//               }
//             } else {
//               throw new Error('No generations found in result');
//             }
//           } else if (job.status === 'pending' && status.processing) {
//             console.log(`Job ${job.hordeJobId} is processing`);
//             await ImageGeneration.findByIdAndUpdate(job._id, {
//               status: 'processing'
//             });
//           }
//         } catch (error) {
//           console.error(`Error processing job ${job.hordeJobId}:`, error);
          
//           // Handle specific error cases
//           const errorMessage = error.message === 'HORDE_REQUEST_NOT_FOUND' 
//             ? 'Image generation request expired or not found in StableHorde'
//             : error.message;
            
//           await ImageGeneration.findByIdAndUpdate(job._id, {
//             status: 'failed',
//             error: errorMessage
//           });
          
//           // If this was a character image generation, we might want to notify or handle specially
//           if (job.characterId) {
//             console.log(`Character image generation ${job.characterId} failed: ${errorMessage}`);
//           }
//         }
//       }));

//       // Wait a bit before next check
//       await new Promise(resolve => setTimeout(resolve, 50000));
//     }
//   } catch (error) {
//     console.error('Error in main polling loop:', error);
//   } finally {
//     isPolling = false;
//     console.log('Polling process ended');
//   }

//   // Check one more time if we need to keep polling
//   if (!isPolling && await shouldPollBeRunning()) {
//     console.log('Still have pending jobs, restarting polling');
//     setTimeout(pollPendingJobs, 10000);
//   } else {
//     console.log('No more pending jobs, stopping polling');
//   }
// }

// imageRoutes.post("/character/:characterId", authenticate, async (req, res) => {
//   try {
//     console.log('Finding character:', req.params.characterId);
//     const character = await Character.findById(req.params.characterId);
//     if (!character) {
//       console.log('Character not found');
//       return res.status(404).json({ message: "Character not found" });
//     }

//     console.log('Getting book for style guidance');
//     // Get the book's categories for style guidance
//     const book = await Book.findById(character.bookId);
//     const styleContext = book.categories?.length > 0 
//       ? `Style: ${book.categories.join(", ")}`
//       : "Style: realistic, detailed";

//     console.log('Constructing prompt for character:', character.firstName, character.lastName);
//     // Construct a focused appearance-based prompt
//     const prompt = `portrait of a ${character.appearance || 'person'}. ${styleContext}.`;
    
//     // Add some artistic direction to negative prompt
//     const negative_prompt = "deformed, blurry, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, mutated hands and fingers";

//     console.log('Preparing StableHorde payload');
//     // Prepare generation payload
//     const payload = {
//       prompt,
//       params: {
//         negative_prompt,
//         sampler_name: "k_euler_a",
//         steps: 30,
//         cfg_scale: 7.5,
//         width: 512,
//         height: 512,
//         seed: "0",
//       },
//       nsfw: false,
//       trusted_workers: true,
//       models: ["stable_diffusion_2.1"]  // Using 2.1 for better quality and worker availability
//     };

//     console.log('Sending request to StableHorde API');
//     // Submit generation request to StableHorde
//     const response = await fetch(`${STABLEHORDE_API}/generate/async`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'apikey': STABLEHORDE_API_KEY,
//       },
//       body: JSON.stringify(payload),
//     });

//     if (!response.ok) {
//       const errorText = await response.text();
//       console.error('StableHorde API error response:', {
//         status: response.status,
//         statusText: response.statusText,
//         body: errorText
//       });
//       return res.status(500).json({ 
//         message: "Failed to start generation",
//         error: errorText
//       });
//     }

//     console.log('Parsing StableHorde response');
//     const data = await response.json();

//     if (!data.id) {
//       console.error('Invalid StableHorde response:', data);
//       return res.status(500).json({ 
//         message: "Failed to start generation",
//         error: "No job ID received from StableHorde"
//       });
//     }

//     // Check for no workers warning
//     if (data.message && data.message.includes("No available workers")) {
//       console.log('No workers available for this request');
      
//       // Try to cancel the job in Horde
//       await cancelHordeJob(data.id);
      
//       return res.status(503).json({
//         message: "No workers currently available for image generation. Please try again later.",
//         error: data.message
//       });
//     }

//     console.log('Creating job in database');
//     // Create job in database
//     const job = await ImageGeneration.create({
//       userId: req.user._id,
//       prompt,
//       negative_prompt,
//       width: 512,
//       height: 768,
//       steps: 30,
//       status: 'pending',
//       hordeJobId: data.id,
//       estimatedTimeSeconds: data.kudos * 2,
//       characterId: character._id,
//       hordeResponse: data
//     });

//     // Start polling if there are pending jobs
//     if (await shouldPollBeRunning()) {
//       pollPendingJobs();
//     }

//     console.log('Sending success response');
//     res.status(202).json({
//       id: job._id,
//       message: "Character image generation started",
//       estimatedTimeSeconds: job.estimatedTimeSeconds
//     });

//   } catch (error) {
//     console.error('Error in character image generation:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({ 
//       message: "Failed to start image generation",
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// });

// // Update the cleanup interval to also handle expired jobs
// setInterval(async () => {
//   const oneHourAgo = new Date(Date.now() - 3600000);
//   const twentyMinutesAgo = new Date(Date.now() - 1200000); // 20 minutes ago
//   try {
//     // Clean up completed/failed jobs
//     await ImageGeneration.deleteMany({
//       createdAt: { $lt: oneHourAgo },
//       status: { $in: ['completed', 'failed'] }
//     });

//     // Update status of pending jobs with no workers after 20 minutes
//     await ImageGeneration.updateMany(
//       {
//         createdAt: { $lt: twentyMinutesAgo },
//         status: 'pending',
//         'hordeResponse.message': { $regex: 'No available workers' }
//       },
//       {
//         $set: {
//           status: 'failed',
//           error: 'Request expired due to no available workers'
//         }
//       }
//     );
//   } catch (error) {
//     console.error('Error cleaning up jobs:', error);
//   }
// }, 300000); // Run every 5 minutes

// module.exports = imageRoutes; 