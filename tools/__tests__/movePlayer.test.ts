import { describe, test, expect } from 'vitest';
import movePlayer from '../movePlayer';
import { GameState } from '../../types';
import { statesEqual } from './testHelpers';

/**
 * Создает тестовое состояние с несколькими локациями и связями разных типов
 */
function createLocationTestState(): GameState {
  return {
    world: {
      worldDescription: 'Test world with locations',
      gameGenre: 'cyberpunk'
    },
    locations: [
      {
        id: 'loc_001',
        name: 'Офис',
        description: 'Тестовый офис',
        currentSituation: 'Тихо',
        connections: [
          {
            targetLocationId: 'loc_002',
            type: 'out' // Можно выйти из loc_001 в loc_002
          },
          {
            targetLocationId: 'loc_003',
            type: 'bidirectional' // Можно перемещаться в обе стороны
          },
          {
            targetLocationId: 'loc_002',
            type: 'in' // Можно войти из loc_002 в loc_001 (для обратного пути)
          }
        ],
        attributes: {
          state: 'нормальное состояние'
        }
      },
      {
        id: 'loc_002',
        name: 'Улица',
        description: 'Тестовая улица',
        currentSituation: 'Шумно',
        connections: [
          {
            targetLocationId: 'loc_004',
            type: 'bidirectional'
          }
        ],
        attributes: {
          state: 'нормальное состояние'
        }
      },
      {
        id: 'loc_003',
        name: 'Библиотека',
        description: 'Тестовая библиотека',
        currentSituation: 'Тихо',
        connections: [
          {
            targetLocationId: 'loc_001',
            type: 'bidirectional' // Обратная связь
          }
        ],
        attributes: {}
      },
      {
        id: 'loc_004',
        name: 'Парк',
        description: 'Тестовый парк',
        currentSituation: 'Спокойно',
        connections: [
          {
            targetLocationId: 'loc_002',
            type: 'bidirectional' // Обратная связь
          }
        ],
        attributes: {}
      },
      {
        id: 'loc_005',
        name: 'Изолированная локация',
        description: 'Локация без связей',
        currentSituation: 'Пусто',
        connections: [], // Нет связей
        attributes: {}
      }
    ],
    players: [
      {
        id: 'char_001',
        name: 'Игрок 1',
        description: 'Первый игрок',
        locationId: 'loc_001',
        attributes: {
          health: 'в хорошей форме',
          condition: 'готов к действию'
        }
      },
      {
        id: 'char_002',
        name: 'Игрок 2',
        description: 'Второй игрок',
        locationId: 'loc_002',
        attributes: {
          health: 'устал',
          condition: 'устал'
        }
      }
    ],
    objects: []
  };
}

describe('move_player tool', () => {
  describe('Успешные операции', () => {
    test('успешно перемещает игрока через связь типа out', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      expect(result.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_002');
      expect(result.result).toContain('перемещён');
      expect(result.result).toContain('Игрок 1');
      expect(result.result).toContain('Офис');
      expect(result.result).toContain('Улица');
      // Исходное состояние не должно быть изменено
      expect(state).toEqual(originalState);
    });

    test('успешно перемещает игрока через связь типа in', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // Игрок 2 находится в loc_002
      // У loc_001 есть связь типа 'in' с loc_002: {targetLocationId: 'loc_002', type: 'in'}
      // Это означает, что из loc_002 можно войти в loc_001
      // Логика проверяет: есть ли у целевой локации (loc_001) связь типа 'in' с текущей (loc_002)
      const result = movePlayer.apply(state, {
        playerId: 'char_002',
        targetLocationId: 'loc_001'
      });

      expect(result.newState.players.find(p => p.id === 'char_002')?.locationId).toBe('loc_001');
      expect(result.result).toContain('перемещён');
      expect(result.result).toContain('Игрок 2');
      expect(state).toEqual(originalState);
    });

    test('успешно перемещает игрока через связь типа bidirectional', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_003'
      });

      expect(result.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_003');
      expect(result.result).toContain('перемещён');
      expect(result.result).toContain('Игрок 1');
      expect(state).toEqual(originalState);
    });

    test('успешно перемещает игрока через обратную bidirectional связь', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // Перемещаем игрока 1 в loc_003, затем обратно в loc_001 через bidirectional связь
      const result1 = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_003'
      });
      
      const result2 = movePlayer.apply(result1.newState, {
        playerId: 'char_001',
        targetLocationId: 'loc_001'
      });

      expect(result2.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_001');
      expect(result2.result).toContain('перемещён');
    });

    test('корректно обновляет locationId игрока', () => {
      const state = createLocationTestState();
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      const movedPlayer = result.newState.players.find(p => p.id === 'char_001');
      expect(movedPlayer?.locationId).toBe('loc_002');
    });

    test('не изменяет других игроков', () => {
      const state = createLocationTestState();
      const originalPlayer2 = JSON.parse(JSON.stringify(state.players.find(p => p.id === 'char_002')));
      
      movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      const player2 = state.players.find(p => p.id === 'char_002');
      expect(player2).toEqual(originalPlayer2);
    });

    test('возвращает информативное сообщение с именами сущностей', () => {
      const state = createLocationTestState();
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      expect(result.result).toContain('Игрок 1');
      expect(result.result).toContain('Офис');
      expect(result.result).toContain('Улица');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом playerId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: '',
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом targetLocationId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: ''
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при undefined playerId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: undefined,
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при undefined targetLocationId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при null playerId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: null,
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при несуществующем playerId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_999',
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найден');
      expect(result.result).toContain('char_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при несуществующей targetLocationId', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_999'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найдена');
      expect(result.result).toContain('loc_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при несуществующей текущей локации игрока', () => {
      const state = createLocationTestState();
      // Устанавливаем несуществующую локацию игроку
      state.players[0].locationId = 'loc_nonexistent';
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найдена');
      expect(result.result).toContain('loc_nonexistent');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Защита от некорректных операций', () => {
    test('возвращает сообщение при попытке переместиться в ту же локацию', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('уже находится');
      expect(result.result).toContain('Игрок 1');
      expect(result.result).toContain('loc_001');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при отсутствии подходящей связи типа out', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // Игрок 1 в loc_001, пытаемся переместить в loc_005 (нет связи)
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_005'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('нет подходящей связи');
      expect(result.result).toContain('Офис');
      expect(result.result).toContain('Изолированная локация');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при отсутствии подходящей связи типа in', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // Игрок 1 в loc_001, пытаемся переместить в loc_005
      // У loc_001 нет связи out с loc_005, и у loc_005 нет связи in с loc_001
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_005'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('нет подходящей связи');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при неправильном направлении связи', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // Игрок 2 в loc_002, пытаемся переместить в loc_003
      // У loc_002 нет связи с loc_003
      const result = movePlayer.apply(state, {
        playerId: 'char_002',
        targetLocationId: 'loc_003'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('нет подходящей связи');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      movePlayer.apply(state, {
        playerId: 'nonexistent',
        targetLocationId: 'loc_002'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createLocationTestState();
      
      const result = movePlayer.apply(state, {
        playerId: 'nonexistent',
        targetLocationId: 'loc_002'
      });

      expect(result.newState).toBe(state);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createLocationTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });

      // Новое состояние должно быть изменено
      expect(result.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_002');
      
      // Исходное состояние не должно быть изменено
      expect(state.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_001');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Граничные случаи', () => {
    test('работает с несколькими последовательными перемещениями', () => {
      const state = createLocationTestState();
      
      // Перемещаем игрока 1: loc_001 -> loc_002 -> loc_004 -> loc_002 -> loc_001
      // loc_001 -> loc_002: через связь 'out'
      const result1 = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });
      
      // loc_002 -> loc_004: через bidirectional связь
      const result2 = movePlayer.apply(result1.newState, {
        playerId: 'char_001',
        targetLocationId: 'loc_004'
      });
      
      // loc_004 -> loc_002: через bidirectional связь (обратно)
      const result3 = movePlayer.apply(result2.newState, {
        playerId: 'char_001',
        targetLocationId: 'loc_002'
      });
      
      // loc_002 -> loc_001: через связь типа 'in' (у loc_001 есть связь {targetLocationId: 'loc_002', type: 'in'})
      const result4 = movePlayer.apply(result3.newState, {
        playerId: 'char_001',
        targetLocationId: 'loc_001'
      });

      expect(result4.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_001');
    });

    test('работает с bidirectional связями в обе стороны', () => {
      const state = createLocationTestState();
      
      // Перемещаем через bidirectional связь
      const result1 = movePlayer.apply(state, {
        playerId: 'char_001',
        targetLocationId: 'loc_003'
      });
      
      expect(result1.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_003');
      
      // Возвращаемся обратно через ту же bidirectional связь
      const result2 = movePlayer.apply(result1.newState, {
        playerId: 'char_001',
        targetLocationId: 'loc_001'
      });
      
      expect(result2.newState.players.find(p => p.id === 'char_001')?.locationId).toBe('loc_001');
    });
  });
});

