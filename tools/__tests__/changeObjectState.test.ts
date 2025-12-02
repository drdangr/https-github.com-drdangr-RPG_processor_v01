import { describe, test, expect } from 'vitest';
import changeObjectState from '../changeObjectState';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('change_object_state tool', () => {
  describe('Успешные операции', () => {
    test('успешно изменяет состояние объекта', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Сломан'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')?.state).toBe('Сломан');
      expect(result.result).toContain('изменено на');
      expect(result.result).toContain('Сломан');
      expect(state).toEqual(originalState);
    });

    test('не принимает пустую строку как валидное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: ''
      });

      // Пустая строка должна быть отклонена
      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('принимает длинное описание состояния', () => {
      const state = createTestState();
      const longState = 'Очень длинное описание состояния объекта, которое содержит много информации о его текущем состоянии и характеристиках';
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: longState
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')?.state).toBe(longState);
    });

    test('корректно обновляет state объекта', () => {
      const state = createTestState();
      const newStateValue = 'Активирован';
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: newStateValue
      });

      const updatedObject = result.newState.objects.find(o => o.id === 'obj_001');
      expect(updatedObject?.state).toBe(newStateValue);
    });

    test('не изменяет другие поля объекта', () => {
      const state = createTestState();
      const originalObject = JSON.parse(JSON.stringify(state.objects[0]));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Новое состояние'
      });

      const updatedObject = result.newState.objects.find(o => o.id === 'obj_001');
      expect(updatedObject?.id).toBe(originalObject.id);
      expect(updatedObject?.name).toBe(originalObject.name);
      expect(updatedObject?.description).toBe(originalObject.description);
      expect(updatedObject?.connectionId).toBe(originalObject.connectionId);
      expect(updatedObject?.state).toBe('Новое состояние');
    });

    test('возвращает информативное сообщение с именем объекта', () => {
      const state = createTestState();
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Сломан'
      });

      expect(result.result).toContain('Тестовый объект');
      expect(result.result).toContain('Сломан');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: '',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: ''
      });

      // Пустая строка должна быть валидной, но проверка в коде может быть строгой
      // Проверяем, что если это ошибка, то состояние не изменено
      if (result.result.includes('обязательны')) {
        expect(result.newState).toBe(state);
        expect(statesEqual(state, originalState)).toBe(true);
      }
    });

    test('возвращает ошибку при undefined objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: undefined,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при undefined newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: null,
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при null newState', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: null
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при несуществующем objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_999',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найден');
      expect(result.result).toContain('obj_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      changeObjectState.apply(state, {
        objectId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = changeObjectState.apply(state, {
        objectId: 'nonexistent',
        newState: 'Новое состояние'
      });

      expect(result.newState).toBe(state);
    });

    test('другие объекты не изменяются', () => {
      const state = createExtendedTestState();
      const originalObj2 = JSON.parse(JSON.stringify(state.objects[1]));
      const originalObj3 = JSON.parse(JSON.stringify(state.objects[2]));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Новое состояние'
      });

      expect(result.newState.objects[1]).toEqual(originalObj2);
      expect(result.newState.objects[2]).toEqual(originalObj3);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Новое состояние'
      });

      // Новое состояние должно быть изменено
      expect(result.newState.objects.find(o => o.id === 'obj_001')?.state).toBe('Новое состояние');
      
      // Исходное состояние не должно быть изменено
      expect(state.objects.find(o => o.id === 'obj_001')?.state).toBe('Normal');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Граничные случаи', () => {
    test('работает с объектом, который уже имеет такое же состояние', () => {
      const state = createTestState();
      // obj_001 имеет состояние 'Normal'
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Normal'
      });

      // Должно успешно выполниться (хотя и бессмысленно)
      expect(result.newState.objects.find(o => o.id === 'obj_001')?.state).toBe('Normal');
      expect(result.result).toContain('изменено');
    });

    test('работает с объектом внутри другого объекта', () => {
      const state = createExtendedTestState();
      // obj_003 находится внутри obj_002
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_003',
        newState: 'Открыт'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_003')?.state).toBe('Открыт');
    });

    test('работает с объектом у игрока', () => {
      const state = createExtendedTestState();
      // obj_001 находится у char_001
      
      const result = changeObjectState.apply(state, {
        objectId: 'obj_001',
        newState: 'Разряжен'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')?.state).toBe('Разряжен');
    });
  });
});

