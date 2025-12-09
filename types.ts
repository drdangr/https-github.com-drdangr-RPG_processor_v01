import { FunctionDeclaration, Content, Part } from "@google/genai";

export interface GeminiApiResponse {
  candidates?: Array<{
    content?: Content;
    finishReason?: string;
    // Add other candidate fields if needed
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

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
  attributes?: Record<string, string>;
}

export interface PlayerData {
  id: string;
  name: string;
  description: string;
  inventory: string[]; // Array of Object IDs
  health: number;
  state: string; // e.g., "drunk", "tired"
  connectionId: string; // Unified location tracking (Location ID, Object ID, etc.)
  attributes?: Record<string, string>;
}

export interface ObjectData {
  id: string;
  name: string;
  description?: string;
  connectionId: string; // ID of Player, Location, or other Object
  state?: string; // e.g., "broken", "working"
  attributes?: Record<string, string>;
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
  iteration?: number;
}

export interface SimulationResult {
  narrative: string;
  toolLogs: ToolCallLog[];
  newState: GameState;
  thinking?: string;
  simulationThinking?: string;
  narrativeThinking?: string;
  tokenUsage?: {
    simulation: TokenUsage;
    narrative: TokenUsage | null;
    total: TokenUsage;
  };
  costInfo?: CostInfo;
  simulationDebugInfo?: any;
  narrativeDebugInfo?: any;
}

// Modular Tool Definition
export interface GameTool {
  definition: FunctionDeclaration;
  apply: (state: GameState, args: any) => { newState: GameState; result: string; createdId?: string };
}

// AI Settings
export interface AISettings {
  modelId: string;
  maxIterations: number;
  temperature: number;
  thinkingBudget: number;
  systemPromptOverride?: string;
  systemPromptPresetId?: string;
  narrativePromptOverride?: string;
  narrativePromptPresetId?: string;
  narrativeModelId?: string;
  narrativeTemperature?: number;
  narrativeThinkingBudget?: number;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  modelId: 'gemini-flash-latest',
  maxIterations: 5,
  temperature: 0.6,
  thinkingBudget: 8192,
  narrativeModelId: 'gemini-flash-lite-latest',
  narrativeTemperature: 0.8,
};

// Available Models
export interface ModelInfo {
  id: string;
  name: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite Latest' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
];

// Token Usage
export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

// Cost Info
export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model?: string;
}

// Turn History
export interface TurnHistory {
  turn: number;
  userPrompt: string;
  narrative: string;
  toolLogs: ToolCallLog[];
}
