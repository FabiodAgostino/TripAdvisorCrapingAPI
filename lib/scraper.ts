// lib/scraper.ts
import puppeteer, { Browser, Page } from 'puppeteer';
import { 
  ExtractedRestaurant, 
  ScrapingOptions, 
  ScrapingResponse 
} from './types';

// Browser globale per riutilizzo (se possibile in Vercel)
let globalBrowser: Browser | null = null;

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

    // Configurazione opzioni - timeout ridotti per Vercel
    const {
      timeout = 7000,  // Ridotto per Vercel Hobby
      retries = 1,     // Solo 1 retry per risparmiare tempo
      userAgent
    } = options;

    console.log(`🔍 Iniziando scraping con Puppeteer: ${trimmedUrl}`);

    let lastError: Error | null = null;
    
    // Retry logic con strategie diverse
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Tentativo ${attempt + 1}/${retries + 1}`);
        
        const html = await scrapeWithPuppeteer(trimmedUrl, {
          timeout,
          userAgent: userAgent || getRandomUserAgent(),
          attempt
        });

        // Verifica se la richiesta è stata bloccata
        const blockCheck = checkIfBlocked(html);
        if (!blockCheck.success) {
          console.log(`🚫 Tentativo ${attempt + 1} bloccato: ${blockCheck.reason}`);
          
          if (attempt < retries) {
            // Delay più lungo tra tentativi quando bloccato
            await randomDelay(2000, 4000);
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
        const extractedData = await extractDataFromHTML(html, trimmedUrl);
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
          await randomDelay(1000 * (attempt + 1), 2000 * (attempt + 1));
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

async function scrapeWithPuppeteer(url: string, options: {
  timeout: number;
  userAgent: string;
  attempt: number;
}): Promise<string> {
  
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    console.log(`🚀 Launching Puppeteer for attempt ${options.attempt + 1}`);
    
    // Configurazione browser super ottimizzata
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Importante per Vercel
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-background-networking',
        '--disable-background-media-streaming',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-web-security',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain',
        // Performance optimizations
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--disable-images', // Skip images for speed
        '--disable-javascript', // Skip JS if not needed for content
        '--disable-css', // Skip CSS loading
        '--disable-plugins',
        '--disable-extensions'
      ],
      timeout: 8000, // Timeout per launch
      protocolTimeout: 8000,
      ignoreDefaultArgs: ['--disable-extensions'],
      defaultViewport: {
        width: 1366,
        height: 768,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      }
    };

    // Cerca di riutilizzare browser globale se disponibile
    if (globalBrowser && globalBrowser.isConnected()) {
      console.log('🔄 Riutilizzo browser esistente');
      browser = globalBrowser;
    } else {
      console.log('🆕 Creazione nuovo browser');
      browser = await puppeteer.launch(launchOptions);
      globalBrowser = browser;
    }

    page = await browser.newPage();
    
    // Configurazione page ottimizzata
    await page.setUserAgent(options.userAgent);
    
    // Set extra headers per sembrare più umano
    const extraHeaders: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
    if (options.attempt === 1) {
      extraHeaders['Referer'] = 'https://www.google.it/';
    } else if (options.attempt === 2) {
      extraHeaders['Referer'] = 'https://www.tripadvisor.it/';
      extraHeaders['Accept-Language'] = 'en-US,en;q=0.9,it;q=0.8';
    }

    await page.setExtraHTTPHeaders(extraHeaders);

    // Disabilita immagini, CSS e JS per velocità
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else if (resourceType === 'script') {
        // Blocca JS non essenziali ma permetti quelli che potrebbero caricare il contenuto
        const url = req.url();
        if (url.includes('analytics') || url.includes('ads') || url.includes('tracking')) {
          req.abort();
        } else {
          req.continue();
        }
      } else {
        req.continue();
      }
    });

    console.log(`📤 Navigating to: ${url}`);
    
    // Navigazione con timeout aggressivo
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Non aspettare tutte le risorse
      timeout: options.timeout
    });

    // Simula comportamento umano con scroll veloce
    await page.evaluate(() => {
      (globalThis as any).scrollTo(0, Math.floor(Math.random() * 500));
    });

    // Attesa minima per caricamento contenuto
    await new Promise(resolve => setTimeout(resolve, 500));

    // Estrai HTML
    console.log('📄 Extracting HTML content');
    const html = await page.content();
    
    console.log(`✅ HTML estratto: ${html.length} caratteri`);
    return html;

  } catch (error) {
    console.error('❌ Errore Puppeteer:', error);
    throw error;
  } finally {
    // Chiudi solo la page, non il browser (per riutilizzo)
    if (page) {
      try {
        await page.close();
        console.log('📄 Page chiusa');
      } catch (e) {
        console.log('⚠️ Errore chiusura page:', e);
      }
    }
    
    // NON chiudere il browser globale per riutilizzo
    // Il browser sarà chiuso automaticamente quando il processo termina
  }
}

function checkIfBlocked(html: string): { success: boolean; reason?: string } {
  // Controlla lunghezza HTML (pagine bloccate sono spesso molto corte)
  if (html.length < 5000) {
    return { 
      success: false, 
      reason: `Pagina troppo corta (${html.length} caratteri) - possibile blocco` 
    };
  }

  // Usa API DOM invece di Cheerio per velocità
  const lowerHtml = html.toLowerCase();
  
  // Controlla title della pagina
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : '';
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
  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerHtml.includes(pattern)) {
      return { 
        success: false, 
        reason: `Contenuto pagina contiene "${pattern}"` 
      };
    }
  }

  // Controlla se contiene elementi tipici di TripAdvisor
  const hasRestaurantElements = lowerHtml.includes('biGQs') || 
                               lowerHtml.includes('<h1') || 
                               lowerHtml.includes('hjbfq') ||
                               lowerHtml.includes('tripadvisor');
  
  if (!hasRestaurantElements) {
    return { 
      success: false, 
      reason: 'Pagina non contiene elementi tipici di TripAdvisor - possibile blocco' 
    };
  }

  // Controlla presence di CAPTCHA o form di verifica
  if (lowerHtml.includes('captcha') || 
      lowerHtml.includes('verification') ||
      lowerHtml.includes('challenge')) {
    return { 
      success: false, 
      reason: 'CAPTCHA rilevato nella pagina' 
    };
  }

  console.log('✅ Pagina sembra legittima');
  return { success: true };
}

async function extractDataFromHTML(html: string, sourceUrl: string): Promise<ExtractedRestaurant> {
  // Usa regex invece di Cheerio per velocità quando possibile
  console.log(`🔍 Inizio estrazione dati da HTML (${html.length} caratteri)`);

  // Extract restaurant name con regex prima, poi fallback
  let name = extractWithRegex(html, /<[^>]*class="[^"]*biGQs[^"]*_P[^"]*hzzSG[^"]*rRtyp[^"]*"[^>]*>([^<]+)</) ||
             extractWithRegex(html, /<h1[^>]*>([^<]+)<\/h1>/) ||
             extractWithRegex(html, /<[^>]*class="[^"]*HjBfq[^"]*"[^>]*>([^<]+)</) ||
             "Ristorante";
  
  name = cleanText(name);
  console.log(`🏪 Nome estratto: "${name}"`);

  // Extract rating con regex
  const ratingText = extractWithRegex(html, /<[^>]*class="[^"]*biGQs[^"]*_P[^"]*pZUbB[^"]*KxBGd[^"]*"[^>]*>([^<]*\d+\.?\d*[^<]*)</) || "4.0";
  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
  let rating = ratingMatch ? ratingMatch[1] : "4.0";
  
  // Validazione rating
  const numRating = parseFloat(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    rating = "4.0";
  }
  
  console.log(`⭐ Rating estratto: ${rating}`);

  // Extract price range con ricerca nel testo
  let priceRange = "€€";
  if (html.includes('€€€€')) {
    priceRange = "€€€€";
  } else if (html.includes('€€€')) {
    priceRange = "€€€";
  } else if (html.includes('€€')) {
    priceRange = "€€";
  } else if (html.includes('€') && !html.includes('€€')) {
    priceRange = "€";
  }
  
  console.log(`💰 Fascia prezzo: ${priceRange}`);

  // Extract cuisines con regex veloce
  const cuisines: string[] = [];
  const cuisineMapping = {
    'pugliese': ['pugliese', 'apulian', 'puglia', 'salentina', 'salento', 'tipica pugliese', 'regional italian'],
    'italiana': ['italiana', 'italian', 'italy', 'tradizionale italiana', 'regional'],
    'mediterranea': ['mediterranea', 'mediterranean', 'mediter'],
    'pesce': ['pesce', 'seafood', 'fish', 'mare', 'frutti di mare', 'crudo', 'raw'],
    'barbecue': ['barbecue', 'grill', 'griglia', 'alla griglia', 'bbq', 'braceria'],
    'steakhouse': ['steakhouse', 'steak', 'bistecca', 'carne', 'beef', 'braceria', 'meat']
  };

  const lowerHtml = html.toLowerCase();
  
  Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
    if (keywords.some(keyword => lowerHtml.includes(keyword.toLowerCase()))) {
      if (!cuisines.includes(cuisineType)) {
        cuisines.push(cuisineType);
        console.log(`✅ Cucina trovata: ${cuisineType}`);
      }
    }
  });

  // Default se non trova nulla
  if (cuisines.length === 0) {
    console.log('⚠️ Nessuna cucina trovata, usando default');
    cuisines.push('italiana');
  }
  
  console.log(`🍽️ Cucine finali: [${cuisines.join(', ')}]`);

  // Extract description con regex
  let description = extractWithRegex(html, /<[^>]*class="[^"]*biGQs[^"]*_P[^"]*pZUbB[^"]*avBIb[^"]*KxBGd[^"]*"[^>]*>([^<]+)</) ||
                   extractWithRegex(html, /<[^>]*class="[^"]*biGQs[^"]*_P[^"]*pZUbB[^"]*hmDzD[^"]*"[^>]*>([^<]+)</) ||
                   extractWithRegex(html, /<p[^>]*>([^<]{50,})<\/p>/) ||
                   "Authentic restaurant serving local specialties";
  
  description = cleanText(description);
  
  // Limita lunghezza descrizione
  if (description.length > 300) {
    description = description.substring(0, 297) + '...';
  }
  
  console.log(`📝 Descrizione: "${description.substring(0, 50)}..."`);

  // Extract address con regex
  let address = extractWithRegex(html, /<[^>]*class="[^"]*biGQs[^"]*_P[^"]*fiohW[^"]*fOtGX[^"]*"[^>]*>([^<]+)</) ||
               extractWithRegex(html, /<[^>]*class="[^"]*AYHFM[^"]*"[^>]*>([^<]+)</) ||
               "Salento, Puglia";
  
  address = cleanText(address);
  console.log(`🏠 Indirizzo: "${address}"`);

  // Extract coordinates e location
  let latitude = "40.3515";
  let longitude = "18.1750";
  let location = "Salento";

  // Cerca link di Google Maps con regex
  const mapLinkMatch = html.match(/href="[^"]*(?:maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl)[^"]*"/gi);
  if (mapLinkMatch) {
    const mapUrl = mapLinkMatch[0];
    console.log(`🗺️ Link mappa trovato`);
    
    const coordMatch = mapUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) {
      latitude = coordMatch[1];
      longitude = coordMatch[2];
      console.log(`📍 Coordinate estratte: ${latitude}, ${longitude}`);
    }
  }

  // Fallback location dall'indirizzo
  if (location === "Salento" && address) {
    const addressParts = address.split(',');
    if (addressParts.length > 1) {
      location = addressParts[addressParts.length - 1].trim();
    }
  }
  
  console.log(`📍 Location finale: ${location}`);

  // Extract image URL con regex
  let imageUrl = "";
  const imgMatch = html.match(/(?:src|srcset)="[^"]*tripadvisor\.com\/media\/photo[^"]*"/i);
  if (imgMatch) {
    imageUrl = imgMatch[0].split('"')[1];
    console.log(`🖼️ Immagine trovata: ${imageUrl.substring(0, 80)}...`);
  }

  // Extract phone con regex
  let phone = "";
  const phoneMatch = html.match(/href="tel:([^"]+)"/);
  if (phoneMatch) {
    const phoneCandidate = phoneMatch[1];
    // Validazione telefono italiano o internazionale
    if (/(\+39\s?)?(\d{2,4}\s?\d{6,8}|\d{3}\s?\d{3}\s?\d{4})/.test(phoneCandidate)) {
      phone = phoneCandidate;
      console.log(`✅ Telefono estratto: ${phone}`);
    }
  }

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

// Helper functions
function extractWithRegex(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1] : null;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
  
  if (error.message.includes('TimeoutError') || error.message.includes('timeout')) {
    return {
      success: false,
      error: 'Timeout della richiesta Puppeteer',
      details: 'La pagina ha impiegato troppo tempo a caricare',
      suggestion: 'La connessione è lenta o il server è sovraccarico. Riprova con un timeout maggiore.',
      processingTime
    };
  }

  if (error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('net::')) {
    return {
      success: false,
      error: 'Errore di connessione',
      details: 'Impossibile raggiungere TripAdvisor',
      suggestion: 'Verifica la connessione internet e riprova.',
      processingTime
    };
  }

  if (error.message.includes('Navigation failed') || error.message.includes('net::ERR_FAILED')) {
    return {
      success: false,
      error: 'Navigazione fallita',
      details: 'TripAdvisor ha rifiutato la connessione',
      suggestion: 'Il sito potrebbe aver rilevato l\'automazione. Riprova più tardi.',
      processingTime
    };
  }

  return {
    success: false,
    error: 'Errore durante il scraping con Puppeteer',
    details: error.message,
    suggestion: 'Verifica che l\'URL sia corretto e riprova. Se il problema persiste, inserisci i dati manualmente.',
    processingTime
  };
}

// Cleanup function per chiudere il browser globale quando necessario
export async function cleanupBrowser(): Promise<void> {
  if (globalBrowser && globalBrowser.isConnected()) {
    try {
      await globalBrowser.close();
      globalBrowser = null;
      console.log('🧹 Browser globale chiuso');
    } catch (error) {
      console.log('⚠️ Errore chiusura browser:', error);
    }
  }
}