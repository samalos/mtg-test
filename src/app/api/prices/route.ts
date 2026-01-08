import { NextRequest, NextResponse } from 'next/server';
import { PriceResult } from '@/types';

// Common headers that look like a real browser
const getBrowserHeaders = (referer: string) => ({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,fi;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Referer': referer,
});

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
    // Poromagia uses a different search URL pattern
    const searchUrl = `https://poromagia.com/advanced_search_result.php?keywords=${encodeURIComponent(cardName)}&search_in_description=0&categories_id=0&inc_subcat=1&manufacturers_id=0&pfrom=&pto=&dfrom=&dto=`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: getBrowserHeaders('https://poromagia.com/'),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const normalizedCardName = cardName.toLowerCase().trim();

    // Look for price patterns
    const priceMatches = html.match(/(\d+[,.]?\d*)\s*€/g);

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
    storeUrl: 'https://www.basaari.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: null,
  };

  try {
    const searchUrl = `https://www.basaari.com/tuotehaku?haku=${encodeURIComponent(cardName)}`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: getBrowserHeaders('https://www.basaari.com/'),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const normalizedCardName = cardName.toLowerCase().trim();

    // Look for price patterns
    const priceMatches = html.match(/(\d+[,.]?\d*)\s*€/g);

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
    // Use Cardmarket's Singles search to get more specific results
    const searchUrl = `https://www.cardmarket.com/en/Magic/Cards?name=${encodeURIComponent(cardName)}`;
    baseResult.link = searchUrl;

    const response = await fetch(searchUrl, {
      headers: getBrowserHeaders('https://www.cardmarket.com/en/Magic'),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const normalizedCardName = cardName.toLowerCase().trim();

    // Cardmarket shows prices in format like "0,15 €" or "From 0,15 €"
    const fromPriceMatch = html.match(/From\s+(\d+[,.]?\d*)\s*€/i);
    const priceMatch = html.match(/(\d+[,.]?\d*)\s*€/);

    if (html.toLowerCase().includes(normalizedCardName) || html.toLowerCase().includes(normalizedCardName.split(' ')[0])) {
      const foundPrice = fromPriceMatch || priceMatch;
      if (foundPrice) {
        const price = foundPrice[1].replace(',', '.');
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
