import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { endpoint, mode } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Endpoint parameter is required' });
  }

  try {
    // Ensure endpoint starts with a forward slash and remove any double slashes
    const normalizedEndpoint = `/${endpoint.replace(/^\/+/, '')}`;
    const fullUrl = `${FPL_BASE_URL}${normalizedEndpoint}`;
    
    console.log('Proxying request to:', fullUrl);
    console.log('Request mode:', mode);
    
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    // For setup mode, we want to return the raw data
    // For live mode, we process it for live updates
    if (mode === 'setup') {
      res.status(200).json(response.data);
    } else {
      // Process live data (add any specific processing needed for live updates)
      res.status(200).json(response.data);
    }
  } catch (error: any) {
    console.error('FPL API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message,
      details: {
        status: error.response?.status,
        statusText: error.response?.statusText
      }
    });
  }
} 