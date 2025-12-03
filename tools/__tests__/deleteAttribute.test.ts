import { describe, test, expect } from 'vitest';
import deleteAttribute from '../deleteAttribute';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('delete_attribute tool', () => {
  describe('Успешные операции для игроков', () => {
    test('удаляет существующую характеристику у игрока', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.newState.players[0].attributes?.health).toBeUndefined();
      expect(result.result).toContain('удалена');
      expect(result.result).toContain('health');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает информацию о предыдущем значении', () => {
      const state = createTestState();
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.result).toContain('было:');
    });
  });

  describe('Успешные операции для объектов', () => {
    test('удаляет существующую характеристику у объекта', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'object',
        entityId: 'obj_001',
        attributeName: 'condition'
      });

      expect(result.newState.objects[0].attributes?.condition).toBeUndefined();
      expect(result.result).toContain('удалена');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Успешные операции для локаций', () => {
    test('удаляет существующую характеристику у локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'location',
        entityId: 'loc_001',
        attributeName: 'state'
      });

      expect(result.newState.locations[0].attributes?.state).toBeUndefined();
      expect(result.result).toContain('удалена');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом entityType', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: '',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при пустом entityId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: '',
        attributeName: 'health'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при пустом attributeName', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: ''
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при неверном entityType', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'invalid',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('должен быть');
    });

    test('возвращает ошибку при несуществующем игроке', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_999',
        attributeName: 'health'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });

    test('возвращает ошибку при несуществующем объекте', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'object',
        entityId: 'obj_999',
        attributeName: 'condition'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });

    test('возвращает ошибку при несуществующей локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'location',
        entityId: 'loc_999',
        attributeName: 'state'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });

    test('возвращает ошибку при несуществующей характеристике', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'nonexistent'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найдена');
    });

    test('возвращает ошибку при отсутствии attributes у сущности', () => {
      const state = createTestState();
      // Удаляем attributes для теста
      delete state.players[0].attributes;
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найдена');
    });
  });

  describe('Неизменность состояния', () => {
    test('исходное состояние не изменяется при ошибке', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_999',
        attributeName: 'health'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('исходное состояние не изменяется при успешном удалении', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('другие сущности не затрагиваются', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      // Проверяем, что другие игроки не изменились
      expect(result.newState.players[1]).toEqual(originalState.players[1]);
      // Проверяем, что объекты не изменились
      expect(result.newState.objects).toEqual(originalState.objects);
      // Проверяем, что локации не изменились
      expect(result.newState.locations).toEqual(originalState.locations);
    });

    test('другие характеристики сущности не затрагиваются', () => {
      const state = createTestState();
      // Добавляем дополнительную характеристику
      state.players[0].attributes = {
        ...state.players[0].attributes,
        magic: 'владеет базовыми заклинаниями',
        stamina: 'полон сил'
      };
      
      const result = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      expect(result.newState.players[0].attributes?.health).toBeUndefined();
      expect(result.newState.players[0].attributes?.magic).toBe('владеет базовыми заклинаниями');
      expect(result.newState.players[0].attributes?.stamina).toBe('полон сил');
    });
  });

  describe('Последовательное удаление', () => {
    test('может удалить несколько характеристик последовательно', () => {
      const state = createTestState();
      // Добавляем характеристики
      state.players[0].attributes = {
        health: 'здоров',
        magic: 'владеет магией',
        stamina: 'устал'
      };
      
      const result1 = deleteAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health'
      });

      const result2 = deleteAttribute.apply(result1.newState, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'magic'
      });

      const result3 = deleteAttribute.apply(result2.newState, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'stamina'
      });

      const player = result3.newState.players[0];
      expect(player.attributes?.health).toBeUndefined();
      expect(player.attributes?.magic).toBeUndefined();
      expect(player.attributes?.stamina).toBeUndefined();
    });
  });
});

