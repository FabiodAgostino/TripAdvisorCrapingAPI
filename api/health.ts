// api/health.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { HealthCheckResponse } from '../lib/types';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  const startTime = Date.now();

  try {
    // Test rapido del servizio di scraping
    const scrapingStatus = await testScrapingService();
    
    const response: HealthCheckResponse = {
      status: scrapingStatus === 'operational' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        scraping: scrapingStatus,
        external_apis: 'operational'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    const response: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        scraping: 'down',
        external_apis: 'down'
      }
    };

    res.status(503).json(response);
  }
}

async function testScrapingService(): Promise<'operational' | 'degraded' | 'down'> {
  try {
    // Test molto semplice - verifica che le dipendenze siano caricate
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    if (axios && cheerio) {
      return 'operational';
    }
    return 'degraded';
  } catch (error) {
    return 'down';
  }
}