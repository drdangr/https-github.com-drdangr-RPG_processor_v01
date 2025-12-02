import { GameState, WorldData, LocationData, PlayerData, ObjectData } from '../types';

/**
 * Генерирует содержимое файла world.ts
 */
export function generateWorldFile(world: WorldData): string {
  return `import { WorldData } from '../types';

export const INITIAL_WORLD: WorldData = ${JSON.stringify(world, null, 2)};
`;
}

/**
 * Генерирует содержимое файла locations.ts
 */
export function generateLocationsFile(locations: LocationData[]): string {
  return `import { LocationData } from '../types';

export const INITIAL_LOCATIONS: LocationData[] = ${JSON.stringify(locations, null, 2)};
`;
}

/**
 * Генерирует содержимое файла players.ts
 */
export function generatePlayersFile(players: PlayerData[]): string {
  return `import { PlayerData } from '../types';

export const INITIAL_PLAYERS: PlayerData[] = ${JSON.stringify(players, null, 2)};
`;
}

/**
 * Генерирует содержимое файла objects.ts
 */
export function generateObjectsFile(objects: ObjectData[]): string {
  return `import { ObjectData } from '../types';

export const INITIAL_OBJECTS: ObjectData[] = ${JSON.stringify(objects, null, 2)};
`;
}

/**
 * Скачивает файл в браузере
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Сохраняет все файлы данных из GameState
 */
export function saveDataFiles(gameState: GameState): void {
  downloadFile('world.ts', generateWorldFile(gameState.world), 'text/typescript');
  
  // Небольшая задержка между скачиваниями для избежания блокировки браузера
  setTimeout(() => {
    downloadFile('locations.ts', generateLocationsFile(gameState.locations), 'text/typescript');
  }, 100);
  
  setTimeout(() => {
    downloadFile('players.ts', generatePlayersFile(gameState.players), 'text/typescript');
  }, 200);
  
  setTimeout(() => {
    downloadFile('objects.ts', generateObjectsFile(gameState.objects), 'text/typescript');
  }, 300);
}

/**
 * Копирует содержимое файла в буфер обмена
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}


