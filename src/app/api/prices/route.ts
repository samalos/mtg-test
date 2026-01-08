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

function extractBasaariProducts(html: string, searchName: string): ProductMatch[] {
  const products: ProductMatch[] = [];
  const allFound: string[] = [];

  // Method 1: Parse __NEXT_DATA__ JSON
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const jsonStr = JSON.stringify(data);
      console.log(`[Basaari] __NEXT_DATA__ size: ${jsonStr.length} chars`);

      // Find all title-price pairs in the JSON (more flexible regex)
      const pairRegex = /"title"\s*:\s*"([^"]{3,100})"[\s\S]{0,500}?"price"\s*:\s*([0-9]+\.?[0-9]*)/g;
      let match;
      while ((match = pairRegex.exec(jsonStr)) !== null) {
        const [, name, priceStr] = match;
        const price = parseFloat(priceStr);
        if (price > 0 && price < 5000) {
          allFound.push(`${name}: €${price}`);
          if (cardNamesMatch(searchName, name)) {
            products.push({ name, price });
            console.log(`[Basaari] Match in NEXT_DATA: "${name}" at €${price}`);
          }
        }
      }
      console.log(`[Basaari] Total products in NEXT_DATA: ${allFound.length}`);
      if (allFound.length > 0 && allFound.length <= 5) {
        console.log(`[Basaari] Found: ${allFound.join(', ')}`);
      }
    } catch (e) {
      console.error('[Basaari] Failed to parse __NEXT_DATA__:', e);
    }
  } else {
    console.log('[Basaari] No __NEXT_DATA__ found in HTML');
  }

  // Method 2: Look for product JSON objects anywhere in HTML
  const productObjRegex = /"title"\s*:\s*"([^"]{3,100})"[^}]{0,300}"price"\s*:\s*([0-9]+\.?[0-9]*)/g;
  let match;
  while ((match = productObjRegex.exec(html)) !== null) {
    const [, name, priceStr] = match;
    const price = parseFloat(priceStr);
    if (cardNamesMatch(searchName, name) && price > 0 && price < 5000) {
      if (!products.some(p => p.name === name && p.price === price)) {
        products.push({ name, price });
        console.log(`[Basaari] Match in HTML: "${name}" at €${price}`);
      }
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

  // Try Shopify search/suggest API first (common Shopify endpoint)
  const shopifyUrls = [
    `https://basaari.com/search/suggest.json?q=${encodeURIComponent(cardName)}&resources[type]=product&resources[limit]=10`,
    `https://basaari.com/api/search?q=${encodeURIComponent(cardName)}`,
  ];

  for (const url of shopifyUrls) {
    try {
      console.log(`[Basaari] Trying Shopify API: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Basaari] Got Shopify API response`);

        // Parse Shopify suggest response
        const resources = (data as {resources?: {results?: {products?: Array<{title: string; price: string; variants?: Array<{price: string}>}>}}}).resources;
        const products = resources?.results?.products || [];

        for (const product of products) {
          const title = product.title || '';
          if (cardNamesMatch(cardName, title)) {
            const priceStr = product.variants?.[0]?.price || product.price;
            const price = parseFloat(priceStr);
            if (price > 0) {
              baseResult.price = price.toFixed(2);
              baseResult.availability = 'in_stock';
              console.log(`[Basaari] Shopify match: "${title}" at €${price}`);
              return baseResult;
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Basaari] Shopify API error:`, (error as Error).message);
    }
  }

  // Fallback: try HTML pages with proxy
  const htmlUrls = [
    `https://basaari.com/magic?searchTerm=${encodeURIComponent(cardName)}`,
    `https://basaari.com/?searchTerm=${encodeURIComponent(cardName)}`,
  ];

  for (const url of htmlUrls) {
    console.log(`[Basaari] Trying HTML: ${url}`);
    const html = await fetchWithProxy(url);
    if (!html) continue;

    const products = extractBasaariProducts(html, cardName);
    console.log(`[Basaari] Found ${products.length} matching products`);

    if (products.length > 0) {
      const firstMatch = products[0];
      baseResult.price = firstMatch.price.toFixed(2);
      baseResult.availability = 'in_stock';
      console.log(`[Basaari] HTML match: "${firstMatch.name}" at €${firstMatch.price.toFixed(2)}`);
      return baseResult;
    }
  }

  return baseResult;
}

function extractBasaariProductsFromApi(data: unknown, searchName: string): ProductMatch[] {
  const products: ProductMatch[] = [];

  // Handle array of products or {data: [...]} format
  const items = Array.isArray(data) ? data : (data as {data?: unknown[]}).data || [];

  for (const item of items as Array<{title?: string; variants?: Array<{title?: string; price?: number; available?: boolean}>}>) {
    const title = item.title || '';
    const variants = item.variants || [];

    for (const variant of variants) {
      const variantTitle = variant.title || title;
      const price = variant.price;

      if (typeof price === 'number' && price > 0 && variant.available !== false) {
        if (cardNamesMatch(searchName, variantTitle) || cardNamesMatch(searchName, title)) {
          products.push({ name: variantTitle || title, price });
        }
      }
    }
  }

  return products;
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
