import { describe, test, expect } from 'vitest';
import deleteObject from '../deleteObject';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';
import { GameState } from '../../types';

describe('delete_object tool', () => {
  describe('Успешные операции', () => {
    test('успешно удаляет простой объект', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')).toBeUndefined();
      expect(result.newState.objects.length).toBe(0);
      expect(result.result).toContain('удалён');
      expect(result.result).toContain('Тестовый объект');
      // Исходное состояние не должно быть изменено
      expect(state).toEqual(originalState);
    });

    test('успешно удаляет объект у игрока', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001' // Револьвер у char_001
      });

      expect(result.newState.objects.find(o => o.id === 'obj_001')).toBeUndefined();
      expect(result.result).toContain('удалён');
      expect(result.result).toContain('Револьвер');
      expect(state).toEqual(originalState);
    });

    test('успешно удаляет объект в локации', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_004' // Документ в loc_002
      });

      expect(result.newState.objects.find(o => o.id === 'obj_004')).toBeUndefined();
      expect(result.result).toContain('удалён');
      expect(result.result).toContain('Документ');
      expect(state).toEqual(originalState);
    });

    test('успешно удаляет объект внутри другого объекта', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_003' // Ключ внутри obj_002 (Ящик)
      });

      expect(result.newState.objects.find(o => o.id === 'obj_003')).toBeUndefined();
      expect(result.result).toContain('удалён');
      expect(result.result).toContain('Ключ');
      expect(state).toEqual(originalState);
    });
  });

  describe('Обработка вложенных объектов', () => {
    test('перемещает вложенные объекты при удалении контейнера', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      // obj_003 (Ключ) находится внутри obj_002 (Ящик)
      // При удалении Ящика, Ключ должен переместиться в loc_001 (где был Ящик)
      const result = deleteObject.apply(state, {
        objectId: 'obj_002' // Ящик в loc_001
      });

      // Ящик удалён
      expect(result.newState.objects.find(o => o.id === 'obj_002')).toBeUndefined();
      
      // Ключ перемещён в loc_001
      const key = result.newState.objects.find(o => o.id === 'obj_003');
      expect(key).toBeDefined();
      expect(key?.connectionId).toBe('loc_001');
      
      // Сообщение содержит информацию о перемещении
      expect(result.result).toContain('Вложенные объекты');
      expect(result.result).toContain('Ключ');
      expect(result.result).toContain('Офис');
      
      expect(state).toEqual(originalState);
    });

    test('перемещает несколько вложенных объектов', () => {
      const state = createExtendedTestState();
      
      // Добавляем ещё один объект внутрь Ящика
      state.objects.push({
        id: 'obj_005',
        name: 'Записка',
        description: 'Тестовая записка',
        connectionId: 'obj_002', // внутри Ящика
        state: 'Normal'
      });
      
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_002' // Ящик
      });

      // Ящик удалён
      expect(result.newState.objects.find(o => o.id === 'obj_002')).toBeUndefined();
      
      // Оба вложенных объекта перемещены в loc_001
      const key = result.newState.objects.find(o => o.id === 'obj_003');
      const note = result.newState.objects.find(o => o.id === 'obj_005');
      
      expect(key?.connectionId).toBe('loc_001');
      expect(note?.connectionId).toBe('loc_001');
      
      // Сообщение содержит информацию о 2 объектах
      expect(result.result).toContain('(2)');
      
      expect(state).toEqual(originalState);
    });

    test('перемещает вложенные объекты к игроку при удалении объекта у игрока', () => {
      const state = createExtendedTestState();
      
      // Создаём объект-контейнер у игрока с вложенным объектом
      state.objects.push({
        id: 'obj_bag',
        name: 'Сумка',
        description: 'Тестовая сумка',
        connectionId: 'char_001', // у игрока
        state: 'Normal'
      });
      state.objects.push({
        id: 'obj_in_bag',
        name: 'Кошелёк',
        description: 'Тестовый кошелёк',
        connectionId: 'obj_bag', // внутри сумки
        state: 'Normal'
      });
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_bag'
      });

      // Сумка удалена
      expect(result.newState.objects.find(o => o.id === 'obj_bag')).toBeUndefined();
      
      // Кошелёк перемещён к игроку
      const wallet = result.newState.objects.find(o => o.id === 'obj_in_bag');
      expect(wallet?.connectionId).toBe('char_001');
      
      expect(result.result).toContain('Игрок 1');
    });

    test('обрабатывает глубокую вложенность (удаление среднего уровня)', () => {
      const state: GameState = {
        world: { worldDescription: 'Test', gameGenre: 'test' },
        locations: [{ id: 'loc_001', name: 'Локация', description: '', currentSituation: '', state: 'Normal', connections: [] }],
        players: [],
        objects: [
          { id: 'obj_A', name: 'Объект A', description: '', connectionId: 'loc_001', state: 'Normal' },
          { id: 'obj_B', name: 'Объект B', description: '', connectionId: 'obj_A', state: 'Normal' },
          { id: 'obj_C', name: 'Объект C', description: '', connectionId: 'obj_B', state: 'Normal' },
        ]
      };
      
      // Удаляем средний объект B
      const result = deleteObject.apply(state, {
        objectId: 'obj_B'
      });

      // B удалён
      expect(result.newState.objects.find(o => o.id === 'obj_B')).toBeUndefined();
      
      // C перемещён в A (где был B)
      const objC = result.newState.objects.find(o => o.id === 'obj_C');
      expect(objC?.connectionId).toBe('obj_A');
      
      // A остался на месте
      const objA = result.newState.objects.find(o => o.id === 'obj_A');
      expect(objA?.connectionId).toBe('loc_001');
    });

    test('удаление объекта без вложенных не показывает сообщение о перемещении', () => {
      const state = createTestState();
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(result.result).not.toContain('Вложенные');
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: ''
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязателен');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при undefined objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязателен');
    });

    test('возвращает ошибку при null objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: null
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязателен');
    });

    test('возвращает ошибку при несуществующем objectId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_999'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('не найден');
      expect(result.result).toContain('obj_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при отсутствующем аргументе objectId', () => {
      const state = createTestState();
      
      const result = deleteObject.apply(state, {});

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязателен');
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при успешном удалении', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      deleteObject.apply(state, {
        objectId: 'nonexistent'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = deleteObject.apply(state, {
        objectId: 'nonexistent'
      });

      expect(result.newState).toBe(state);
    });

    test('другие объекты не затрагиваются при удалении', () => {
      const state = createExtendedTestState();
      const originalObj1 = JSON.parse(JSON.stringify(state.objects[0])); // Револьвер
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_004' // Документ
      });

      // Револьвер не изменился
      const revolverAfter = result.newState.objects.find(o => o.id === 'obj_001');
      expect(revolverAfter).toEqual(originalObj1);
    });
  });

  describe('Граничные случаи', () => {
    test('удаление последнего объекта оставляет пустой массив', () => {
      const state = createTestState();
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(result.newState.objects).toEqual([]);
    });

    test('удаление одного из нескольких объектов сохраняет остальные', () => {
      const state = createExtendedTestState();
      const initialCount = state.objects.length;
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(result.newState.objects.length).toBe(initialCount - 1);
      expect(result.newState.objects.find(o => o.id === 'obj_002')).toBeDefined();
      expect(result.newState.objects.find(o => o.id === 'obj_003')).toBeDefined();
      expect(result.newState.objects.find(o => o.id === 'obj_004')).toBeDefined();
    });

    test('информативное сообщение содержит имя объекта', () => {
      const state = createExtendedTestState();
      
      const result = deleteObject.apply(state, {
        objectId: 'obj_001'
      });

      expect(result.result).toContain('Револьвер');
    });
  });
});


