import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "create_object",
    description: "Создать новый объект в мире игры. Используй когда в нарративе появляется новый предмет, который логично должен существовать (найденный предмет, результат действия, упомянутый объект).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { 
          type: Type.STRING, 
          description: "Название объекта (напр. 'Ржавый ключ', 'Записка')." 
        },
        description: { 
          type: Type.STRING, 
          description: "Описание объекта (внешний вид, особенности)." 
        },
        connectionId: { 
          type: Type.STRING, 
          description: "ID владельца/контейнера: ID игрока (объект у него), ID локации (лежит там), или ID другого объекта (внутри контейнера)." 
        },
        condition: { 
          type: Type.STRING, 
          description: "Начальное состояние объекта в виде нарративного описания (напр. 'новый и блестящий', 'почти сломан', 'закрыт на ключ'). По умолчанию 'в хорошем состоянии'." 
        },
      },
      required: ["name", "description", "connectionId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { name, description, connectionId, condition = "в хорошем состоянии" } = args;
    
    // Валидация обязательных полей
    if (!name || !description || !connectionId) {
      return { 
        newState: state, 
        result: `Ошибка: name, description и connectionId обязательны для создания объекта` 
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
    
    // Создание нового объекта
    const newObject = {
      id: newId,
      name: name.trim(),
      description: description.trim(),
      connectionId: connectionId,
      attributes: {
        condition: condition.trim() || "в хорошем состоянии"
      }
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
    
    return { 
      newState: clonedState, 
      result: `Создан новый объект "${name}" (${newId}) ${locationInfo}. Состояние: "${condition}".` 
    };
  }
};

export default tool;

