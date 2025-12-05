import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "create_object",
    description: "Создать новый объект в мире игры. Используй когда в нарративе появляется новый предмет, который логично должен существовать (найденный предмет, результат действия, упомянутый объект). Можно сразу задать несколько атрибутов для полного описания объекта. Инструмент возвращает скрытый идентификатор createdId, который можно использовать в этом же ответе модели в аргументах других инструментов через ссылки вида $N.createdId (где N — индекс вызова инструмента в общем списке вызовов этого ответа, начиная с 0). Например: если create_object — это второй вызов в ответе (после move_player), используй $1.createdId.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { 
          type: Type.STRING, 
          description: "Название объекта (напр. 'Ржавый ключ', 'Записка')." 
        },
        connectionId: { 
          type: Type.STRING, 
          description: "ID владельца/контейнера: ID игрока (объект у него), ID локации (лежит там), или ID другого объекта (внутри контейнера)." 
        },
        attributes: { 
          type: Type.STRING,
          description: "JSON объект с атрибутами в формате {\"ключ\": \"значение\"}. Примеры атрибутов: condition (состояние), type (тип), size (размер), material (материал), appearance (внешний вид), smell (запах), content (содержимое), feature (особенность), quality (качество), durability (прочность). Все значения должны быть нарративными описаниями. Пример: {\"condition\": \"ржавый\", \"size\": \"небольшой\", \"material\": \"железный\"}"
        },
      },
      required: ["name", "connectionId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { name, connectionId, attributes: attributesArg } = args;
    
    // Валидация обязательных полей
    if (!name || !connectionId) {
      return { 
        newState: state, 
        result: `Ошибка: name и connectionId обязательны для создания объекта` 
      };
    }
    
    const clonedState = cloneState(state);
    
    // Проверка существования connectionId (должен быть игрок, локация или объект)
    const targetPlayer = clonedState.players.find(p => p.id === connectionId);
    const targetLocation = clonedState.locations.find(l => l.id === connectionId);
    const targetObject = clonedState.objects.find(o => o.id === connectionId);
    
    if (!targetPlayer && !targetLocation && !targetObject) {
      return { 
        newState: state, 
        result: `Ошибка: Цель "${connectionId}" не найдена (не игрок, не локация, не объект)` 
      };
    }
    
    // Генерация уникального ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newId = `obj_${timestamp}_${randomSuffix}`;
    
    // Проверка на дубликат ID (маловероятно, но для надёжности)
    if (clonedState.objects.some(o => o.id === newId)) {
      return { 
        newState: state, 
        result: `Ошибка: Не удалось сгенерировать уникальный ID для объекта` 
      };
    }
    
    // Парсим атрибуты - поддерживаем JSON строку и объект
    const normalizedAttributes: Record<string, string> = {};
    let parsedAttributes: any = null;
    
    if (attributesArg) {
      if (typeof attributesArg === 'string') {
        try {
          parsedAttributes = JSON.parse(attributesArg);
        } catch (e) {
          // Если не удалось распарсить как JSON, считаем это значением condition
          normalizedAttributes.condition = attributesArg.trim();
        }
      } else if (typeof attributesArg === 'object') {
        parsedAttributes = attributesArg;
      }
    }
    
    // Нормализуем распарсенные атрибуты
    if (parsedAttributes && typeof parsedAttributes === 'object') {
      for (const [key, value] of Object.entries(parsedAttributes)) {
        if (value !== undefined && value !== null && value !== '') {
          normalizedAttributes[key] = String(value).trim();
        }
      }
    }
    
    // Если атрибуты не переданы, добавляем condition по умолчанию
    if (Object.keys(normalizedAttributes).length === 0) {
      normalizedAttributes.condition = "в хорошем состоянии";
    }
    
    // Создание нового объекта
    const newObject = {
      id: newId,
      name: name.trim(),
      connectionId: connectionId,
      attributes: normalizedAttributes
    };
    
    // Добавление в массив объектов
    clonedState.objects.push(newObject);
    
    // Формируем информативное сообщение
    let locationInfo = "";
    if (targetPlayer) {
      locationInfo = `у игрока "${targetPlayer.name}"`;
    } else if (targetLocation) {
      locationInfo = `в локации "${targetLocation.name}"`;
    } else if (targetObject) {
      locationInfo = `внутри объекта "${targetObject.name}"`;
    }
    
    // Формируем список атрибутов для результата
    const attrList = Object.entries(normalizedAttributes)
      .map(([k, v]) => `${k}: "${v}"`)
      .join(', ');
    
    return { 
      newState: clonedState, 
      result: `Создан новый объект "${name}" (${newId}) ${locationInfo}. Атрибуты: ${attrList}.`,
      createdId: newId
    };
  }
};

export default tool;

