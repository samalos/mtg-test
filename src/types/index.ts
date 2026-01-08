export interface CardSuggestion {
  name: string;
  id: string;
  image_uris?: {
    small?: string;
    normal?: string;
  };
}

export interface PriceResult {
  store: string;
  storeName: string;
  storeUrl: string;
  price: string | null;
  currency: string;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  link: string | null;
  error?: string;
}

export interface PriceSearchResult {
  cardName: string;
  results: PriceResult[];
}
