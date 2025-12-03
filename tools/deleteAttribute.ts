import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "delete_attribute",
    description: "Удалить характеристику у игрока, объекта или локации. Используй этот инструмент, когда характеристика больше не актуальна или должна быть полностью удалена (например, эффект закончился, состояние прошло).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        entityType: {
          type: Type.STRING,
          enum: ["player", "object", "location"],
          description: "Тип сущности: 'player' для игрока, 'object' для объекта, 'location' для локации."
        },
        entityId: {
          type: Type.STRING,
          description: "ID сущности (playerId, objectId или locationId)."
        },
        attributeName: {
          type: Type.STRING,
          description: "Название характеристики для удаления (например, 'health', 'condition', 'durability', 'atmosphere', 'safety')."
        }
      },
      required: ["entityType", "entityId", "attributeName"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { entityType, entityId, attributeName } = args;
    
    // Валидация входных данных
    if (!entityType || !entityId || !attributeName) {
      return {
        newState: state,
        result: `Ошибка: entityType, entityId и attributeName обязательны`
      };
    }

    if (!["player", "object", "location"].includes(entityType)) {
      return {
        newState: state,
        result: `Ошибка: entityType должен быть 'player', 'object' или 'location'`
      };
    }

    const clonedState = cloneState(state);
    
    // Найти сущность
    let entity: any = null;
    let entityName = "";

    if (entityType === "player") {
      entity = clonedState.players.find(p => p.id === entityId);
      entityName = entity?.name || entityId;
    } else if (entityType === "object") {
      entity = clonedState.objects.find(o => o.id === entityId);
      entityName = entity?.name || entityId;
    } else if (entityType === "location") {
      entity = clonedState.locations.find(l => l.id === entityId);
      entityName = entity?.name || entityId;
    }

    if (!entity) {
      return {
        newState: state,
        result: `Ошибка: ${entityType} с ID "${entityId}" не найден`
      };
    }

    // Проверить наличие attributes
    if (!entity.attributes || entity.attributes[attributeName] === undefined) {
      return {
        newState: state,
        result: `Ошибка: характеристика "${attributeName}" не найдена у ${entityType} "${entityName}"`
      };
    }

    // Сохраняем старое значение для отчета
    const previousValue = entity.attributes[attributeName];

    // Удалить характеристику
    delete entity.attributes[attributeName];

    return {
      newState: clonedState,
      result: `Характеристика "${attributeName}" удалена у ${entityType} "${entityName}" (было: "${previousValue}")`
    };
  }
};

export default tool;

