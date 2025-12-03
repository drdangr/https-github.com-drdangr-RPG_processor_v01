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

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface CostInfo {
  inputCost: number; // Стоимость входных токенов в долларах
  outputCost: number; // Стоимость выходных токенов в долларах
  totalCost: number; // Общая стоимость в долларах
  model: string; // Модель, для которой рассчитана стоимость
}

export interface SimulationResult {
  narrative: string;
  toolLogs: ToolCallLog[];
  newState: GameState;
  thinking?: string; // Мысли модели (reasoning) - устаревшее, используйте simulationThinking и narrativeThinking
  simulationThinking?: string; // Мысли модели во время симуляции (вызов инструментов)
  narrativeThinking?: string; // Мысли модели во время генерации нарратива
  tokenUsage?: {
    simulation: TokenUsage; // Токены использованные в симуляции (все итерации)
    narrative: TokenUsage; // Токены использованные в нарративе
    total: TokenUsage; // Общее использование токенов
  };
  costInfo?: CostInfo; // Информация о стоимости хода
  simulationDebugInfo?: {
    responseStructure?: {
      totalParts: number;
      partTypes: Array<{
        hasText: boolean;
        hasThought: boolean;
        hasFunctionCall: boolean;
        textLength: number;
      }>;
    };
    functionCallsCount?: number;
    allParts?: Array<{
      type: 'text' | 'thought' | 'functionCall' | 'unknown';
      content: string;
      length: number;
    }>;
  };
  narrativeDebugInfo?: {
    responseStructure?: {
      totalParts: number;
      partTypes: Array<{
        hasText: boolean;
        hasThought: boolean;
        hasFunctionCall: boolean;
        textLength: number;
      }>;
    };
    functionCallsCount?: number;
    allParts?: Array<{
      type: 'text' | 'thought' | 'functionCall' | 'unknown';
      content: string;
      length: number;
    }>;
  };
}

// Настройки AI
export interface AISettings {
  modelId: string;
  maxIterations: number;
  temperature: number;
  thinkingBudget: number;
  systemPromptOverride?: string; // Если задан, заменяет стандартный промпт
  
  // Настройки для финального нарративного запроса (опционально)
  narrativeModelId?: string; // Если не задан, используется modelId
  narrativeTemperature?: number; // Если не задан, используется temperature
  narrativeThinkingBudget?: number; // Если не задан, используется thinkingBudget
  narrativePromptOverride?: string; // Если задан, используется вместо systemPromptOverride для нарратива
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  modelId: 'gemini-2.5-pro', // Pro модель для симуляции (более точная логика)
  maxIterations: 1,
  temperature: 0.0, // Низкая температура для точной симуляции
  thinkingBudget: 2048,
  narrativeModelId: 'gemini-2.5-flash', // Flash модель для нарратива (быстрее и дешевле)
  narrativeTemperature: 1.0, // Высокая температура для креативного нарратива
};

export const AVAILABLE_MODELS = [
  // Gemini 2.5 Pro - advanced reasoning, best for complex logic
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro — $1.25/$10.00 (продвинутая логика)' },
  
  // Gemini 2.5 Flash - hybrid reasoning, 1M context, thinking budgets
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash — $0.30/$2.50 (рекомендуется)' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest — $0.30/$2.50' },
  
  // Gemini 2.5 Flash-Lite - most cost effective
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite — $0.10/$0.40 (самая дешёвая)' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite Latest — $0.10/$0.40' },
  
  // Legacy models
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (legacy)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (legacy)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (legacy)' },
];

// Modular Tool Definition
export interface GameTool {
  definition: FunctionDeclaration;
  apply: (state: GameState, args: any) => { newState: GameState; result: string };
}
