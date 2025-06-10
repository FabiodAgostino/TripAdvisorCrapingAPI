// api/get-config.ts
import { VercelRequest, VercelResponse } from '@vercel/node';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface GetConfigResponse {
  success: boolean;
  firebaseConfig?: FirebaseConfig;
  error?: string;
  timestamp: string;
  version: string;
}

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret');
  
  console.log(`📡 ${req.method} /api/get-config`);

  // Gestione preflight
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    const response: GetConfigResponse = {
      success: false,
      error: 'Method not allowed. Use POST.',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(405).json(response);
    return;
  }

  try {
    // Verifica secret key
    const providedSecret = req.headers['x-secret'] as string;
    const expectedSecret = process.env.CONFIG_SECRET_KEY || process.env.API_SECRET_KEY; // Fallback
    
    if (!providedSecret) {
      const response: GetConfigResponse = {
        success: false,
        error: 'Secret key richiesta nell\'header X-Secret',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(400).json(response);
      return;
    }

    if (providedSecret !== expectedSecret) {
      console.log('🚫 Invalid secret key provided');
      const response: GetConfigResponse = {
        success: false,
        error: 'Secret key non valida',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };
      res.status(401).json(response);
      return;
    }

    // Secret valida - restituisci configurazione Firebase
    console.log('✅ Valid secret key, returning Firebase config');
    
    const firebaseConfig: FirebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || "",
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.VITE_FIREBASE_APP_ID || ''
    };

    const response: GetConfigResponse = {
      success: true,
      firebaseConfig: firebaseConfig,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    res.status(200).json(response);

  } catch (error: any) {
    console.error('❌ Error in get-config:', error.message);

    const response: GetConfigResponse = {
      success: false,
      error: 'Errore interno del server',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    res.status(500).json(response);
  }
}