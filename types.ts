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
  iteration: number; // Номер итерации (шага) в многоходовом цикле
}

export interface SimulationResult {
  narrative: string;
  toolLogs: ToolCallLog[];
  newState: GameState;
  thinking?: string; // Мысли модели (reasoning)
}

// Настройки AI
export interface AISettings {
  modelId: string;
  maxIterations: number;
  temperature: number;
  thinkingBudget: number;
  systemPromptOverride?: string; // Если задан, заменяет стандартный промпт
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  modelId: 'gemini-2.5-flash',
  maxIterations: 5,
  temperature: 0.7,
  thinkingBudget: 2048,
};

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (рекомендуется)' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (медленнее, умнее)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (legacy)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (legacy)' },
];

// Modular Tool Definition
export interface GameTool {
  definition: FunctionDeclaration;
  apply: (state: GameState, args: any) => { newState: GameState; result: string };
}
