import { GoogleGenAI, Tool, Content, Part } from "@google/genai";
import { GameState, SimulationResult, ToolCallLog, GameTool } from "../types";

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

    const createSystemInstruction = (state: GameState) => `
Ты - продвинутый ИИ Гейм-Мастер (Ведущий).
Твоя задача:
1. Проанализировать текущее состояние мира (JSON) и намерение/действие игрока.
2. Использовать ДОСТУПНЫЕ ИНСТРУМЕНТЫ (если они подходят) для обновления JSON состояния (перемещение предметов, изменение состояний).
3. Написать художественное литературное описание результата.
   - Учитывай locationId игрока для определения видимости объектов.
   - Если игрок хочет взаимодействовать с объектом, который находится в другой локации, опиши, что это невозможно.

ВАЖНО:
- Всегда отвечай на том же языке, на котором написан входной запрос и данные состояния (РУССКИЙ).
- Текст должен быть атмосферным и соответствовать жанру.

ТЕКУЩЕЕ СОСТОЯНИЕ МИРА (JSON):
${JSON.stringify(state, null, 2)}
`;

    const modelId = "gemini-2.5-flash"; 

    console.log(`[Service] Sending prompt to ${modelId} with ${geminiTools.length > 0 ? geminiTools[0].functionDeclarations?.length : 0} tools...`);
    
    const initialContents: Content[] = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    const result1 = await ai.models.generateContent({
      model: modelId,
      contents: initialContents,
      config: {
        systemInstruction: createSystemInstruction(currentState),
        tools: geminiTools,
        temperature: 0.7,
      },
    });

    console.log("[Service] Received response 1.");
    console.log("[Service] result1 structure:", {
      hasCandidates: !!result1.candidates,
      candidatesCount: result1.candidates?.length || 0,
      hasText: !!result1.text,
      textLength: result1.text?.length || 0
    });
    
    let workingState = currentState;
    const toolLogs: ToolCallLog[] = [];
    let narrative = "";

    const candidates = result1.candidates;
    if (!candidates || candidates.length === 0) {
        console.error("[Service] ❌ result1.candidates пуст или отсутствует");
        return {
            narrative: "Ошибка: ИИ не вернул вариантов ответа.",
            toolLogs: [],
            newState: currentState
        };
    }

    const firstCandidateContent = candidates[0].content;
    console.log("[Service] result1.candidates[0].content:", {
      role: firstCandidateContent.role,
      partsCount: firstCandidateContent.parts?.length || 0
    });

    const toolCalls = firstCandidateContent.parts?.filter(p => p.functionCall).map(p => p.functionCall);
    
    if (toolCalls && toolCalls.length > 0) {
      console.log("[Service] Found tool calls:", toolCalls.map(c => ({
        name: c?.name,
        id: c?.id
      })));
    }

    if (toolCalls && toolCalls.length > 0) {
      console.log(`[Service] Processing ${toolCalls.length} tool calls...`);
      
      const toolResponseParts: Part[] = [];

      for (const call of toolCalls) {
        if (!call) continue;
        console.log(`[Service] Executing tool: ${call.name}`);
        
        // Find the tool implementation
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

        // Log
        toolLogs.push({
          name: call.name,
          args: call.args,
          result: executionResult
        });

        toolResponseParts.push({
            functionResponse: {
                name: call.name,
                id: call.id,
                response: { result: executionResult }
            }
        });
      }

      const historyContents: Content[] = [
          ...initialContents,
          firstCandidateContent, 
          { role: 'user', parts: toolResponseParts } 
      ];

      console.log("[Service] Sending tool outputs back to AI for narrative...");
      console.log("[Service] Tool responses being sent:", toolResponseParts.map(p => ({
        functionName: p.functionResponse?.name,
        functionId: p.functionResponse?.id,
        responsePreview: JSON.stringify(p.functionResponse?.response).substring(0, 100)
      })));
      console.log("[Service] Updated workingState summary:", {
        objectsCount: workingState.objects.length,
        playersCount: workingState.players.length,
        locationsCount: workingState.locations.length
      });

      const result2 = await ai.models.generateContent({
          model: modelId,
          contents: historyContents,
          config: {
              systemInstruction: createSystemInstruction(workingState) + "\n\nВАЖНО: Инструменты уже выполнены. Сгенерируй ТОЛЬКО художественное повествование о результате действий. НЕ вызывай инструменты.",
              // Не передаём tools - это заставит Gemini генерировать только текст
          }
      });

      console.log("[Service] Received response 2.");
      console.log("[Service] result2 structure:", {
        hasCandidates: !!result2.candidates,
        candidatesCount: result2.candidates?.length || 0,
        hasText: !!result2.text,
        textLength: result2.text?.length || 0,
        textPreview: result2.text?.substring(0, 100) || "N/A"
      });

      if (result2.candidates && result2.candidates.length > 0) {
        const result2Content = result2.candidates[0].content;
        console.log("[Service] result2.candidates[0].content:", {
          role: result2Content.role,
          partsCount: result2Content.parts?.length || 0,
          hasParts: !!result2Content.parts,
          partsType: Array.isArray(result2Content.parts) ? 'array' : typeof result2Content.parts
        });
        
        // Детальный вывод структуры content для отладки
        console.log("[Service] result2.candidates[0].content полная структура:", JSON.stringify(result2Content, null, 2).substring(0, 1000));

        if (result2Content.parts) {
          const textParts = result2Content.parts.filter(p => p.text);
          const functionCallParts = result2Content.parts.filter(p => p.functionCall);
          
          console.log("[Service] result2 parts breakdown:", {
            totalParts: result2Content.parts.length,
            textPartsCount: textParts.length,
            functionCallPartsCount: functionCallParts.length
          });

          if (textParts.length > 0) {
            console.log("[Service] Text parts found:", textParts.map(p => ({
              textLength: p.text?.length || 0,
              textPreview: p.text?.substring(0, 100) || "N/A"
            })));
          }

          if (functionCallParts.length > 0) {
            console.log("[Service] FunctionCall parts found:", functionCallParts.map(p => ({
              functionName: p.functionCall?.name || "N/A",
              functionId: p.functionCall?.id || "N/A"
            })));
            console.warn("[Service] ⚠️ Второй ответ содержит functionCall вместо текста!");
          }

          // Извлекаем текст из всех text частей
          const extractedText = textParts.map(p => p.text).filter(Boolean).join(' ');
          if (extractedText) {
            console.log("[Service] ✓ Текст успешно извлечён из parts, длина:", extractedText.length);
            narrative = extractedText;
          } else {
            console.warn("[Service] ⚠️ Не удалось извлечь текст из parts");
            narrative = result2.text || "Действие обработано (Повествование не сгенерировано).";
          }
        } else {
          console.warn("[Service] ⚠️ result2.candidates[0].content.parts отсутствует");
          console.log("[Service] Попытка использовать result2.text напрямую:", {
            hasText: !!result2.text,
            textLength: result2.text?.length || 0,
            textValue: result2.text || "undefined/null"
          });
          
          // Попробуем альтернативные способы извлечения текста
          if (result2.text && result2.text.trim()) {
            console.log("[Service] ✓ Используем result2.text напрямую");
            narrative = result2.text;
          } else {
            // Попробуем извлечь из candidates напрямую
            const candidateText = result2.candidates[0].text;
            if (candidateText && candidateText.trim()) {
              console.log("[Service] ✓ Используем result2.candidates[0].text");
              narrative = candidateText;
            } else {
              console.warn("[Service] ❌ Не удалось извлечь текст ни одним способом");
              console.log("[Service] Полная структура result2.candidates[0]:", JSON.stringify(result2.candidates[0], null, 2).substring(0, 1000));
              narrative = "Действие обработано (Повествование не сгенерировано).";
            }
          }
        }
      } else {
        console.warn("[Service] ⚠️ result2.candidates пуст или отсутствует");
        narrative = result2.text || "Действие обработано (Повествование не сгенерировано).";
      }

    } else {
      console.log("[Service] No tool calls, using direct text.");
      narrative = result1.text || "";
    }

    console.log("[Service] Final result:", {
      narrativeLength: narrative.length,
      narrativePreview: narrative.substring(0, 150),
      toolLogsCount: toolLogs.length,
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
