import { GoogleGenAI, Tool, Content, Part } from "@google/genai";
import { GameState, SimulationResult, ToolCallLog, GameTool, AISettings, DEFAULT_AI_SETTINGS, TokenUsage, CostInfo, TurnHistory, GeminiApiResponse } from "../types";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_NARRATIVE_PROMPT } from "../prompts/systemPrompts";
import { normalizeState } from "../utils/gameUtils";
import { withRetry } from "../utils/retry";

// Cache for system prompts to avoid re-generating identical prompts
// Key: hash of relevant state + settings + isFinalNarrative
// Value: generated prompt string
const promptCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory leaks

// Simple string hash function
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
};

// Цены на токены для разных моделей Gemini (за 1 миллион токенов)
// Источник: https://ai.google.dev/pricing (актуализировать при необходимости)
// 
// ВАЖНО: Идентификаторы моделей добавлены на основе скриншота Google AI Studio.
// Необходимо проверить через реальный API, какие идентификаторы работают:
// - Работают ли алиасы типа "gemini-flash-latest" или нужно использовать полные имена
// - Правильность идентификаторов "gemini-2.5-flash" и "gemini-2.5-flash-lite"
// - Если модель не найдена, API вернет ошибку - нужно будет скорректировать идентификаторы
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Только модели со скриншота Google AI Studio

  // Gemini 2.5 Pro - advanced reasoning model
  // <=200K tokens: $1.25/$10.00 per 1M, >200K: $2.50/$15.00 per 1M
  // Используем базовую цену для <=200K
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },

  // Gemini Flash Latest - алиас на gemini-2.5-flash-preview-09-2025
  'gemini-flash-latest': { input: 0.30, output: 2.50 },

  // Gemini Flash-Lite Latest - алиас на gemini-2.5-flash-lite-preview-09-2025
  'gemini-flash-lite-latest': { input: 0.10, output: 0.40 },

  // Gemini 2.5 Flash - hybrid reasoning with 1M context
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },

  // Gemini 2.5 Flash-Lite - most cost effective
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
};

// Функция для извлечения информации о токенах из ответа API
const extractTokenUsage = (response: GeminiApiResponse): TokenUsage | null => {
  try {
    const usageMetadata = response?.usageMetadata;
    if (!usageMetadata) return null;

    return {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    };
  } catch (e) {
    console.warn("[Service] Could not extract token usage:", e);
    return null;
  }
};

// Функция для расчета стоимости на основе модели и токенов
const calculateCost = (tokenUsage: TokenUsage, modelId: string): CostInfo | null => {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) {
    console.warn(`[Service] No pricing found for model: ${modelId}`);
    return null;
  }

  const inputCost = (tokenUsage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.candidatesTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    model: modelId,
  };
};

// ============================================================================
// БЕЗОПАСНЫЕ ХЕЛПЕРЫ ДЛЯ РАБОТЫ С ОТВЕТАМИ GEMINI API
// ============================================================================
// Единая точка доступа к структуре ответа API с валидацией
// Это предотвращает ошибки "Cannot read properties of undefined"

interface ResponseContentData {
  content: Content;
  parts: Part[];
}

/**
 * Безопасно извлекает content и parts из ответа Gemini API
 * @returns { content, parts } или null, если структура невалидна
 */
const getResponseContent = (response: GeminiApiResponse): ResponseContentData | null => {
  if (!response?.candidates || !Array.isArray(response.candidates) || response.candidates.length === 0) {
    return null;
  }

  const candidate = response.candidates[0];
  if (!candidate?.content) {
    return null;
  }

  const parts = candidate.content.parts || [];
  return {
    content: candidate.content,
    parts
  };
};

/**
 * Безопасно извлекает tool calls из ответа
 * @returns массив function calls или пустой массив
 */
const getToolCalls = (response: GeminiApiResponse): Array<{ name: string; id: string; args: any }> => {
  const contentData = getResponseContent(response);
  if (!contentData) return [];

  return contentData.parts
    .filter(p => p.functionCall)
    .map(p => ({
      name: p.functionCall!.name || 'unknown',
      id: "call_" + Math.random().toString(36).substr(2, 9), // Google GenAI types might miss ID in strict mode? Or generic check.
      args: p.functionCall!.args || {}
    }));
};

/**
 * Безопасно извлекает текстовые части из ответа
 * @param excludeThoughts - исключить части с thought: true и thinking-подобные тексты
 * @returns массив текстовых строк
 */
const getTextParts = (response: GeminiApiResponse, excludeThoughts: boolean = false): string[] => {
  const contentData = getResponseContent(response);
  if (!contentData) return [];

  return contentData.parts
    .filter(p => {
      if (!p.text) return false;
      if (excludeThoughts && p.thought === true) return false;
      if (excludeThoughts) {
        const text = p.text.trim();
        if (text.startsWith('**Analysis') ||
          text.startsWith('**Thinking') ||
          text.startsWith('**Okay') ||
          text.startsWith('Okay,')) {
          return false;
        }
      }
      return true;
    })
    .map(p => p.text!)
    .filter(Boolean);
};

/**
 * Безопасно извлекает thinking части из ответа
 * @returns массив текстов thinking
 */
const getThoughtParts = (response: GeminiApiResponse): string[] => {
  const contentData = getResponseContent(response);
  if (!contentData) return [];

  return contentData.parts
    .filter(p => p.thought === true && p.text)
    .map(p => p.text!)
    .filter(Boolean);
};

/**
 * Парсит системную инструкцию на подразделы
 */
const parseSystemInstruction = (systemInstruction: string): {
  basePrompt?: string;
  worldState?: string;
  locationContext?: string;
  historySection?: string;
} => {
  const result: any = {};
  
  // Ищем "ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):"
  // Останавливаемся на "ТЕКУЩАЯ ЛОКАЦИЯ", "ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ", "ДОСТУПНЫЕ ОБЪЕКТЫ ДЛЯ РАЗМЕТКИ" или конце строки
  const worldStateMatch = systemInstruction.match(/ТЕКУЩЕЕ СОСТОЯНИЕ МИРА \(JSON\):([\s\S]*?)(?=ТЕКУЩАЯ ЛОКАЦИЯ|ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ|ДОСТУПНЫЕ ОБЪЕКТЫ ДЛЯ РАЗМЕТКИ|$)/);
  if (worldStateMatch) {
    result.worldState = worldStateMatch[1].trim();
    // Базовый промпт - все до "ТЕКУЩЕЕ СОСТОЯНИЕ МИРА"
    const beforeWorldState = systemInstruction.substring(0, systemInstruction.indexOf('ТЕКУЩЕЕ СОСТОЯНИЕ МИРА'));
    if (beforeWorldState.trim()) {
      result.basePrompt = beforeWorldState.trim();
    }
  } else {
    // Если нет раздела с состоянием мира, весь текст - базовый промпт
    result.basePrompt = systemInstruction;
  }
  
  // Ищем "ТЕКУЩАЯ ЛОКАЦИЯ"
  // Останавливаемся на "ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ", "ДОСТУПНЫЕ ОБЪЕКТЫ ДЛЯ РАЗМЕТКИ" или конце строки
  const locationMatch = systemInstruction.match(/ТЕКУЩАЯ ЛОКАЦИЯ \(ГДЕ НАХОДИТСЯ ИГРОК\):([\s\S]*?)(?=ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ|ДОСТУПНЫЕ ОБЪЕКТЫ ДЛЯ РАЗМЕТКИ|$)/);
  if (locationMatch) {
    result.locationContext = locationMatch[1].trim();
  }
  
  // Ищем "ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ"
  const historyMatch = systemInstruction.match(/ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ[^:]*:([\s\S]*?)$/);
  if (historyMatch) {
    result.historySection = historyMatch[1].trim();
  }
  
  return result;
};

/**
 * Создает размеченный лог всех компонентов, отправляемых в LLM
 * Использует структурированную разметку с уникальными ID для каждого блока
 */
const createMarkedPromptLog = (
  systemInstruction: string,
  tools: Tool[],
  userPrompt: string,
  conversationHistory?: Content[],
  settings?: {
    temperature?: number;
    modelId?: string;
    thinkingBudget?: number;
    includeConnectedLocationObjects?: boolean;
    compactConnectedLocationObjects?: boolean;
  }
): string => {
  const MARKER_START = '<<<';
  const MARKER_END = '>>>';
  const BLOCK_SEPARATOR = '---';
  
  // Парсим системную инструкцию на подразделы
  const systemParts = parseSystemInstruction(systemInstruction);
  
  let log = '\n';
  log += `${MARKER_START}BLOCK:REQUEST_LOG${MARKER_END}\n\n`;

  // Настройки запроса
  if (settings) {
    log += `${MARKER_START}BLOCK:SETTINGS${MARKER_END}\n`;
    log += `Модель: ${settings.modelId || 'не указана'}\n`;
    log += `Температура: ${settings.temperature ?? 'не указана'}\n`;
    log += `Thinking Budget: ${settings.thinkingBudget ?? 'не указан'}\n`;
    log += `Объекты в соседних локациях: ${settings.includeConnectedLocationObjects ? 'ON' : 'OFF'}\n`;
    log += `Соседние объекты компактно: ${settings.compactConnectedLocationObjects ? 'ON' : 'OFF'}\n`;
    log += `${MARKER_START}ENDBLOCK:SETTINGS${MARKER_END}\n\n`;
  }

  // Системная инструкция - разбиваем на подразделы
  log += `${MARKER_START}BLOCK:SYSTEM_INSTRUCTION${MARKER_END}\n`;
  
  // Базовый промпт
  if (systemParts.basePrompt) {
    log += `${MARKER_START}SUBBLOCK:BASE_PROMPT${MARKER_END}\n`;
    log += systemParts.basePrompt;
    log += `\n${MARKER_START}ENDSUBBLOCK:BASE_PROMPT${MARKER_END}\n\n`;
  }
  
  // Состояние мира (JSON)
  if (systemParts.worldState) {
    log += `${MARKER_START}SUBBLOCK:WORLD_STATE${MARKER_END}\n`;
    log += `ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):\n${systemParts.worldState}`;
    log += `\n${MARKER_START}ENDSUBBLOCK:WORLD_STATE${MARKER_END}\n\n`;
  }
  
  // Контекст локации
  if (systemParts.locationContext) {
    log += `${MARKER_START}SUBBLOCK:LOCATION_CONTEXT${MARKER_END}\n`;
    log += systemParts.locationContext;
    log += `\n${MARKER_START}ENDSUBBLOCK:LOCATION_CONTEXT${MARKER_END}\n\n`;
  }
  
  // История ходов
  if (systemParts.historySection) {
    log += `${MARKER_START}SUBBLOCK:HISTORY_SECTION${MARKER_END}\n`;
    log += systemParts.historySection;
    log += `\n${MARKER_START}ENDSUBBLOCK:HISTORY_SECTION${MARKER_END}\n\n`;
  }
  
  // Если системная инструкция не была распарсена, выводим целиком
  if (!systemParts.basePrompt && !systemParts.worldState) {
    log += systemInstruction;
  }
  
  log += `${MARKER_START}ENDBLOCK:SYSTEM_INSTRUCTION${MARKER_END}\n\n`;

  // Описание инструментов
  log += `${MARKER_START}BLOCK:TOOLS${MARKER_END}\n`;
  if (tools.length > 0 && tools[0].functionDeclarations) {
    const toolDefs = tools[0].functionDeclarations;
    toolDefs.forEach((tool, index) => {
      log += `${MARKER_START}SUBBLOCK:TOOL_${index + 1}${MARKER_END}\n`;
      log += `Имя: ${tool.name}\n`;
      log += `Описание: ${tool.description || '(нет описания)'}\n`;
      if (tool.parameters) {
        log += `Параметры:\n${JSON.stringify(tool.parameters, null, 2)}\n`;
      }
      log += `${MARKER_START}ENDSUBBLOCK:TOOL_${index + 1}${MARKER_END}\n\n`;
    });
  } else {
    log += '(нет инструментов)\n';
  }
  log += `${MARKER_START}ENDBLOCK:TOOLS${MARKER_END}\n\n`;

  // История разговора (если есть)
  if (conversationHistory && conversationHistory.length > 0) {
    log += `${MARKER_START}BLOCK:CONVERSATION_HISTORY${MARKER_END}\n`;
    conversationHistory.forEach((content, index) => {
      log += `${MARKER_START}SUBBLOCK:MESSAGE_${index + 1}${MARKER_END}\n`;
      log += `Роль: ${content.role}\n`;
      if (content.parts && content.parts.length > 0) {
        content.parts.forEach((part, partIndex) => {
          if (part.text) {
            log += `[Часть ${partIndex + 1} - Текст]\n${part.text}\n`;
          }
          if (part.functionCall) {
            log += `[Часть ${partIndex + 1} - Вызов функции]\n${JSON.stringify(part.functionCall, null, 2)}\n`;
          }
          if (part.functionResponse) {
            log += `[Часть ${partIndex + 1} - Ответ функции]\n${JSON.stringify(part.functionResponse, null, 2)}\n`;
          }
        });
      }
      log += `${MARKER_START}ENDSUBBLOCK:MESSAGE_${index + 1}${MARKER_END}\n\n`;
    });
    log += `${MARKER_START}ENDBLOCK:CONVERSATION_HISTORY${MARKER_END}\n\n`;
  }

  // Запрос пользователя
  log += `${MARKER_START}BLOCK:USER_PROMPT${MARKER_END}\n`;
  log += userPrompt;
  log += `\n${MARKER_START}ENDBLOCK:USER_PROMPT${MARKER_END}\n`;

  log += `\n${MARKER_START}ENDBLOCK:REQUEST_LOG${MARKER_END}\n\n`;
  return log;
};

/**
 * Создает размеченный лог для запроса нарратива к LLM
 */
const createMarkedNarrativeLog = (
  systemInstruction: string,
  userPrompt: string,
  toolsSummary: string,
  simulationContext: string,
  narrativeInstruction: string,
  settings?: {
    temperature?: number;
    modelId?: string;
    thinkingBudget?: number;
  }
): string => {
  const MARKER_START = '<<<';
  const MARKER_END = '>>>';
  
  // Парсим системную инструкцию на подразделы
  const systemParts = parseSystemInstruction(systemInstruction);
  
  let log = '\n';
  log += `${MARKER_START}BLOCK:REQUEST_LOG${MARKER_END}\n\n`;

  // Настройки запроса
  if (settings) {
    log += `${MARKER_START}BLOCK:SETTINGS${MARKER_END}\n`;
    log += `Модель: ${settings.modelId || 'не указана'}\n`;
    log += `Температура: ${settings.temperature ?? 'не указана'}\n`;
    log += `Thinking Budget: ${settings.thinkingBudget ?? 'не указан'}\n`;
    log += `${MARKER_START}ENDBLOCK:SETTINGS${MARKER_END}\n\n`;
  }

  // Системная инструкция - разбиваем на подразделы
  log += `${MARKER_START}BLOCK:SYSTEM_INSTRUCTION${MARKER_END}\n`;
  
  // Базовый промпт
  if (systemParts.basePrompt) {
    log += `${MARKER_START}SUBBLOCK:BASE_PROMPT${MARKER_END}\n`;
    log += systemParts.basePrompt;
    log += `\n${MARKER_START}ENDSUBBLOCK:BASE_PROMPT${MARKER_END}\n\n`;
  }
  
  // Состояние мира (JSON)
  if (systemParts.worldState) {
    log += `${MARKER_START}SUBBLOCK:WORLD_STATE${MARKER_END}\n`;
    log += `ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):\n${systemParts.worldState}`;
    log += `\n${MARKER_START}ENDSUBBLOCK:WORLD_STATE${MARKER_END}\n\n`;
  }
  
  // Контекст локации
  if (systemParts.locationContext) {
    log += `${MARKER_START}SUBBLOCK:LOCATION_CONTEXT${MARKER_END}\n`;
    log += systemParts.locationContext;
    log += `\n${MARKER_START}ENDSUBBLOCK:LOCATION_CONTEXT${MARKER_END}\n\n`;
  }
  
  // История ходов
  if (systemParts.historySection) {
    log += `${MARKER_START}SUBBLOCK:HISTORY_SECTION${MARKER_END}\n`;
    log += systemParts.historySection;
    log += `\n${MARKER_START}ENDSUBBLOCK:HISTORY_SECTION${MARKER_END}\n\n`;
  }
  
  // Если системная инструкция не была распарсена, выводим целиком
  if (!systemParts.basePrompt && !systemParts.worldState) {
    log += systemInstruction;
  }
  
  log += `${MARKER_START}ENDBLOCK:SYSTEM_INSTRUCTION${MARKER_END}\n\n`;

  // Запрос пользователя (состоит из нескольких частей)
  log += `${MARKER_START}BLOCK:USER_PROMPT${MARKER_END}\n`;
  
  // Исходный запрос игрока
  if (userPrompt) {
    log += `${MARKER_START}SUBBLOCK:PLAYER_INPUT${MARKER_END}\n`;
    log += userPrompt;
    log += `\n${MARKER_START}ENDSUBBLOCK:PLAYER_INPUT${MARKER_END}\n\n`;
  }
  
  // Сводка выполненных инструментов
  if (toolsSummary) {
    log += `${MARKER_START}SUBBLOCK:TOOLS_SUMMARY${MARKER_END}\n`;
    log += toolsSummary;
    log += `\n${MARKER_START}ENDSUBBLOCK:TOOLS_SUMMARY${MARKER_END}\n\n`;
  }
  
  // Контекст рассуждений симуляции
  if (simulationContext) {
    log += `${MARKER_START}SUBBLOCK:SIMULATION_CONTEXT${MARKER_END}\n`;
    log += simulationContext;
    log += `\n${MARKER_START}ENDSUBBLOCK:SIMULATION_CONTEXT${MARKER_END}\n\n`;
  }
  
  // Инструкция для нарратива
  if (narrativeInstruction) {
    log += `${MARKER_START}SUBBLOCK:NARRATIVE_INSTRUCTION${MARKER_END}\n`;
    log += narrativeInstruction;
    log += `\n${MARKER_START}ENDSUBBLOCK:NARRATIVE_INSTRUCTION${MARKER_END}\n\n`;
  }
  
  log += `${MARKER_START}ENDBLOCK:USER_PROMPT${MARKER_END}\n`;

  log += `\n${MARKER_START}ENDBLOCK:REQUEST_LOG${MARKER_END}\n\n`;
  return log;
};

/**
 * Парсит размеченный лог обратно на компоненты
 * Возвращает структурированные данные с блоками и подблоками
 */
export const parseMarkedPromptLog = (markedLog: string): {
  blocks?: Array<{ id: string; type: 'block' | 'subblock'; content: string; children?: any[] }>;
  systemInstruction?: string;
  tools?: any[];
  userPrompt?: string;
  conversationHistory?: Content[];
  settings?: any;
} => {
  const result: any = {};
  const MARKER_START = '<<<';
  const MARKER_END = '>>>';
  
  // Извлекаем все блоки
  const blockRegex = new RegExp(`${MARKER_START}(BLOCK|SUBBLOCK):([^${MARKER_END}]+)${MARKER_END}([\\s\\S]*?)${MARKER_START}END(?:BLOCK|SUBBLOCK):([^${MARKER_END}]+)${MARKER_END}`, 'g');
  const blocks: any[] = [];
  let match;
  
  while ((match = blockRegex.exec(markedLog)) !== null) {
    const type = match[1] === 'BLOCK' ? 'block' : 'subblock';
    const id = match[2];
    const content = match[3].trim();
    const endId = match[4];
    
    if (id === endId) {
      blocks.push({
        id,
        type,
        content
      });
    }
  }
  
  result.blocks = blocks;
  
  // Извлекаем конкретные блоки для обратной совместимости
  const getBlockContent = (blockId: string): string | undefined => {
    const block = blocks.find(b => b.id === blockId && b.type === 'block');
    return block?.content;
  };
  
  const getSubblockContent = (blockId: string, subblockId: string): string | undefined => {
    // Ищем блок, затем подблок внутри него
    const blockStart = markedLog.indexOf(`<<<BLOCK:${blockId}>>>`);
    if (blockStart === -1) return undefined;
    const blockEnd = markedLog.indexOf(`<<<ENDBLOCK:${blockId}>>>`, blockStart);
    if (blockEnd === -1) return undefined;
    const blockContent = markedLog.substring(blockStart, blockEnd);
    const subblockMatch = blockContent.match(new RegExp(`<<<SUBBLOCK:${subblockId}>>>([\\s\\S]*?)<<<ENDSUBBLOCK:${subblockId}>>>`));
    return subblockMatch ? subblockMatch[1].trim() : undefined;
  };
  
  // Настройки
  const settingsContent = getBlockContent('SETTINGS');
  if (settingsContent) {
    result.settings = {};
    const modelMatch = settingsContent.match(/Модель: (.+)/);
    const tempMatch = settingsContent.match(/Температура: (.+)/);
    const thinkingMatch = settingsContent.match(/Thinking Budget: (.+)/);
    if (modelMatch) result.settings.modelId = modelMatch[1].trim();
    if (tempMatch) {
      const temp = tempMatch[1].trim();
      result.settings.temperature = temp === 'не указана' ? undefined : parseFloat(temp);
    }
    if (thinkingMatch) {
      const thinking = thinkingMatch[1].trim();
      result.settings.thinkingBudget = thinking === 'не указан' ? undefined : parseFloat(thinking);
    }
  }
  
  // Системная инструкция (собираем из подблоков)
  const systemBlock = getBlockContent('SYSTEM_INSTRUCTION');
  if (systemBlock) {
    const basePrompt = getSubblockContent('SYSTEM_INSTRUCTION', 'BASE_PROMPT');
    const worldState = getSubblockContent('SYSTEM_INSTRUCTION', 'WORLD_STATE');
    const locationContext = getSubblockContent('SYSTEM_INSTRUCTION', 'LOCATION_CONTEXT');
    const historySection = getSubblockContent('SYSTEM_INSTRUCTION', 'HISTORY_SECTION');
    
    result.systemInstruction = systemBlock;
    if (basePrompt) result.basePrompt = basePrompt;
    if (worldState) result.worldState = worldState;
    if (locationContext) result.locationContext = locationContext;
    if (historySection) result.historySection = historySection;
  }
  
  // Инструменты
  const toolsContent = getBlockContent('TOOLS');
  if (toolsContent && toolsContent !== '(нет инструментов)') {
    result.tools = [];
    const toolRegex = /<<<SUBBLOCK:TOOL_(\d+)>>>([\s\S]*?)<<<ENDSUBBLOCK:TOOL_\d+>>>/g;
    let toolMatch;
    while ((toolMatch = toolRegex.exec(toolsContent)) !== null) {
      const toolText = toolMatch[2];
      const nameMatch = toolText.match(/Имя: ([^\n]+)/);
      const descMatch = toolText.match(/Описание: ([^\n]+)/);
      const paramsMatch = toolText.match(/Параметры:\n([\s\S]*?)(?=\n|$)/);
      
      const tool: any = {};
      if (nameMatch) tool.name = nameMatch[1].trim();
      if (descMatch) tool.description = descMatch[1].trim();
      if (paramsMatch) {
        try {
          tool.parameters = JSON.parse(paramsMatch[1].trim());
        } catch (e) {
          tool.parameters = paramsMatch[1].trim();
        }
      }
      result.tools.push(tool);
    }
  } else {
    result.tools = [];
  }
  
  // Запрос пользователя
  const userPromptContent = getBlockContent('USER_PROMPT');
  if (userPromptContent) {
    result.userPrompt = userPromptContent;
  }
  
  // История разговора
  const historyContent = getBlockContent('CONVERSATION_HISTORY');
  if (historyContent) {
    result.conversationHistory = [];
  }
  
  return result;
};

export const processGameTurn = async (
  currentState: GameState,
  userPrompt: string,
  enabledTools: GameTool[],
  settings: AISettings = DEFAULT_AI_SETTINGS,
  history: TurnHistory[] = []
): Promise<SimulationResult> => {
  console.log("[Service] Starting processGameTurn...");
  console.log("[Service] History received:", {
    historyLength: history.length,
    history: history.map(h => ({ turn: h.turn, userPrompt: h.userPrompt.substring(0, 50) + '...' }))
  });

  try {
    // Safer API Key Check
    let apiKey = '';
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        apiKey = process.env.API_KEY;
      }
    } catch (e) {
      console.error("Error accessing process.env", e);
    }

    if (!apiKey) {
      return {
        narrative: "КРИТИЧЕСКАЯ ОШИБКА: API_KEY отсутствует. Приложение не может связаться с Google Gemini. Убедитесь, что 'process.env.API_KEY' доступен.",
        toolLogs: [],
        newState: currentState
      };
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Construct dynamic tool definitions for Gemini
    const toolDefinitions = enabledTools.map(t => t.definition);
    const geminiTools: Tool[] = toolDefinitions.length > 0 ? [{ functionDeclarations: toolDefinitions }] : [];

    // Оптимизация: создаем компактное состояние только с релевантными данными
    // Это значительно снижает расход токенов при каждом шаге
    const getRelevantState = (state: GameState): GameState => {
      const normalizedState = normalizeState(state);

      // Если игроков нет, возвращаем полное состояние (на всякий случай)
      if (normalizedState.players.length === 0) {
        console.log("[Service] No players found, returning full state");
        return normalizedState;
      }

      // В симуляции передаём ВСЕХ игроков полностью (исходная архитектура: общий ход и общий ответ)
      const players = normalizedState.players;

      // Локации, где находятся игроки (полные, с описанием/ситуацией)
      const playerLocationIds = Array.from(
        new Set(players.map(p => p.locationId).filter(Boolean))
      );
      const playerLocations = normalizedState.locations.filter(l => playerLocationIds.includes(l.id));

      // Если хоть одна локация игрока не найдена — безопасно откатываемся на полное состояние
      if (playerLocations.length !== playerLocationIds.length) {
        console.warn("[Service] One or more player locations not found, returning full state");
        return normalizedState;
      }

      // Соседние локации (для навигации/доступных переходов)
      const connectedLocationIds = new Set<string>();
      for (const loc of playerLocations) {
        loc.connections.forEach(conn => connectedLocationIds.add(conn.targetLocationId));
      }
      // Не включаем локации игроков как "соседние"
      for (const id of playerLocationIds) connectedLocationIds.delete(id);

      // Компактные версии соседних локаций (без описаний/ситуации/атрибутов)
      const connectedLocations = normalizedState.locations
        .filter(loc => connectedLocationIds.has(loc.id))
        .map(loc => ({
          id: loc.id,
          name: loc.name,
          description: "", // экономия токенов
          currentSituation: "", // экономия токенов
          state: loc.state, // важно для навигации, например "locked"
          connections: loc.connections,
          attributes: {} // экономия токенов
        }));

      // Релевантные локации для объектов:
      // - локации игроков (полные)
      // - соседние локации (для контекста и осознанного перемещения)
      const includeConnectedLocationObjects = !!settings.includeConnectedLocationObjects;
      const compactConnectedLocationObjects = !!settings.compactConnectedLocationObjects;
      const relevantLocationIdsForObjects = new Set<string>(playerLocationIds);
      if (includeConnectedLocationObjects) {
        Array.from(connectedLocationIds).forEach(id => relevantLocationIdsForObjects.add(id));
      }

      // Собираем релевантные объекты:
      // - объекты в релевантных локациях (локации игроков + соседние)
      // - объекты "у игроков" (инвентарь/контейнеры на игроке)
      const relevantObjectIds = new Set<string>();
      // Множество объектов, которые относятся к "соседнему" контексту (для компактного режима)
      const connectedContextObjectIds = new Set<string>();

      normalizedState.objects
        .filter(obj => relevantLocationIdsForObjects.has(obj.connectionId))
        .forEach(obj => {
          relevantObjectIds.add(obj.id);
          if (connectedLocationIds.has(obj.connectionId)) {
            connectedContextObjectIds.add(obj.id);
          }
        });

      normalizedState.objects
        .filter(obj => players.some(p => p.id === obj.connectionId))
        .forEach(obj => relevantObjectIds.add(obj.id));

      // Рекурсивно находим объекты внутри релевантных объектов (контейнеры)
      const findNestedObjects = (parentId: string) => {
        normalizedState.objects
          .filter(obj => obj.connectionId === parentId)
          .forEach(obj => {
            if (!relevantObjectIds.has(obj.id)) {
              relevantObjectIds.add(obj.id);
              // Если родительский объект относится к "соседнему" контексту — наследуем это для вложенных
              if (connectedContextObjectIds.has(parentId)) {
                connectedContextObjectIds.add(obj.id);
              }
              findNestedObjects(obj.id);
            }
          });
      };
      Array.from(relevantObjectIds).forEach(objId => findNestedObjects(objId));

      const relevantObjectsRaw = normalizedState.objects.filter(obj => relevantObjectIds.has(obj.id));

      // Компактируем объекты из соседних локаций (и вложенные в них), если включено
      const relevantObjects = (!includeConnectedLocationObjects || !compactConnectedLocationObjects)
        ? relevantObjectsRaw
        : relevantObjectsRaw.map(obj => {
          if (!connectedContextObjectIds.has(obj.id)) return obj;
          return {
            ...obj,
            description: "",
            attributes: {}
          };
        });

      return {
        world: normalizedState.world,
        // Полные локации игроков + компактные соседние
        locations: [...playerLocations, ...connectedLocations],
        players,
        objects: relevantObjects
      };
    };

    // Вынесенная функция для выполнения tool calls (устраняет дублирование кода)
    const executeToolCalls = (
      calls: any[],
      state: GameState,
      tools: GameTool[],
      iteration: number,
      resolveReferences: (args: any, results: Array<{ result: string; createdId?: string }>) => any
    ): {
      newState: GameState;
      logs: ToolCallLog[];
      responseParts: Part[];
    } => {
      const toolResponseParts: Part[] = [];
      const logs: ToolCallLog[] = [];
      let newState = state;
      // Результаты вызовов в рамках ТЕКУЩЕЙ итерации (для подстановки ссылок $N.createdId)
      const callResults: Array<{ result: string; createdId?: string }> = [];

      for (let index = 0; index < calls.length; index++) {
        const call = calls[index];
        if (!call) continue;

        // Перед выполнением инструмента разрешаем ссылки вида $N.createdId в аргументах
        const resolvedArgs = resolveReferences(call.args, callResults);

        console.log(`[Service] Executing tool: ${call.name}`, resolvedArgs);

        const tool = tools.find(t => t.definition.name === call.name);

        let executionResult = "Ошибка: Инструмент не найден или отключен.";
        let createdId: string | undefined = undefined;

        if (tool) {
          // Валидация обязательных аргументов
          const requiredParams = tool.definition.parameters?.required || [];
          const missingParams = requiredParams.filter(param =>
            resolvedArgs?.[param] === undefined || resolvedArgs?.[param] === null || resolvedArgs?.[param] === ''
          );

          if (missingParams.length > 0) {
            executionResult = `Ошибка валидации: отсутствуют обязательные параметры: ${missingParams.join(', ')}`;
            console.warn(`[Service] ⚠️ Validation failed for ${call.name}:`, missingParams);
          } else {
            try {
              const execution = tool.apply(newState, resolvedArgs);
              newState = execution.newState;
              executionResult = execution.result;
              createdId = execution.createdId;
            } catch (e: any) {
              executionResult = `Ошибка выполнения: ${e.message}`;
              console.error(`[Service] ❌ Tool execution error for ${call.name}:`, e);
            }
          }
        }

        // Сохраняем результат для возможных ссылок из последующих вызовов
        callResults.push({ result: executionResult, createdId });

        logs.push({
          name: call.name,
          args: resolvedArgs,
          result: executionResult,
          iteration: iteration
        });

        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: { result: executionResult }
          }
        });
      }

      return { newState, logs, responseParts: toolResponseParts };
    };

    // [IMPROVEMENT Item 9] Memoization for system instruction
    const createSystemInstruction = (state: GameState, isFinalNarrative: boolean = false) => {
      // Create a cache key based on optimization strategy and override settings
      // We don't hash the entire state here yet because we need to normalize/optimize it first
      // But we can check if we just generated this prompt in the same turn for the same phase

      // Optimization: we move the cache check INSIDE after we decided on stateToUse, 
      // OR we just cache the heavy stringification part.
      // Let's cache the FINAL string.

      // Для финального нарратива используем полное состояние (нужно для разметки всех объектов)
      // Для симуляции используем оптимизированное состояние
      let stateToUse: GameState;
      if (isFinalNarrative) {
        stateToUse = normalizeState(state);
      } else {
        const fullState = normalizeState(state);
        const relevantState = getRelevantState(state);
        // ... logging code ...
        stateToUse = relevantState;
      }
      const normalizedState = normalizeState(stateToUse);

      const promptOverride = isFinalNarrative ? settings.narrativePromptOverride : settings.systemPromptOverride;
      const historySummary = history.length > 0 ? history[history.length - 1].narrative.substring(0, 50) : 'none'; // Weak hash for history change
      const cacheKey = hashString(JSON.stringify(normalizedState) + isFinalNarrative + (promptOverride || '') + historySummary);

      if (promptCache.has(cacheKey)) {
        console.log(`[Service] ⚡ Using cached system instruction (key: ${cacheKey.substring(0, 8)}...)`);
        return promptCache.get(cacheKey)!;
      }

      // [IMPROVEMENT Item 4] Добавляем контекст текущей локации для нарратива
      // Это помогает модели описывать атмосферу и окружение, даже если явно не запрашивалось
      let locationContext = '';
      if (isFinalNarrative && normalizedState.players.length > 0) {
        const player = normalizedState.players[0];
        const playerLocation = normalizedState.locations.find(l => l.id === player.locationId);
        if (playerLocation) {
          locationContext = `\n\nТЕКУЩАЯ ЛОКАЦИЯ (ГДЕ НАХОДИТСЯ ИГРОК):\nНазвание: ${playerLocation.name}\nОписание: ${playerLocation.description}\nТекущая ситуация/Атмосфера: ${playerLocation.currentSituation || 'Без особенностей'}`;
        }
      }

      // Для нарратива и симуляции используем то, что указано в пресете или поле,
      // с fallback на DEFAULT_*_PROMPT если override не задан
      let basePrompt: string;
      let promptSource: string;

      if (isFinalNarrative) {
        // Для нарратива: используем override если задан и не пустой, иначе fallback на DEFAULT_NARRATIVE_PROMPT
        if (settings.narrativePromptOverride !== undefined &&
          settings.narrativePromptOverride !== null &&
          settings.narrativePromptOverride.trim() !== '') {
          basePrompt = settings.narrativePromptOverride;
          promptSource = 'narrativePromptOverride (custom)';
        } else {
          // Fallback на DEFAULT_NARRATIVE_PROMPT если override не задан или пустой
          basePrompt = DEFAULT_NARRATIVE_PROMPT;
          promptSource = 'DEFAULT_NARRATIVE_PROMPT (fallback)';
        }
        console.log(`[Service] 🎭 Using narrative prompt: ${promptSource}`);
      } else {
        // Для симуляции: используем override если задан и не пустой, иначе fallback на DEFAULT_SYSTEM_PROMPT
        if (settings.systemPromptOverride !== undefined &&
          settings.systemPromptOverride !== null &&
          settings.systemPromptOverride.trim() !== '') {
          basePrompt = settings.systemPromptOverride;
          promptSource = 'systemPromptOverride (custom)';
        } else {
          // Fallback на DEFAULT_SYSTEM_PROMPT если override не задан или пустой
          basePrompt = DEFAULT_SYSTEM_PROMPT;
          promptSource = 'DEFAULT_SYSTEM_PROMPT (fallback)';
        }
        console.log(`[Service] ⚙️ Using simulation prompt: ${promptSource}`);
      }

      // Формируем историю для промпта (это контекст, не часть системного промпта)
      let historySection = '';
      if (history.length > 0) {
        const recentHistory = history.slice(-3); // Последние 3 хода
        console.log(`[Service] Adding history to prompt: ${recentHistory.length} turns (out of ${history.length} total)`);

        if (isFinalNarrative) {
          // Для нарратора - передаём ТОЛЬКО нарративы предыдущих ходов для стилистической связности
          // Не передаем toolLogs - это техническая информация, которая может испортить стиль
          const formatTurnForNarrative = (turn: TurnHistory) => {
            return `Ход ${turn.turn}:\nНарратив: "${turn.narrative}"`;
        };

          historySection = `\n\nИСТОРИЯ ПОСЛЕДНИХ ХОДОВ (для стилистической связности):\n${recentHistory.map(formatTurnForNarrative).join('\n\n---\n\n')}\n`;
        } else {
          // Для симуляции - передаём ТОЛЬКО вызовы инструментов (toolLogs), без нарратива
          const formatTurnForSimulation = (turn: TurnHistory) => {
            if (!turn.toolLogs || turn.toolLogs.length === 0) {
              return `Ход ${turn.turn}:\nИгрок: "${turn.userPrompt}"\nДействия: (нет действий)`;
            }
            
            // Форматируем только toolLogs с аргументами и результатами
            const toolCalls = turn.toolLogs.map(t => {
              const argsStr = JSON.stringify(t.args, null, 2);
              return `- [${t.name}] Аргументы: ${argsStr}\n  Результат: ${t.result}`;
            }).join('\n\n');
            
            return `Ход ${turn.turn}:\nИгрок: "${turn.userPrompt}"\nВызовы инструментов:\n${toolCalls}`;
          };
          
          historySection = `\n\nИСТОРИЯ ПОСЛЕДНИХ ХОДОВ (вызовы инструментов):\n${recentHistory.map(formatTurnForSimulation).join('\n\n---\n\n')}\n`;
        }
      } else {
        console.log("[Service] No history available for this turn");
      }

      // basePrompt - это ровно то, что указано в системном промпте (поле или пресет)
      // JSON состояния и история - это контекст, который добавляется отдельно
      const baseInstruction = `${basePrompt}

ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):
${JSON.stringify(normalizedState, null, 2)}${locationContext}${historySection}`;

      // [IMPROVEMENT Item 9] Caching logic
      // Store result in cache
      if (promptCache.size >= MAX_CACHE_SIZE) {
        // Simple LRU: delete first key (oldest insertion)
        const firstKey = promptCache.keys().next().value;
        if (firstKey) promptCache.delete(firstKey);
      }
      promptCache.set(cacheKey, baseInstruction);

      return baseInstruction;
    };

    const modelId = settings.modelId;

    console.log(`[Service] Sending prompt to ${modelId} with ${geminiTools.length > 0 ? geminiTools[0].functionDeclarations?.length : 0} tools...`);

    let workingState = currentState;
    const toolLogs: ToolCallLog[] = [];
    let narrative = "";
    const simulationThinkingParts: string[] = []; // Мысли модели во время симуляции
    const narrativeThinkingParts: string[] = []; // Мысли модели во время генерации нарратива
    const simulationDebugInfo: any = { allParts: [], iterations: [] }; // Техническая информация для симуляции
    const narrativeDebugInfo: any = { allParts: [] }; // Техническая информация для нарратива

    // Сбор информации о токенах
    const simulationTokenUsages: TokenUsage[] = []; // Токены для каждой итерации симуляции
    let narrativeTokenUsage: TokenUsage | null = null; // Токены для нарратива

    // История сообщений для многоходового диалога
    let conversationHistory: Content[] = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // Конфигурация thinking (мышление модели)
    const thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: settings.thinkingBudget
    };

    // Первый запрос
    // [IMPROVEMENT Item 7 & 8] Retry logic and Timeouts
    const generateWithRetry = async (model: string, contents: Content[], config: any) => {
      return withRetry(async () => {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

        try {
          console.log(`[Service] 📡 Sending request to ${model}...`);
          return await ai.models.generateContent({
            model: model,
            contents: contents,
            config: config,
          });
          // Note: The Google GenAI SDK might not fully support 'signal' yet in all versions.
          // If it doesn't, the timeout won't abort the request itself, but standard fetch would.
          // We wrap this assuming underlying fetch support or future proofing.
          // If the SDK doesn't expose signal in types, we might need a workaround or just rely on retries.
          // However, we can't implement true 'signal' passing without modification to sdk method signature if it's strictly typed.
          // So for now, we rely on the `withRetry` doing the heavy lifting if the promise hangs (which it won't, unless network hangs).
          // To implement true timeout for a promise that doesn't support cancel:
          // We can race it.
        } finally {
          clearTimeout(timeoutId);
        }
      }, {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: (err) => {
          console.warn(`[Service] ⚠️ Request failed: ${err.message}. Checking retry...`);
          // Retry on timeout (AbortError), network errors, 429, 5xx
          if (err.name === 'AbortError') return true;
          if (err.message?.includes('network')) return true;
          if (err.status === 429) return true;
          if (err.status >= 500) return true;
          return false;
        }
      });
    };

    // Первый запрос (Simulate)
    // Wrap simple generateContent with our race-timeout helper if SDK doesn't support signal
    const generateWithTimeout = async (model: string, contents: Content[], config: any) => {
      const timeoutPromise = new Promise((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error('Request timed out (30s limit)'));
        }, 30000); // 30s timeout
      });

      // Race against timeout
      return Promise.race([
        ai.models.generateContent({ model, contents, config }),
        timeoutPromise
      ]);
    };

    // Actual call with retry AND timeout wrapper
    // Создаем размеченный лог перед первым вызовом LLM
    const systemInstruction = createSystemInstruction(workingState);
    const markedPromptLog = createMarkedPromptLog(
      systemInstruction,
      geminiTools,
      userPrompt,
      conversationHistory.length > 0 ? conversationHistory : undefined,
      {
        modelId,
        temperature: settings.temperature,
        thinkingBudget: settings.thinkingBudget,
        includeConnectedLocationObjects: settings.includeConnectedLocationObjects,
        compactConnectedLocationObjects: settings.compactConnectedLocationObjects
      }
    );
    
    // Логируем размеченный промпт для точного отслеживания
    console.log(markedPromptLog);

    let response = await withRetry(async () => {
      return await generateWithTimeout(modelId, conversationHistory, {
        systemInstruction: systemInstruction,
        tools: geminiTools,
        temperature: settings.temperature,
        thinkingConfig,
      }) as GeminiApiResponse;
    }, { maxRetries: 3 });

    console.log("[Service] Received initial response.");

    // Функция для извлечения thoughts из ответа
    const extractThoughts = (resp: GeminiApiResponse, isNarrative: boolean = false, iteration?: number) => {
      try {
        const contentData = getResponseContent(resp);
        if (!contentData) return;

        const parts = contentData.parts;
        const prefix = isNarrative ? "🎭 Narrative" : "⚙️ Simulation";
        const debugInfo = isNarrative ? narrativeDebugInfo : simulationDebugInfo;

        // Для симуляции сохраняем информацию по каждой итерации
        if (!isNarrative && iteration !== undefined) {
          const iterationInfo = {
            iteration,
            responseStructure: {
              totalParts: parts.length,
              partTypes: parts.map((p: any) => ({
                hasText: !!p.text,
                hasThought: p.thought === true,
                hasFunctionCall: !!p.functionCall,
                textLength: p.text?.length || 0
              }))
            },
            functionCallsCount: parts.filter((p: any) => p.functionCall).length,
            allParts: parts.map((p: any, idx: number) => {
              let type: 'text' | 'thought' | 'functionCall' | 'empty' | 'unknown' = 'unknown';
              let content = '';
              let details: string[] = []; // Дополнительная информация о части

              if (p.thought === true && p.text) {
                type = 'thought';
                content = p.text;
                details.push('thinking mode');
              } else if (p.text) {
                type = 'text';
                content = p.text;
              } else if (p.functionCall) {
                type = 'functionCall';
                content = JSON.stringify({
                  name: p.functionCall.name,
                  id: p.functionCall.id,
                  args: p.functionCall.args
                }, null, 2);
                details.push(`tool: ${p.functionCall.name}`);
              } else {
                // Детальная диагностика пустой части
                const hasFields = Object.keys(p).filter(k => k !== 'text' && k !== 'functionCall' && k !== 'thought');
                if (hasFields.length === 0) {
                  type = 'empty';
                  details.push('нет данных');
                } else {
                  type = 'unknown';
                  details.push(`поля: ${hasFields.join(', ')}`);
                  content = JSON.stringify(p, null, 2);
                }
              }

              return {
                type,
                content,
                length: content.length,
                details: details.join(', ') // Дополнительная информация
              };
            })
          };

          debugInfo.iterations.push(iterationInfo);

          // Обновляем общую информацию (берем последнюю итерацию с данными)
          if (parts.length > 0) {
            debugInfo.responseStructure = iterationInfo.responseStructure;
            debugInfo.functionCallsCount = iterationInfo.functionCallsCount;
            debugInfo.allParts = iterationInfo.allParts;
          }
        } else {
          // Для нарратива или первого запроса (без итерации)
          debugInfo.responseStructure = {
            totalParts: parts.length,
            partTypes: parts.map((p: any) => ({
              hasText: !!p.text,
              hasThought: p.thought === true,
              hasFunctionCall: !!p.functionCall,
              textLength: p.text?.length || 0
            }))
          };

          debugInfo.allParts = parts.map((p: any, idx: number) => {
            let type: 'text' | 'thought' | 'functionCall' | 'empty' | 'unknown' = 'unknown';
            let content = '';
            let details: string[] = []; // Дополнительная информация о части

            if (p.thought === true && p.text) {
              type = 'thought';
              content = p.text;
              details.push('thinking mode');
            } else if (p.text) {
              type = 'text';
              content = p.text;
            } else if (p.functionCall) {
              type = 'functionCall';
              content = JSON.stringify({
                name: p.functionCall.name,
                id: p.functionCall.id,
                args: p.functionCall.args
              }, null, 2);
              details.push(`tool: ${p.functionCall.name}`);
            } else {
              // Детальная диагностика пустой части
              const hasFields = Object.keys(p).filter(k => k !== 'text' && k !== 'functionCall' && k !== 'thought');
              if (hasFields.length === 0) {
                type = 'empty';
                details.push('нет данных');
              } else {
                type = 'unknown';
                details.push(`поля: ${hasFields.join(', ')}`);
                content = JSON.stringify(p, null, 2);
              }
            }

            return {
              type,
              content,
              length: content.length,
              details: details.join(', ') // Дополнительная информация
            };
          });

          const functionCalls = parts.filter((p: any) => p.functionCall);
          debugInfo.functionCallsCount = functionCalls.length;
        }

        // Логируем для консоли
        const functionCalls = parts.filter((p: any) => p.functionCall);
        console.log(`[Service] ${prefix} Response structure:`, debugInfo.responseStructure);
        if (functionCalls.length > 0 && !isNarrative) {
          console.log(`[Service] ${prefix} Found ${functionCalls.length} function calls in response`);
        }

        // Извлекаем thinking части через хелпер
        const thoughtTexts = getThoughtParts(resp);
        if (thoughtTexts.length > 0) {
          const thoughts = thoughtTexts.join('\n');
          if (thoughts) {
            // Сохраняем в соответствующий массив
            if (isNarrative) {
              narrativeThinkingParts.push(thoughts);
            } else {
              simulationThinkingParts.push(thoughts);
            }

            console.log(`[Service] ✓ ${prefix} thinking extracted:`, thoughts.length, "chars");
            if (thoughts.length > 500) {
              console.log(`[Service] ${prefix} thinking preview:`, thoughts.substring(0, 500) + "...");
            } else {
              console.log(`[Service] ${prefix} thinking:`, thoughts);
            }
          }
        } else {
          console.log(`[Service] ⚠️ No thinking parts found in ${prefix.toLowerCase()} response`);
          parts.forEach((p: any, idx: number) => {
            if (p.text) {
              console.log(`[Service] ${prefix} Part ${idx} (text, thought=${p.thought}):`, p.text.substring(0, 200));
            }
          });
        }
      } catch (e) {
        console.warn("[Service] Could not extract thoughts:", e);
      }
    };

    // Извлекаем мысли из первого ответа (итерация -1 означает первый запрос)
    extractThoughts(response, false, -1);

    // Извлекаем информацию о токенах из первого ответа
    const firstTokenUsage = extractTokenUsage(response);
    if (firstTokenUsage) {
      simulationTokenUsages.push(firstTokenUsage);
    }

    // Вспомогательная функция: подстановка ссылок вида $N.createdId в аргументы вызова инструмента
    const resolveReferences = (
      args: any,
      results: Array<{ result: string; createdId?: string }>
    ): any => {
      if (!args) return args;

      const resolveValue = (value: any): any => {
        if (typeof value === 'string') {
          // Заменяем шаблоны вида $0.createdId, $1.createdId и т.п. на реальные ID,
          // которые вернули предыдущие вызовы инструментов в рамках этого ответа.
          return value.replace(/\$(\d+)\.createdId/g, (match, indexStr) => {
            const index = parseInt(indexStr, 10);
            const createdId = results[index]?.createdId;
            // Если по какой-то причине ссылка не может быть разрешена — оставляем как есть,
            // чтобы система валидации/логов отразила проблему явно.
            return createdId || match;
          });
        }

        if (Array.isArray(value)) {
          return value.map(v => resolveValue(v));
        }

        if (value !== null && typeof value === 'object') {
          const resolved: any = {};
          for (const [k, v] of Object.entries(value)) {
            resolved[k] = resolveValue(v);
          }
          return resolved;
        }

        return value;
      };

      return resolveValue(args);
    };

    // Цикл обработки инструментов
    let iteration = 0;

    while (iteration < settings.maxIterations) {
      // Безопасно извлекаем content и tool calls из ответа
      const contentData = getResponseContent(response);

      if (!contentData) {
        console.error("[Service] ❌ Не удалось извлечь содержимое ответа");
        return {
          narrative: "Ошибка: ИИ не вернул валидного ответа.",
          toolLogs,
          newState: workingState
        };
      }

      const assistantContent = contentData.content;

      // Извлекаем tool calls из ответа
      const toolCalls = getToolCalls(response);

      // Если нет tool calls — выходим из цикла
      // НО не используем narrative из этого ответа - финальный запрос сгенерирует лучший нарратив
      if (toolCalls.length === 0) {
        console.log(`[Service] Iteration ${iteration}: No tool calls, will generate final narrative...`);
        // Не извлекаем narrative здесь - финальный запрос сделает это лучше
        break;
      }

      console.log(`[Service] Iteration ${iteration}: Processing ${toolCalls.length} tool calls...`);

      // Выполняем инструменты используя вынесенную функцию
      const executionResult = executeToolCalls(toolCalls, workingState, enabledTools, iteration, resolveReferences);
      workingState = executionResult.newState;
      toolLogs.push(...executionResult.logs);
      const toolResponseParts = executionResult.responseParts;

      // Добавляем ответ ассистента и результаты инструментов в историю
      if (assistantContent) {
        conversationHistory.push(assistantContent);
      }
      conversationHistory.push({ role: 'user', parts: toolResponseParts });

      console.log(`[Service] Iteration ${iteration}: Sending tool results back to AI...`);

      // Следующий запрос к AI с обновлённым состоянием
      response = await ai.models.generateContent({
        model: modelId,
        contents: conversationHistory,
        config: {
          systemInstruction: createSystemInstruction(workingState),
          tools: geminiTools, // Продолжаем передавать инструменты
          temperature: settings.temperature,
          thinkingConfig,
        },
      });

      // Извлекаем мысли из ответа (с номером итерации)
      extractThoughts(response, false, iteration);

      // Извлекаем информацию о токенах из ответа итерации
      const iterationTokenUsage = extractTokenUsage(response);
      if (iterationTokenUsage) {
        simulationTokenUsages.push(iterationTokenUsage);
      }

      iteration++;
    }

    // Всегда генерируем финальный нарратив с отдельными настройками
    // Это позволяет использовать отдельный промпт, температуру и модель для нарратива
    // Выполняем финальный запрос ВСЕГДА после цикла инструментов
    if (iteration >= settings.maxIterations) {
      console.warn(`[Service] ⚠️ Reached max iterations (${settings.maxIterations}), generating final narrative...`);
    } else {
      console.log(`[Service] ✓ All tools executed, generating final narrative with dedicated settings...`);
    }

    // Добавляем последний ответ в историю если есть
    // Безопасно извлекаем content и tool calls из последнего ответа
    const lastContentData = getResponseContent(response);
    if (lastContentData) {
      const lastContent = lastContentData.content;
      const remainingToolCalls = getToolCalls(response);

      // Обрабатываем оставшиеся tool calls используя вынесенную функцию
      if (remainingToolCalls.length > 0) {
        const executionResult = executeToolCalls(remainingToolCalls, workingState, enabledTools, iteration, resolveReferences);
        workingState = executionResult.newState;
        toolLogs.push(...executionResult.logs);
        const toolResponseParts = executionResult.responseParts;

        conversationHistory.push(lastContent);
        conversationHistory.push({ role: 'user', parts: toolResponseParts });
      }
    }

    // Финальный запрос без инструментов — только нарратив
    // Используем отдельные настройки для нарратива, если заданы
    const narrativeModelId = settings.narrativeModelId || settings.modelId;
    const narrativeTemperature = settings.narrativeTemperature ?? settings.temperature;
    const narrativeThinkingBudget = settings.narrativeThinkingBudget ?? settings.thinkingBudget;

    const narrativeThinkingConfig = {
      includeThoughts: true,
      thinkingBudget: narrativeThinkingBudget
    };

    // Создаем системную инструкцию для нарратива
    const narrativeSystemInstruction = createSystemInstruction(workingState, true);

    // Формируем список всех объектов, игроков и локаций для разметки
    const objectsList = workingState.objects.map(obj => `- [object:${obj.id}:${obj.name}]`).join('\n');
    const playersList = workingState.players.map(p => `- [player:${p.id}:${p.name}]`).join('\n');
    const locationsList = workingState.locations.map(loc => `- [location:${loc.id}:${loc.name}]`).join('\n');

    // Добавляем список объектов в системную инструкцию
    const narrativeSystemInstructionWithObjects = `${narrativeSystemInstruction}

ДОСТУПНЫЕ ОБЪЕКТЫ ДЛЯ РАЗМЕТКИ:
${objectsList}

ДОСТУПНЫЕ ИГРОКИ ДЛЯ РАЗМЕТКИ:
${playersList}

ДОСТУПНЫЕ ЛОКАЦИИ ДЛЯ РАЗМЕТКИ:
${locationsList}

ВАЖНО: ВСЕ упоминания объектов, игроков и локаций должны быть размечены форматом [type:ID:name].`;

    // Формируем контекст для нарратива: что произошло (лог инструментов)
    const hasToolActions = toolLogs.length > 0;
    const toolsSummary = hasToolActions
      ? `\n\nЧто произошло:\n${toolLogs.map(log => {
          // Форматируем как события для лучшей читаемости
          if (log.name === 'move_object') {
            return `- Объект перемещен: ${log.result}`;
          } else if (log.name === 'create_object') {
            return `- Создан объект: ${log.result}`;
          } else if (log.name === 'delete_object') {
            return `- Объект удален: ${log.result}`;
          } else if (log.name === 'move_player') {
            return `- Игрок перемещен: ${log.result}`;
          } else if (log.name === 'set_attribute') {
            return `- Изменен атрибут: ${log.result}`;
          } else if (log.name === 'delete_attribute') {
            return `- Удален атрибут: ${log.result}`;
          } else {
            return `- ${log.name}: ${log.result}`;
          }
        }).join('\n')}`
      : '';

    // Не передаем thinking симуляции в нарратив - это внутренние рассуждения,
    // которые могут испортить стиль нарратива и раскрыть механику игры
    const simulationContext = '';

    // Разная инструкция в зависимости от того, были ли действия
    const narrativeInstruction = hasToolActions
      ? 'Создай художественное описание того, что произошло в результате этих действий.'
      : 'Создай художественное описание в ответ на запрос игрока. Опиши то, что он видит/слышит/чувствует, включая причины, почему действие не удалось (если применимо).';

    // Создаем новый контекст для нарратива (без истории инструментов)
    const narrativeContents: Content[] = [
      {
        role: 'user',
        parts: [{
          text: `${userPrompt}${toolsSummary}${simulationContext}\n\n${narrativeInstruction}`
        }]
      }
    ];

    // Логируем настройки нарратива для отладки
    console.log("[Service] 🎭 Narrative Request Settings:", {
      model: narrativeModelId,
      temperature: narrativeTemperature,
      thinkingBudget: narrativeThinkingBudget,
      promptSource: settings.narrativePromptOverride ? 'custom' : 'default',
      promptPreview: narrativeSystemInstruction.substring(0, 200) + '...',
      toolsSummary: toolsSummary.substring(0, 200) + '...'
    });

    // Создаем размеченный лог для нарратива
    const narrativeMarkedPromptLog = createMarkedNarrativeLog(
      narrativeSystemInstructionWithObjects,
      userPrompt,
      toolsSummary,
      simulationContext,
      narrativeInstruction,
      {
        modelId: narrativeModelId,
        temperature: narrativeTemperature,
        thinkingBudget: narrativeThinkingBudget
      }
    );

    // Final request (Narrative) with Retry and Timeout
    const finalResponse = await withRetry(async () => {
      return await generateWithTimeout(narrativeModelId, narrativeContents, {
        systemInstruction: narrativeSystemInstructionWithObjects,
        thinkingConfig: narrativeThinkingConfig,
        temperature: narrativeTemperature,
        // No tools
      }) as GeminiApiResponse; // Explicit cast as race buffer might lose type inference
    }, { maxRetries: 3 });

    // Извлекаем мысли из финального ответа
    console.log("[Service] 🎭 Extracting thoughts from narrative response...");
    extractThoughts(finalResponse, true);

    // Извлекаем информацию о токенах из финального ответа
    narrativeTokenUsage = extractTokenUsage(finalResponse);

    // Безопасно извлекаем текстовые части из финального ответа
    const finalContentData = getResponseContent(finalResponse);

    if (finalContentData) {
      const allParts = finalContentData.parts;

      // Логируем все части для отладки
      console.log("[Service] 🎭 Narrative response parts:", allParts.map((p: any, idx: number) => ({
        idx,
        hasText: !!p.text,
        thought: p.thought,
        textPreview: p.text?.substring(0, 100)
      })));

      // Извлекаем текстовые части (исключая thinking)
      const textParts = getTextParts(finalResponse, true);
      narrative = textParts.join(' ');

      // Если narrative пустой, пробуем найти хоть что-то в parts без фильтрации thinking
      if (!narrative) {
        const allTextParts = getTextParts(finalResponse, false);
        narrative = allTextParts.join(' ').trim();
      }

      console.log("[Service] 🎭 Narrative generated:", {
        length: narrative.length,
        wordCount: narrative.split(/\s+/).length,
        preview: narrative.substring(0, 150) + (narrative.length > 150 ? '...' : '')
      });
    } else {
      console.warn("[Service] 🎭 Не удалось извлечь содержимое финального ответа");
      narrative = toolLogs.length > 0
        ? "Действие обработано."
        : "Ничего не произошло.";
    }

    // Fallback если нарратив пустой
    if (!narrative) {
      narrative = toolLogs.length > 0
        ? "Действие обработано."
        : "Ничего не произошло.";
    }

    // Объединяем мысли отдельно для симуляции и нарратива
    const simulationThinking = simulationThinkingParts.length > 0
      ? simulationThinkingParts.join('\n\n---\n\n')
      : undefined;
    const narrativeThinking = narrativeThinkingParts.length > 0
      ? narrativeThinkingParts.join('\n\n---\n\n')
      : undefined;

    // Для обратной совместимости сохраняем объединенные мысли
    const thinking = (simulationThinking || narrativeThinking)
      ? [simulationThinking, narrativeThinking].filter(Boolean).join('\n\n=== НАРРАТИВ ===\n\n')
      : undefined;

    // Подсчитываем общее использование токенов для симуляции
    const totalSimulationTokens: TokenUsage = simulationTokenUsages.reduce(
      (acc, usage) => ({
        promptTokens: acc.promptTokens + usage.promptTokens,
        candidatesTokens: acc.candidatesTokens + usage.candidatesTokens,
        totalTokens: acc.totalTokens + usage.totalTokens,
      }),
      { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
    );

    // Общее использование токенов (симуляция + нарратив)
    const totalTokenUsage: TokenUsage = {
      promptTokens: totalSimulationTokens.promptTokens + (narrativeTokenUsage?.promptTokens || 0),
      candidatesTokens: totalSimulationTokens.candidatesTokens + (narrativeTokenUsage?.candidatesTokens || 0),
      totalTokens: totalSimulationTokens.totalTokens + (narrativeTokenUsage?.totalTokens || 0),
    };

    // Рассчитываем стоимость
    // Используем модель симуляции для расчета стоимости симуляции
    const simulationCost = totalSimulationTokens.totalTokens > 0
      ? calculateCost(totalSimulationTokens, modelId)
      : null;

    // Используем модель нарратива для расчета стоимости нарратива (narrativeModelId уже объявлена выше)
    const narrativeCost = narrativeTokenUsage
      ? calculateCost(narrativeTokenUsage, narrativeModelId)
      : null;

    // Общая стоимость
    let totalCostInfo: CostInfo | undefined = undefined;
    if (simulationCost && narrativeCost) {
      totalCostInfo = {
        inputCost: simulationCost.inputCost + narrativeCost.inputCost,
        outputCost: simulationCost.outputCost + narrativeCost.outputCost,
        totalCost: simulationCost.totalCost + narrativeCost.totalCost,
        model: `${modelId} + ${narrativeModelId}`,
      };
    } else if (simulationCost) {
      totalCostInfo = simulationCost;
    } else if (narrativeCost) {
      totalCostInfo = narrativeCost;
    }

    console.log("[Service] Final result:", {
      narrativeLength: narrative.length,
      narrativePreview: narrative.substring(0, 150),
      toolLogsCount: toolLogs.length,
      iterations: iteration,
      hasSimulationThinking: !!simulationThinking,
      simulationThinkingLength: simulationThinking?.length || 0,
      hasNarrativeThinking: !!narrativeThinking,
      narrativeThinkingLength: narrativeThinking?.length || 0,
      stateChanged: workingState !== currentState,
      tokenUsage: {
        simulation: totalSimulationTokens,
        narrative: narrativeTokenUsage,
        total: totalTokenUsage,
      },
      costInfo: totalCostInfo,
    });

    return {
      narrative,
      toolLogs,
      newState: workingState,
      thinking, // Для обратной совместимости
      simulationThinking,
      narrativeThinking,
      markedPromptLog, // Размеченный лог первого запроса к LLM (симуляция)
      narrativeMarkedPromptLog, // Размеченный лог второго запроса к LLM (нарратив)
      tokenUsage: totalTokenUsage.totalTokens > 0 ? {
        simulation: totalSimulationTokens,
        narrative: narrativeTokenUsage || { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 },
        total: totalTokenUsage,
      } : undefined,
      costInfo: totalCostInfo,
      simulationDebugInfo: Object.keys(simulationDebugInfo).length > 0 ? simulationDebugInfo : undefined,
      narrativeDebugInfo: Object.keys(narrativeDebugInfo).length > 0 ? narrativeDebugInfo : undefined
    };

  } catch (error: any) {
    console.error("[Service] Error:", error);
    return {
      narrative: `СИСТЕМНАЯ ОШИБКА: ${error.message}`,
      toolLogs: [],
      newState: currentState
    };
  }
};
