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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
];

// Blocco patterns per rilevare pagine bloccate
const BLOCKED_PATTERNS = [
  'blocked', 'captcha', 'security', 'access denied', 'forbidden',
  'bot detected', 'suspicious activity', 'verification required',
  'cloudflare', 'rate limit', 'too many requests', 'temporarily unavailable'
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
      timeout = 9000, // Ridotto per Vercel
      retries = 2,    // Aumentato tentativi
      userAgent
    } = options;

    console.log(`🔍 Iniziando scraping: ${trimmedUrl}`);

    // Delay iniziale per sembrare più umano
    await randomDelay(1000, 3000);

    let lastError: Error | null = null;
    
    // Retry logic con strategie diverse
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Tentativo ${attempt + 1}/${retries + 1}`);
        
        const response = await makeRequest(trimmedUrl, {
          timeout,
          userAgent: userAgent || getRandomUserAgent(),
          attempt
        });

        // Verifica se la richiesta è stata bloccata
        const blockCheck = checkIfBlocked(response.data);
        if (!blockCheck.success) {
          console.log(`🚫 Tentativo ${attempt + 1} bloccato: ${blockCheck.reason}`);
          
          if (attempt < retries) {
            // Delay più lungo tra tentativi quando bloccato
            await randomDelay(3000, 8000);
            continue;
          } else {
            // Ultimo tentativo fallito
            return {
              success: false,
              error: 'TripAdvisor ha bloccato tutte le richieste',
              details: blockCheck.reason,
              suggestion: 'Il servizio potrebbe essere temporaneamente limitato. Prova a inserire i dati manualmente o riprova più tardi.',
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
          // Delay progressivo tra tentativi
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

async function makeRequest(url: string, options: {
  timeout: number;
  userAgent: string;
  attempt: number;
}): Promise<AxiosResponse<string>> {
  
  // Headers più realistici basati sul tentativo
  const baseHeaders: Record<string, string> = {
    'User-Agent': options.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive'
  };

  // Variazioni negli headers per ogni tentativo
  const headers: Record<string, string> = { ...baseHeaders };
  
  if (options.attempt === 1) {
    headers['Referer'] = 'https://www.google.it/';
  } else if (options.attempt === 2) {
    headers['Referer'] = 'https://www.tripadvisor.it/';
    headers['Accept-Language'] = 'en-US,en;q=0.9,it;q=0.8';
  }

  console.log(`📤 Request headers for attempt ${options.attempt + 1}:`, {
    'User-Agent': headers['User-Agent'].substring(0, 50) + '...',
    'Referer': headers['Referer'] || 'none'
  });

  return axios.get(url, {
    headers,
    timeout: options.timeout,
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
    // Configurazioni aggiuntive per evitare detection
    maxContentLength: 50 * 1024 * 1024, // 50MB max
    maxBodyLength: 50 * 1024 * 1024
  });
}

function checkIfBlocked(html: string): { success: boolean; reason?: string } {
  // Controlla lunghezza HTML (pagine bloccate sono spesso molto corte)
  if (html.length < 5000) {
    return { 
      success: false, 
      reason: `Pagina troppo corta (${html.length} caratteri) - possibile blocco` 
    };
  }

  // Carica HTML con Cheerio per analisi
  const $ = cheerio.load(html);
  
  // Controlla title della pagina
  const pageTitle = $('title').text().toLowerCase();
  console.log(`📄 Page title: "${pageTitle}"`);
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pageTitle.includes(pattern)) {
      return { 
        success: false, 
        reason: `Titolo pagina contiene "${pattern}": ${pageTitle}` 
      };
    }
  }

  // Controlla body della pagina
  const bodyText = $('body').text().toLowerCase();
  const bodyClasses = $('body').attr('class') || '';
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (bodyText.includes(pattern) || bodyClasses.includes(pattern)) {
      return { 
        success: false, 
        reason: `Contenuto pagina contiene "${pattern}"` 
      };
    }
  }

  // Controlla se contiene elementi tipici di TripAdvisor
  const hasRestaurantElements = $('.biGQs._P.hzzSG.rRtyp').length > 0 || 
                               $('h1').length > 0 || 
                               $('.HjBfq').length > 0;
  
  if (!hasRestaurantElements) {
    return { 
      success: false, 
      reason: 'Pagina non contiene elementi tipici di TripAdvisor - possibile blocco' 
    };
  }

  // Controlla presence di CAPTCHA o form di verifica
  if ($('form[action*="captcha"]').length > 0 || 
      $('.captcha').length > 0 || 
      $('input[name*="captcha"]').length > 0) {
    return { 
      success: false, 
      reason: 'CAPTCHA rilevato nella pagina' 
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

  // Extract price range con ricerca migliorata
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

  // Extract multiple cuisine types con mappatura migliorata
  const cuisines: string[] = [];
  const cuisineMapping = {
    'pugliese': ['pugliese', 'apulian', 'puglia', 'salentina', 'salento', 'tipica pugliese', 'regional italian'],
    'italiana': ['italiana', 'italian', 'italy', 'tradizionale italiana', 'regional'],
    'mediterranea': ['mediterranea', 'mediterranean', 'mediter'],
    'pesce': ['pesce', 'seafood', 'fish', 'mare', 'frutti di mare', 'crudo', 'raw'],
    'barbecue': ['barbecue', 'grill', 'griglia', 'alla griglia', 'bbq', 'braceria'],
    'steakhouse': ['steakhouse', 'steak', 'bistecca', 'carne', 'beef', 'braceria', 'meat']
  };

  // Strategia migliorata per trovare cucine
  const cuisineContainer = $('.HUMGB.cPbcf');
  let found = false;

  if (cuisineContainer.length > 0) {
    console.log('🔍 Trovato contenitore cucine specifico');
    
    cuisineContainer.each((index, container) => {
      const $container = $(container);
      
      $container.find('span.biGQs._P.pZUbB.KxBGd').each((i, elem) => {
        const text = $(elem).text().trim().toLowerCase();
        
        if (!text.includes('€') && text.length > 2) {
          console.log(`📝 Analizzando testo cucina: "${text}"`);
          
          Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
            if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
              if (!cuisines.includes(cuisineType)) {
                cuisines.push(cuisineType);
                console.log(`✅ Cucina trovata: ${cuisineType} (da "${text}")`);
                found = true;
              }
            }
          });
        }
      });
    });
  }

  // Fallback search in altre aree
  if (cuisines.length === 0) {
    console.log('🔍 Ricerca cucine in aree alternative...');
    
    // Cerca in overview
    $('[data-test-target="restaurant-detail-overview"]').find('span, div').each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      if (text.length > 3 && text.length < 50) {
        Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
          if (keywords.some(keyword => text.includes(keyword))) {
            if (!cuisines.includes(cuisineType)) {
              cuisines.push(cuisineType);
              console.log(`✅ Cucina trovata (fallback): ${cuisineType}`);
            }
          }
        });
      }
    });

    // Cerca in breadcrumbs
    $('.breadcrumbs, [role="navigation"]').find('span, a').each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
        if (keywords.some(keyword => text.includes(keyword))) {
          if (!cuisines.includes(cuisineType)) {
            cuisines.push(cuisineType);
            console.log(`✅ Cucina trovata (breadcrumb): ${cuisineType}`);
          }
        }
      });
    });
  }

  // Default se non trova nulla
  if (cuisines.length === 0) {
    console.log('⚠️ Nessuna cucina trovata, usando default');
    cuisines.push('italiana');
  }
  
  console.log(`🍽️ Cucine finali: [${cuisines.join(', ')}]`);

  // Extract description con fallback
  let description = $('.biGQs._P.pZUbB.avBIb.KxBGd').first().text().trim();
  if (!description) description = $('.biGQs._P.pZUbB.hmDzD').first().text().trim();
  if (!description) description = $('[data-test-target="restaurant-detail-overview"] p').first().text().trim();
  if (!description) description = "Authentic restaurant serving local specialties";
  
  // Limita lunghezza descrizione
  if (description.length > 300) {
    description = description.substring(0, 297) + '...';
  }
  
  console.log(`📝 Descrizione: "${description.substring(0, 50)}..."`);

  // Extract address con miglioramenti
  let address = $('.biGQs._P.fiohW.fOtGX').first().text().trim();
  if (!address) address = $('.AYHFM').first().text().trim();
  if (!address) address = $('[data-test-target="location-detail"] span').first().text().trim();
  if (!address) address = "Salento, Puglia";
  
  console.log(`🏠 Indirizzo: "${address}"`);

  // Extract coordinates e location
  let latitude = "40.3515";
  let longitude = "18.1750";
  let location = "Salento";

  // Cerca link di Google Maps con pattern migliorati
  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && (href.includes('maps.google.com') || href.includes('goo.gl/maps') || href.includes('maps.app.goo.gl'))) {
      console.log(`🗺️ Link mappa trovato: ${href.substring(0, 100)}...`);
      
      const coordMatch = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        latitude = coordMatch[1];
        longitude = coordMatch[2];
        console.log(`📍 Coordinate estratte: ${latitude}, ${longitude}`);
      }
      
      // Extract location
      const addressMatch = href.match(/daddr=([^@&]+)/);
      if (addressMatch) {
        const addressParts = decodeURIComponent(addressMatch[1]).split(',');
        if (addressParts.length > 1) {
          location = addressParts[addressParts.length - 2].trim();
        }
      }
    }
  });

  // Fallback location dall'indirizzo
  if (location === "Salento" && address) {
    const addressParts = address.split(',');
    if (addressParts.length > 1) {
      location = addressParts[addressParts.length - 1].trim();
    }
  }
  
  console.log(`📍 Location finale: ${location}`);

  // Extract image URL con strategia migliorata
  let imageUrl = "";

  // Cerca immagini TripAdvisor
  $('picture img, img').each((i, elem) => {
    if (imageUrl) return;
    
    const img = $(elem);
    const src = img.attr('src');
    const srcset = img.attr('srcset');
    
    if (srcset && srcset.includes('tripadvisor.com/media/photo')) {
      const srcsetUrls = srcset.split(',').map(item => item.trim().split(' ')[0]);
      imageUrl = srcsetUrls[srcsetUrls.length - 1];
      console.log(`🖼️ Immagine trovata (srcset): ${imageUrl.substring(0, 80)}...`);
    } else if (src && src.includes('tripadvisor.com/media/photo')) {
      imageUrl = src;
      console.log(`🖼️ Immagine trovata (src): ${imageUrl.substring(0, 80)}...`);
    }
  });

  // Extract phone con pattern migliorati
  let phone = "";

  $('a[href^="tel:"]').each((i, elem) => {
    if (phone) return;
    
    const $link = $(elem);
    const phoneSpan = $link.find('span.biGQs._P.XWJSj.Wb');
    
    if (phoneSpan.length > 0) {
      const phoneText = phoneSpan.text().trim();
      console.log(`📞 Candidato telefono: "${phoneText}"`);
      
      // Validazione telefono italiano o internazionale
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
  return DEFAULT_USER_AGENTS[Math.floor(Math.random() * DEFAULT_USER_AGENTS.length)];
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
        details: 'Il server ha rilevato una richiesta automatica e l\'ha bloccata',
        suggestion: 'Questo può accadere quando si effettuano troppe richieste. Prova a inserire i dati manualmente o riprova tra qualche minuto.',
        processingTime
      };
    }
    
    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Troppe richieste inviate (429 Rate Limited)',
        details: 'Il server ha temporaneamente limitato le richieste',
        suggestion: 'Attendi qualche minuto prima di riprovare.',
        processingTime
      };
    }
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Timeout della richiesta',
        details: 'La pagina ha impiegato troppo tempo a rispondere',
        suggestion: 'La connessione è lenta o il server è sovraccarico. Riprova.',
        processingTime
      };
    }

    if (error.response != undefined && error.response?.status >= 500) {
      return {
        success: false,
        error: 'Errore del server TripAdvisor',
        details: `Server ha restituito ${error.response.status}`,
        suggestion: 'TripAdvisor potrebbe avere problemi tecnici. Riprova più tardi.',
        processingTime
      };
    }
  }

  return {
    success: false,
    error: 'Errore durante il scraping',
    details: error.message,
    suggestion: 'Verifica che l\'URL sia corretto e riprova. Se il problema persiste, inserisci i dati manualmente.',
    processingTime
  };
}