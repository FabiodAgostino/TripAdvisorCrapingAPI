// api/health.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { HealthCheckResponse } from '../lib/types';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  // CORS headers
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Gestione preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  // ✅ Autenticazione opzionale per health check
  // Puoi decidere se renderla obbligatoria o meno
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.API_SECRET_KEY;
  
  // Se è configurata una API key ma quella fornita non è corretta
  if (expectedApiKey && apiKey && apiKey !== expectedApiKey) {
    console.log('🚫 Unauthorized health check attempt');
    res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    return;
  }

  const startTime = Date.now();

  try {
    console.log('🏥 Health check requested');
    
    // Test rapido del servizio di scraping
    const scrapingStatus = await testScrapingService();
    const responseTime = Date.now() - startTime;
    
    const response: HealthCheckResponse = {
      status: scrapingStatus === 'operational' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      responseTime: `${responseTime}ms`, // ✅ Aggiungi tempo di risposta
      services: {
        scraping: scrapingStatus,
        external_apis: 'operational'
      }
    };

    console.log(`✅ Health check completed: ${response.status} (${responseTime}ms)`);
    res.status(200).json(response);
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
    
    const response: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      responseTime: `${Date.now() - startTime}ms`,
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
    // Test più completo delle dipendenze
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    if (!axios || !cheerio) {
      return 'down';
    }

    // ✅ Test opzionale di connettività (veloce)
    // Uncommenta se vuoi testare anche la connettività
    /*
    try {
      await axios.get('https://httpbin.org/status/200', { 
        timeout: 2000 
      });
    } catch (networkError) {
      console.warn('⚠️ Network test failed:', networkError.message);
      return 'degraded';
    }
    */
    
    return 'operational';
  } catch (error: any) {
    console.error('🔥 Scraping service test failed:', error.message);
    return 'down';
  }
}