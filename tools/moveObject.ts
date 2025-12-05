import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "move_object",
    description: "Переместить объект: передать игроку, поместить в локацию или внутрь другого объекта. Может работать как с реальными ID объектов из состояния мира, так и с ID, созданными предыдущими вызовами create_object в этом же ответе модели через ссылки вида $N.createdId (где N — индекс вызова create_object в общем списке вызовов этого ответа, начиная с 0).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: { 
          type: Type.STRING, 
          description: "Реальный ID объекта из состояния мира (формат: obj_timestamp_suffix) ИЛИ ссылка на результат предыдущего вызова create_object в этом же ответе в формате $N.createdId (где N — индекс вызова create_object в общем списке вызовов этого ответа, начиная с 0). Например: если create_object был вторым вызовом (после move_player), используй $1.createdId. Не выдумывай ID вручную — либо используй реальные ID из GameState, либо ссылки $N.createdId." 
        },
        targetId: { type: Type.STRING, description: "ID нового владельца/контейнера (Player ID, Location ID или Object ID)." },
      },
      required: ["objectId", "targetId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const newState = cloneState(state);
    const { objectId, targetId } = args;
    
    // Проверка на пустые значения
    if (!objectId || !targetId) {
      return { 
        newState: state, 
        result: `Ошибка: objectId и targetId не могут быть пустыми` 
      };
    }
    
    // Найти объект
    const obj = newState.objects.find(o => o.id === objectId);
    if (!obj) {
      return { 
        newState: state, 
        result: `Ошибка: Объект "${objectId}" не найден` 
      };
    }

    // Проверка на перемещение в себя
    if (objectId === targetId) {
      return { 
        newState: state, 
        result: `Ошибка: Объект не может быть перемещён в себя` 
      };
    }

    // Определить тип цели и проверить её существование
    const targetLocation = newState.locations.find(l => l.id === targetId);
    const targetPlayer = newState.players.find(p => p.id === targetId);
    const targetObject = newState.objects.find(o => o.id === targetId);

    if (!targetLocation && !targetPlayer && !targetObject) {
      return { 
        newState: state, 
        result: `Ошибка: Цель "${targetId}" не найдена (не локация, не игрок, не объект)` 
      };
    }

    // Проверка на циклические зависимости (если цель - объект)
    if (targetObject) {
      // Проверяем, не находится ли целевой объект внутри перемещаемого объекта
      let currentId = targetObject.connectionId;
      const visited = new Set<string>();
      
      while (currentId) {
        if (currentId === objectId) {
          return { 
            newState: state, 
            result: `Ошибка: Невозможно переместить объект "${obj.name}" в "${targetObject.name}" - это создаст циклическую зависимость` 
          };
        }
        if (visited.has(currentId)) break; // Защита от бесконечного цикла
        visited.add(currentId);
        
        const currentObj = newState.objects.find(o => o.id === currentId);
        if (!currentObj) break;
        currentId = currentObj.connectionId;
      }
    }

    // Обновить connectionId
    obj.connectionId = targetId;

    // Формируем информативное сообщение
    let result = "";
    if (targetPlayer) {
      result = `Объект "${obj.name}" передан игроку "${targetPlayer.name}"`;
    } else if (targetLocation) {
      result = `Объект "${obj.name}" перемещён в локацию "${targetLocation.name}"`;
    } else if (targetObject) {
      result = `Объект "${obj.name}" помещён внутрь объекта "${targetObject.name}"`;
    } else {
      result = `Объект "${obj.name}" перемещён в ${targetId}`;
    }

    return { newState, result };
  }
};

export default tool;

