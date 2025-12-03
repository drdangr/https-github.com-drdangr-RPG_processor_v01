import { describe, test, expect, vi, beforeEach } from 'vitest';
import createObject from '../createObject';
import { createTestState, createExtendedTestState, statesEqual } from './testHelpers';

describe('create_object tool', () => {
  beforeEach(() => {
    // Мокируем Date.now() и Math.random() для предсказуемости ID
    vi.clearAllMocks();
  });

  describe('Успешные операции', () => {
    test('успешно создает объект в локации с JSON атрибутами', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: 'Новый ключ',
        connectionId: 'loc_001',
        attributes: '{"condition": "ржавый", "size": "небольшой", "material": "железный"}'
      });

      // Проверяем, что объект добавлен
      expect(result.newState.objects.length).toBe(originalObjectsCount + 1);
      
      // Проверяем, что объект создан с правильными данными
      const newObject = result.newState.objects.find(o => o.name === 'Новый ключ');
      expect(newObject).toBeDefined();
      expect(newObject?.connectionId).toBe('loc_001');
      expect(newObject?.attributes?.condition).toBe('ржавый');
      expect(newObject?.attributes?.size).toBe('небольшой');
      expect(newObject?.attributes?.material).toBe('железный');
      expect(newObject?.id).toMatch(/^obj_\d+_[a-z0-9]+$/);
      
      // Проверяем сообщение
      expect(result.result).toContain('Создан новый объект');
      expect(result.result).toContain('Новый ключ');
      expect(result.result).toContain('в локации');
      expect(result.result).toContain('Офис');
      
      // Исходное состояние не должно быть изменено
      expect(state).toEqual(originalState);
    });

    test('успешно создает объект у игрока', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: 'Пистолет',
        connectionId: 'char_001'
      });

      expect(result.newState.objects.length).toBe(originalObjectsCount + 1);
      
      const newObject = result.newState.objects.find(o => o.name === 'Пистолет');
      expect(newObject).toBeDefined();
      expect(newObject?.connectionId).toBe('char_001');
      expect(newObject?.attributes?.condition).toBe('в хорошем состоянии'); // Значение по умолчанию
      
      expect(result.result).toContain('у игрока');
      expect(result.result).toContain('Тестовый игрок');
      expect(state).toEqual(originalState);
    });

    test('успешно создает объект внутри другого объекта', () => {
      const state = createExtendedTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: 'Записка',
        connectionId: 'obj_002', // Внутри ящика
        attributes: '{"condition": "помятая", "content": "текст на неизвестном языке"}'
      });

      expect(result.newState.objects.length).toBe(originalObjectsCount + 1);
      
      const newObject = result.newState.objects.find(o => o.name === 'Записка');
      expect(newObject).toBeDefined();
      expect(newObject?.connectionId).toBe('obj_002');
      expect(newObject?.attributes?.condition).toBe('помятая');
      expect(newObject?.attributes?.content).toBe('текст на неизвестном языке');
      
      expect(result.result).toContain('внутри объекта');
      expect(result.result).toContain('Ящик');
      expect(state).toEqual(originalState);
    });

    test('поддерживает передачу атрибутов как объект (обратная совместимость)', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Меч',
        connectionId: 'char_001',
        attributes: { condition: 'новый', type: 'длинный меч', material: 'сталь' }
      });

      const newObject = result.newState.objects.find(o => o.name === 'Меч');
      expect(newObject?.attributes?.condition).toBe('новый');
      expect(newObject?.attributes?.type).toBe('длинный меч');
      expect(newObject?.attributes?.material).toBe('сталь');
    });

    test('простая строка в attributes используется как condition', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Камень',
        connectionId: 'loc_001',
        attributes: 'тяжёлый и гладкий'
      });

      const newObject = result.newState.objects.find(o => o.name === 'Камень');
      expect(newObject?.attributes?.condition).toBe('тяжёлый и гладкий');
    });

    test('использует значение по умолчанию для состояния, если не указано', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001'
        // condition не указан
      });

      const newObject = result.newState.objects.find(o => o.name === 'Предмет');
      expect(newObject?.attributes?.condition).toBe('в хорошем состоянии');
      expect(result.result).toContain('в хорошем состоянии');
    });

    test('обрезает пробелы в начале и конце строк', () => {
      const state = createTestState();
      
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: '  Предмет с пробелами  ',
        connectionId: 'loc_001',
        attributes: '{"condition": "  состояние  ", "type": "  тип  "}'
      });

      // Проверяем, что объект добавлен
      expect(result.newState.objects.length).toBe(originalObjectsCount + 1);
      
      // Ищем новый объект - он должен быть последним в массиве
      const newObject = result.newState.objects[result.newState.objects.length - 1];
      expect(newObject?.name).toBe('Предмет с пробелами');
      expect(newObject?.attributes?.condition).toBe('состояние');
      expect(newObject?.attributes?.type).toBe('тип');
    });

    test('генерирует уникальный ID для каждого объекта', () => {
      const state = createTestState();
      
      const result1 = createObject.apply(state, {
        name: 'Объект 1',
        connectionId: 'loc_001'
      });

      const result2 = createObject.apply(result1.newState, {
        name: 'Объект 2',
        connectionId: 'loc_001'
      });

      const obj1 = result1.newState.objects.find(o => o.name === 'Объект 1');
      const obj2 = result2.newState.objects.find(o => o.name === 'Объект 2');
      
      expect(obj1?.id).toBeDefined();
      expect(obj2?.id).toBeDefined();
      expect(obj1?.id).not.toBe(obj2?.id);
    });

    test('не изменяет другие объекты при создании нового', () => {
      const state = createExtendedTestState();
      const originalObj1 = JSON.parse(JSON.stringify(state.objects[0]));
      const originalObj2 = JSON.parse(JSON.stringify(state.objects[1]));
      
      createObject.apply(state, {
        name: 'Новый объект',
        connectionId: 'loc_001'
      });

      expect(state.objects[0]).toEqual(originalObj1);
      expect(state.objects[1]).toEqual(originalObj2);
    });
  });

  describe('Валидация входных данных', () => {
    test('возвращает ошибку при пустом name', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: '',
        connectionId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.newState.objects.length).toBe(originalObjectsCount);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при пустом connectionId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = createObject.apply(state, {
        name: 'Название',
        connectionId: ''
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при undefined name', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = createObject.apply(state, {
        name: undefined,
        connectionId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при undefined connectionId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = createObject.apply(state, {
        name: 'Название',
        connectionId: undefined
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращает ошибку при null name', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      const result = createObject.apply(state, {
        name: null,
        connectionId: 'loc_001'
      });

      expect(result.newState).toBe(state);
      expect(result.result).toContain('обязательны');
    });

    test('возвращает ошибку при несуществующем connectionId', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: 'Объект',
        connectionId: 'nonexistent_999'
      });

      expect(result.newState).toBe(state);
      expect(result.newState.objects.length).toBe(originalObjectsCount);
      expect(result.result).toContain('не найдена');
      expect(result.result).toContain('nonexistent_999');
      expect(statesEqual(state, originalState)).toBe(true);
    });
  });

  describe('Проверка неизменности состояния', () => {
    test('исходное состояние не изменяется при ошибках', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      
      createObject.apply(state, {
        name: '',
        connectionId: 'loc_001'
      });

      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('возвращается исходное состояние при ошибках', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Объект',
        connectionId: 'nonexistent'
      });

      expect(result.newState).toBe(state);
    });

    test('клонирование работает корректно - изменения не влияют на исходное состояние', () => {
      const state = createTestState();
      const originalState = JSON.parse(JSON.stringify(state));
      const originalObjectsCount = state.objects.length;
      
      const result = createObject.apply(state, {
        name: 'Новый объект',
        connectionId: 'loc_001'
      });

      // Новое состояние должно содержать новый объект
      expect(result.newState.objects.length).toBe(originalObjectsCount + 1);
      
      // Исходное состояние не должно быть изменено
      expect(state.objects.length).toBe(originalObjectsCount);
      expect(statesEqual(state, originalState)).toBe(true);
    });

    test('другие объекты не изменяются при создании нового', () => {
      const state = createExtendedTestState();
      const originalObj1 = JSON.parse(JSON.stringify(state.objects[0]));
      const originalObj2 = JSON.parse(JSON.stringify(state.objects[1]));
      
      const result = createObject.apply(state, {
        name: 'Новый объект',
        connectionId: 'loc_001'
      });

      expect(result.newState.objects[0]).toEqual(originalObj1);
      expect(result.newState.objects[1]).toEqual(originalObj2);
    });
  });

  describe('Информативные сообщения', () => {
    test('сообщение содержит имя созданного объекта', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Уникальный предмет',
        connectionId: 'loc_001'
      });

      expect(result.result).toContain('Уникальный предмет');
    });

    test('сообщение содержит ID созданного объекта', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001'
      });

      const newObject = result.newState.objects.find(o => o.name === 'Предмет');
      expect(result.result).toContain(newObject?.id);
    });

    test('сообщение правильно определяет тип контейнера - игрок', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'char_001'
      });

      expect(result.result).toContain('у игрока');
      expect(result.result).toContain('Тестовый игрок');
    });

    test('сообщение правильно определяет тип контейнера - локация', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001'
      });

      expect(result.result).toContain('в локации');
      expect(result.result).toContain('Офис');
    });

    test('сообщение правильно определяет тип контейнера - объект', () => {
      const state = createExtendedTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'obj_002'
      });

      expect(result.result).toContain('внутри объекта');
      expect(result.result).toContain('Ящик');
    });

    test('сообщение содержит атрибуты объекта', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001',
        attributes: '{"condition": "сломан", "size": "большой"}'
      });

      expect(result.result).toContain('condition');
      expect(result.result).toContain('сломан');
      expect(result.result).toContain('size');
      expect(result.result).toContain('большой');
    });
  });

  describe('Граничные случаи', () => {
    test('работает с длинным названием объекта', () => {
      const state = createTestState();
      const longName = 'Очень длинное название объекта, которое содержит много слов и символов для проверки корректной обработки длинных строк в системе';
      
      const result = createObject.apply(state, {
        name: longName,
        connectionId: 'loc_001'
      });

      const newObject = result.newState.objects.find(o => o.name === longName);
      expect(newObject).toBeDefined();
      expect(newObject?.name).toBe(longName);
    });

    test('работает с пустой строкой атрибутов (использует значение по умолчанию)', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001',
        attributes: ''
      });

      const newObject = result.newState.objects.find(o => o.name === 'Предмет');
      expect(newObject?.attributes?.condition).toBe('в хорошем состоянии');
    });

    test('работает с пустым JSON объектом (использует значение по умолчанию)', () => {
      const state = createTestState();
      
      const result = createObject.apply(state, {
        name: 'Предмет',
        connectionId: 'loc_001',
        attributes: '{}'
      });

      const newObject = result.newState.objects.find(o => o.name === 'Предмет');
      expect(newObject?.attributes?.condition).toBe('в хорошем состоянии');
    });

    test('может создать несколько объектов в одной локации', () => {
      const state = createTestState();
      
      const result1 = createObject.apply(state, {
        name: 'Объект 1',
        connectionId: 'loc_001'
      });

      const result2 = createObject.apply(result1.newState, {
        name: 'Объект 2',
        connectionId: 'loc_001'
      });

      const objectsInLocation = result2.newState.objects.filter(o => o.connectionId === 'loc_001');
      expect(objectsInLocation.length).toBeGreaterThan(1);
      
      const obj1 = result2.newState.objects.find(o => o.name === 'Объект 1');
      const obj2 = result2.newState.objects.find(o => o.name === 'Объект 2');
      expect(obj1).toBeDefined();
      expect(obj2).toBeDefined();
      expect(obj1?.id).not.toBe(obj2?.id);
    });
  });
});

