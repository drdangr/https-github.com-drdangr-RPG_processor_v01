import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { processGameTurn } from '../geminiService';
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

// Хелпер для создания тестового состояния
function createTestState(): GameState {
  return {
    world: { worldDescription: 'Test World', gameGenre: 'Fantasy' },
    locations: [
      {
        id: 'loc1',
        name: 'Start Location',
        description: 'A dark creepy cave',
        currentSituation: 'Scary sounds',
        state: 'normal',
        connections: [],
        attributes: {}
      },
      {
        id: 'loc2',
        name: 'Connected Location',
        description: 'Bright field',
        currentSituation: 'Sunny',
        state: 'normal',
        connections: [{ targetLocationId: 'loc1', type: 'bidirectional' }],
        attributes: {}
      }
    ],
    players: [
      { id: 'p1', name: 'Tester', description: 'Hero', inventory: [], health: 100, state: 'normal', locationId: 'loc1', attributes: {} }
    ],
    objects: []
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

    // 1. Симуляция: возвращает текст (мысли), инструментов нет -> выход из цикла
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Thinking about looking around...' })
    );

    // 2. Нарратив: генерирует финальное описание
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Джек осмотрелся вокруг.' })
    );

    const result = await processGameTurn(state, 'осмотреться', []);

    expect(result.narrative).toBe('Джек осмотрелся вокруг.');
    expect(result.toolLogs).toHaveLength(0);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  test('обрабатывает один вызов инструмента', async () => {
    const state = createTestState();

    const testTool = createMockTool('test_action', (s, args) => ({
      newState: s,
      result: `Выполнено: ${args.value}`
    }));

    // 1. Симуляция: вызывает инструмент
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'test_action', id: 'call_1', args: { value: 'тест' } }]
      })
    );

    // 2. Симуляция (итерация 1): получает результат, решает закончить (текст без tools)
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Действие выполнено, завершаю.' })
    );

    // 3. Нарратив: финальное описание
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Действие успешно выполнено.' })
    );

    const result = await processGameTurn(state, 'выполнить тест', [testTool]);

    expect(result.narrative).toBe('Действие успешно выполнено.');
    expect(result.toolLogs).toHaveLength(1);
    expect(result.toolLogs[0].name).toBe('test_action');
    expect(result.toolLogs[0].result).toBe('Выполнено: тест');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
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

    // 1. Симуляция: Инструмент 1
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_1', args: { value: '1' } }]
      })
    );

    // 2. Симуляция: Инструмент 2
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_2', args: { value: '2' } }]
      })
    );

    // 3. Симуляция: Инструмент 3
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [{ name: 'increment', id: 'call_3', args: { value: '3' } }]
      })
    );

    // 4. Симуляция: Завершение (текст)
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Все действия выполнены.' })
    );

    // 5. Нарратив: Финал
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Выполнено три действия подряд!' })
    );

    const result = await processGameTurn(state, 'увеличить три раза', [counterTool]);

    expect(result.narrative).toBe('Выполнено три действия подряд!');
    expect(result.toolLogs).toHaveLength(3);
    expect(callCount).toBe(3);
    expect(mockGenerateContent).toHaveBeenCalledTimes(5);
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

    // AI бесконечно вызывает инструменты (10 раз)
    // Но цикл ограничится 5 итерациями (каждая вызывает инструмент) + финальный вызов (нарратив)
    for (let i = 0; i < 10; i++) {
      mockGenerateContent.mockResolvedValueOnce(
        createMockResponse({
          toolCalls: [{ name: 'infinite', id: `call_${i}`, args: { value: String(i) } }]
        })
      );
    }

    // Нарратив (он позовется после break по лимиту)
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Превышен лимит итераций.' })
    );

    const result = await processGameTurn(state, 'бесконечный цикл', [infiniteTool]);

    // 5 iterations for tools + 1 final narrative
    expect(result.toolLogs.length).toBeLessThanOrEqual(6);
    expect(result.narrative).toBeTruthy();
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

    // 1. Симуляция: Два инструмента сразу
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({
        toolCalls: [
          { name: 'action_a', id: 'call_a', args: { value: 'a' } },
          { name: 'action_b', id: 'call_b', args: { value: 'b' } }
        ]
      })
    );

    // 2. Симуляция: Завершение
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Готово.' })
    );

    // 3. Нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Оба действия выполнены.' })
    );

    const result = await processGameTurn(state, 'сделать A и B', [toolA, toolB]);

    expect(logs).toEqual(['A', 'B']);
    expect(result.toolLogs).toHaveLength(2);
    expect(result.narrative).toBe('Оба действия выполнены.');
  });

  test('добавляет контент локации и историю действий в промпт', async () => {
    const state = createTestState();
    const history = [{
      turn: 1,
      userPrompt: 'предыдущее действие',
      narrative: 'предыдущий ответ',
      toolLogs: [{ name: 'prev_tool', args: {}, result: 'Успех' }]
    }];

    // 1. Симуляция
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Thinking...' })
    );

    // 2. Нарратив
    mockGenerateContent.mockResolvedValueOnce(
      createMockResponse({ text: 'Финальный нарратив.' })
    );

    await processGameTurn(state, 'текущее действие', [], undefined, history);

    // Проверяем вызовы
    // Вызов 0: Симуляция. Должна быть история действий.
    const simCallArgs = mockGenerateContent.mock.calls[0][0];
    const simInstruction = simCallArgs.config.systemInstruction;

    expect(simInstruction).toContain('ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ');
    expect(simInstruction).toContain('prev_tool'); // Проверяем наличие имени инструмента

    // Вызов 1: Нарратив. Должен быть контекст локации.
    const narCallArgs = mockGenerateContent.mock.calls[1][0];
    const narInstruction = narCallArgs.config.systemInstruction;

    expect(narInstruction).toContain('ТЕКУЩАЯ ЛОКАЦИЯ');
    expect(narInstruction).toContain('A dark creepy cave');
    expect(narInstruction).toContain('Scary sounds');
    // И история тоже
    expect(narInstruction).toContain('ИСТОРИЯ ПОСЛЕДНИХ ХОДОВ');
    expect(narInstruction).toContain('prev_tool');
  });
});
