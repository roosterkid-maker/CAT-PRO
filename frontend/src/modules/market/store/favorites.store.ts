import { create } from "zustand";

const STORAGE_KEY = "favorite-markets";

interface FavoritesState {
  favorites: Set<string>;

  isFavorite: (exchange: string, market: string) => boolean;

  toggleFavorite: (exchange: string, market: string) => void;
}

function createFavoriteKey(
  exchange: string,
  market: string,
): string {
  return `${exchange.toLowerCase()}:${market.toUpperCase()}`;
}

function loadFavorites(): Set<string> {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(saved);

    return Array.isArray(parsed)
      ? new Set(parsed)
      : new Set();
  } catch {
    return new Set();
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: loadFavorites(),

  isFavorite: (exchange, market) => {
    return get().favorites.has(
      createFavoriteKey(exchange, market),
    );
  },

  toggleFavorite: (exchange, market) => {
    const key = createFavoriteKey(exchange, market);
    const favorites = new Set(get().favorites);

    if (favorites.has(key)) {
      favorites.delete(key);
    } else {
      favorites.add(key);
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...favorites]),
    );

    set({ favorites });
  },
}));