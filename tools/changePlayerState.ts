import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";
import { cloneState } from '../utils/gameUtils';

const tool: GameTool = {
  definition: {
    name: "change_player_state",
    description: "Обновить описание состояния/кондиции игрока.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerId: { type: Type.STRING, description: "ID игрока." },
        newState: { type: Type.STRING, description: "Новое описание состояния (например, 'без сознания', 'воодушевлен')." },
      },
      required: ["playerId", "newState"],
    },
  },
  apply: (state: GameState, args: any) => {
    const newState = cloneState(state);
    const { playerId, newState: newPlayerState } = args;
    const player = newState.players.find(p => p.id === playerId);
    let result = "";

    if (player) {
      player.state = newPlayerState;
      result = `Состояние игрока ${player.name} (${playerId}) изменено на: ${newPlayerState}`;
    } else {
      result = `Ошибка: Игрок ${playerId} не найден`;
    }
    return { newState, result };
  }
};

export default tool;
