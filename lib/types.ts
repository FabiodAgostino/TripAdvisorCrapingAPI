// lib/types.ts
export interface ScrapingRequest {
  url: string;
  options?: ScrapingOptions;
}

export interface ScrapingOptions {
  timeout?: number;
  retries?: number;
  userAgent?: string;
}

export interface ExtractedRestaurant {
  name: string;
  rating: string;
  priceRange: string;
  cuisine: string;
  cuisines?: string[];
  description: string;
  address: string;
  location: string;
  latitude: string;
  longitude: string;
  phone?: string;
  imageUrl?: string;
  hours?: string;
  extractedAt: string;
  sourceUrl: string;
}

export interface ScrapingResponse {
  success: boolean;
  data?: ExtractedRestaurant;
  error?: string;
  details?: string;
  suggestion?: string;
  processingTime?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  version: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    scraping: 'operational' | 'degraded' | 'down';
    external_apis: 'operational' | 'degraded' | 'down';
  };
}