// api/scrape.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeTripAdvisor } from '../lib/scraper';
import { ScrapingRequest, ApiResponse, ExtractedRestaurant } from '../lib/types';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    const response: ApiResponse = {
      success: false,
      error: 'Method not allowed. Use POST.',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(405).json(response);
    return;
  }

  try {
    const { url, options }: ScrapingRequest = req.body;

    if (!url) {
      const response: ApiResponse = {
        success: false,
        error: 'URL è richiesto nel body della richiesta',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(400).json(response);
      return;
    }

    console.log(`🔍 API Request: ${url}`);

    // Timeout per Vercel (9 secondi max)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('API_TIMEOUT')), 9000);
    });

    const result = await Promise.race([
      scrapeTripAdvisor(url, options),
      timeoutPromise
    ]);

    if (result.success) {
      const response: ApiResponse<ExtractedRestaurant> = {
        success: true,
        data: result.data,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(400).json(response);
    }

  } catch (error: any) {
    console.error('❌ API Error:', error.message);

    if (error.message === 'API_TIMEOUT') {
      const response: ApiResponse = {
        success: false,
        error: 'Timeout - La richiesta ha impiegato troppo tempo',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(408).json(response);
      return;
    }

    const response: ApiResponse = {
      success: false,
      error: 'Errore interno del server',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(500).json(response);
  }
}