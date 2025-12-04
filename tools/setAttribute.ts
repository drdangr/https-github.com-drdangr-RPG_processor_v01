import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "set_attribute",
    description: "Установить нарративное описание характеристики для игрока, объекта или локации. Характеристика будет создана автоматически, если её нет. Используй богатые, детальные описания вместо цифр (например, 'умирает от жажды' вместо 'health: 10%', 'почти сломан' вместо 'durability: 20%'). ВАЖНО: НЕ используй этот инструмент для изменения locationId игрока - для перемещения игроков используй инструмент move_player.",
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
          description: "Реальный ID сущности из состояния мира. Для объектов формат: obj_timestamp_suffix. Не выдумывай ID - используй только существующие."
        },
        attributeName: {
          type: Type.STRING,
          description: "Название характеристики (например, 'health', 'condition', 'durability', 'atmosphere', 'safety'). Может быть любым - система создаст его автоматически."
        },
        value: {
          type: Type.STRING,
          description: "Текстовое описание характеристики. Должно быть детальным и нарративным (например, 'сильно ранен, но может продолжать бой', 'почти сломан, но еще работает', 'опасная атмосфера, чувствуется угроза')."
        }
      },
      required: ["entityType", "entityId", "attributeName", "value"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { entityType, entityId, attributeName, value } = args;
    
    // Валидация входных данных
    if (!entityType || !entityId || !attributeName || value === undefined || value === null || value === '') {
      return {
        newState: state,
        result: `Ошибка: entityType, entityId, attributeName и value обязательны`
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

    // КРИТИЧЕСКАЯ ЗАЩИТА: Нельзя изменять locationId через set_attribute
    // Для перемещения игроков используется специальный инструмент move_player
    if (entityType === "player" && attributeName === "locationId") {
      return {
        newState: state,
        result: `ОШИБКА: Нельзя изменять locationId игрока через set_attribute! Для перемещения игроков между локациями ВСЕГДА используй инструмент move_player. Это единственный способ перемещения игроков.`
      };
    }

    // Создать attributes, если его нет
    if (!entity.attributes) {
      entity.attributes = {};
    }

    // Установить характеристику
    const previousValue = entity.attributes[attributeName];
    entity.attributes[attributeName] = value;

    // Формируем результат
    if (previousValue !== undefined) {
      return {
        newState: clonedState,
        result: `Характеристика "${attributeName}" для ${entityType} "${entityName}" изменена с "${previousValue}" на "${value}"`
      };
    } else {
      return {
        newState: clonedState,
        result: `Характеристика "${attributeName}" для ${entityType} "${entityName}" создана: "${value}"`
      };
    }
  }
};

export default tool;

