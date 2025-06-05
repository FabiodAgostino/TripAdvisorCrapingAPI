// api/scrape.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeTripAdvisor } from '../lib/scraper';
import { ScrapingRequest, ApiResponse, ExtractedRestaurant } from '../lib/types';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  // CORS headers migliorati
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Gestione preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Verifica metodo
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

  // ✅ Verifica API Key
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.API_SECRET_KEY;

  if (!expectedApiKey) {
    console.error('⚠️ API_SECRET_KEY non configurata');
    const response: ApiResponse = {
      success: false,
      error: 'Server configuration error',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(500).json(response);
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    console.log('🚫 Unauthorized access attempt');
    const response: ApiResponse = {
      success: false,
      error: 'Unauthorized - Invalid API key',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(401).json(response);
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

    // ✅ Validazione URL TripAdvisor più rigorosa
    if (!url.includes('tripadvisor')) {
      const response: ApiResponse = {
        success: false,
        error: 'URL deve essere di TripAdvisor',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(400).json(response);
      return;
    }

    console.log(`🔍 API Request: ${url} (Key: ${apiKey.substring(0, 8)}...)`);

    // Timeout per Vercel (9 secondi max)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('API_TIMEOUT')), 9000);
    });

    const result = await Promise.race([
      scrapeTripAdvisor(url, options),
      timeoutPromise
    ]);

    if (result.success) {
      console.log(`✅ Scraping successful: ${result.data?.name}`);
      const response: ApiResponse<ExtractedRestaurant> = {
        success: true,
        data: result.data,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(200).json(response);
    } else {
      console.log(`❌ Scraping failed: ${result.error}`);
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