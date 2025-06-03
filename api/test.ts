// api/test.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiResponse } from '../lib/types';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  const testData = {
    message: 'API Scraping Salento funzionante! 🚀',
    endpoints: {
      scrape: '/api/scrape (POST)',
      health: '/api/health (GET)',
      test: '/api/test (GET)'
    },
    example_request: {
      url: '/api/scrape',
      method: 'POST',
      body: {
        url: 'https://www.tripadvisor.it/Restaurant_Review-...',
        options: {
          timeout: 8000,
          retries: 1
        }
      }
    },
    version: '1.0.0',
    timestamp: new Date().toISOString()
  };

  const response: ApiResponse<typeof testData> = {
    success: true,
    data: testData,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };

  res.status(200).json(response);
}