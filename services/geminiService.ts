import { GoogleGenAI, Tool, Content, Part } from "@google/genai";
import { GameState, SimulationResult, ToolCallLog, GameTool } from "../types";
import { normalizeState } from "../utils/gameUtils";

// Конфигурация
const MAX_TOOL_ITERATIONS = 5; // Максимум итераций с инструментами

export const processGameTurn = async (
  currentState: GameState,
  userPrompt: string,
  enabledTools: GameTool[]
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
      const baseInstruction = `
Ты - продвинутый ИИ Гейм-Мастер (Ведущий).
0. Учитывай текущее состояние мира (JSON) и используй его для генерации ответа.
1. Используй следующие правила:      
2. Помни, что мир построен на правилах и законах, вытекающих из его описания и жанра игры.
3. Старайся следовать этим правилам и законам. Не нарушай их.
4. Используй инструменты для изменения состояния мира, игроков, объектов и локаций с помощью добавления изменения или удаления атрибутов.
5. Используй инструменты для создания новых объектов, если это выглядит логично или следует из текста пользователя.
6. Используй инструменты для удаления объектов, если они перестали существовать в мире как первоначальная сущность.
7. Используй инструменты для перемещения объектов между игроками, локациями и объектами. Не забывай, что объекты могут быть вложены в другие объекты.
8. Ты можешь вызывать инструменты несколько раз подряд — например, сначала создать объект, потом переместить его.

ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):
${JSON.stringify(normalizedState, null, 2)}
`;

      if (isFinalNarrative) {
        return baseInstruction + "\n\nВсе необходимые изменения состояния мира уже внесены. Опиши художественно, что произошло в результате действий игрока.";
      }
      
      return baseInstruction;
    };

    const modelId = "gemini-2.5-flash"; 

    console.log(`[Service] Sending prompt to ${modelId} with ${geminiTools.length > 0 ? geminiTools[0].functionDeclarations?.length : 0} tools...`);
    
    let workingState = currentState;
    const toolLogs: ToolCallLog[] = [];
    let narrative = "";

    // История сообщений для многоходового диалога
    let conversationHistory: Content[] = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // Первый запрос
    let response = await ai.models.generateContent({
      model: modelId,
      contents: conversationHistory,
      config: {
        systemInstruction: createSystemInstruction(workingState),
        tools: geminiTools,
        temperature: 0.7,
      },
    });

    console.log("[Service] Received initial response.");

    // Цикл обработки инструментов
    let iteration = 0;
    
    while (iteration < MAX_TOOL_ITERATIONS) {
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
      if (toolCalls.length === 0) {
        console.log(`[Service] Iteration ${iteration}: No tool calls, extracting narrative...`);
        
        // Извлекаем текст из ответа
        const textParts = assistantContent.parts?.filter(p => p.text) || [];
        narrative = textParts.map(p => p.text).filter(Boolean).join(' ') || response.text || "";
        
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
          try {
            const execution = tool.apply(workingState, call.args);
            workingState = execution.newState;
            executionResult = execution.result;
          } catch (e: any) {
            executionResult = `Ошибка выполнения: ${e.message}`;
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
          temperature: 0.7,
        },
      });

      iteration++;
    }

    // Если вышли по лимиту итераций — генерируем финальный нарратив
    if (iteration >= MAX_TOOL_ITERATIONS && !narrative) {
      console.warn(`[Service] ⚠️ Reached max iterations (${MAX_TOOL_ITERATIONS}), forcing narrative generation...`);
      
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
              try {
                const execution = tool.apply(workingState, call.args);
                workingState = execution.newState;
                executionResult = execution.result;
              } catch (e: any) {
                executionResult = `Ошибка выполнения: ${e.message}`;
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
      const finalResponse = await ai.models.generateContent({
        model: modelId,
        contents: conversationHistory,
        config: {
          systemInstruction: createSystemInstruction(workingState, true),
          // Не передаём tools — форсируем генерацию текста
        },
      });

      if (finalResponse.candidates && finalResponse.candidates.length > 0) {
        const finalContent = finalResponse.candidates[0].content;
        const textParts = finalContent.parts?.filter(p => p.text) || [];
        narrative = textParts.map(p => p.text).filter(Boolean).join(' ') || finalResponse.text || "";
      }
    }

    // Fallback если нарратив пустой
    if (!narrative) {
      narrative = toolLogs.length > 0 
        ? "Действие обработано." 
        : "Ничего не произошло.";
    }

    console.log("[Service] Final result:", {
      narrativeLength: narrative.length,
      narrativePreview: narrative.substring(0, 150),
      toolLogsCount: toolLogs.length,
      iterations: iteration,
      stateChanged: workingState !== currentState
    });

    return {
      narrative,
      toolLogs,
      newState: workingState
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
