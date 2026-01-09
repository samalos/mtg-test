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
  const urlHost = new URL(url).hostname;
  const proxyMethods = [
    { name: 'direct', url: url },
    { name: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
  ];

  for (const method of proxyMethods) {
    try {
      console.log(`[Fetch:${urlHost}] Trying ${method.name}...`);
      const response = await fetch(method.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      });

      console.log(`[Fetch:${urlHost}] ${method.name} returned status ${response.status}`);
      if (response.ok) {
        const html = await response.text();
        console.log(`[Fetch:${urlHost}] Got ${html.length} bytes from ${method.name}`);
        if (html.length > 1000) return html;
        console.log(`[Fetch:${urlHost}] Response too small (${html.length} bytes), trying next...`);
      }
    } catch (error) {
      console.log(`[Fetch:${urlHost}] ${method.name} error:`, (error as Error).message);
    }
  }
  console.log(`[Fetch:${urlHost}] All methods failed, returning null`);
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
  // Base URL pattern: /tuotteet/magic/singlet with search parameter
  // Try different search query parameter names
  const searchParams = ['search', 'q', 'searchTerm', 'name', 'query'];
  const baseUrl = 'https://basaari.com/tuotteet/magic/singlet';

  let searchUrl = `${baseUrl}?search=${encodeURIComponent(cardName)}`;

  // Test which search parameter works
  for (const param of searchParams) {
    const testUrl = `${baseUrl}?${param}=${encodeURIComponent(cardName)}`;
    try {
      console.log(`[Basaari] Testing search param: ${param}`);
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(5000),
      });
      console.log(`[Basaari] ${param} returned status ${response.status}`);
      if (response.ok) {
        searchUrl = testUrl;
        console.log(`[Basaari] Using search param: ${param}`);
        break;
      }
    } catch (error) {
      console.log(`[Basaari] ${param} error:`, (error as Error).message);
    }
  }

  const baseResult: PriceResult = {
    store: 'basaari',
    storeName: 'Basaari',
    storeUrl: 'https://basaari.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: searchUrl, // Use the working URL
  };

  console.log(`[Basaari] Using search URL: ${searchUrl}`);

  try {
    // Method 1: Try direct API endpoints (many stores have these)
    const apiEndpoints = [
      // Based on the URL structure /tuotteet/magic/singlet, try API patterns
      `https://basaari.com/api/tuotteet/magic/singlet?search=${encodeURIComponent(cardName)}`,
      `https://basaari.com/api/products?search=${encodeURIComponent(cardName)}&category=magic`,
      // Shopify-style search API
      `https://basaari.com/search/suggest.json?q=${encodeURIComponent(cardName)}&resources[type]=product`,
      // Next.js API route pattern
      `https://basaari.com/api/search?q=${encodeURIComponent(cardName)}`,
    ];

    for (const apiUrl of apiEndpoints) {
      try {
        console.log(`[Basaari] Trying API: ${apiUrl}`);
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[Basaari] API response:`, JSON.stringify(data).substring(0, 500));
          const price = extractPriceFromApiResponse(data, cardName);
          if (price) {
            baseResult.price = price.toFixed(2);
            baseResult.availability = 'in_stock';
            console.log(`[Basaari] Found price from API: €${price.toFixed(2)}`);
            return baseResult;
          }
        }
      } catch (error) {
        console.log(`[Basaari] API error:`, (error as Error).message);
      }
    }

    // Method 2: Try JS rendering services (only Microlink, others return 404)
    const renderServices = [
      // Microlink API - can render JS and return HTML (needs longer timeout for JS rendering)
      `https://api.microlink.io/?url=${encodeURIComponent(searchUrl)}&screenshot=false&pdf=false&javascript=true&waitForTimeout=8000`,
    ];

    for (const serviceUrl of renderServices) {
      try {
        console.log(`[Basaari] Trying render service: ${serviceUrl.split('?')[0].substring(0, 50)}`);
        const response = await fetch(serviceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/json,*/*',
          },
          signal: AbortSignal.timeout(20000), // Longer timeout for JS rendering
        });

        if (!response.ok) {
          console.log(`[Basaari] Service returned ${response.status}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        let html = '';

        if (contentType.includes('application/json')) {
          const json = await response.json();
          html = json.data?.html || JSON.stringify(json);
          console.log(`[Basaari] Got JSON response, html length: ${html.length}`);
          // Log the actual JSON structure for debugging
          console.log(`[Basaari] JSON keys:`, Object.keys(json.data || json).join(', '));
        } else {
          html = await response.text();
          console.log(`[Basaari] Got HTML response, length: ${html.length}`);
        }

        // Log sample even for small responses
        console.log(`[Basaari] Response sample:`, html.substring(0, 500));

        if (html.length < 1000) continue;

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

    // Method 3: Try with Googlebot user agent (faster, single attempt with short timeout)
    try {
      console.log(`[Basaari] Trying with Googlebot...`);
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const html = await response.text();
        console.log(`[Basaari] Googlebot got ${html.length} bytes`);

        if (html.length > 5000) {
          const price = extractBasaariPrice(html, cardName);
          if (price) {
            baseResult.price = price.toFixed(2);
            baseResult.availability = 'in_stock';
            console.log(`[Basaari] Found price with Googlebot: €${price.toFixed(2)}`);
            return baseResult;
          }
        }
      }
    } catch (error) {
      console.log(`[Basaari] Googlebot error:`, (error as Error).message);
    }

    // Method 4: Try direct fetch with various proxies
    console.log(`[Basaari] Trying proxy fetch...`);
    const html = await fetchWithProxy(searchUrl);
    console.log(`[Basaari] Proxy fetch result: ${html ? html.length + ' bytes' : 'null'}`);
    if (html) {
      console.log(`[Basaari] Proxy fetch got ${html.length} bytes`);

      // Debug: Log HTML structure info
      const hasNextData = html.includes('__NEXT_DATA__');
      const hasProducts = html.includes('product') || html.includes('Product');
      const hasPrice = html.includes('€') || html.includes('EUR') || html.includes('price');
      const hasCardName = html.toLowerCase().includes(cardName.toLowerCase().split(' ')[0]);
      console.log(`[Basaari] HTML contains: __NEXT_DATA__=${hasNextData}, products=${hasProducts}, price=${hasPrice}, cardName=${hasCardName}`);

      // Log sample of HTML around product/price keywords
      const priceIndex = html.indexOf('€');
      if (priceIndex > -1) {
        console.log(`[Basaari] Sample around €:`, html.substring(Math.max(0, priceIndex - 100), priceIndex + 100));
      }

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

function extractPriceFromApiResponse(data: unknown, searchName: string): number | null {
  const searchLower = searchName.toLowerCase();

  // Handle various API response formats
  const traverse = (obj: unknown): number | null => {
    if (!obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const price = traverse(item);
        if (price) return price;
      }
      return null;
    }

    const record = obj as Record<string, unknown>;

    // Check if this object represents a product matching our search
    const name = (record.title || record.name || record.product_title || '') as string;
    if (name.toLowerCase().includes(searchLower) ||
        searchLower.split(' ').every(w => name.toLowerCase().includes(w))) {
      // Look for price fields
      const priceFields = ['price', 'price_min', 'price_max', 'compare_at_price', 'amount', 'value'];
      for (const field of priceFields) {
        const val = record[field];
        if (typeof val === 'number' && val > 0 && val < 5000) {
          return val;
        }
        if (typeof val === 'string') {
          const num = parseFloat(val.replace(',', '.').replace(/[^0-9.]/g, ''));
          if (num > 0 && num < 5000) return num;
        }
      }

      // Check nested price object
      if (record.price && typeof record.price === 'object') {
        const priceObj = record.price as Record<string, unknown>;
        const val = priceObj.amount || priceObj.value || priceObj.price;
        if (typeof val === 'number' && val > 0) return val;
        if (typeof val === 'string') {
          const num = parseFloat(val.replace(',', '.'));
          if (num > 0) return num;
        }
      }
    }

    // Recurse into nested objects
    for (const key of Object.keys(record)) {
      const price = traverse(record[key]);
      if (price) return price;
    }

    return null;
  };

  return traverse(data);
}

function extractBasaariPrice(html: string, searchName: string): number | null {
  // Look for product cards with prices
  // Common patterns: "X.XX €", "€X.XX", "X,XX €"
  const prices: number[] = [];

  // Pattern 0: Extract __NEXT_DATA__ from Next.js apps (most reliable)
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      console.log('[Basaari] Found __NEXT_DATA__, extracting prices...');
      const price = extractPriceFromApiResponse(nextData, searchName);
      if (price) {
        console.log(`[Basaari] Found price in __NEXT_DATA__: €${price}`);
        return price;
      }
    } catch (e) {
      console.log('[Basaari] Failed to parse __NEXT_DATA__');
    }
  }

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
