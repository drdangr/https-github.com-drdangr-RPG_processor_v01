import { GameTool } from '../types';

// --- Manual Fallback List ---
// Используется, если среда не поддерживает автоматическое сканирование (require.context)
import moveObject from './moveObject';
import movePlayer from './movePlayer';
import setAttribute from './setAttribute';
import deleteAttribute from './deleteAttribute';
import createObject from './createObject';
import deleteObject from './deleteObject';

let tools: GameTool[] = [
  moveObject,
  movePlayer,
  setAttribute,
  deleteAttribute,
  createObject,
  deleteObject
];

// --- Auto-Loader Mechanism ---
// Попытка использовать Webpack require.context для автоматического сканирования папки.
// Если вы добавите новый файл .ts в эту папку, он будет автоматически зарегистрирован, 
// если ваш сборщик поддерживает эту функцию.

try {
  // @ts-ignore: require.context is a webpack macro
  if (typeof require !== 'undefined' && require.context) {
    // @ts-ignore
    const context = require.context('./', false, /^\.\/(?!index).*\.ts$/);
    
    const autoLoadedTools: GameTool[] = [];
    
    context.keys().forEach((key: string) => {
      // Import the module
      const module = context(key);
      // Check if it has a default export matching our interface
      if (module.default && module.default.definition && module.default.apply) {
        autoLoadedTools.push(module.default);
      }
    });

    if (autoLoadedTools.length > 0) {
      console.log(`[Tools Registry] Auto-loaded ${autoLoadedTools.length} tools via require.context.`);
      tools = autoLoadedTools;
    }
  }
} catch (e) {
  // Игнорируем ошибки, если require.context недоступен (например, в Vite или чистом ES)
  console.debug("[Tools Registry] Auto-loading skipped (require.context not available). Using manual list.");
}

export const ALL_TOOLS = tools;
