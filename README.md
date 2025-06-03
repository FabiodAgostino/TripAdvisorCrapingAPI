# 🍽️ Salento Scraping API

API Serverless per l'estrazione di dati ristoranti da TripAdvisor, ottimizzata per la regione del Salento.

## 🚀 Features

- ✅ Scraping intelligente con retry automatico
- ✅ Estrazione di tutti i dati principali del ristorante
- ✅ API REST con documentazione integrata
- ✅ Health check e monitoring
- ✅ Gestione errori avanzata
- ✅ CORS configurato per uso frontend
- ✅ TypeScript completo
- ✅ Deploy serverless su Vercel

## 📋 Endpoints

### POST /api/scrape
Estrae dati di un ristorante da TripAdvisor

**Request:**
```json
{
  "url": "https://www.tripadvisor.it/Restaurant_Review-...",
  "options": {
    "timeout": 8000,
    "retries": 1
  }
}