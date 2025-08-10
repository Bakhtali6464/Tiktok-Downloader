const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// New: Download endpoint that streams the video
app.get('/download-video', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('TikTok URL is required');
  }

  try {
    const apiResponse = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const videoUrl = apiResponse.data.data.play;

    // Fetch the video as a stream
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
    });

    // Set headers to force download
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok-video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    // Pipe the video stream to the response
    videoResponse.data.pipe(res);
  } catch (error) {
    res.status(500).send('Failed to download video');
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));