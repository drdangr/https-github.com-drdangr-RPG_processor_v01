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

    const systemInstruction = `
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
${JSON.stringify(currentState, null, 2)}
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
        systemInstruction: systemInstruction,
        tools: geminiTools,
        temperature: 0.7,
      },
    });

    console.log("[Service] Received response 1.");
    
    let workingState = currentState;
    const toolLogs: ToolCallLog[] = [];
    let narrative = "";

    const candidates = result1.candidates;
    if (!candidates || candidates.length === 0) {
        return {
            narrative: "Ошибка: ИИ не вернул вариантов ответа.",
            toolLogs: [],
            newState: currentState
        };
    }

    const firstCandidateContent = candidates[0].content;
    const toolCalls = firstCandidateContent.parts?.filter(p => p.functionCall).map(p => p.functionCall);

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

      const result2 = await ai.models.generateContent({
          model: modelId,
          contents: historyContents,
          config: {
              systemInstruction: systemInstruction,
              tools: geminiTools 
          }
      });

      narrative = result2.text || "Действие обработано (Повествование не сгенерировано).";

    } else {
      console.log("[Service] No tool calls, using direct text.");
      narrative = result1.text || "";
    }

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
