import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "change_object_state",
    description: "Обновить описание состояния объекта.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: { type: Type.STRING, description: "ID объекта." },
        newState: { type: Type.STRING, description: "Новое описание состояния (например, 'сломан', 'активирован')." },
      },
      required: ["objectId", "newState"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { objectId, newState: stateDescription } = args;
    
    // Валидация пустых значений
    if (!objectId || !stateDescription) {
      return { 
        newState: state, 
        result: `Ошибка: objectId и newState обязательны` 
      };
    }
    
    const clonedState = cloneState(state);
    const obj = clonedState.objects.find(o => o.id === objectId);
    
    if (!obj) {
      return { 
        newState: state, 
        result: `Ошибка: Объект "${objectId}" не найден` 
      };
    }
    
    obj.state = stateDescription;
    return { 
      newState: clonedState, 
      result: `Состояние объекта "${obj.name}" изменено на: "${stateDescription}"` 
    };
  }
};

export default tool;
