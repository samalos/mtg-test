import { NextRequest, NextResponse } from 'next/server';
import { PriceResult } from '@/types';

interface ScryfallCard {
  name: string;
  prices: {
    eur: string | null;
    eur_foil: string | null;
    usd: string | null;
    usd_foil: string | null;
  };
  purchase_uris: {
    cardmarket: string;
  };
  scryfall_uri: string;
}

async function fetchFromScryfall(cardName: string): Promise<ScryfallCard | null> {
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Scryfall fetch error:', error);
    return null;
  }
}

// Helper to try fetching with proxy fallback
async function fetchWithProxy(url: string, timeout = 15000): Promise<string | null> {
  const urls = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const fetchUrl of urls) {
    try {
      const isProxy = fetchUrl !== url;
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      });

      if (response.ok) {
        const html = await response.text();
        console.log(`[Fetch] Got ${html.length} bytes from ${isProxy ? 'proxy' : 'direct'}: ${url.split('?')[0]}`);
        if (html.length > 1000) return html; // Ensure we got real content
      } else {
        console.error(`[Fetch] HTTP ${response.status} from ${isProxy ? 'proxy' : 'direct'}`);
      }
    } catch (error) {
      const isProxy = fetchUrl !== url;
      console.error(`[Fetch] Error (${isProxy ? 'proxy' : 'direct'}):`, (error as Error).message);
    }
  }
  return null;
}

function extractPricesFromHtml(html: string): number[] {
  const prices: number[] = [];

  // Method 1: Decimal('X.XX') patterns from ecommerce tracking
  const decimalRegex = /Decimal\('([0-9]+\.[0-9]+)'\)/g;
  let match;
  while ((match = decimalRegex.exec(html)) !== null) {
    prices.push(parseFloat(match[1]));
  }

  // Method 2: Euro prices €X.XX or X,XX €
  const euroMatches = html.match(/(\d+)[,.](\d{2})\s*€|€\s*(\d+)[,.](\d{2})/g) || [];
  for (const p of euroMatches) {
    const cleaned = p.replace('€', '').replace(',', '.').trim();
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) prices.push(val);
  }

  // Method 3: JSON "price":X.XX patterns
  const jsonRegex = /"price"\s*:\s*(\d+\.?\d*)/g;
  while ((match = jsonRegex.exec(html)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0) prices.push(val);
  }

  // Filter reasonable card prices
  return prices.filter(p => p >= 0.05 && p <= 5000);
}

async function fetchPoromagiaPrice(cardName: string): Promise<PriceResult> {
  const searchUrl = `https://poromagia.com/en/search/?q=${encodeURIComponent(cardName)}`;
  const baseResult: PriceResult = {
    store: 'poromagia',
    storeName: 'Poromagia',
    storeUrl: 'https://poromagia.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: searchUrl,
  };

  const html = await fetchWithProxy(searchUrl);
  if (!html) return baseResult;

  const prices = extractPricesFromHtml(html);
  console.log(`[Poromagia] Found ${prices.length} total prices`);

  if (prices.length > 0) {
    const lowestPrice = Math.min(...prices);
    baseResult.price = lowestPrice.toFixed(2);
    baseResult.availability = 'in_stock';
    console.log(`[Poromagia] Lowest: €${lowestPrice.toFixed(2)}`);
  }

  return baseResult;
}

async function fetchBasaariPrice(cardName: string): Promise<PriceResult> {
  const searchUrl = `https://basaari.com/?searchTerm=${encodeURIComponent(cardName)}`;
  const baseResult: PriceResult = {
    store: 'basaari',
    storeName: 'Basaari',
    storeUrl: 'https://basaari.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: searchUrl,
  };

  const html = await fetchWithProxy(searchUrl);
  if (!html) return baseResult;

  const prices = extractPricesFromHtml(html);
  console.log(`[Basaari] Found ${prices.length} total prices`);

  if (prices.length > 0) {
    const lowestPrice = Math.min(...prices);
    baseResult.price = lowestPrice.toFixed(2);
    baseResult.availability = 'in_stock';
    console.log(`[Basaari] Lowest: €${lowestPrice.toFixed(2)}`);
  }

  return baseResult;
}

function getCardmarketResult(cardName: string, scryfallData: ScryfallCard | null): PriceResult {
  const baseResult: PriceResult = {
    store: 'cardmarket',
    storeName: 'Cardmarket',
    storeUrl: 'https://www.cardmarket.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: null,
  };

  if (scryfallData) {
    if (scryfallData.prices.eur) {
      baseResult.price = scryfallData.prices.eur;
      baseResult.availability = 'in_stock';
    }
    baseResult.link = scryfallData.purchase_uris.cardmarket;
  } else {
    baseResult.link = `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(cardName)}`;
  }

  return baseResult;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cardName = searchParams.get('card');

  if (!cardName) {
    return NextResponse.json({ error: 'Card name is required' }, { status: 400 });
  }

  const [scryfallData, poromagiaResult, basaariResult] = await Promise.all([
    fetchFromScryfall(cardName),
    fetchPoromagiaPrice(cardName),
    fetchBasaariPrice(cardName),
  ]);

  const results: PriceResult[] = [
    getCardmarketResult(cardName, scryfallData),
    poromagiaResult,
    basaariResult,
  ];

  if (scryfallData && scryfallData.prices.usd) {
    results.push({
      store: 'scryfall',
      storeName: 'TCGPlayer (USD)',
      storeUrl: 'https://scryfall.com',
      price: scryfallData.prices.usd,
      currency: 'USD',
      availability: 'in_stock',
      link: scryfallData.scryfall_uri,
    });
  }

  return NextResponse.json({
    cardName: scryfallData?.name || cardName,
    results,
  });
}
