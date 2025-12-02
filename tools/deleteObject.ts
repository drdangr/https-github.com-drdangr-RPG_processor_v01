import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "delete_object",
    description: "Удалить объект, который перестал существовать в мире как первоночальная сущность. Вложенные объекты будут перемещены туда, где был удалённый объект.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: { 
          type: Type.STRING, 
          description: "ID объекта для удаления." 
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
    const parentConnectionId = objectToDelete.connectionId;
    
    // Найти все вложенные объекты (объекты, у которых connectionId === objectId)
    const nestedObjects = clonedState.objects.filter(o => o.connectionId === objectId);
    
    // Переместить вложенные объекты к родителю удаляемого объекта
    for (const nested of nestedObjects) {
      nested.connectionId = parentConnectionId;
    }
    
    // Удалить объект из массива
    clonedState.objects.splice(objectIndex, 1);
    
    // Формируем информативное сообщение
    let result = `Объект "${objectName}" удалён`;
    
    if (nestedObjects.length > 0) {
      const nestedNames = nestedObjects.map(o => `"${o.name}"`).join(', ');
      
      // Определяем, куда переместились вложенные объекты
      const targetPlayer = clonedState.players.find(p => p.id === parentConnectionId);
      const targetLocation = clonedState.locations.find(l => l.id === parentConnectionId);
      const targetObject = clonedState.objects.find(o => o.id === parentConnectionId);
      
      let locationInfo = "";
      if (targetPlayer) {
        locationInfo = `к игроку "${targetPlayer.name}"`;
      } else if (targetLocation) {
        locationInfo = `в локацию "${targetLocation.name}"`;
      } else if (targetObject) {
        locationInfo = `в объект "${targetObject.name}"`;
      } else {
        locationInfo = `в "${parentConnectionId}"`;
      }
      
      result += `. Вложенные объекты (${nestedObjects.length}) перемещены ${locationInfo}: ${nestedNames}`;
    }
    
    return { 
      newState: clonedState, 
      result 
    };
  }
};

export default tool;

