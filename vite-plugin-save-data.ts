import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { GameState } from './types';
import { normalizeState } from './utils/gameUtils';

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
            const parsedState: GameState = JSON.parse(body);
            // Нормализуем состояние - гарантируем наличие attributes у всех сущностей
            const gameState = normalizeState(parsedState);
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

      // API для работы с промптами
      server.middlewares.use('/api/prompts', async (req, res, next) => {
        const promptsDir = path.resolve(__dirname, 'prompts');
        
        // Убеждаемся, что папка prompts существует
        if (!fs.existsSync(promptsDir)) {
          fs.mkdirSync(promptsDir, { recursive: true });
        }

        // Парсим URL для получения типа и ID
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const type = url.searchParams.get('type'); // 'simulation' | 'narrative'
        const id = url.searchParams.get('id'); // ID промпта (для GET/DELETE конкретного)

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        try {
          // GET /api/prompts?type=simulation - получить все промпты типа
          if (req.method === 'GET' && type && !id) {
            const files = fs.readdirSync(promptsDir);
            const prompts: any[] = [];
            
            for (const file of files) {
              if (file.endsWith('.json') && file.startsWith(`${type}_`)) {
                const filePath = path.join(promptsDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const prompt = JSON.parse(content);
                prompts.push(prompt);
              }
            }
            
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, prompts }));
            return;
          }

          // GET /api/prompts?type=simulation&id=xxx - получить конкретный промпт
          if (req.method === 'GET' && type && id) {
            const fileName = `${type}_${id}.json`;
            const filePath = path.join(promptsDir, fileName);
            
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, error: 'Промпт не найден' }));
              return;
            }
            
            const content = fs.readFileSync(filePath, 'utf-8');
            const prompt = JSON.parse(content);
            
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, prompt }));
            return;
          }

          // POST /api/prompts - создать новый промпт
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });

            req.on('end', () => {
              try {
                const prompt = JSON.parse(body);
                
                if (!prompt.type || !prompt.id || !prompt.name || !prompt.prompt) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ success: false, error: 'Недостаточно данных' }));
                  return;
                }

                const fileName = `${prompt.type}_${prompt.id}.json`;
                const filePath = path.join(promptsDir, fileName);
                
                // Сохраняем промпт
                fs.writeFileSync(filePath, JSON.stringify(prompt, null, 2), 'utf-8');
                
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, prompt }));
              } catch (error: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: error.message }));
              }
            });
            return;
          }

          // PUT /api/prompts?type=simulation&id=xxx - обновить промпт
          if (req.method === 'PUT' && type && id) {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });

            req.on('end', () => {
              try {
                const prompt = JSON.parse(body);
                const fileName = `${type}_${id}.json`;
                const filePath = path.join(promptsDir, fileName);
                
                if (!fs.existsSync(filePath)) {
                  res.statusCode = 404;
                  res.end(JSON.stringify({ success: false, error: 'Промпт не найден' }));
                  return;
                }
                
                // Обновляем промпт
                prompt.id = id;
                prompt.type = type;
                fs.writeFileSync(filePath, JSON.stringify(prompt, null, 2), 'utf-8');
                
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, prompt }));
              } catch (error: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: error.message }));
              }
            });
            return;
          }

          // DELETE /api/prompts?type=simulation&id=xxx - удалить промпт
          if (req.method === 'DELETE' && type && id) {
            const fileName = `${type}_${id}.json`;
            const filePath = path.join(promptsDir, fileName);
            
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, error: 'Промпт не найден' }));
              return;
            }
            
            fs.unlinkSync(filePath);
            
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
            return;
          }

          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: 'Неверный запрос' }));
        } catch (error: any) {
          console.error('[Prompts API] Ошибка:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    }
  };
}



