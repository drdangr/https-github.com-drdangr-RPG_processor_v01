import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { processGameTurn } from '../geminiService';
import { createTestState } from '../../tools/__tests__/testHelpers';
import { GameTool, GameState } from '../../types';
import { Type } from '@google/genai';

// Мок для generateContent
const mockGenerateContent = vi.fn();

// Мок для @google/genai
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent
      };
    },
    Type: {
      OBJECT: 'object',
      STRING: 'string',
    }
  };
});

// Хелпер для создания мок-ответа от AI
function createMockResponse(options: {
  text?: string;
  toolCalls?: Array<{ name: string; id: string; args: any }>;
}) {
  const parts: any[] = [];
  
  if (options.text) {
    parts.push({ text: options.text });
  }
  
  if (options.toolCalls) {
    for (const call of options.toolCalls) {
      parts.push({
        functionCall: {
          name: call.name,
          id: call.id,
          args: call.args
        }
      });
    }
  }
  
  return {
    candidates: [{
      content: {
        role: 'model',
        parts
      }
    }],
    text: options.text || ''
  };
}

// Простой тестовый инструмент
function createMockTool(name: string, handler: (state: GameState, args: any) => { newState: GameState; result: string }): GameTool {
  return {
    definition: {
      name,
      description: `Test tool: ${name}`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          value: { type: Type.STRING, description: 'Test value' }
        },
        required: ['value']
      }
    },
    apply: handler
  };
}

describe('geminiService - многоходовый цикл инструментов', () => {
  beforeEach(() => {
    // Настраиваем process.env.API_KEY
    vi.stubGlobal('process', { env: { API_KEY: 'test-api-key' } });
    
    // Сбрасываем моки
    mockGenerateContent.mockReset();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  test('обрабатывает ответ без инструментов (только текст)', async () => {
    const state = createTestState();
    
    // AI сразу возвращает текст без вызова инструментов
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Джек осмотрелся вокруг.' })
    );
    
    const result = await processGameTurn(state, 'осмотреться', []);
    
    expect(result.narrative).toBe('Джек осмотрелся вокруг.');
    expect(result.toolLogs).toHaveLength(0);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  test('обрабатывает один вызов инструмента', async () => {
    const state = createTestState();
    
    const testTool = createMockTool('test_action', (s, args) => ({
      newState: s,
      result: `Выполнено: ${args.value}`
    }));
    
    // Первый ответ: AI вызывает инструмент
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'test_action', id: 'call_1', args: { value: 'тест' } }]
      })
    );
    
    // Второй ответ: AI возвращает нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Действие успешно выполнено.' })
    );
    
    const result = await processGameTurn(state, 'выполнить тест', [testTool]);
    
    expect(result.narrative).toBe('Действие успешно выполнено.');
    expect(result.toolLogs).toHaveLength(1);
    expect(result.toolLogs[0].name).toBe('test_action');
    expect(result.toolLogs[0].result).toBe('Выполнено: тест');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  test('обрабатывает многоходовый цикл инструментов', async () => {
    const state = createTestState();
    
    let callCount = 0;
    const counterTool = createMockTool('increment', (s, args) => {
      callCount++;
      return {
        newState: s,
        result: `Счётчик: ${callCount}`
      };
    });
    
    // Первый ответ: AI вызывает инструмент
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_1', args: { value: '1' } }]
      })
    );
    
    // Второй ответ: AI вызывает инструмент снова
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_2', args: { value: '2' } }]
      })
    );
    
    // Третий ответ: AI вызывает инструмент ещё раз
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_3', args: { value: '3' } }]
      })
    );
    
    // Четвёртый ответ: AI возвращает нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Выполнено три действия подряд!' })
    );
    
    const result = await processGameTurn(state, 'увеличить три раза', [counterTool]);
    
    expect(result.narrative).toBe('Выполнено три действия подряд!');
    expect(result.toolLogs).toHaveLength(3);
    expect(callCount).toBe(3);
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  test('ограничивает количество итераций (MAX_TOOL_ITERATIONS = 5)', async () => {
    const state = createTestState();
    
    let callCount = 0;
    const infiniteTool = createMockTool('infinite', (s, args) => {
      callCount++;
      return {
        newState: s,
        result: `Вызов ${callCount}`
      };
    });
    
    // AI бесконечно вызывает инструменты
    for (let i = 0; i < 10; i++) {
      mockGenerateContent.mockResolvedValueOnce(
        createMockResponse({
          toolCalls: [{ name: 'infinite', id: `call_${i}`, args: { value: String(i) } }]
        })
      );
    }
    
    // Финальный нарратив после лимита
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Превышен лимит итераций.' })
    );
    
    const result = await processGameTurn(state, 'бесконечный цикл', [infiniteTool]);
    
    // MAX_TOOL_ITERATIONS = 5, + 1 последняя обработка + 1 финальный запрос
    // Инструменты вызываются максимум 6 раз (5 итераций + последние из 5-й итерации)
    expect(result.toolLogs.length).toBeLessThanOrEqual(6);
    expect(result.narrative).toBeTruthy();
    expect(callCount).toBeLessThanOrEqual(6);
  });

  test('обрабатывает несколько инструментов за одну итерацию', async () => {
    const state = createTestState();
    
    const logs: string[] = [];
    
    const toolA = createMockTool('action_a', (s, args) => {
      logs.push('A');
      return { newState: s, result: 'A выполнено' };
    });
    
    const toolB = createMockTool('action_b', (s, args) => {
      logs.push('B');
      return { newState: s, result: 'B выполнено' };
    });
    
    // AI вызывает два инструмента одновременно
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [
          { name: 'action_a', id: 'call_a', args: { value: 'a' } },
          { name: 'action_b', id: 'call_b', args: { value: 'b' } }
        ]
      })
    );
    
    // Нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Оба действия выполнены.' })
    );
    
    const result = await processGameTurn(state, 'сделать A и B', [toolA, toolB]);
    
    expect(logs).toEqual(['A', 'B']);
    expect(result.toolLogs).toHaveLength(2);
    expect(result.narrative).toBe('Оба действия выполнены.');
  });

  test('состояние обновляется между итерациями', async () => {
    const state = createTestState();
    
    const modifyTool = createMockTool('modify_state', (s, args) => {
      // Модифицируем состояние
      const newState = JSON.parse(JSON.stringify(s));
      newState.players[0].attributes.modified = args.value;
      return { newState, result: `Установлено: ${args.value}` };
    });
    
    // Первый вызов модифицирует состояние
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'modify_state', id: 'call_1', args: { value: 'первое' } }]
      })
    );
    
    // Второй вызов модифицирует уже изменённое состояние
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'modify_state', id: 'call_2', args: { value: 'второе' } }]
      })
    );
    
    // Нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Состояние изменено дважды.' })
    );
    
    const result = await processGameTurn(state, 'изменить дважды', [modifyTool]);
    
    // Финальное состояние должно содержать последнее значение
    expect(result.newState.players[0].attributes.modified).toBe('второе');
    expect(result.toolLogs).toHaveLength(2);
  });

  test('обрабатывает ошибку выполнения инструмента', async () => {
    const state = createTestState();
    
    const failingTool = createMockTool('failing_tool', () => {
      throw new Error('Инструмент сломался!');
    });
    
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'failing_tool', id: 'call_1', args: { value: 'test' } }]
      })
    );
    
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Произошла ошибка.' })
    );
    
    const result = await processGameTurn(state, 'сломать', [failingTool]);
    
    expect(result.toolLogs).toHaveLength(1);
    expect(result.toolLogs[0].result).toContain('Ошибка выполнения');
    expect(result.toolLogs[0].result).toContain('Инструмент сломался!');
  });

  test('обрабатывает вызов несуществующего инструмента', async () => {
    const state = createTestState();
    
    // AI пытается вызвать инструмент, которого нет
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'nonexistent_tool', id: 'call_1', args: { value: 'test' } }]
      })
    );
    
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Инструмент не найден.' })
    );
    
    const result = await processGameTurn(state, 'вызвать несуществующий', []);
    
    expect(result.toolLogs).toHaveLength(1);
    expect(result.toolLogs[0].result).toContain('не найден');
  });

  test('возвращает ошибку при отсутствии API ключа', async () => {
    vi.stubGlobal('process', { env: {} }); // Нет API_KEY
    
    const state = createTestState();
    const result = await processGameTurn(state, 'тест', []);
    
    expect(result.narrative).toContain('API_KEY');
    expect(result.narrative).toContain('КРИТИЧЕСКАЯ ОШИБКА');
    expect(result.newState).toBe(state);
  });
});
