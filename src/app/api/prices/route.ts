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
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return null;
    }

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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Poromagia returned status ${response.status}`);
      return baseResult;
    }

    const html = await response.text();

    // Parse JSON data from the ecommerce tracking script
    // Look for patterns like: "name": "Lightning Bolt - Set", ... "excl_tax": Decimal('X.XX'), "tax": Decimal('Y.YY')
    const products: { name: string; price: number; url: string }[] = [];

    // Method 1: Parse the FixedPrice format
    const fixedPriceRegex = /"name":\s*"([^"]+)"[^}]*?"excl_tax":\s*Decimal\('([0-9.]+)'\)[^}]*?"tax":\s*Decimal\('([0-9.]+)'\)[^}]*?"url":\s*"([^"]+)"/g;
    let match;
    while ((match = fixedPriceRegex.exec(html)) !== null) {
      const [, name, exclTax, tax, url] = match;
      products.push({
        name,
        price: parseFloat(exclTax) + parseFloat(tax),
        url: url.startsWith('http') ? url : `https://poromagia.com${url}`,
      });
    }

    // Method 2: Try alternate format - look for product cards with prices
    if (products.length === 0) {
      // Look for price patterns in product listings: €X.XX or X,XX €
      const pricePatterns = html.match(/€\s*([0-9]+[.,][0-9]{2})|([0-9]+[.,][0-9]{2})\s*€/g);
      if (pricePatterns && pricePatterns.length > 0) {
        // Get the first (typically cheapest or most relevant) price
        const firstPrice = pricePatterns[0].replace('€', '').replace(',', '.').trim();
        const priceValue = parseFloat(firstPrice);
        if (!isNaN(priceValue) && priceValue > 0) {
          baseResult.price = priceValue.toFixed(2);
          baseResult.availability = 'in_stock';
          return baseResult;
        }
      }
    }

    // Filter products by card name
    const searchTermLower = cardName.toLowerCase().trim();
    const searchWords = searchTermLower.split(/\s+/);

    const matchingProducts = products.filter(p => {
      const nameLower = p.name.toLowerCase();
      // Check if all search words appear in the product name
      return searchWords.every(word => nameLower.includes(word));
    });

    if (matchingProducts.length > 0) {
      // Find the cheapest
      const cheapest = matchingProducts.reduce((min, p) => p.price < min.price ? p : min);
      baseResult.price = cheapest.price.toFixed(2);
      baseResult.availability = 'in_stock';
      baseResult.link = cheapest.url;
    }

    return baseResult;
  } catch (error) {
    console.error('Poromagia fetch error:', error);
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
    // Try fetching the search results page and parse it
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Basaari returned status ${response.status}`);
      return baseResult;
    }

    const html = await response.text();

    // Look for price patterns in the HTML
    // Basaari uses formats like: "price":0.87 or €X.XX
    const jsonPrices = html.match(/"price"\s*:\s*([0-9]+\.?[0-9]*)/g);
    const euroPrices = html.match(/€\s*([0-9]+[.,][0-9]{2})|([0-9]+[.,][0-9]{2})\s*€/g);

    // Also check for product data in Next.js hydration
    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Navigate through the structure to find products
        const searchTermLower = cardName.toLowerCase();

        // Recursively search for price data
        const findPrices = (obj: unknown, depth = 0): number[] => {
          if (depth > 10) return [];
          const prices: number[] = [];

          if (Array.isArray(obj)) {
            for (const item of obj) {
              prices.push(...findPrices(item, depth + 1));
            }
          } else if (obj && typeof obj === 'object') {
            const record = obj as Record<string, unknown>;
            // Check if this object has price and title/name
            if (typeof record.price === 'number' && record.price > 0) {
              const title = String(record.title || record.name || '').toLowerCase();
              if (title.includes(searchTermLower) || searchTermLower.split(' ').every(w => title.includes(w))) {
                prices.push(record.price);
              }
            }
            // Recurse into children
            for (const value of Object.values(record)) {
              prices.push(...findPrices(value, depth + 1));
            }
          }
          return prices;
        };

        const foundPrices = findPrices(nextData);
        if (foundPrices.length > 0) {
          const cheapest = Math.min(...foundPrices);
          baseResult.price = cheapest.toFixed(2);
          baseResult.availability = 'in_stock';
          return baseResult;
        }
      } catch {
        // JSON parse failed, continue with other methods
      }
    }

    // Fallback: Look for any price patterns
    if (jsonPrices && jsonPrices.length > 0) {
      const prices = jsonPrices
        .map(p => parseFloat(p.replace(/"price"\s*:\s*/, '')))
        .filter(p => p > 0 && p < 10000);

      if (prices.length > 0) {
        const cheapest = Math.min(...prices);
        baseResult.price = cheapest.toFixed(2);
        baseResult.availability = 'in_stock';
        return baseResult;
      }
    }

    if (euroPrices && euroPrices.length > 0) {
      const prices = euroPrices
        .map(p => parseFloat(p.replace('€', '').replace(',', '.').trim()))
        .filter(p => p > 0 && p < 10000);

      if (prices.length > 0) {
        const cheapest = Math.min(...prices);
        baseResult.price = cheapest.toFixed(2);
        baseResult.availability = 'in_stock';
        return baseResult;
      }
    }

    return baseResult;
  } catch (error) {
    console.error('Basaari fetch error:', error);
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

  // Fetch all data in parallel
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

  // Add TCGPlayer USD price
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
