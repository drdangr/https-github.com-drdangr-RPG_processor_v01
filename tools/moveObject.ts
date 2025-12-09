import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "move_object",
    description: "Универсальный иструмент для перемещения ОБЪЕКТОВ и ИГРОКОВ. Позволяет поместить сущность (объект или игрока) в локацию, внутрь объекта или передать другому игроку. Работает с иерархией. При перемещении объекта в объект, проверяет отсутствие циклов. ВАЖНО: При перемещении объекта ВСЕ прикрепленные к нему объекты и игроки автоматически перемещаются вместе с ним, и их locationId обновляется на новую корневую локацию. Используй этот инструмент, чтобы: положить предмет в ящик, дать предмет игроку, посадить игрока в машину, перенести объект в другую комнату.",
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

    // Helper: Find root location by traversing up the hierarchy
    const findRootLocation = (entityId: string): string | undefined => {
      let currentId = entityId;
      const visited = new Set<string>();

      while (currentId) {
        if (visited.has(currentId)) return undefined; // Cycle
        visited.add(currentId);

        const loc = newState.locations.find(l => l.id === currentId);
        if (loc) return loc.id;

        const obj = newState.objects.find(o => o.id === currentId);
        if (obj) {
          currentId = obj.connectionId;
          continue;
        }

        const player = newState.players.find(p => p.id === currentId);
        if (player) {
          currentId = player.connectionId;
          continue;
        }

        return undefined;
      }
      return undefined;
    };

    // Helper: Find all players inside an object hierarchy (recursively)
    const findPlayersInHierarchy = (entityId: string): string[] => {
      const playerIds: string[] = [];
      const visited = new Set<string>();

      const traverse = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);

        // Check if any players are connected to this entity
        newState.players.forEach(p => {
          if (p.connectionId === id && !playerIds.includes(p.id)) {
            playerIds.push(p.id);
            // Recursively check if this player has objects/players inside
            traverse(p.id);
          }
        });

        // Check if any objects are connected to this entity
        newState.objects.forEach(o => {
          if (o.connectionId === id) {
            traverse(o.id);
          }
        });
      };

      traverse(entityId);
      return playerIds;
    };

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

    // 6. Обновляем locationId для всех игроков внутри перемещаемой сущности
    const rootLocationId = findRootLocation(targetId);
    const affectedPlayerIds = findPlayersInHierarchy(objectId);

    affectedPlayerIds.forEach(playerId => {
      const player = newState.players.find(p => p.id === playerId);
      if (player) {
        player.locationId = rootLocationId;
      }
    });

    // Если перемещаемая сущность - сам игрок, обновляем его locationId
    if (entityType === 'player') {
      entity.locationId = rootLocationId;
    }

    let result = "";
    const targetName = targetLocation?.name || targetPlayer?.name || targetObject?.name || targetId;

    if (entityType === 'player') {
      result = `Игрок "${entity.name}" переместился в/к "${targetName}"`;
    } else {
      result = `Объект "${entity.name}" перемещен в/к "${targetName}"`;
    }

    if (affectedPlayerIds.length > 0) {
      result += `. Обновлен locationId для ${affectedPlayerIds.length} игрок(ов) внутри`;
    }

    return { newState, result };
  }
};

export default tool;

