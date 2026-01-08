'use client';

import { useState } from 'react';
import CardSearch from '@/components/CardSearch';
import PriceResults from '@/components/PriceResults';
import { PriceResult } from '@/types';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PriceResult[] | null>(null);
  const [searchedCard, setSearchedCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (cardName: string) => {
    setIsLoading(true);
    setError(null);
    setSearchedCard(cardName);
    setResults(null);

    try {
      const response = await fetch(`/api/prices?card=${encodeURIComponent(cardName)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch prices');
      }

      setResults(data.results);
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-purple-900/20">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            MTG Price Checker
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Compare Magic: The Gathering card prices across Finnish stores and Cardmarket.
            Start typing a card name to see suggestions.
          </p>
        </header>

        {/* Search */}
        <div className="mb-8">
          <CardSearch onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {/* Stores info */}
        {!results && !isLoading && (
          <div className="max-w-2xl mx-auto mt-12">
            <h3 className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
              SEARCHING ACROSS
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <a
                href="https://poromagia.fi"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-blue-500 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold text-xl">
                  P
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Poromagia</span>
              </a>
              <a
                href="https://basaari.com"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-green-500 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold text-xl">
                  B
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Basaari</span>
              </a>
              <a
                href="https://www.cardmarket.com/en/Magic"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-orange-500 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold text-xl">
                  C
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cardmarket</span>
              </a>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto mt-8">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 dark:text-red-400">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <PriceResults results={results} cardName={searchedCard} isLoading={isLoading} />

        {/* Footer */}
        <footer className="text-center mt-16 text-sm text-gray-500 dark:text-gray-400">
          <p>
            Card suggestions powered by{' '}
            <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">
              Scryfall API
            </a>
          </p>
          <p className="mt-2">
            Prices are indicative. Always verify on the store websites.
          </p>
        </footer>
      </div>
    </div>
  );
}
