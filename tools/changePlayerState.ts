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
    const { playerId, newState: stateDescription } = args;
    
    // Валидация пустых значений
    if (!playerId || !stateDescription) {
      return { 
        newState: state, 
        result: `Ошибка: playerId и newState обязательны` 
      };
    }
    
    const clonedState = cloneState(state);
    const player = clonedState.players.find(p => p.id === playerId);
    
    if (!player) {
      return { 
        newState: state, 
        result: `Ошибка: Игрок "${playerId}" не найден` 
      };
    }
    
    player.state = stateDescription;
    return { 
      newState: clonedState, 
      result: `Состояние игрока "${player.name}" изменено на: "${stateDescription}"` 
    };
  }
};

export default tool;
