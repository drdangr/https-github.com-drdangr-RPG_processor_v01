import { FunctionDeclaration } from "@google/genai";

export interface WorldData {
  worldDescription: string;
  gameGenre: string;
}

export interface LocationData {
  id: string;
  name: string;
  description: string;
  currentSituation: string;
  connections: Array<{
    targetLocationId: string;
    type: 'in' | 'out' | 'bidirectional';
  }>;
  attributes: Record<string, string>; // Нарративные характеристики локации
}

export interface PlayerData {
  id: string;
  name: string;
  description: string;
  locationId: string; // Explicit location tracking
  attributes: Record<string, string>; // Нарративные характеристики игрока
}

export interface ObjectData {
  id: string;
  name: string;
  connectionId: string; // ID of Player, Location, or other Object
  attributes: Record<string, string>; // Нарративные характеристики объекта
}

export interface GameState {
  world: WorldData;
  locations: LocationData[];
  players: PlayerData[];
  objects: ObjectData[];
}

export interface ToolCallLog {
  name: string;
  args: any;
  result: string;
}

export interface SimulationResult {
  narrative: string;
  toolLogs: ToolCallLog[];
  newState: GameState;
}

// Modular Tool Definition
export interface GameTool {
  definition: FunctionDeclaration;
  apply: (state: GameState, args: any) => { newState: GameState; result: string };
}
