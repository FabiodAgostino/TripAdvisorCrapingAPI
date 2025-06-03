// lib/scraper.ts
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { 
  ExtractedRestaurant, 
  ScrapingOptions, 
  ScrapingResponse 
} from './types';

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

export async function scrapeTripAdvisor(
  url: string, 
  options: ScrapingOptions = {}
): Promise<ScrapingResponse> {
  const startTime = Date.now();
  
  try {
    // Validazione URL
    if (!url || typeof url !== 'string') {
      return {
        success: false,
        error: 'URL richiesto e deve essere una stringa'
      };
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.includes('tripadvisor.com') && !trimmedUrl.includes('tripadvisor.it')) {
      return {
        success: false,
        error: 'URL TripAdvisor richiesto'
      };
    }

    // Configurazione opzioni
    const {
      timeout = 8000,
      retries = 1,
      userAgent
    } = options;

    console.log(`🔍 Iniziando scraping: ${trimmedUrl}`);

    let lastError: Error | null = null;
    
    // Retry logic
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await makeRequest(trimmedUrl, {
          timeout,
          userAgent: userAgent || getRandomUserAgent()
        });

        const extractedData = await extractDataFromHTML(response.data, trimmedUrl);
        const processingTime = Date.now() - startTime;

        console.log(`✅ Scraping completato in ${processingTime}ms: ${extractedData.name}`);

        return {
          success: true,
          data: extractedData,
          processingTime
        };

      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Tentativo ${attempt + 1} fallito:`, error);
        
        if (attempt < retries) {
          // Pausa tra i tentativi
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // Tutti i tentativi falliti
    const processingTime = Date.now() - startTime;
    return handleScrapingError(lastError!, processingTime);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    return handleScrapingError(error as Error, processingTime);
  }
}

async function makeRequest(url: string, options: {
  timeout: number;
  userAgent: string;
}): Promise<AxiosResponse<string>> {
  
  return axios.get(url, {
    headers: {
      'User-Agent': options.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    },
    timeout: options.timeout,
    maxRedirects: 3,
    validateStatus: (status) => status < 500
  });
}

async function extractDataFromHTML(html: string, sourceUrl: string): Promise<ExtractedRestaurant> {
  const $ = cheerio.load(html);
  
  // Verifica se la pagina è stata bloccata
  const pageTitle = $('title').text().toLowerCase();
  if (pageTitle.includes('blocked') || pageTitle.includes('captcha') || pageTitle.includes('security')) {
    throw new Error('Pagina bloccata o con CAPTCHA rilevato');
  }

  // Extract restaurant name - IDENTICO AL METODO API
  const name = $('.biGQs._P.hzzSG.rRtyp').first().text().trim() || 
               $('h1').first().text().trim() || 
               $('.HjBfq').first().text().trim() ||
               "Restaurant";

  // Extract rating - IDENTICO AL METODO API
  const ratingText = $('.biGQs._P.pZUbB.KxBGd').first().text().trim();
  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
  const rating = ratingMatch ? ratingMatch[1] : "4.0";

  // Extract price range - IDENTICO AL METODO API
  let priceRange = "€€";
  $('.biGQs._P.pZUbB.KxBGd').each((i, elem) => {
    const text = $(elem).text().trim();
    if (text.includes('€€€€')) {
      priceRange = "€€€€";
    } else if (text.includes('€€€')) {
      priceRange = "€€€";
    } else if (text.includes('€€')) {
      priceRange = "€€";
    } else if (text.includes('€') && !text.includes('€€')) {
      priceRange = "€";
    }
  });

  // Extract multiple cuisine types - IDENTICO AL METODO API
  const cuisines: string[] = [];
  const cuisineMapping = {
    'pugliese': ['pugliese', 'apulian', 'puglia', 'salentina', 'salento', 'tipica pugliese'],
    'italiana': ['italiana', 'italian', 'italy', 'tradizionale italiana'],
    'mediterranea': ['mediterranea', 'mediterranean', 'mediter'],
    'pesce': ['pesce', 'seafood', 'fish', 'mare', 'frutti di mare', 'crudo', 'sushi', 'sashimi'],
    'barbecue': ['barbecue', 'grill', 'griglia', 'alla griglia', 'bbq', 'braceria'],
    'steakhouse': ['steakhouse', 'steak', 'bistecca', 'carne', 'beef', 'braceria']
  };

  // Cerca nella classe specifica per le cuisines
  $('.biGQs._P.pZUbB.KxBGd').each((i, elem) => {
    const text = $(elem).text().trim().toLowerCase();
    
    Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
      if (keywords.some(keyword => text.includes(keyword))) {
        if (!cuisines.includes(cuisineType)) {
          cuisines.push(cuisineType);
        }
      }
    });
  });

  // Fallback search in other areas
  if (cuisines.length === 0) {
    $('[data-test-target="restaurant-detail-overview"]').find('span, div').each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
        if (keywords.some(keyword => text.includes(keyword))) {
          if (!cuisines.includes(cuisineType)) {
            cuisines.push(cuisineType);
          }
        }
      });
    });

    // Search in breadcrumbs
    $('.breadcrumbs').find('span, a').each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
        if (keywords.some(keyword => text.includes(keyword))) {
          if (!cuisines.includes(cuisineType)) {
            cuisines.push(cuisineType);
          }
        }
      });
    });
  }

  // Default fallback
  if (cuisines.length === 0) {
    cuisines.push('italiana');
  }

  // Extract description - IDENTICO AL METODO API
  const description = $('.biGQs._P.pZUbB.avBIb.KxBGd').first().text().trim() ||
                     $('.biGQs._P.pZUbB.hmDzD').first().text().trim() ||
                     "Authentic restaurant serving local specialties";

  // Extract address - IDENTICO AL METODO API
  const address = $('.biGQs._P.fiohW.fOtGX').first().text().trim() ||
                 $('.AYHFM').first().text().trim() ||
                 "Salento, Puglia";

  // Extract coordinates - IDENTICO AL METODO API
  let latitude = "40.3515";
  let longitude = "18.1750";
  let location = "Salento";

  // Cerca link di Google Maps
  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && (href.includes('maps.google.com') || href.includes('goo.gl/maps'))) {
      const coordMatch = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        latitude = coordMatch[1];
        longitude = coordMatch[2];
      }
      
      // Extract location from address
      const addressMatch = href.match(/daddr=([^@&]+)/);
      if (addressMatch) {
        const addressParts = decodeURIComponent(addressMatch[1]).split(',');
        if (addressParts.length > 1) {
          location = addressParts[addressParts.length - 2].trim();
        }
      }
    }
  });

  // Fallback per location dall'indirizzo
  if (location === "Salento" && address) {
    const addressParts = address.split(',');
    if (addressParts.length > 1) {
      location = addressParts[addressParts.length - 1].trim();
    }
  }

  // Extract image URL - IDENTICO AL METODO API
  let imageUrl = "";

  // Strategia 1: Cerca tutti gli elementi picture sulla pagina
  const allPictures = $('picture');
  if (allPictures.length > 0) {
    // Analizza ogni picture per trovare quello con immagini TripAdvisor
    allPictures.each((index, pictureEl) => {
      if (imageUrl) return; // Se già trovato, skip
      
      const picture = $(pictureEl);
      
      // Cerca img dentro questo picture
      const img = picture.find('img').first();
      if (img.length > 0) {
        const src = img.attr('src');
        const srcset = img.attr('srcset');
        // Controlla se contiene URL TripAdvisor validi
        if (srcset && srcset.includes('tripadvisor.com/media/photo')) {
          const srcsetUrls = srcset.split(',').map(item => item.trim().split(' ')[0]);
          // Prende l'URL con risoluzione più alta
          imageUrl = srcsetUrls[srcsetUrls.length - 1];
          return;
        } else if (src && src.includes('tripadvisor.com/media/photo')) {
          imageUrl = src;
          return;
        }
      }
    });
  }

  // Extract phone - IDENTICO AL METODO API
  let phone = "";
  $('.biGQs._P.pZUbB.KxBGd').each((i, elem) => {
    const text = $(elem).text().trim();
    const phoneMatch = text.match(/(\+39\s?)?(\d{2,4}\s?\d{6,8}|\d{3}\s?\d{3}\s?\d{4})/);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0];
    }
  });

  return {
    name,
    rating:rating,
    priceRange,
    cuisine: cuisines[0] || 'italiana',
    cuisines,
    description,
    address,
    location,
    latitude: latitude,
    longitude: longitude,
    phone: phone || undefined,
    imageUrl,
    extractedAt: new Date().toISOString(),
    sourceUrl
  };
}

function getRandomUserAgent(): string {
  return DEFAULT_USER_AGENTS[Math.floor(Math.random() * DEFAULT_USER_AGENTS.length)];
}

function handleScrapingError(error: Error, processingTime: number): ScrapingResponse {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'TripAdvisor ha bloccato la richiesta (403)',
        suggestion: 'Riprova tra qualche minuto o inserisci i dati manualmente',
        processingTime
      };
    }
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Timeout della richiesta',
        suggestion: 'La pagina ha impiegato troppo tempo a caricare. Riprova.',
        processingTime
      };
    }
  }

  return {
    success: false,
    error: 'Errore durante il scraping',
    details: error.message,
    processingTime
  };
}