'use client';

import { PriceResult } from '@/types';

interface PriceResultsProps {
  results: PriceResult[] | null;
  cardName: string | null;
  isLoading: boolean;
}

const StoreIcon = ({ store }: { store: string }) => {
  const colors: Record<string, string> = {
    poromagia: 'bg-blue-600',
    basaari: 'bg-emerald-600',
    cardmarket: 'bg-orange-500',
    scryfall: 'bg-violet-600',
  };

  const initials: Record<string, string> = {
    poromagia: 'P',
    basaari: 'B',
    cardmarket: 'CM',
    scryfall: 'TC',
  };

  return (
    <div className={`w-12 h-12 rounded-xl ${colors[store] || 'bg-gray-500'} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
      {initials[store] || store.charAt(0).toUpperCase()}
    </div>
  );
};

export default function PriceResults({ results, cardName, isLoading }: PriceResultsProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8">
        <div className="grid gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                </div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!results || !cardName) {
    return null;
  }

  // Sort: results with prices first
  const sortedResults = [...results].sort((a, b) => {
    if (a.price && !b.price) return -1;
    if (!a.price && b.price) return 1;
    if (a.price && b.price) {
      return parseFloat(a.price) - parseFloat(b.price);
    }
    return 0;
  });

  const lowestEurPrice = sortedResults
    .filter(r => r.price && r.currency === 'EUR')
    .sort((a, b) => parseFloat(a.price!) - parseFloat(b.price!))[0];

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Prices for &quot;{cardName}&quot;
        </h2>
        {lowestEurPrice && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Best EUR price: <span className="font-semibold text-green-600 dark:text-green-400">{lowestEurPrice.price} €</span> at {lowestEurPrice.storeName}
          </p>
        )}
      </div>

      <div className="grid gap-4">
        {sortedResults.map((result) => {
          const isFinishStore = result.store === 'poromagia' || result.store === 'basaari';
          const hasPriceData = result.price !== null;

          return (
            <div
              key={result.store}
              className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-md border-2 transition-all duration-200 hover:shadow-lg relative ${
                result === lowestEurPrice
                  ? 'border-green-500 dark:border-green-400'
                  : 'border-transparent'
              }`}
            >
              {result === lowestEurPrice && (
                <div className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                  BEST PRICE
                </div>
              )}

              <div className="flex items-center gap-4">
                <StoreIcon store={result.store} />

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {result.storeName}
                  </h3>
                  {isFinishStore && !hasPriceData ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Finnish store - click to check price
                    </p>
                  ) : hasPriceData ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Price Available
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      Click to check
                    </span>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  {hasPriceData ? (
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {result.price} <span className="text-base text-gray-500">{result.currency === 'EUR' ? '€' : '$'}</span>
                    </div>
                  ) : (
                    <a
                      href={result.link || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Check Price
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              {hasPriceData && result.link && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium transition-colors text-sm"
                  >
                    View on {result.storeName}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Note:</strong> Cardmarket prices are fetched automatically via Scryfall API.
          Finnish stores (Poromagia, Basaari) require manual checking as they block automated requests.
        </p>
      </div>
    </div>
  );
}
