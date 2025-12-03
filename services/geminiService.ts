import { GoogleGenAI, Tool, Content, Part } from "@google/genai";
import { GameState, SimulationResult, ToolCallLog, GameTool, AISettings, DEFAULT_AI_SETTINGS, TokenUsage, CostInfo } from "../types";
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
const extractTokenUsage = (response: any): TokenUsage | null => {
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

// Стандартный системный промпт для симуляции (с инструментами)
export const DEFAULT_SYSTEM_PROMPT = `Ты - продвинутый ИИ Гейм-Мастер (Ведущий). Твоя задача - изменять состояние мира через инструменты.

ВАЖНО: НЕ генерируй текстовый ответ. ТОЛЬКО вызывай инструменты. Нарратив будет создан отдельно.

Правила:
1. Учитывай текущее состояние мира (JSON).
2. Мир построен на правилах и законах, вытекающих из его описания и жанра игры. Следуй им.
3. Используй инструменты для изменения состояния мира, игроков, объектов и локаций через атрибуты.
4. Создавай новые объекты, если это логично следует из действий игрока.
5. Удаляй объекты, которые перестали существовать.
6. Перемещай объекты между игроками, локациями и другими объектами.
7. Можешь вызывать несколько инструментов подряд — например, создать объект, потом переместить его.

`;

// Стандартный системный промпт для нарратива (художественное описание)
export const DEFAULT_NARRATIVE_PROMPT = `Ты - талантливый писатель и рассказчик, создающий живые, атмосферные описания событий в игровом мире.

ЯЗЫК: Пиши на русском языке.

Твоя задача - создать художественное, детальное описание того, что произошло в результате действий игрока. 

Правила для нарратива:
1. Используй богатый, образный язык. Опиши не только что произошло, но и как это выглядело, звучало, ощущалось.
2. Учитывай атмосферу и жанр мира. Если это нуар - используй соответствующий стиль, если фэнтези - создай магическую атмосферу.
3. Фокусируйся на деталях: звуки, запахи, визуальные образы, тактильные ощущения.
4. Передавай эмоции и настроение персонажей через их действия и реакции.
5. Будь конкретным, но не перегружай текст избыточными деталями.
6. Создавай ощущение присутствия - читатель должен почувствовать себя в этом мире.
7. Используй динамичные глаголы и яркие образы вместо абстрактных описаний.
8. Длина описания должна быть достаточной для погружения, но не чрезмерной (обычно 1-2 абзаца).

Помни: ты не описываешь правила игры или механику - ты создаёшь живой, дышащий мир, который читатель может увидеть и почувствовать.`;

export const processGameTurn = async (
  currentState: GameState,
  userPrompt: string,
  enabledTools: GameTool[],
  settings: AISettings = DEFAULT_AI_SETTINGS
): Promise<SimulationResult> => {
  console.log("[Service] Starting processGameTurn...");

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

    const createSystemInstruction = (state: GameState, isFinalNarrative: boolean = false) => {
      const normalizedState = normalizeState(state);
      
      // Для нарратива используем narrativePromptOverride, если задан, иначе DEFAULT_NARRATIVE_PROMPT
      // Для симуляции используем systemPromptOverride или DEFAULT_SYSTEM_PROMPT
      let basePrompt: string;
      let promptSource: string;
      
      if (isFinalNarrative) {
        if (settings.narrativePromptOverride) {
          basePrompt = settings.narrativePromptOverride;
          promptSource = 'narrativePromptOverride (custom)';
        } else {
          basePrompt = DEFAULT_NARRATIVE_PROMPT;
          promptSource = 'DEFAULT_NARRATIVE_PROMPT';
        }
        console.log(`[Service] 🎭 Using narrative prompt: ${promptSource}`);
      } else {
        if (settings.systemPromptOverride) {
          basePrompt = settings.systemPromptOverride;
          promptSource = 'systemPromptOverride (custom)';
        } else {
          basePrompt = DEFAULT_SYSTEM_PROMPT;
          promptSource = 'DEFAULT_SYSTEM_PROMPT';
        }
        console.log(`[Service] ⚙️ Using simulation prompt: ${promptSource}`);
      }
      
      const baseInstruction = `${basePrompt}

ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):
${JSON.stringify(normalizedState, null, 2)}
`;
      
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
    const extractThoughts = (resp: any, isNarrative: boolean = false, iteration?: number) => {
      try {
        const candidates = resp?.candidates;
        if (candidates && candidates.length > 0) {
          const candidate = candidates[0];
          const parts = candidate.content?.parts || [];
          
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
                let type: 'text' | 'thought' | 'functionCall' | 'unknown' = 'unknown';
                let content = '';
                
                if (p.thought === true && p.text) {
                  type = 'thought';
                  content = p.text;
                } else if (p.text) {
                  type = 'text';
                  content = p.text;
                } else if (p.functionCall) {
                  type = 'functionCall';
                  content = JSON.stringify({ name: p.functionCall.name, args: p.functionCall.args }, null, 2);
                }
                
                return {
                  type,
                  content,
                  length: content.length
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
              let type: 'text' | 'thought' | 'functionCall' | 'unknown' = 'unknown';
              let content = '';
              
              if (p.thought === true && p.text) {
                type = 'thought';
                content = p.text;
              } else if (p.text) {
                type = 'text';
                content = p.text;
              } else if (p.functionCall) {
                type = 'functionCall';
                content = JSON.stringify({ name: p.functionCall.name, args: p.functionCall.args }, null, 2);
              }
              
              return {
                type,
                content,
                length: content.length
              };
            });
            
            const functionCalls = parts.filter((p: any) => p.functionCall);
            debugInfo.functionCallsCount = functionCalls.length;
          }
          
          // Ищем части с thought: true
          const thoughtParts = parts.filter((p: any) => p.thought === true && p.text);
          
          // Логируем для консоли
          const functionCalls = parts.filter((p: any) => p.functionCall);
          console.log(`[Service] ${prefix} Response structure:`, debugInfo.responseStructure);
          if (functionCalls.length > 0 && !isNarrative) {
            console.log(`[Service] ${prefix} Found ${functionCalls.length} function calls in response`);
          }
          
          if (thoughtParts.length > 0) {
            const thoughts = thoughtParts.map((p: any) => p.text).join('\n');
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

    // Цикл обработки инструментов
    let iteration = 0;
    
    while (iteration < settings.maxIterations) {
      const candidates = response.candidates;
      
      if (!candidates || candidates.length === 0) {
        console.error("[Service] ❌ candidates пуст или отсутствует");
        return {
          narrative: "Ошибка: ИИ не вернул вариантов ответа.",
          toolLogs,
          newState: workingState
        };
      }

      const assistantContent = candidates[0].content;
      
      // Извлекаем tool calls из ответа
      const toolCalls = assistantContent.parts?.filter(p => p.functionCall).map(p => p.functionCall) || [];
      
      // Если нет tool calls — выходим из цикла
      // НО не используем narrative из этого ответа - финальный запрос сгенерирует лучший нарратив
      if (toolCalls.length === 0) {
        console.log(`[Service] Iteration ${iteration}: No tool calls, will generate final narrative...`);
        // Не извлекаем narrative здесь - финальный запрос сделает это лучше
        break;
      }

      console.log(`[Service] Iteration ${iteration}: Processing ${toolCalls.length} tool calls...`);
      
      // Выполняем инструменты
      const toolResponseParts: Part[] = [];
      
      for (const call of toolCalls) {
        if (!call) continue;
        
        console.log(`[Service] Executing tool: ${call.name}`, call.args);
        
        const tool = enabledTools.find(t => t.definition.name === call.name);
        
        let executionResult = "Ошибка: Инструмент не найден или отключен.";
        if (tool) {
          // Валидация обязательных аргументов
          const requiredParams = tool.definition.parameters?.required || [];
          const missingParams = requiredParams.filter(param => 
            call.args?.[param] === undefined || call.args?.[param] === null || call.args?.[param] === ''
          );
          
          if (missingParams.length > 0) {
            executionResult = `Ошибка валидации: отсутствуют обязательные параметры: ${missingParams.join(', ')}`;
            console.warn(`[Service] ⚠️ Validation failed for ${call.name}:`, missingParams);
          } else {
            try {
              const execution = tool.apply(workingState, call.args);
              workingState = execution.newState;
              executionResult = execution.result;
            } catch (e: any) {
              executionResult = `Ошибка выполнения: ${e.message}`;
              console.error(`[Service] ❌ Tool execution error for ${call.name}:`, e);
            }
          }
        }

        toolLogs.push({
          name: call.name,
          args: call.args,
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

      // Добавляем ответ ассистента и результаты инструментов в историю
      conversationHistory.push(assistantContent);
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
    const lastCandidates = response.candidates;
    if (lastCandidates && lastCandidates.length > 0) {
      const lastContent = lastCandidates[0].content;
      
      // Обрабатываем оставшиеся tool calls
      const remainingToolCalls = lastContent.parts?.filter(p => p.functionCall).map(p => p.functionCall) || [];
      if (remainingToolCalls.length > 0) {
        const toolResponseParts: Part[] = [];
        
        for (const call of remainingToolCalls) {
          if (!call) continue;
          
          const tool = enabledTools.find(t => t.definition.name === call.name);
          let executionResult = "Ошибка: Инструмент не найден или отключен.";
          
          if (tool) {
            // Валидация обязательных аргументов
            const requiredParams = tool.definition.parameters?.required || [];
            const missingParams = requiredParams.filter(param => 
              call.args?.[param] === undefined || call.args?.[param] === null || call.args?.[param] === ''
            );
            
            if (missingParams.length > 0) {
              executionResult = `Ошибка валидации: отсутствуют обязательные параметры: ${missingParams.join(', ')}`;
              console.warn(`[Service] ⚠️ Validation failed for ${call.name}:`, missingParams);
            } else {
              try {
                const execution = tool.apply(workingState, call.args);
                workingState = execution.newState;
                executionResult = execution.result;
              } catch (e: any) {
                executionResult = `Ошибка выполнения: ${e.message}`;
                console.error(`[Service] ❌ Tool execution error for ${call.name}:`, e);
              }
            }
          }

          toolLogs.push({
            name: call.name,
            args: call.args,
            result: executionResult,
            iteration: iteration // Последняя итерация
          });

          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              id: call.id,
              response: { result: executionResult }
            }
          });
        }
        
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
        systemInstruction: narrativeSystemInstruction,
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

    if (finalResponse.candidates && finalResponse.candidates.length > 0) {
      const finalContent = finalResponse.candidates[0].content;
      const textParts = finalContent.parts?.filter((p: any) => p.text && !p.thought) || [];
      narrative = textParts.map((p: any) => p.text).filter(Boolean).join(' ') || finalResponse.text || "";
      
      console.log("[Service] 🎭 Narrative generated:", {
        length: narrative.length,
        wordCount: narrative.split(/\s+/).length,
        preview: narrative.substring(0, 150) + (narrative.length > 150 ? '...' : '')
      });
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
