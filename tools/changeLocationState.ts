import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "change_location_state",
    description: "Обновить атмосферное или физическое состояние локации.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        locationId: { type: Type.STRING, description: "ID локации." },
        newState: { type: Type.STRING, description: "Новое описание состояния (например, 'затоплена', 'тишина')." },
      },
      required: ["locationId", "newState"],
    },
  },
  apply: (state: GameState, args: any) => {
    const { locationId, newState: stateDescription } = args;
    
    // Валидация пустых значений
    if (!locationId || !stateDescription) {
      return { 
        newState: state, 
        result: `Ошибка: locationId и newState обязательны` 
      };
    }
    
    const clonedState = cloneState(state);
    const loc = clonedState.locations.find(l => l.id === locationId);
    
    if (!loc) {
      return { 
        newState: state, 
        result: `Ошибка: Локация "${locationId}" не найдена` 
      };
    }
    
    loc.state = stateDescription;
    return { 
      newState: clonedState, 
      result: `Состояние локации "${loc.name}" изменено на: "${stateDescription}"` 
    };
  }
};

export default tool;
