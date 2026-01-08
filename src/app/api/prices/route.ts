import { NextRequest, NextResponse } from 'next/server';
import { PriceResult } from '@/types';

async function fetchPoromagia(cardName: string): Promise<PriceResult> {
  const baseResult: PriceResult = {
    store: 'poromagia',
    storeName: 'Poromagia',
    storeUrl: 'https://poromagia.fi',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: null,
  };

  try {
    const searchUrl = `https://poromagia.fi/search_result?q=${encodeURIComponent(cardName)}`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Look for product with matching name and extract price
    // Poromagia uses a product grid with prices
    const normalizedCardName = cardName.toLowerCase().trim();

    // Look for price patterns
    const priceMatches = html.match(/(\d+[,.]\d{2})\s*€/g);

    // Check if the card name appears in the results
    if (html.toLowerCase().includes(normalizedCardName) || html.toLowerCase().includes(normalizedCardName.split(' ')[0])) {
      if (priceMatches && priceMatches.length > 0) {
        // Get the first price found (usually the most relevant)
        const firstPrice = priceMatches[0].replace('€', '').trim().replace(',', '.');
        baseResult.price = firstPrice;
        baseResult.availability = 'in_stock';
      } else {
        baseResult.availability = 'unknown';
      }
    } else {
      // No matching card found
      baseResult.availability = 'out_of_stock';
    }

    return baseResult;
  } catch (error) {
    console.error('Poromagia fetch error:', error);
    return {
      ...baseResult,
      error: error instanceof Error ? error.message : 'Failed to fetch',
    };
  }
}

async function fetchBasaari(cardName: string): Promise<PriceResult> {
  const baseResult: PriceResult = {
    store: 'basaari',
    storeName: 'Basaari',
    storeUrl: 'https://basaari.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: null,
  };

  try {
    const searchUrl = `https://basaari.com/search?q=${encodeURIComponent(cardName)}`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const normalizedCardName = cardName.toLowerCase().trim();

    // Look for price patterns - Basaari format
    const priceMatches = html.match(/(\d+[,.]\d{2})\s*€/g);

    if (html.toLowerCase().includes(normalizedCardName) || html.toLowerCase().includes(normalizedCardName.split(' ')[0])) {
      if (priceMatches && priceMatches.length > 0) {
        const firstPrice = priceMatches[0].replace('€', '').trim().replace(',', '.');
        baseResult.price = firstPrice;
        baseResult.availability = 'in_stock';
      } else {
        baseResult.availability = 'unknown';
      }
    } else {
      baseResult.availability = 'out_of_stock';
    }

    return baseResult;
  } catch (error) {
    console.error('Basaari fetch error:', error);
    return {
      ...baseResult,
      error: error instanceof Error ? error.message : 'Failed to fetch',
    };
  }
}

async function fetchCardmarket(cardName: string): Promise<PriceResult> {
  const baseResult: PriceResult = {
    store: 'cardmarket',
    storeName: 'Cardmarket',
    storeUrl: 'https://www.cardmarket.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: null,
  };

  try {
    // Cardmarket search URL - search specifically in Magic singles
    const searchUrl = `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(cardName)}`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const normalizedCardName = cardName.toLowerCase().trim();

    // Cardmarket shows prices in format like "0,15 €" or "From 0,15 €"
    // Look for "From X,XX €" pattern which indicates the lowest price
    const fromPriceMatch = html.match(/From\s+(\d+[,.]\d{2})\s*€/i);
    const directPriceMatch = html.match(/(\d+[,.]\d{2})\s*€/);

    if (html.toLowerCase().includes(normalizedCardName) || html.toLowerCase().includes(normalizedCardName.split(' ')[0])) {
      const priceMatch = fromPriceMatch || directPriceMatch;
      if (priceMatch) {
        const price = priceMatch[1].replace(',', '.');
        baseResult.price = price;
        baseResult.availability = 'in_stock';
      } else {
        baseResult.availability = 'unknown';
      }
    } else {
      baseResult.availability = 'out_of_stock';
    }

    return baseResult;
  } catch (error) {
    console.error('Cardmarket fetch error:', error);
    return {
      ...baseResult,
      error: error instanceof Error ? error.message : 'Failed to fetch',
    };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cardName = searchParams.get('card');

  if (!cardName) {
    return NextResponse.json({ error: 'Card name is required' }, { status: 400 });
  }

  // Fetch prices from all stores in parallel
  const [poromagia, basaari, cardmarket] = await Promise.all([
    fetchPoromagia(cardName),
    fetchBasaari(cardName),
    fetchCardmarket(cardName),
  ]);

  return NextResponse.json({
    cardName,
    results: [poromagia, basaari, cardmarket],
  });
}
