import { describe, test, expect } from 'vitest';
import setAttribute from '../setAttribute';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('set_attribute tool', () => {
  describe('Успешные операции для игроков', () => {
    test('создает новую характеристику для игрока', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'magic',
        value: 'владеет базовыми заклинаниями'
      });

      expect(result.newState.players[0].attributes?.magic).toBe('владеет базовыми заклинаниями');
      expect(result.result).toContain('создана');
      expect(result.result).toContain('magic');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('изменяет существующую характеристику игрока', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health',
        value: 'сильно ранен, но может продолжать бой'
      });

      expect(result.newState.players[0].attributes?.health).toBe('сильно ранен, но может продолжать бой');
      expect(result.result).toContain('изменена');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('создает attributes, если его нет', () => {
      const state = createTestState();
      // Удаляем attributes для теста
      delete state.players[0].attributes;
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'stamina',
        value: 'сильно устал'
      });

      expect(result.newState.players[0].attributes).toBeDefined();
      expect(result.newState.players[0].attributes?.stamina).toBe('сильно устал');
    });
  });

  describe('Успешные операции для объектов', () => {
    test('создает новую характеристику для объекта', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'object',
        entityId: 'obj_001',
        attributeName: 'durability',
        value: 'почти сломан, но еще работает'
      });

      expect(result.newState.objects[0].attributes?.durability).toBe('почти сломан, но еще работает');
      expect(result.result).toContain('создана');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('изменяет существующую характеристику объекта', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'object',
        entityId: 'obj_001',
        attributeName: 'condition',
        value: 'сломан и не работает'
      });

      expect(result.newState.objects[0].attributes?.condition).toBe('сломан и не работает');
      expect(result.result).toContain('изменена');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Успешные операции для локаций', () => {
    test('создает новую характеристику для локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'location',
        entityId: 'loc_001',
        attributeName: 'safety',
        value: 'опасно, стоит быть настороже'
      });

      expect(result.newState.locations[0].attributes?.safety).toBe('опасно, стоит быть настороже');
      expect(result.result).toContain('создана');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('изменяет существующую характеристику локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'location',
        entityId: 'loc_001',
        attributeName: 'state',
        value: 'полный беспорядок после драки'
      });

      expect(result.newState.locations[0].attributes?.state).toBe('полный беспорядок после драки');
      expect(result.result).toContain('изменена');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом entityType', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: '',
        entityId: 'char_001',
        attributeName: 'health',
        value: 'ранен'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при пустом entityId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: '',
        attributeName: 'health',
        value: 'ранен'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при пустом attributeName', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: '',
        value: 'ранен'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при пустом value', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health',
        value: ''
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при неверном entityType', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'invalid',
        entityId: 'char_001',
        attributeName: 'health',
        value: 'ранен'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('должен быть');
    });

    test('возвращает ошибку при несуществующем игроке', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_999',
        attributeName: 'health',
        value: 'ранен'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });

    test('возвращает ошибку при несуществующем объекте', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'object',
        entityId: 'obj_999',
        attributeName: 'condition',
        value: 'сломан'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });

    test('возвращает ошибку при несуществующей локации', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'location',
        entityId: 'loc_999',
        attributeName: 'safety',
        value: 'опасно'
      });

      expect(result.newState).toEqual(originalState);
      expect(result.result).toContain('не найден');
    });
  });

  describe('Неизменность состояния', () => {
    test('исходное состояние не изменяется при ошибке', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_999',
        attributeName: 'health',
        value: 'ранен'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('другие сущности не затрагиваются', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health',
        value: 'ранен'
      });

      // Проверяем, что другие игроки не изменились
      expect(result.newState.players[1]).toEqual(originalState.players[1]);
      // Проверяем, что объекты не изменились
      expect(result.newState.objects).toEqual(originalState.objects);
      // Проверяем, что локации не изменились
      expect(result.newState.locations).toEqual(originalState.locations);
    });
  });

  describe('Множественные характеристики', () => {
    test('может создать несколько характеристик для одной сущности', () => {
      const state = createTestState();
      
      const result1 = setAttribute.apply(state, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'health',
        value: 'ранен'
      });

      const result2 = setAttribute.apply(result1.newState, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'magic',
        value: 'владеет магией'
      });

      const result3 = setAttribute.apply(result2.newState, {
        entityType: 'player',
        entityId: 'char_001',
        attributeName: 'stamina',
        value: 'устал'
      });

      const player = result3.newState.players[0];
      expect(player.attributes?.health).toBe('ранен');
      expect(player.attributes?.magic).toBe('владеет магией');
      expect(player.attributes?.stamina).toBe('устал');
    });
  });
});




