import { NextRequest, NextResponse } from 'next/server';

// Fallback list of popular MTG cards for when external API is unavailable
const POPULAR_CARDS = [
  "Lightning Bolt",
  "Lightning Greaves",
  "Lightning Helix",
  "Lightning Strike",
  "Black Lotus",
  "Counterspell",
  "Dark Ritual",
  "Sol Ring",
  "Llanowar Elves",
  "Birds of Paradise",
  "Mana Crypt",
  "Force of Will",
  "Brainstorm",
  "Swords to Plowshares",
  "Path to Exile",
  "Fatal Push",
  "Thoughtseize",
  "Ragavan, Nimble Pilferer",
  "The One Ring",
  "Orcish Bowmasters",
  "Sheoldred, the Apocalypse",
  "Atraxa, Grand Unifier",
  "Phyrexian Obliterator",
  "Snapcaster Mage",
  "Tarmogoyf",
  "Liliana of the Veil",
  "Jace, the Mind Sculptor",
  "Ugin, the Spirit Dragon",
  "Karn Liberated",
  "Wrenn and Six",
  "Volcanic Island",
  "Underground Sea",
  "Tropical Island",
  "Tundra",
  "Savannah",
  "Badlands",
  "Scrubland",
  "Taiga",
  "Plateau",
  "Bayou",
  "Scalding Tarn",
  "Misty Rainforest",
  "Verdant Catacombs",
  "Arid Mesa",
  "Marsh Flats",
  "Polluted Delta",
  "Flooded Strand",
  "Bloodstained Mire",
  "Wooded Foothills",
  "Windswept Heath",
  "Demonic Tutor",
  "Vampiric Tutor",
  "Imperial Seal",
  "Mana Drain",
  "Cyclonic Rift",
  "Craterhoof Behemoth",
  "Dockside Extortionist",
  "Smothering Tithe",
  "Rhystic Study",
  "Necropotence",
  "Yawgmoth's Will",
  "Time Walk",
  "Ancestral Recall",
  "Mox Pearl",
  "Mox Sapphire",
  "Mox Jet",
  "Mox Ruby",
  "Mox Emerald",
  "Time Twister",
  "Library of Alexandria",
  "Bazaar of Baghdad",
  "The Tabernacle at Pendrell Vale",
  "Gaea's Cradle",
  "Serra's Sanctum",
  "Tolarian Academy",
  "Ancient Tomb",
  "City of Traitors",
  "Cavern of Souls",
  "Urza's Saga",
  "Murktide Regent",
  "Expressive Iteration",
  "Prismatic Ending",
  "Teferi, Time Raveler",
  "Oko, Thief of Crowns",
  "Archmage's Charm",
  "Chalice of the Void",
  "Aether Vial",
  "Stoneforge Mystic",
  "Batterskull",
  "Umezawa's Jitte",
  "Sword of Fire and Ice",
  "Chrome Mox",
  "Mox Diamond",
  "Lion's Eye Diamond",
  "Lotus Petal",
  "Exploration",
  "Sylvan Library",
  "Survival of the Fittest",
  "Natural Order",
  "Green Sun's Zenith",
];

function filterCards(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  return POPULAR_CARDS
    .filter(card => card.toLowerCase().includes(lowerQuery))
    .slice(0, 10);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    // Use Scryfall's autocomplete API
    const response = await fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch from Scryfall');
    }

    const data = await response.json();

    // Scryfall returns { object: 'catalog', data: ['card1', 'card2', ...] }
    const suggestions = data.data?.slice(0, 10) || [];

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Autocomplete error:', error);
    // Fallback to local list when API is unavailable
    const fallbackSuggestions = filterCards(query);
    return NextResponse.json({
      suggestions: fallbackSuggestions,
      fallback: true
    });
  }
}
