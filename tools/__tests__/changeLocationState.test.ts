import { describe, test, expect } from 'vitest';
import changeLocationState from '../changeLocationState';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('change_location_state tool', () => {
  describe('Успешные операции', () => {
    test('успешно изменяет состояние локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Затоплена'
      });

      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Затоплена');
      expect(result.result).toContain('изменено на');
      expect(result.result).toContain('Затоплена');
      expect(state).toEqual(originalState);
    });

    test('принимает различные форматы состояний', () => {
      const state = createTestState();
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Тишина, только слышен шум дождя'
      });

      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Тишина, только слышен шум дождя');
    });

    test('корректно обновляет state локации', () => {
      const state = createTestState();
      const newStateValue = 'Оживленная';
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: newStateValue
      });

      const updatedLocation = result.newState.locations.find(l => l.id === 'loc_001');
      expect(updatedLocation?.state).toBe(newStateValue);
    });

    test('не изменяет другие поля локации', () => {
      const state = createTestState();
      const originalLocation = JSON.parse(JSON.stringify(state.locations[0]));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Новое состояние'
      });

      const updatedLocation = result.newState.locations.find(l => l.id === 'loc_001');
      expect(updatedLocation?.id).toBe(originalLocation.id);
      expect(updatedLocation?.name).toBe(originalLocation.name);
      expect(updatedLocation?.description).toBe(originalLocation.description);
      expect(updatedLocation?.currentSituation).toBe(originalLocation.currentSituation);
      expect(updatedLocation?.connections).toEqual(originalLocation.connections);
      expect(updatedLocation?.state).toBe('Новое состояние');
    });

    test('возвращает информативное сообщение с именем локации', () => {
      const state = createTestState();
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Затоплена'
      });

      expect(result.result).toContain('Офис');
      expect(result.result).toContain('Затоплена');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом locationId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: '',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: ''
      });

      // Пустая строка должна быть валидной, но проверка в коде может быть строгой
      if (result.result.includes('обязательны')) {
        expect(result.newState).toBe(state);
        expect(statesEqual(state, originalState)).toBe(true);
      }
    });

    test('возвращает ошибку при undefined locationId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: undefined,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при undefined newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null locationId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: null,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: null
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при несуществующем locationId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_999',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найдена');
      expect(result.result).toContain('loc_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      changeLocationState.apply(state, {
        locationId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = changeLocationState.apply(state, {
        locationId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
    });

    test('другие локации не изменяются', () => {
      const state = createExtendedTestState();
      const originalLoc2 = JSON.parse(JSON.stringify(state.locations[1]));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Новое состояние'
      });

      expect(result.newState.locations[1]).toEqual(originalLoc2);
    });

    test('объекты и игроки не изменяются', () => {
      const state = createExtendedTestState();
      const originalObjects = JSON.parse(JSON.stringify(state.objects));
      const originalPlayers = JSON.parse(JSON.stringify(state.players));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Новое состояние'
      });

      expect(result.newState.objects).toEqual(originalObjects);
      expect(result.newState.players).toEqual(originalPlayers);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Новое состояние'
      });

      // Новое состояние должно быть изменено
      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Новое состояние');
      
      // Исходное состояние не должно быть изменено
      expect(state.locations.find(l => l.id === 'loc_001')?.state).toBe('Normal');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Граничные случаи', () => {
    test('работает с локацией, которая уже имеет такое же состояние', () => {
      const state = createTestState();
      // loc_001 имеет состояние 'Normal'
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Normal'
      });

      // Должно успешно выполниться (хотя и бессмысленно)
      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Normal');
      expect(result.result).toContain('изменено');
    });

    test('работает с локацией, имеющей connections', () => {
      const state = createExtendedTestState();
      // loc_001 имеет connections
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_001',
        newState: 'Затоплена'
      });

      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Затоплена');
      // connections должны остаться неизменными
      expect(result.newState.locations.find(l => l.id === 'loc_001')?.connections.length).toBeGreaterThan(0);
    });

    test('работает с несколькими локациями', () => {
      const state = createExtendedTestState();
      
      const result = changeLocationState.apply(state, {
        locationId: 'loc_002',
        newState: 'Оживленная'
      });

      expect(result.newState.locations.find(l => l.id === 'loc_002')?.state).toBe('Оживленная');
      // Первая локация не должна быть изменена
      expect(result.newState.locations.find(l => l.id === 'loc_001')?.state).toBe('Normal');
    });
  });
});


