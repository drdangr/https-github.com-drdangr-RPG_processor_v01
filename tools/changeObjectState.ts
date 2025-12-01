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
    const newState = cloneState(state);
    const { objectId, newState: newObjState } = args;
    const obj = newState.objects.find(o => o.id === objectId);
    let result = "";

    if (obj) {
      obj.state = newObjState;
      result = `Состояние объекта ${obj.name} (${objectId}) изменено на: ${newObjState}`;
    } else {
      result = `Ошибка: Объект ${objectId} не найден`;
    }
    return { newState, result };
  }
};

export default tool;
