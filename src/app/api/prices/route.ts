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

interface PoromagiaProduct {
  name: string;
  id: number;
  price: string;
  category: string;
  url: string;
}

interface BasaariVariant {
  title: string;
  price: number;
  available: boolean;
  quantityAvailable: number;
  condition: string;
}

interface BasaariProduct {
  title: string;
  handle: string;
  variants: BasaariVariant[];
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

    // Parse JSON data embedded in the HTML
    // The data is in format: {"name": "Card Name", "price": "FixedPrice({'currency': 'EUR', 'excl_tax': Decimal('X.XX'), 'tax': Decimal('Y.YY')})", ...}
    const productRegex = /\{"name":\s*"([^"]+)"[^}]*"price":\s*"FixedPrice\(\{'currency':\s*'EUR',\s*'excl_tax':\s*Decimal\('([0-9.]+)'\),\s*'tax':\s*Decimal\('([0-9.]+)'\)\}\)"[^}]*"url":\s*"([^"]+)"\}/g;

    const products: PoromagiaProduct[] = [];
    let match;

    while ((match = productRegex.exec(html)) !== null) {
      const [, name, exclTax, tax, url] = match;
      const totalPrice = parseFloat(exclTax) + parseFloat(tax);
      products.push({
        name,
        id: 0,
        price: totalPrice.toFixed(2),
        category: '',
        url: url.startsWith('http') ? url : `https://poromagia.com${url}`,
      });
    }

    // Filter products that match the card name (case-insensitive)
    const searchTermLower = cardName.toLowerCase();
    const matchingProducts = products.filter(p =>
      p.name.toLowerCase().includes(searchTermLower) ||
      searchTermLower.split(' ').every(word => p.name.toLowerCase().includes(word))
    );

    if (matchingProducts.length > 0) {
      // Find the cheapest matching product
      const cheapest = matchingProducts.reduce((min, p) =>
        parseFloat(p.price) < parseFloat(min.price) ? p : min
      );

      baseResult.price = cheapest.price;
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
    // Fetch products from Basaari API
    const response = await fetch('https://basaari.com/api/products', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Basaari API returned status ${response.status}`);
      return baseResult;
    }

    const data = await response.json();
    const products: BasaariProduct[] = data.data || [];

    // Filter products by card name (case-insensitive)
    const searchTermLower = cardName.toLowerCase();
    const matchingProducts = products.filter(p => {
      const titleLower = p.title.toLowerCase();
      // Check if it's a Magic single and matches the card name
      return titleLower.includes(searchTermLower) ||
             searchTermLower.split(' ').every(word => titleLower.includes(word));
    });

    if (matchingProducts.length > 0) {
      // Find the cheapest available variant
      let cheapestPrice: number | null = null;
      let cheapestProduct: BasaariProduct | null = null;

      for (const product of matchingProducts) {
        for (const variant of product.variants) {
          if (variant.available && variant.quantityAvailable > 0) {
            if (cheapestPrice === null || variant.price < cheapestPrice) {
              cheapestPrice = variant.price;
              cheapestProduct = product;
            }
          }
        }
      }

      if (cheapestPrice !== null && cheapestProduct) {
        baseResult.price = cheapestPrice.toFixed(2);
        baseResult.availability = 'in_stock';
        baseResult.link = `https://basaari.com/products/${cheapestProduct.handle}`;
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
    // Use Scryfall's Cardmarket price data
    if (scryfallData.prices.eur) {
      baseResult.price = scryfallData.prices.eur;
      baseResult.availability = 'in_stock';
    }
    baseResult.link = scryfallData.purchase_uris.cardmarket;
  } else {
    // Fallback to search URL
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

  // Get results for all stores
  const results: PriceResult[] = [
    getCardmarketResult(cardName, scryfallData),
    poromagiaResult,
    basaariResult,
  ];

  // Add Scryfall as a bonus source with USD price
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
