import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "move_player",
    description: "ВАЖНО: Это ЕДИНСТВЕННЫЙ способ перемещения игроков (персонажей) между локациями. НЕ используй set_attribute для изменения locationId игрока - это не сработает. Используй этот инструмент move_player для перемещения игрока из одной локации в другую. Перемещение возможно только если текущая локация игрока имеет связь с целевой локацией в подходящем направлении (out, in или bidirectional). Если нужно переместить игрока через несколько локаций, вызывай move_player последовательно для каждого шага.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerId: { type: Type.STRING, description: "ID игрока из состояния мира (формат: char_xxx). Не выдумывай ID - используй только существующие." },
        targetLocationId: { type: Type.STRING, description: "ID целевой локации (формат: loc_xxx)." },
      },
      required: ["playerId", "targetLocationId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const newState = cloneState(state);
    const { playerId, targetLocationId } = args;

    // Проверка на пустые значения
    if (!playerId || !targetLocationId) {
      return {
        newState: state,
        result: `Ошибка: playerId и targetLocationId не могут быть пустыми`
      };
    }

    // Найти игрока
    const player = newState.players.find(p => p.id === playerId);
    if (!player) {
      return {
        newState: state,
        result: `Ошибка: Игрок "${playerId}" не найден`
      };
    }

    // Проверка на перемещение в ту же локацию
    if (player.connectionId === targetLocationId) {
      return {
        newState: state,
        result: `Игрок "${player.name}" уже находится в локации "${targetLocationId}"`
      };
    }

    // Найти текущую (корневую) локацию игрока
    let currentId = player.connectionId;
    let currentLocation = newState.locations.find(l => l.id === currentId);

    // Если игрок в объекте, ищем локацию, в которой находится этот объект
    if (!currentLocation) {
      let ptr = currentId;
      const visited = new Set<string>();
      visited.add(ptr);
      while (ptr) {
        // Check object
        const obj = newState.objects.find(o => o.id === ptr);
        if (obj) {
          ptr = obj.connectionId;
          if (visited.has(ptr)) break; // Cycle
          visited.add(ptr);

          // Try finding location again
          const loc = newState.locations.find(l => l.id === ptr);
          if (loc) {
            currentLocation = loc;
            break;
          }
          continue;
        }
        // Check player (unlikely but possible)
        const parentPlayer = newState.players.find(p => p.id === ptr);
        if (parentPlayer) {
          ptr = parentPlayer.connectionId;
          if (visited.has(ptr)) break;
          visited.add(ptr);

          const loc = newState.locations.find(l => l.id === ptr);
          if (loc) {
            currentLocation = loc;
            break;
          }
          continue;
        }
        break; // Not object or player, dead end
      }
    }

    const targetLocation = newState.locations.find(l => l.id === targetLocationId);

    if (!currentLocation) {
      return {
        newState: state,
        result: `Ошибка: Не удалось определить текущую локацию игрока "${player.connectionId}". Возможно он внутри объекта, который нигде не находится.`
      };
    }

    if (!targetLocation) {
      return {
        newState: state,
        result: `Ошибка: Целевая локация "${targetLocationId}" не найдена`
      };
    }

    // Проверка связей между локациями
    // Проверяем связи текущей локации (out или bidirectional)
    const connectionFromCurrent = currentLocation.connections.find(
      conn => conn.targetLocationId === targetLocationId &&
        (conn.type === 'out' || conn.type === 'bidirectional')
    );

    // Проверяем связи целевой локации (in или bidirectional)
    const connectionFromTarget = targetLocation.connections.find(
      conn => conn.targetLocationId === currentLocation.id &&
        (conn.type === 'in' || conn.type === 'bidirectional')
    );

    if (!connectionFromCurrent && !connectionFromTarget) {
      return {
        newState: state,
        result: `Ошибка: Невозможно переместить игрока "${player.name}" из локации "${currentLocation.name}" в локацию "${targetLocation.name}" - нет подходящей связи между локациями`
      };
    }

    // Перемещаем игрока
    player.connectionId = targetLocationId;

    return {
      newState,
      result: `Игрок "${player.name}" перемещён из локации "${currentLocation.name}" в локацию "${targetLocation.name}"`
    };
  }
};

export default tool;

