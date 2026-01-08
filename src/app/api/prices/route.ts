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

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[Poromagia] HTTP ${response.status}`);
      return baseResult;
    }

    const html = await response.text();
    console.log(`[Poromagia] Got ${html.length} bytes`);

    // Method 1: Look for Decimal prices in the ecommerce data
    const decimalPrices: number[] = [];
    const decimalRegex = /Decimal\('([0-9]+\.[0-9]+)'\)/g;
    let match;
    while ((match = decimalRegex.exec(html)) !== null) {
      decimalPrices.push(parseFloat(match[1]));
    }
    console.log(`[Poromagia] Found ${decimalPrices.length} Decimal prices`);

    // Method 2: Look for euro prices like €X.XX or X,XX €
    const euroMatches = html.match(/(\d+)[,.](\d{2})\s*€|€\s*(\d+)[,.](\d{2})/g) || [];
    const euroPrices = euroMatches.map(p => {
      const cleaned = p.replace('€', '').replace(',', '.').trim();
      return parseFloat(cleaned);
    }).filter(p => !isNaN(p) && p > 0);
    console.log(`[Poromagia] Found ${euroPrices.length} euro prices`);

    // Combine all prices and filter reasonable card prices (0.10 to 5000)
    const allPrices = [...decimalPrices, ...euroPrices]
      .filter(p => p >= 0.10 && p <= 5000);

    if (allPrices.length > 0) {
      // Get the lowest price (most likely the cheapest version)
      const lowestPrice = Math.min(...allPrices);
      baseResult.price = lowestPrice.toFixed(2);
      baseResult.availability = 'in_stock';
      console.log(`[Poromagia] Lowest price: €${lowestPrice.toFixed(2)}`);
    }

    return baseResult;
  } catch (error) {
    console.error('[Poromagia] Error:', error);
    return baseResult;
  }
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

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[Basaari] HTTP ${response.status}`);
      return baseResult;
    }

    const html = await response.text();
    console.log(`[Basaari] Got ${html.length} bytes`);

    // Method 1: Look for JSON price patterns like "price":1.23
    const jsonPriceRegex = /"price"\s*:\s*(\d+\.?\d*)/g;
    const jsonPrices: number[] = [];
    let match;
    while ((match = jsonPriceRegex.exec(html)) !== null) {
      const price = parseFloat(match[1]);
      if (price > 0) jsonPrices.push(price);
    }
    console.log(`[Basaari] Found ${jsonPrices.length} JSON prices`);

    // Method 2: Look for euro prices
    const euroMatches = html.match(/(\d+)[,.](\d{2})\s*€|€\s*(\d+)[,.](\d{2})/g) || [];
    const euroPrices = euroMatches.map(p => {
      const cleaned = p.replace('€', '').replace(',', '.').trim();
      return parseFloat(cleaned);
    }).filter(p => !isNaN(p) && p > 0);
    console.log(`[Basaari] Found ${euroPrices.length} euro prices`);

    // Combine and filter
    const allPrices = [...jsonPrices, ...euroPrices]
      .filter(p => p >= 0.05 && p <= 5000);

    if (allPrices.length > 0) {
      const lowestPrice = Math.min(...allPrices);
      baseResult.price = lowestPrice.toFixed(2);
      baseResult.availability = 'in_stock';
      console.log(`[Basaari] Lowest price: €${lowestPrice.toFixed(2)}`);
    }

    return baseResult;
  } catch (error) {
    console.error('[Basaari] Error:', error);
    return baseResult;
  }
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
