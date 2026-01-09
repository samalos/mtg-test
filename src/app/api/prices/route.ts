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
        console.log(`[Fetch] Got ${html.length} bytes from ${isProxy ? 'proxy' : 'direct'}`);
        if (html.length > 1000) return html;
      }
    } catch (error) {
      console.error(`[Fetch] Error:`, (error as Error).message);
    }
  }
  return null;
}

function normalizeCardName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cardNamesMatch(searchName: string, foundName: string): boolean {
  const normalizedSearch = normalizeCardName(searchName);
  const normalizedFound = normalizeCardName(foundName);

  // Exact match
  if (normalizedFound === normalizedSearch) return true;

  // Found name starts with search name (e.g., "Lightning Bolt - Revised" matches "Lightning Bolt")
  if (normalizedFound.startsWith(normalizedSearch)) return true;

  // All words from search appear in found name
  const searchWords = normalizedSearch.split(' ');
  return searchWords.every(word => normalizedFound.includes(word));
}

interface ProductMatch {
  name: string;
  price: number;
}

function extractPoromagiaProducts(html: string, searchName: string): ProductMatch[] {
  const products: ProductMatch[] = [];

  // Method 1: Parse the ecommerce JSON data with name-price pairs
  // Format: {"name": "Lightning Bolt - Set", ..., "price": "FixedPrice({...excl_tax': Decimal('X.XX'), 'tax': Decimal('Y.YY')...})"
  const productJsonRegex = /"name":\s*"([^"]+)"[^}]*?"price":\s*"FixedPrice\(\{[^}]*'excl_tax':\s*Decimal\('([0-9.]+)'\)[^}]*'tax':\s*Decimal\('([0-9.]+)'\)/g;
  let match;
  while ((match = productJsonRegex.exec(html)) !== null) {
    const [, name, exclTax, tax] = match;
    const totalPrice = parseFloat(exclTax) + parseFloat(tax);
    if (cardNamesMatch(searchName, name) && totalPrice > 0) {
      products.push({ name, price: totalPrice });
    }
  }

  // Method 2: Look for product cards with price_color class
  // Pattern: <h4 class="text">Card Name</h4>...<p class="price_color">€X.XX</p>
  const productCardRegex = /<article[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  while ((match = productCardRegex.exec(html)) !== null) {
    const cardHtml = match[1];

    // Extract card name from title/heading
    const nameMatch = cardHtml.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i) ||
                      cardHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i) ||
                      cardHtml.match(/alt="([^"]+)"/i);

    // Extract price from price_color class or similar
    const priceMatch = cardHtml.match(/class="[^"]*price[^"]*"[^>]*>([^<]*€[^<]*|[^<]*[0-9]+[,.][0-9]{2}[^<]*)</i) ||
                       cardHtml.match(/€\s*([0-9]+[,.][0-9]{2})/);

    if (nameMatch && priceMatch) {
      const name = nameMatch[1].trim();
      const priceStr = priceMatch[1] || priceMatch[0];
      const price = parseFloat(priceStr.replace('€', '').replace(',', '.').trim());

      if (cardNamesMatch(searchName, name) && price > 0 && price < 5000) {
        products.push({ name, price });
      }
    }
  }

  // Method 3: Look for structured data patterns
  const structuredRegex = /itemprop="name"[^>]*>([^<]+)<[\s\S]*?itemprop="price"[^>]*content="([0-9.]+)"/gi;
  while ((match = structuredRegex.exec(html)) !== null) {
    const [, name, priceStr] = match;
    const price = parseFloat(priceStr);
    if (cardNamesMatch(searchName, name) && price > 0) {
      products.push({ name, price });
    }
  }

  return products;
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

  const products = extractPoromagiaProducts(html, cardName);
  console.log(`[Poromagia] Found ${products.length} matching products for "${cardName}"`);

  if (products.length > 0) {
    // Use first result (most relevant) since Poromagia sorts by relevancy
    const firstMatch = products[0];
    baseResult.price = firstMatch.price.toFixed(2);
    baseResult.availability = 'in_stock';
    console.log(`[Poromagia] First match: "${firstMatch.name}" at €${firstMatch.price.toFixed(2)}`);
  }

  return baseResult;
}

async function fetchBasaariPrice(cardName: string): Promise<PriceResult> {
  const searchUrl = `https://basaari.com/magic?searchTerm=${encodeURIComponent(cardName)}`;
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
    // Basaari uses client-side rendering. Try using JS rendering services.
    const renderServices = [
      // Rendertron (Google's headless Chrome rendering solution)
      `https://render-tron.appspot.com/render/${encodeURIComponent(searchUrl)}`,
      // Microlink API - extracts data from websites
      `https://api.microlink.io/?url=${encodeURIComponent(searchUrl)}&screenshot=false&pdf=false`,
    ];

    for (const serviceUrl of renderServices) {
      try {
        console.log(`[Basaari] Trying render service: ${serviceUrl.split('?')[0]}`);
        const response = await fetch(serviceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/json,*/*',
          },
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
          console.log(`[Basaari] Service returned ${response.status}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        let html = '';

        if (contentType.includes('application/json')) {
          // Microlink returns JSON
          const json = await response.json();
          html = json.data?.html || JSON.stringify(json);
          console.log(`[Basaari] Got JSON response, html length: ${html.length}`);
        } else {
          html = await response.text();
          console.log(`[Basaari] Got HTML response, length: ${html.length}`);
        }

        if (html.length < 1000) continue;

        // Extract prices from rendered HTML
        const price = extractBasaariPrice(html, cardName);
        if (price) {
          baseResult.price = price.toFixed(2);
          baseResult.availability = 'in_stock';
          console.log(`[Basaari] Found price: €${price.toFixed(2)}`);
          return baseResult;
        }
      } catch (error) {
        console.error(`[Basaari] Render service error:`, (error as Error).message);
      }
    }

    // Fallback: Try direct fetch with proxy (in case they added server-side rendering)
    const html = await fetchWithProxy(searchUrl);
    if (html) {
      const price = extractBasaariPrice(html, cardName);
      if (price) {
        baseResult.price = price.toFixed(2);
        baseResult.availability = 'in_stock';
        console.log(`[Basaari] Found price via proxy: €${price.toFixed(2)}`);
      }
    }
  } catch (error) {
    console.error('[Basaari] Error:', error);
  }

  return baseResult;
}

function extractBasaariPrice(html: string, searchName: string): number | null {
  // Look for product cards with prices
  // Common patterns: "X.XX €", "€X.XX", "X,XX €"
  const prices: number[] = [];

  // Pattern 1: Look for price in product grid items
  // Basaari typically shows products in a grid with price near product name
  const productRegex = /<div[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = productRegex.exec(html)) !== null) {
    const block = match[1];
    // Check if this block contains the card name
    const normalizedBlock = block.toLowerCase();
    const normalizedSearch = searchName.toLowerCase();

    if (normalizedBlock.includes(normalizedSearch) ||
        normalizedSearch.split(' ').every(word => normalizedBlock.includes(word.toLowerCase()))) {
      // Extract price from this block
      const priceMatch = block.match(/([0-9]+[.,][0-9]{2})\s*€|€\s*([0-9]+[.,][0-9]{2})/);
      if (priceMatch) {
        const priceStr = priceMatch[1] || priceMatch[2];
        const price = parseFloat(priceStr.replace(',', '.'));
        if (price > 0 && price < 5000) {
          prices.push(price);
        }
      }
    }
  }

  // Pattern 2: Generic price extraction near card name mentions
  const searchWords = searchName.toLowerCase().split(' ');
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (searchWords.every(word => line.includes(word))) {
      // Look for price in nearby lines
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 5)).join(' ');
      const priceMatch = context.match(/([0-9]+[.,][0-9]{2})\s*€|€\s*([0-9]+[.,][0-9]{2})/);
      if (priceMatch) {
        const priceStr = priceMatch[1] || priceMatch[2];
        const price = parseFloat(priceStr.replace(',', '.'));
        if (price > 0 && price < 5000) {
          prices.push(price);
        }
      }
    }
  }

  // Pattern 3: Look for JSON data structures with prices
  const jsonPriceRegex = /"price":\s*"?([0-9]+\.?[0-9]*)"?/gi;
  while ((match = jsonPriceRegex.exec(html)) !== null) {
    const price = parseFloat(match[1]);
    if (price > 0 && price < 5000) {
      prices.push(price);
    }
  }

  // Pattern 4: Schema.org structured data
  const schemaRegex = /"@type":\s*"Product"[\s\S]*?"price":\s*"?([0-9]+\.?[0-9]*)"?/gi;
  while ((match = schemaRegex.exec(html)) !== null) {
    const price = parseFloat(match[1]);
    if (price > 0 && price < 5000) {
      prices.push(price);
    }
  }

  if (prices.length > 0) {
    // Return first price (most relevant in search results)
    return prices[0];
  }

  return null;
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

  return NextResponse.json({
    cardName: scryfallData?.name || cardName,
    results,
  });
}
