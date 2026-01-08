'use client';

import { PriceResult } from '@/types';

interface PriceResultsProps {
  results: PriceResult[] | null;
  cardName: string | null;
  isLoading: boolean;
}

const StoreIcon = ({ store }: { store: string }) => {
  const colors: Record<string, string> = {
    poromagia: 'bg-blue-500',
    basaari: 'bg-green-500',
    cardmarket: 'bg-orange-500',
  };

  return (
    <div className={`w-10 h-10 rounded-lg ${colors[store] || 'bg-gray-500'} flex items-center justify-center text-white font-bold text-lg`}>
      {store.charAt(0).toUpperCase()}
    </div>
  );
};

const AvailabilityBadge = ({ availability }: { availability: string }) => {
  const styles: Record<string, string> = {
    in_stock: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    out_of_stock: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };

  const labels: Record<string, string> = {
    in_stock: 'In Stock',
    out_of_stock: 'Not Found',
    unknown: 'Check Store',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[availability] || styles.unknown}`}>
      {labels[availability] || 'Unknown'}
    </span>
  );
};

export default function PriceResults({ results, cardName, isLoading }: PriceResultsProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8">
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
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

  // Sort results: in_stock first, then by price (lowest first)
  const sortedResults = [...results].sort((a, b) => {
    if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
    if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;

    const priceA = a.price ? parseFloat(a.price) : Infinity;
    const priceB = b.price ? parseFloat(b.price) : Infinity;
    return priceA - priceB;
  });

  const lowestPrice = sortedResults
    .filter(r => r.price && r.availability === 'in_stock')
    .sort((a, b) => parseFloat(a.price!) - parseFloat(b.price!))[0];

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Prices for &quot;{cardName}&quot;
        </h2>
        {lowestPrice && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Lowest price: <span className="font-semibold text-green-600 dark:text-green-400">{lowestPrice.price} {lowestPrice.currency}</span> at {lowestPrice.storeName}
          </p>
        )}
      </div>

      <div className="grid gap-4">
        {sortedResults.map((result) => (
          <div
            key={result.store}
            className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md border-2 transition-all duration-200 hover:shadow-lg ${
              result === lowestPrice
                ? 'border-green-500 dark:border-green-400'
                : 'border-transparent'
            }`}
          >
            <div className="flex items-center gap-4">
              <StoreIcon store={result.store} />

              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {result.storeName}
                </h3>
                {result.error ? (
                  <p className="text-sm text-red-500 dark:text-red-400">
                    Error: {result.error}
                  </p>
                ) : (
                  <div className="flex items-center gap-3 mt-1">
                    <AvailabilityBadge availability={result.availability} />
                  </div>
                )}
              </div>

              <div className="text-right">
                {result.price ? (
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {result.price} <span className="text-base text-gray-500">{result.currency}</span>
                  </div>
                ) : (
                  <div className="text-lg text-gray-400 dark:text-gray-500">
                    N/A
                  </div>
                )}
              </div>
            </div>

            {result.link && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <a
                  href={result.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium transition-colors"
                >
                  View on {result.storeName}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {result === lowestPrice && (
              <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                BEST PRICE
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mt-6 text-center">
        Prices are fetched in real-time. Click the store links to verify availability and exact pricing.
      </p>
    </div>
  );
}
