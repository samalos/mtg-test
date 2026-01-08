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

function getPoromagiaResult(cardName: string): PriceResult {
  // Poromagia blocks automated requests, so we provide a search link
  const searchUrl = `https://poromagia.com/en/catalogue/mtg-singles/?q=${encodeURIComponent(cardName)}`;

  return {
    store: 'poromagia',
    storeName: 'Poromagia',
    storeUrl: 'https://poromagia.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: searchUrl,
    error: 'Click link to check price (site blocks automated requests)',
  };
}

function getBasaariResult(cardName: string): PriceResult {
  // Basaari - provide search link
  const searchUrl = `https://www.basaari.com/magic/singlet?s=${encodeURIComponent(cardName)}`;

  return {
    store: 'basaari',
    storeName: 'Basaari',
    storeUrl: 'https://www.basaari.com',
    price: null,
    currency: 'EUR',
    availability: 'unknown',
    link: searchUrl,
    error: 'Click link to check price (site blocks automated requests)',
  };
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
    baseResult.error = 'Card not found';
  }

  return baseResult;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cardName = searchParams.get('card');

  if (!cardName) {
    return NextResponse.json({ error: 'Card name is required' }, { status: 400 });
  }

  // Fetch card data from Scryfall (includes Cardmarket prices)
  const scryfallData = await fetchFromScryfall(cardName);

  // Get results for all stores
  const results: PriceResult[] = [
    getPoromagiaResult(cardName),
    getBasaariResult(cardName),
    getCardmarketResult(cardName, scryfallData),
  ];

  // Add Scryfall as a bonus source with USD price
  if (scryfallData && scryfallData.prices.usd) {
    results.push({
      store: 'scryfall',
      storeName: 'Scryfall (USD)',
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
