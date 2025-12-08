import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState, getAllDescendants, findRootLocationOrPlayer } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "delete_object",
    description: "Удалить объект, который перестал существовать в мире как первоночальная сущность. Вложенные объекты будут перемещены туда, где был удалённый объект.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: { 
          type: Type.STRING, 
          description: "Реальный ID объекта из состояния мира (формат: obj_timestamp_suffix, например 'obj_1764794659879_jo28'). Не выдумывай ID - используй только существующие ID из текущего состояния или из результата create_object." 
        },
      },
      required: ["objectId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { objectId } = args;
    
    // Валидация пустых значений
    if (!objectId) {
      return { 
        newState: state, 
        result: `Ошибка: objectId обязателен для удаления объекта` 
      };
    }
    
    const clonedState = cloneState(state);
    
    // Поиск объекта для удаления
    const objectIndex = clonedState.objects.findIndex(o => o.id === objectId);
    
    if (objectIndex === -1) {
      return { 
        newState: state, 
        result: `Ошибка: Объект "${objectId}" не найден` 
      };
    }
    
    const objectToDelete = clonedState.objects[objectIndex];
    const objectName = objectToDelete.name;
    
    // Определяем, куда переместить потомков
    let targetConnectionId: string | undefined;
    
    if (objectToDelete.connectionId && objectToDelete.connectionId.trim() !== '') {
      // У удаляемого объекта есть родитель
      const parentConnectionId = objectToDelete.connectionId;
      
      // Проверяем, является ли родитель локацией или игроком
      const isLocation = clonedState.locations.some(l => l.id === parentConnectionId);
      const isPlayer = clonedState.players.some(p => p.id === parentConnectionId);
      
      if (isLocation || isPlayer) {
        // Родитель - локация или игрок, потомки переходят туда
        targetConnectionId = parentConnectionId;
      } else {
        // Родитель - другой объект, потомки переходят к нему
        targetConnectionId = parentConnectionId;
      }
    } else {
      // У удаляемого объекта нет родителя - ищем корневую локацию/игрока по цепочке вверх
      const rootLocationOrPlayer = findRootLocationOrPlayer(
        objectId, 
        clonedState.objects, 
        clonedState.locations, 
        clonedState.players
      );
      targetConnectionId = rootLocationOrPlayer || undefined;
    }
    
    // Находим только ПРЯМЫХ потомков (не рекурсивно!)
    // Это объекты, у которых connectionId === objectId
    const directChildren = clonedState.objects.filter(o => o.connectionId === objectId);
    
    // Перемещаем только прямых потомков к найденной цели
    // Вложенные потомки остаются на своих местах (их connectionId указывает на прямых потомков)
    for (const directChild of directChildren) {
      const childIndex = clonedState.objects.findIndex(o => o.id === directChild.id);
      if (childIndex !== -1) {
        clonedState.objects[childIndex].connectionId = targetConnectionId;
      }
    }
    
    // Для информативного сообщения находим всех потомков рекурсивно
    const allDescendants = getAllDescendants(objectId, clonedState.objects);
    
    // Удалить объект из массива
    clonedState.objects.splice(objectIndex, 1);
    
    // Формируем информативное сообщение
    let result = `Объект "${objectName}" удалён`;
    
    if (allDescendants.length > 0) {
      const nestedNames = allDescendants.map(o => `"${o.name}"`).join(', ');
      
      // Определяем, куда переместились вложенные объекты
      const targetPlayer = targetConnectionId ? clonedState.players.find(p => p.id === targetConnectionId) : null;
      const targetLocation = targetConnectionId ? clonedState.locations.find(l => l.id === targetConnectionId) : null;
      const targetObject = targetConnectionId ? clonedState.objects.find(o => o.id === targetConnectionId) : null;
      
      let locationInfo = "";
      if (targetPlayer) {
        locationInfo = `к игроку "${targetPlayer.name}"`;
      } else if (targetLocation) {
        locationInfo = `в локацию "${targetLocation.name}"`;
      } else if (targetObject) {
        locationInfo = `в объект "${targetObject.name}"`;
      } else if (targetConnectionId) {
        locationInfo = `в "${targetConnectionId}"`;
      } else {
        locationInfo = `без связи (в корень)`;
      }
      
      result += `. Все вложенные объекты (${allDescendants.length}) перемещены ${locationInfo}: ${nestedNames}`;
    }
    
    return { 
      newState: clonedState, 
      result 
    };
  }
};

export default tool;

