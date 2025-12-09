import { GoogleGenAI, Tool, Content, Part } from "@google/genai";
import { GameState, SimulationResult, ToolCallLog, GameTool, AISettings, DEFAULT_AI_SETTINGS, TokenUsage, CostInfo, TurnHistory, GeminiApiResponse } from "../types";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_NARRATIVE_PROMPT } from "../prompts/systemPrompts";
import { normalizeState } from "../utils/gameUtils";

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

      // Берем первого игрока (обычно он один)
      const player = normalizedState.players[0];
      const playerLocation = normalizedState.locations.find(l => l.id === player.locationId);

      if (!playerLocation) {
        console.warn("[Service] Player location not found, returning full state");
        return normalizedState;
      }

      // Находим соседние локации (для понимания доступных переходов)
      const connectedLocationIds = new Set<string>();
      playerLocation.connections.forEach(conn => {
        connectedLocationIds.add(conn.targetLocationId);
      });

      // Создаем компактные версии соседних локаций (только ID, name и connections)
      const connectedLocations = normalizedState.locations
        .filter(loc => connectedLocationIds.has(loc.id))
        .map(loc => ({
          id: loc.id,
          name: loc.name,
          description: "", // Убираем описание для экономии токенов
          currentSituation: "", // Убираем текущую ситуацию
          state: loc.state, // Оставляем состояние (важно для навигации, например "locked")
          connections: loc.connections, // Оставляем connections для навигации
          attributes: {} // Убираем атрибуты
        }));

      // Находим объекты в текущей локации и у игрока
      const relevantObjectIds = new Set<string>();

      // Объекты в локации
      normalizedState.objects
        .filter(obj => obj.connectionId === playerLocation.id)
        .forEach(obj => relevantObjectIds.add(obj.id));

      // Объекты у игрока
      normalizedState.objects
        .filter(obj => obj.connectionId === player.id)
        .forEach(obj => relevantObjectIds.add(obj.id));

      // Объекты в соседних локациях (для понимания контекста, но без деталей)
      normalizedState.objects
        .filter(obj => connectedLocationIds.has(obj.connectionId))
        .forEach(obj => relevantObjectIds.add(obj.id));

      // Рекурсивно находим объекты внутри релевантных объектов (контейнеры)
      const findNestedObjects = (parentId: string) => {
        normalizedState.objects
          .filter(obj => obj.connectionId === parentId)
          .forEach(obj => {
            if (!relevantObjectIds.has(obj.id)) {
              relevantObjectIds.add(obj.id);
              findNestedObjects(obj.id); // Рекурсивно ищем вложенные объекты
            }
          });
      };

      // Находим вложенные объекты для всех релевантных объектов
      Array.from(relevantObjectIds).forEach(objId => {
        findNestedObjects(objId);
      });

      const relevantObjects = normalizedState.objects.filter(obj => relevantObjectIds.has(obj.id));

      // Возвращаем компактное состояние
      return {
        world: normalizedState.world, // Мир всегда нужен
        locations: [
          playerLocation, // Текущая локация с полным описанием
          ...connectedLocations // Соседние локации в компактном виде
        ],
        players: [player], // Только текущий игрок
        objects: relevantObjects // Только релевантные объекты
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

    const createSystemInstruction = (state: GameState, isFinalNarrative: boolean = false) => {
      // Для финального нарратива используем полное состояние (нужно для разметки всех объектов)
      // Для симуляции используем оптимизированное состояние
      let stateToUse: GameState;
      if (isFinalNarrative) {
        stateToUse = normalizeState(state);
      } else {
        const fullState = normalizeState(state);
        const relevantState = getRelevantState(state);
        const fullSize = JSON.stringify(fullState).length;
        const relevantSize = JSON.stringify(relevantState).length;
        const savingsPercent = ((fullSize - relevantSize) / fullSize * 100).toFixed(1);
        console.log(`[Service] 💾 State optimization: ${fullSize} → ${relevantSize} bytes (экономия ${savingsPercent}%)`);
        stateToUse = relevantState;
      }
      const normalizedState = normalizeState(stateToUse);

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

        // [IMPROVEMENT Item 5] Добавляем подробную историю действий (toolLogs)
        // Теперь нарратив видит не только прошлый рассказ, но и механические действия, которые к нему привели
        const formatTurn = (turn: TurnHistory) => {
          const actions = turn.toolLogs && turn.toolLogs.length > 0
            ? turn.toolLogs.map(t => `- [${t.name}] Результат: ${t.result}`).join('\n')
            : '(нет действий)';

          return `Ход ${turn.turn}:\nИгрок: "${turn.userPrompt}"\nДействия:\n${actions}\nНарратив: "${turn.narrative}"`;
        };

        if (isFinalNarrative) {
          // Для нарратора - передаём последние нарративы для стилистической связности
          historySection = `\n\nИСТОРИЯ ПОСЛЕДНИХ ХОДОВ (для стилистической связности и контекста):\n${recentHistory.map(formatTurn).join('\n\n---\n\n')}\n`;
        } else {
          // Для симуляции - передаём нарративы с разметкой для материализации объектов
          historySection = `\n\nИСТОРИЯ ПОСЛЕДНИХ ХОДОВ (для понимания контекста и материализации объектов):\n${recentHistory.map(formatTurn).join('\n\n---\n\n')}\n`;
        }
      } else {
        console.log("[Service] No history available for this turn");
      }

      // basePrompt - это ровно то, что указано в системном промпте (поле или пресет)
      // JSON состояния и история - это контекст, который добавляется отдельно
      const baseInstruction = `${basePrompt}

ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):
${JSON.stringify(normalizedState, null, 2)}${locationContext}${historySection}`;

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
    let response = await ai.models.generateContent({
      model: modelId,
      contents: conversationHistory,
      config: {
        systemInstruction: createSystemInstruction(workingState),
        tools: geminiTools,
        temperature: settings.temperature,
        thinkingConfig,
      },
    });

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
      ? `\n\nВыполненные изменения в мире:\n${toolLogs.map(log => `- ${log.name}: ${log.result}`).join('\n')}`
      : '';

    // Всегда передаем thinking симуляции в нарратив, если он есть
    // Это помогает нарративу лучше понимать контекст и рассуждения модели
    const simulationContext = simulationThinkingParts.length > 0
      ? `\n\nРассуждения симуляции:\n${simulationThinkingParts.join('\n\n---\n\n')}`
      : '';

    // Разная инструкция в зависимости от того, были ли действия
    const narrativeInstruction = hasToolActions
      ? 'Создай художественное описание того, что произошло в результате этих действий. Учитывай рассуждения симуляции выше (если они есть).'
      : 'Создай художественное описание в ответ на запрос игрока. Учитывай рассуждения симуляции выше (если они есть). Опиши то, что он видит/слышит/чувствует, включая причины, почему действие не удалось (если применимо).';

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

    const finalResponse = await ai.models.generateContent({
      model: narrativeModelId,
      contents: narrativeContents,
      config: {
        systemInstruction: narrativeSystemInstructionWithObjects,
        thinkingConfig: narrativeThinkingConfig,
        temperature: narrativeTemperature,
        // Не передаём tools — форсируем генерацию текста
      },
    });

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

      // Если narrative пустой, но есть finalResponse.text - используем его
      if (!narrative && finalResponse.text) {
        // Но только если он не похож на thinking
        const fallbackText = finalResponse.text.trim();
        if (!fallbackText.startsWith('**') && !fallbackText.startsWith('Okay,')) {
          narrative = fallbackText;
        }
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
