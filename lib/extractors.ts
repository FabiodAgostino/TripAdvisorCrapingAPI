// lib/extractors.ts
import * as cheerio from 'cheerio';

export function extractName($: cheerio.CheerioAPI): string {
  const selectors = [
    '.biGQs._P.hzzSG.rRtyp',
    'h1[data-automation="restaurant-detail-name"]',
    'h1.ui_header',
    '.HjBfq',
    'h1'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 2 && !text.toLowerCase().includes('tripadvisor')) {
      return text;
    }
  }
  return "Ristorante";
}

export function extractRating($: cheerio.CheerioAPI): string {
  const selectors = [
    '.biGQs._P.pZUbB.KxBGd',
    '[data-automation="rating"]',
    '.ZDEqb',
    '.overallRating'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    const ratingMatch = text.match(/(\d+[.,]\d+|\d+)/);
    if (ratingMatch) {
      return ratingMatch[1].replace(',', '.');
    }
  }
  return "4.0";
}

export function extractPriceRange($: cheerio.CheerioAPI): string {
  let priceRange = "€€";
  
  const priceSelectors = [
    '.biGQs._P.pZUbB.KxBGd',
    '.dlMOJ',
    '[data-automation="price-range"]'
  ];
  
  priceSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('€€€€')) {
        priceRange = "€€€€";
        return false;
      } else if (text.includes('€€€')) {
        priceRange = "€€€";
      } else if (text.includes('€€')) {
        priceRange = "€€";
      } else if (text.includes('€') && !text.includes('€€')) {
        priceRange = "€";
      }
    });
  });
  
  return priceRange;
}

export function extractCuisines($: cheerio.CheerioAPI): string[] {
  const cuisines: string[] = [];
  const cuisineMapping: Record<string, string[]> = {
    'pugliese': ['pugliese', 'apulian', 'puglia', 'salentina', 'salento'],
    'italiana': ['italiana', 'italian', 'italy'],
    'mediterranea': ['mediterranea', 'mediterranean'],
    'pesce': ['pesce', 'seafood', 'fish', 'mare', 'frutti di mare'],
    'barbecue': ['barbecue', 'grill', 'griglia', 'bbq', 'braceria'],
    'steakhouse': ['steakhouse', 'steak', 'bistecca', 'carne']
  };

  const searchAreas = [
    '.biGQs._P.pZUbB.KxBGd',
    '[data-test-target="restaurant-detail-overview"] span',
    '.breadcrumbs span, .breadcrumbs a',
    '.cuisine-type'
  ];

  searchAreas.forEach(area => {
    $(area).each((i, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      
      Object.entries(cuisineMapping).forEach(([cuisineType, keywords]) => {
        if (keywords.some(keyword => text.includes(keyword))) {
          if (!cuisines.includes(cuisineType)) {
            cuisines.push(cuisineType);
          }
        }
      });
    });
  });

  return cuisines.length > 0 ? cuisines : ['italiana'];
}

export function extractDescription($: cheerio.CheerioAPI): string {
  const selectors = [
    '.biGQs._P.pZUbB.avBIb.KxBGd',
    '.biGQs._P.pZUbB.hmDzD',
    '[data-automation="restaurant-detail-description"]',
    '.restaurants-detail-overview-cards-LocationOverviewCard__section--description'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 20) {
      return text;
    }
  }
  return "Autentico ristorante che serve specialità locali";
}

export function extractAddress($: cheerio.CheerioAPI): string {
  const selectors = [
    '.biGQs._P.fiohW.fOtGX',
    '.AYHFM',
    '[data-automation="restaurant-detail-address"]',
    '.restaurants-detail-overview-cards-LocationOverviewCard__address'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 5) {
      return text;
    }
  }
  return "Salento, Puglia";
}

export function extractCoordinates($: cheerio.CheerioAPI): {
  latitude: string;
  longitude: string;
  location: string;
} {
  let latitude = "40.3515";
  let longitude = "18.1750";
  let location = "Salento";

  // Cerca nei link di Google Maps
  $('a[href*="maps.google"], a[href*="goo.gl/maps"]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href) {
      const coordMatch = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        latitude = coordMatch[1];
        longitude = coordMatch[2];
      }
      
      const addressMatch = href.match(/daddr=([^@&]+)/);
      if (addressMatch) {
        const addressParts = decodeURIComponent(addressMatch[1]).split(',');
        if (addressParts.length > 1) {
          location = addressParts[addressParts.length - 2].trim();
        }
      }
    }
  });

  return { latitude, longitude, location };
}

export function extractPhone($: cheerio.CheerioAPI): string | undefined {
  const phoneSelectors = [
    '.biGQs._P.pZUbB.KxBGd',
    '[data-automation="restaurant-phone"]',
    '.phone-number'
  ];
  
  let phone: string | undefined;
  
  for (const selector of phoneSelectors) {
    $(selector).each((i, elem) => {
      const text = $(elem).text().trim();
      const phoneMatch = text.match(/(\+39\s?)?(\d{2,4}\s?\d{6,8}|\d{3}\s?\d{3}\s?\d{4})/);
      if (phoneMatch && !phone) {
        phone = phoneMatch[0];
        return false; // Interrompe il loop .each()
      }
    });
    
    // Se abbiamo trovato il telefono, esci dal loop principale
    if (phone) break;
  }
  
  return phone;
}

export function extractImageUrl($: cheerio.CheerioAPI): string | undefined {
  const imageSelectors = [
    'picture img[src*="tripadvisor.com/media/photo"]',
    'img[src*="tripadvisor.com/media/photo"]',
    '.photo img'
  ];
  
  for (const selector of imageSelectors) {
    const img = $(selector).first();
    const src = img.attr('src');
    const srcset = img.attr('srcset');
    
    if (srcset && srcset.includes('tripadvisor.com/media/photo')) {
      const srcsetUrls = srcset.split(',').map(item => item.trim().split(' ')[0]);
      return srcsetUrls[srcsetUrls.length - 1];
    } else if (src && src.includes('tripadvisor.com/media/photo')) {
      return src;
    }
  }
  return undefined;
}