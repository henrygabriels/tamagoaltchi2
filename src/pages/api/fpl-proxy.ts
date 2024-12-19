import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { endpoint } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Endpoint parameter is required' });
  }

  try {
    const response = await axios.get(`${FPL_BASE_URL}${endpoint}`);
    res.status(200).json(response.data);
  } catch (error: any) {
    console.error('FPL API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
} 