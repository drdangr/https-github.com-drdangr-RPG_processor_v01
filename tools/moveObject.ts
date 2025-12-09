import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "move_object",
    description: "Универсальный иструмент для перемещения ОБЪЕКТОВ и ИГРОКОВ. Позволяет поместить сущность (объект или игрока) в локацию, внутрь объекта или передать другому игроку. Работает с иерархией. При перемещении объекта в объект, проверяет отсутствие циклов. Используй этот инструмент, чтобы: положить предмет в ящик, дать предмет игроку, посадить игрока в машину, перенести объект в другую комнату.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: {
          type: Type.STRING,
          description: "ID сущности для перемещения (Player ID или Object ID). Можно использовать ссылки $N.createdId."
        },
        targetId: { type: Type.STRING, description: "ID цели (нового родителя): Location ID, Player ID или Object ID." },
      },
      required: ["objectId", "targetId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const newState = cloneState(state);
    const { objectId, targetId } = args;

    if (!objectId || !targetId) {
      return { newState: state, result: `Ошибка: objectId и targetId не могут быть пустыми` };
    }

    // 1. Находим сущность (Object или Player)
    let entity: any = newState.objects.find(o => o.id === objectId);
    let entityType = 'object';

    if (!entity) {
      entity = newState.players.find(p => p.id === objectId);
      entityType = 'player';
    }

    if (!entity) {
      return { newState: state, result: `Ошибка: Сущность "${objectId}" не найдена` };
    }

    // 2. Проверка на перемещение в себя
    if (objectId === targetId) {
      return { newState: state, result: `Ошибка: Нельзя переместить сущность в саму себя` };
    }

    // 3. Находим цель
    const targetLocation = newState.locations.find(l => l.id === targetId);
    const targetPlayer = newState.players.find(p => p.id === targetId);
    const targetObject = newState.objects.find(o => o.id === targetId);

    if (!targetLocation && !targetPlayer && !targetObject) {
      return { newState: state, result: `Ошибка: Цель "${targetId}" не найдена` };
    }

    // 4. Проверка циклов (только если цель - Object или Player)
    if (targetObject || targetPlayer) {
      let currentId = targetId;
      const visited = new Set<string>();

      while (currentId) {
        if (currentId === objectId) {
          return {
            newState: state,
            result: `Ошибка: Циклическая зависимость! "${entity.name}" не может быть помещен в "${targetId}", так как "${targetId}" уже находится внутри "${entity.name}".`
          };
        }

        if (visited.has(currentId)) break;
        visited.add(currentId);

        // Ищем родителя текущего узла
        const currObj = newState.objects.find(o => o.id === currentId);
        if (currObj) {
          currentId = currObj.connectionId;
          continue;
        }

        const currPlayer = newState.players.find(p => p.id === currentId);
        if (currPlayer) {
          currentId = currPlayer.connectionId;
          continue;
        }

        // Если дошли до локации или чего-то неизвестного - стоп
        break;
      }
    }

    // 5. Перемещаем
    entity.connectionId = targetId;

    let result = "";
    const targetName = targetLocation?.name || targetPlayer?.name || targetObject?.name || targetId;

    if (entityType === 'player') {
      result = `Игрок "${entity.name}" переместился в/к "${targetName}"`;
    } else {
      result = `Объект "${entity.name}" перемещен в/к "${targetName}"`;
    }

    return { newState, result };
  }
};

export default tool;

