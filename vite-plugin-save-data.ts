import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { GameState } from './types';

export function saveDataPlugin(): Plugin {
  return {
    name: 'save-data-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-data', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const gameState: GameState = JSON.parse(body);
            const dataDir = path.resolve(__dirname, 'data');

            // Убеждаемся, что папка data существует
            if (!fs.existsSync(dataDir)) {
              fs.mkdirSync(dataDir, { recursive: true });
            }

            // Генерируем содержимое файлов
            const worldContent = `import { WorldData } from '../types';

export const INITIAL_WORLD: WorldData = ${JSON.stringify(gameState.world, null, 2)};
`;

            const locationsContent = `import { LocationData } from '../types';

export const INITIAL_LOCATIONS: LocationData[] = ${JSON.stringify(gameState.locations, null, 2)};
`;

            const playersContent = `import { PlayerData } from '../types';

export const INITIAL_PLAYERS: PlayerData[] = ${JSON.stringify(gameState.players, null, 2)};
`;

            const objectsContent = `import { ObjectData } from '../types';

export const INITIAL_OBJECTS: ObjectData[] = ${JSON.stringify(gameState.objects, null, 2)};
`;

            // Сохраняем файлы
            fs.writeFileSync(path.join(dataDir, 'world.ts'), worldContent, 'utf-8');
            fs.writeFileSync(path.join(dataDir, 'locations.ts'), locationsContent, 'utf-8');
            fs.writeFileSync(path.join(dataDir, 'players.ts'), playersContent, 'utf-8');
            fs.writeFileSync(path.join(dataDir, 'objects.ts'), objectsContent, 'utf-8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, message: 'Данные сохранены' }));
          } catch (error: any) {
            console.error('[Save Data Plugin] Ошибка сохранения:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
      });
    }
  };
}


