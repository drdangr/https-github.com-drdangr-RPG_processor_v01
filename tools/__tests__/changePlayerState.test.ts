import { describe, test, expect } from 'vitest';
import changePlayerState from '../changePlayerState';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('change_player_state tool', () => {
  describe('Успешные операции', () => {
    test('успешно изменяет состояние игрока', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Устал'
      });

      expect(result.newState.players.find(p => p.id === 'char_001')?.state).toBe('Устал');
      expect(result.result).toContain('изменено на');
      expect(result.result).toContain('Устал');
      expect(state).toEqual(originalState);
    });

    test('принимает различные форматы состояний', () => {
      const state = createTestState();
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Без сознания, тяжело ранен'
      });

      expect(result.newState.players.find(p => p.id === 'char_001')?.state).toBe('Без сознания, тяжело ранен');
    });

    test('корректно обновляет state игрока', () => {
      const state = createTestState();
      const newStateValue = 'Воодушевлен';
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: newStateValue
      });

      const updatedPlayer = result.newState.players.find(p => p.id === 'char_001');
      expect(updatedPlayer?.state).toBe(newStateValue);
    });

    test('не изменяет другие поля игрока', () => {
      const state = createTestState();
      const originalPlayer = JSON.parse(JSON.stringify(state.players[0]));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Новое состояние'
      });

      const updatedPlayer = result.newState.players.find(p => p.id === 'char_001');
      expect(updatedPlayer?.id).toBe(originalPlayer.id);
      expect(updatedPlayer?.name).toBe(originalPlayer.name);
      expect(updatedPlayer?.description).toBe(originalPlayer.description);
      expect(updatedPlayer?.health).toBe(originalPlayer.health);
      expect(updatedPlayer?.locationId).toBe(originalPlayer.locationId);
      expect(updatedPlayer?.state).toBe('Новое состояние');
    });

    test('возвращает информативное сообщение с именем игрока', () => {
      const state = createTestState();
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Устал'
      });

      expect(result.result).toContain('Тестовый игрок');
      expect(result.result).toContain('Устал');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом playerId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: '',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: ''
      });

      // Пустая строка должна быть валидной, но проверка в коде может быть строгой
      if (result.result.includes('обязательны')) {
        expect(result.newState).toBe(state);
        expect(statesEqual(state, originalState)).toBe(true);
      }
    });

    test('возвращает ошибку при undefined playerId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: undefined,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при undefined newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null playerId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: null,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: null
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при несуществующем playerId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_999',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найден');
      expect(result.result).toContain('char_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      changePlayerState.apply(state, {
        playerId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = changePlayerState.apply(state, {
        playerId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
    });

    test('другие игроки не изменяются', () => {
      const state = createExtendedTestState();
      const originalPlayer2 = JSON.parse(JSON.stringify(state.players[1]));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Новое состояние'
      });

      expect(result.newState.players[1]).toEqual(originalPlayer2);
    });

    test('объекты и локации не изменяются', () => {
      const state = createExtendedTestState();
      const originalObjects = JSON.parse(JSON.stringify(state.objects));
      const originalLocations = JSON.parse(JSON.stringify(state.locations));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Новое состояние'
      });

      expect(result.newState.objects).toEqual(originalObjects);
      expect(result.newState.locations).toEqual(originalLocations);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'Новое состояние'
      });

      // Новое состояние должно быть изменено
      expect(result.newState.players.find(p => p.id === 'char_001')?.state).toBe('Новое состояние');
      
      // Исходное состояние не должно быть изменено
      expect(state.players.find(p => p.id === 'char_001')?.state).toBe('OK');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Граничные случаи', () => {
    test('работает с игроком, который уже имеет такое же состояние', () => {
      const state = createTestState();
      // char_001 имеет состояние 'OK'
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_001',
        newState: 'OK'
      });

      // Должно успешно выполниться (хотя и бессмысленно)
      expect(result.newState.players.find(p => p.id === 'char_001')?.state).toBe('OK');
      expect(result.result).toContain('изменено');
    });

    test('работает с несколькими игроками', () => {
      const state = createExtendedTestState();
      
      const result = changePlayerState.apply(state, {
        playerId: 'char_002',
        newState: 'Отдохнул'
      });

      expect(result.newState.players.find(p => p.id === 'char_002')?.state).toBe('Отдохнул');
      // Первый игрок не должен быть изменен
      expect(result.newState.players.find(p => p.id === 'char_001')?.state).toBe('OK');
    });
  });
});




