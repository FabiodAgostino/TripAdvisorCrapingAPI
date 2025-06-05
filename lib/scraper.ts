// lib/scraper.ts
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { 
  ExtractedRestaurant, 
  ScrapingOptions, 
  ScrapingResponse 
} from './types';

// Pool esteso di User Agents reali
const EXTENDED_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

// Referrer realistici
const REALISTIC_REFERRERS = [
  'https://www.google.it/',
  'https://www.google.com/',
  'https://www.tripadvisor.it/',
  'https://www.tripadvisor.com/',
  'https://www.booking.com/',
  ''
];

// Lingue realistiche
const LANGUAGES = [
  'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'en-US,en;q=0.9,it;q=0.8',
  'it-IT,it;q=0.9,en;q=0.8',
  'en-US,en;q=0.9'
];

// Blocco patterns per rilevare pagine bloccate
const BLOCKED_PATTERNS = [
  'blocked', 'captcha', 'security', 'access denied', 'forbidden',
  'bot detected', 'suspicious activity', 'verification required',
  'cloudflare', 'rate limit', 'too many requests', 'temporarily unavailable',
  'challenge', 'cf-challenge', 'captcha-delive'
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

    // Configurazione opzioni ottimizzate
    const {
      timeout = 8000,
      retries = 2,
      userAgent
    } = options;

    console.log(`🔍 Iniziando scraping Axios ottimizzato: ${trimmedUrl}`);

    // Delay iniziale randomico per sembrare umano
    await randomDelay(500, 2000);

    let lastError: Error | null = null;
    
    // Retry logic con strategie diverse per ogni tentativo
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Tentativo ${attempt + 1}/${retries + 1}`);
        
        const response = await makeAdvancedRequest(trimmedUrl, {
          timeout,
          userAgent: userAgent || getRandomUserAgent(),
          attempt
        });

        // Verifica se la richiesta è stata bloccata
        const blockCheck = checkIfBlocked(response.data);
        if (!blockCheck.success) {
          console.log(`🚫 Tentativo ${attempt + 1} bloccato: ${blockCheck.reason}`);
          
          if (attempt < retries) {
            // Delay progressivo e randomico tra tentativi
            const delayTime = (attempt + 1) * 2000 + Math.random() * 3000;
            await randomDelay(delayTime, delayTime + 2000);
            continue;
          } else {
            return {
              success: false,
              error: 'TripAdvisor ha bloccato tutte le richieste',
              details: blockCheck.reason,
              suggestion: 'Prova con un altro deployment URL o inserisci i dati manualmente.',
              processingTime: Date.now() - startTime
            };
          }
        }

        // Estrazione dati dalla pagina
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
          // Delay progressivo tra tentativi falliti
          await randomDelay(2000 * (attempt + 1), 4000 * (attempt + 1));
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

async function makeAdvancedRequest(url: string, options: {
  timeout: number;
  userAgent: string;
  attempt: number;
}): Promise<AxiosResponse<string>> {
  
  const randomReferrer = REALISTIC_REFERRERS[Math.floor(Math.random() * REALISTIC_REFERRERS.length)];
  const randomLanguage = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  
  // Headers super realistici che cambiano per ogni tentativo
  const baseHeaders: Record<string, string | undefined> = {
    'User-Agent': options.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': randomLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': Math.random() > 0.5 ? '1' : '0',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': Math.random() > 0.5 ? 'cross-site' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': Math.random() > 0.5 ? 'max-age=0' : 'no-cache'
  };

  // Aggiungi Pragma condizionalmente
  if (Math.random() > 0.3) {
    baseHeaders['Pragma'] = 'no-cache';
  }

  // Headers aggiuntivi basati sul tentativo e randomization
  const headers: Record<string, string | undefined> = { ...baseHeaders };
  
  if (randomReferrer) {
    headers['Referer'] = randomReferrer;
  }
  
  // Varia headers per tentativo
  if (options.attempt === 1) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  } else if (options.attempt === 2) {
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    headers['Sec-CH-UA'] = '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"';
    headers['Sec-CH-UA-Mobile'] = '?0';
    headers['Sec-CH-UA-Platform'] = '"Windows"';
  }

  // Rimuovi headers undefined
  Object.keys(headers).forEach(key => {
    if (headers[key] === undefined) {
      delete headers[key];
    }
  });

  // Type guard per assicurarsi che tutti i headers siano stringhe
  const cleanHeaders: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === 'string') {
      cleanHeaders[key] = value;
    }
  });

  console.log(`📤 Request attempt ${options.attempt + 1} with User-Agent: ${cleanHeaders['User-Agent']?.substring(0, 50)}...`);
  console.log(`📤 Referer: ${cleanHeaders['Referer'] || 'none'}`);

  return axios.get(url, {
    headers: cleanHeaders,
    timeout: options.timeout,
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
    // Configurazioni per sembrare più umano
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
    decompress: true,
    // Simula comportamento browser
    withCredentials: false,
    responseType: 'text'
  });
}

function checkIfBlocked(html: string): { success: boolean; reason?: string } {
  // Controlla lunghezza HTML
  if (html.length < 3000) {
    return { 
      success: false, 
      reason: `Pagina troppo corta (${html.length} caratteri) - possibile blocco` 
    };
  }

  // Usa Cheerio per analisi veloce
  const $ = cheerio.load(html);
  
  // Controlla title della pagina
  const pageTitle = $('title').text().toLowerCase();
  console.log(`📄 Page title: "${pageTitle}"`);
  
  // Detection specifica per Cloudflare/CAPTCHA
  if (html.toLowerCase().includes('captcha-delive') || 
      html.toLowerCase().includes('cf-challenge') ||
      pageTitle === 'tripadvisor.it' && html.length < 5000) {
    return { 
      success: false, 
      reason: 'Cloudflare CAPTCHA/Challenge rilevato' 
    };
  }
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pageTitle.includes(pattern)) {
      return { 
        success: false, 
        reason: `Titolo contiene "${pattern}": ${pageTitle}` 
      };
    }
  }

  // Controlla body della pagina
  const bodyText = $('body').text().toLowerCase();
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (bodyText.includes(pattern)) {
      return { 
        success: false, 
        reason: `Contenuto contiene "${pattern}"` 
      };
    }
  }

  // Controlla se contiene elementi tipici di TripAdvisor
  const hasRestaurantElements = $('.biGQs._P.hzzSG.rRtyp').length > 0 || 
                               $('h1').length > 0 || 
                               $('.HjBfq').length > 0 ||
                               $('[data-test-target]').length > 0;
  
  if (!hasRestaurantElements) {
    return { 
      success: false, 
      reason: 'Pagina non contiene elementi tipici di TripAdvisor' 
    };
  }

  console.log('✅ Pagina sembra legittima');
  return { success: true };
}

async function extractDataFromHTML(html: string, sourceUrl: string): Promise<ExtractedRestaurant> {
  const $ = cheerio.load(html);
  
  console.log(`🔍 Inizio estrazione dati da HTML (${html.length} caratteri)`);

  // Extract restaurant name con fallback multipli
  let name = $('.biGQs._P.hzzSG.rRtyp').first().text().trim();
  if (!name) name = $('h1').first().text().trim();
  if (!name) name = $('.HjBfq').first().text().trim();
  if (!name) name = $('[data-test-target="restaurant-detail-overview"] h1').first().text().trim();
  if (!name) name = "Ristorante";
  
  console.log(`🏪 Nome estratto: "${name}"`);

  // Extract rating con validazione
  const ratingText = $('.biGQs._P.pZUbB.KxBGd').first().text().trim();
  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
  let rating = ratingMatch ? ratingMatch[1] : "4.0";
  
  // Validazione rating
  const numRating = parseFloat(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    rating = "4.0";
  }
  
  console.log(`⭐ Rating estratto: ${rating}`);

  // Extract price range
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
  
  console.log(`💰 Fascia prezzo: ${priceRange}`);

  // Extract cuisines con mappatura migliorata
  const cuisines: string[] = [];
  const cuisineMapping = {
    'pugliese': ['pugliese', 'apulian', 'puglia', 'salentina', 'salento', 'tipica pugliese', 'regional italian'],
    'italiana': ['italiana', 'italian', 'italy', 'tradizionale italiana', 'regional'],
    'mediterranea': ['mediterranea', 'mediterranean', 'mediter'],
    'pesce': ['pesce', 'seafood', 'fish', 'mare', 'frutti di mare', 'crudo', 'raw'],
    'barbecue': ['barbecue', 'grill', 'griglia', 'alla griglia', 'bbq', 'braceria'],
    'steakhouse': ['steakhouse', 'steak', 'bistecca', 'carne', 'beef', 'braceria', 'meat']
  };

  // Ricerca cucine in aree specifiche
  $('.HUMGB.cPbcf, [data-test-target="restaurant-detail-overview"]').each((index, container) => {
    const $container = $(container);
    
    $container.find('span, div').each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      
      if (!text.includes('€') && text.length > 2 && text.length < 50) {
        Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
          if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
            if (!cuisines.includes(cuisineType)) {
              cuisines.push(cuisineType);
              console.log(`✅ Cucina trovata: ${cuisineType} (da "${text}")`);
            }
          }
        });
      }
    });
  });

  // Default se non trova nulla
  if (cuisines.length === 0) {
    console.log('⚠️ Nessuna cucina trovata, usando default');
    cuisines.push('italiana');
  }
  
  console.log(`🍽️ Cucine finali: [${cuisines.join(', ')}]`);

  // Extract description
  let description = $('.biGQs._P.pZUbB.avBIb.KxBGd').first().text().trim();
  if (!description) description = $('.biGQs._P.pZUbB.hmDzD').first().text().trim();
  if (!description) description = $('[data-test-target="restaurant-detail-overview"] p').first().text().trim();
  if (!description) description = "Authentic restaurant serving local specialties";
  
  if (description.length > 300) {
    description = description.substring(0, 297) + '...';
  }
  
  console.log(`📝 Descrizione: "${description.substring(0, 50)}..."`);

  // Extract address
  let address = $('.biGQs._P.fiohW.fOtGX').first().text().trim();
  if (!address) address = $('.AYHFM').first().text().trim();
  if (!address) address = $('[data-test-target="location-detail"] span').first().text().trim();
  if (!address) address = "Salento, Puglia";
  
  console.log(`🏠 Indirizzo: "${address}"`);

  // Extract coordinates
  let latitude = "40.3515";
  let longitude = "18.1750";
  let location = "Salento";

  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && (href.includes('maps.google.com') || href.includes('goo.gl/maps') || href.includes('maps.app.goo.gl'))) {
      console.log(`🗺️ Link mappa trovato`);
      
      const coordMatch = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        latitude = coordMatch[1];
        longitude = coordMatch[2];
        console.log(`📍 Coordinate estratte: ${latitude}, ${longitude}`);
      }
    }
  });

  if (location === "Salento" && address) {
    const addressParts = address.split(',');
    if (addressParts.length > 1) {
      location = addressParts[addressParts.length - 1].trim();
    }
  }

  // Extract image URL
  let imageUrl = "";
  $('picture img, img').each((i, elem) => {
    if (imageUrl) return;
    
    const img = $(elem);
    const src = img.attr('src');
    const srcset = img.attr('srcset');
    
    if (srcset && srcset.includes('tripadvisor.com/media/photo')) {
      const srcsetUrls = srcset.split(',').map(item => item.trim().split(' ')[0]);
      imageUrl = srcsetUrls[srcsetUrls.length - 1];
      console.log(`🖼️ Immagine trovata (srcset)`);
    } else if (src && src.includes('tripadvisor.com/media/photo')) {
      imageUrl = src;
      console.log(`🖼️ Immagine trovata (src)`);
    }
  });

  // Extract phone
  let phone = "";
  $('a[href^="tel:"]').each((i, elem) => {
    if (phone) return;
    
    const $link = $(elem);
    const phoneSpan = $link.find('span.biGQs._P.XWJSj.Wb');
    
    if (phoneSpan.length > 0) {
      const phoneText = phoneSpan.text().trim();
      const phoneMatch = phoneText.match(/(\+39\s?)?(\d{2,4}\s?\d{6,8}|\d{3}\s?\d{3}\s?\d{4})/);
      if (phoneMatch) {
        phone = phoneText;
        console.log(`✅ Telefono estratto: ${phone}`);
      }
    }
  });

  const result = {
    name,
    rating,
    priceRange,
    cuisine: cuisines[0] || 'italiana',
    cuisines,
    description,
    address,
    location,
    latitude,
    longitude,
    phone: phone || undefined,
    imageUrl,
    extractedAt: new Date().toISOString(),
    sourceUrl
  };

  console.log('✅ Estrazione completata:', {
    name: result.name,
    rating: result.rating,
    priceRange: result.priceRange,
    cuisines: result.cuisines,
    hasPhone: !!result.phone,
    hasImage: !!result.imageUrl
  });

  return result;
}

function getRandomUserAgent(): string {
  return EXTENDED_USER_AGENTS[Math.floor(Math.random() * EXTENDED_USER_AGENTS.length)];
}

function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`⏱️ Delay di ${delay}ms`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function handleScrapingError(error: Error, processingTime: number): ScrapingResponse {
  console.error('❌ Errore scraping:', error.message);
  
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'TripAdvisor ha rifiutato la connessione (403 Forbidden)',
        details: 'Il server ha rilevato una richiesta automatica',
        suggestion: 'Prova con un altro deployment URL o aspetta qualche minuto.',
        processingTime
      };
    }
    
    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Troppe richieste (429 Rate Limited)',
        details: 'Il server ha limitato le richieste da questo IP',
        suggestion: 'Usa un altro deployment URL o attendi.',
        processingTime
      };
    }
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Timeout della richiesta',
        details: 'La pagina ha impiegato troppo tempo a rispondere',
        suggestion: 'Riprova o usa un altro deployment URL.',
        processingTime
      };
    }

    if (error.response && error.response.status >= 500) {
      return {
        success: false,
        error: 'Errore del server TripAdvisor',
        details: `Server ha restituito ${error.response.status}`,
        suggestion: 'TripAdvisor potrebbe avere problemi. Riprova più tardi.',
        processingTime
      };
    }
  }

  return {
    success: false,
    error: 'Errore durante il scraping',
    details: error.message,
    suggestion: 'Verifica URL e riprova, o usa un altro deployment.',
    processingTime
  };
}