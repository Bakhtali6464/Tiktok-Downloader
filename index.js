const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Constants
const TIKWM_API_URL = 'https://www.tikwm.com/api/';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});
app.use(limiter);

// Helper function to validate TikTok URLs
function isValidTikTokUrl(url) {
  const patterns = [
    /tiktok\.com\/@.+\/video\/\d+/i,
    /tiktok\.com\/t\/[a-z0-9]+/i,
    /vm\.tiktok\.com\/[a-z0-9]+/i,
    /vt\.tiktok\.com\/[a-z0-9]+/i,
    /tiktok\.com\/v\/\d+/i,
    /www\.tiktok\.com\/[a-z]+\/video\/\d+/i
  ];
  return patterns.some(pattern => pattern.test(url));
}

// Download endpoint with improved error handling
app.get('/download-video', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'TikTok URL is required' });
  }

  if (!isValidTikTokUrl(url)) {
    return res.status(400).json({ error: 'Invalid TikTok URL' });
  }

  try {
    let retries = 0;
    let success = false;
    let apiResponse;

    // Retry logic
    while (retries < MAX_RETRIES && !success) {
      try {
        apiResponse = await axios.get(TIKWM_API_URL, {
          params: { url },
          timeout: REQUEST_TIMEOUT
        });
        
        if (apiResponse.data && apiResponse.data.code === 0) {
          success = true;
        } else {
          retries++;
        }
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    if (!apiResponse.data.data.play) {
      throw new Error('No video URL found in response');
    }

    const videoUrl = apiResponse.data.data.play;
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: REQUEST_TIMEOUT
    });

    // Set appropriate headers
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok-video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache');

    // Stream the video
    videoResponse.data.pipe(res);

    // Handle stream errors
    videoResponse.data.on('error', () => {
      res.status(500).json({ error: 'Error streaming video' });
    });

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      res.status(error.response.status).json({ 
        error: 'API request failed',
        details: error.response.data
      });
    } else if (error.request) {
      // The request was made but no response was received
      res.status(504).json({ error: 'API request timed out' });
    } else {
      // Something happened in setting up the request
      res.status(500).json({ error: 'Failed to download video' });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Download endpoint: http://localhost:${PORT}/download-video`);
});
