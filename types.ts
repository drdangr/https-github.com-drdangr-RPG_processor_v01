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
  state: string; // Dynamic state (e.g., "quiet", "crowded")
  connections: Array<{
    targetLocationId: string;
    type: 'in' | 'out' | 'bidirectional';
  }>;
}

export interface PlayerData {
  id: string;
  name: string;
  description: string;
  health: number;
  state: string; // e.g., "drunk", "tired"
  locationId: string; // Explicit location tracking
}

export interface ObjectData {
  id: string;
  name: string;
  description: string;
  connectionId: string; // ID of Player, Location, or other Object
  state: string; // e.g., "broken", "working"
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
