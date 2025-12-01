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
    const newState = cloneState(state);
    const { locationId, newState: newLocState } = args;
    const loc = newState.locations.find(l => l.id === locationId);
    let result = "";

    if (loc) {
      loc.state = newLocState;
      result = `Состояние локации ${loc.name} (${locationId}) изменено на: ${newLocState}`;
    } else {
      result = `Ошибка: Локация ${locationId} не найдена`;
    }
    return { newState, result };
  }
};

export default tool;
