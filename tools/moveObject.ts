import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "move_object",
    description: "Переместить объект: передать игроку, поместить в локацию или внутрь другого объекта.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objectId: { type: Type.STRING, description: "ID объекта для перемещения." },
        targetId: { type: Type.STRING, description: "ID нового владельца/контейнера (Player ID, Location ID или Object ID)." },
      },
      required: ["objectId", "targetId"],
    },
  },
  apply: (state: GameState, args: any) => {
    const newState = cloneState(state);
    const { objectId, targetId } = args;
    const obj = newState.objects.find(o => o.id === objectId);
    let result = "";

    if (obj) {
      obj.connectionId = targetId;
      result = `Объект ${obj.name} (${objectId}) перемещен в ${targetId}`;
    } else {
      result = `Ошибка: Объект ${objectId} не найден`;
    }
    return { newState, result };
  }
};

export default tool;

