import { describe, test, expect } from 'vitest';
import moveObject from '../moveObject';
import { createTestState, createExtendedTestState, createCyclicTestState, statesEqual } from './testHelpers';

describe('move_object tool', () => {
  describe('Успешные операции', () => {
    test('успешно перемещает объект в локацию', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'loc_001'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')?.connectionId).toBe('loc_001');
      expect(result.result).toContain('перемещён в локацию');
      expect(result.result).toContain('Тестовый объект');
      expect(result.result).toContain('Офис');
      // Исходное состояние не должно быть изменено
      expect(state).toEqual(originalState);
    });

    test('успешно передает объект игроку', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_004',
        targetId: 'char_001'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_004')?.connectionId).toBe('char_001');
      expect(result.result).toContain('передан игроку');
      expect(result.result).toContain('Документ');
      expect(result.result).toContain('Игрок 1');
      expect(state).toEqual(originalState);
    });

    test('успешно помещает объект внутрь другого объекта', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_004',
        targetId: 'obj_002'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_004')?.connectionId).toBe('obj_002');
      expect(result.result).toContain('помещён внутрь объекта');
      expect(result.result).toContain('Документ');
      expect(result.result).toContain('Ящик');
      expect(state).toEqual(originalState);
    });

    test('корректно обновляет connectionId объекта', () => {
      const state = createTestState();
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'char_001'
      });

      const movedObject = result.newState.objects.find(o => o.id === 'obj_001');
      expect(movedObject?.connectionId).toBe('char_001');
    });

    test('не изменяет другие объекты', () => {
      const state = createExtendedTestState();
      const originalObj2 = JSON.parse(JSON.stringify(state.objects[1]));
      const originalObj3 = JSON.parse(JSON.stringify(state.objects[2]));
      
      moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'loc_002'
      });

      expect(state.objects[1]).toEqual(originalObj2);
      expect(state.objects[2]).toEqual(originalObj3);
    });

    test('возвращает информативное сообщение с именами сущностей', () => {
      const state = createExtendedTestState();
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'char_002'
      });

      expect(result.result).toContain('Револьвер');
      expect(result.result).toContain('Игрок 2');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: '',
        targetId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом targetId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: ''
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при undefined objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: undefined,
        targetId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при undefined targetId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при null objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: null,
        targetId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не могут быть пустыми');
    });

    test('возвращает ошибку при несуществующем objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_999',
        targetId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найден');
      expect(result.result).toContain('obj_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при несуществующем targetId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'nonexistent_999'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найдена');
      expect(result.result).toContain('nonexistent_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Защита от некорректных операций', () => {
    test('возвращает ошибку при попытке переместить объект в себя', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'obj_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не может быть перемещён в себя');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при прямой циклической зависимости', () => {
      const state = createCyclicTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // obj_001 находится в obj_002, obj_002 находится в obj_001
      // Попытка переместить obj_001 в obj_002 должна создать цикл
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'obj_002'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('циклическую зависимость');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при косвенной циклической зависимости', () => {
      const state = createCyclicTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // obj_003 в obj_004, obj_004 в obj_005, obj_005 в obj_003
      // Попытка переместить obj_003 в obj_004 должна создать цикл
      const result = moveObject.apply(state, {
        objectId: 'obj_003',
        targetId: 'obj_004'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('циклическую зависимость');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('защита от бесконечного цикла в проверке циклов', () => {
      const state = createCyclicTestState();
      // Создаем ситуацию, где объект ссылается на несуществующий объект
      // Это должно быть безопасно обработано
      state.objects[0].connectionId = 'nonexistent';
      
      const result = moveObject.apply(state, {
        objectId: 'obj_002',
        targetId: 'obj_001'
      });

      // Должно успешно выполниться, так как nonexistent не является объектом
      expect(result.result).not.toContain('циклическую зависимость');
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      moveObject.apply(state, {
        objectId: 'nonexistent',
        targetId: 'loc_001'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = moveObject.apply(state, {
        objectId: 'nonexistent',
        targetId: 'loc_001'
      });

      expect(result.newState).toBe(state);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'char_001'
      });

      // Новое состояние должно быть изменено
      expect(result.newState.objects.find(o => o.id === 'obj_001')?.connectionId).toBe('char_001');
      
      // Исходное состояние не должно быть изменено
      expect(state.objects.find(o => o.id === 'obj_001')?.connectionId).toBe('loc_001');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Граничные случаи', () => {
    test('работает с объектом, который уже находится в целевой локации', () => {
      const state = createTestState();
      // obj_001 уже находится в loc_001
      
      const result = moveObject.apply(state, {
        objectId: 'obj_001',
        targetId: 'loc_001'
      });

      // Должно успешно выполниться (хотя и бессмысленно)
      expect(result.newState.objects.find(o => o.id === 'obj_001')?.connectionId).toBe('loc_001');
      expect(result.result).toContain('перемещён');
    });

    test('работает с объектом внутри другого объекта', () => {
      const state = createExtendedTestState();
      // obj_003 находится внутри obj_002
      
      const result = moveObject.apply(state, {
        objectId: 'obj_003',
        targetId: 'char_001'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_003')?.connectionId).toBe('char_001');
      expect(result.result).toContain('передан игроку');
    });
  });
});



