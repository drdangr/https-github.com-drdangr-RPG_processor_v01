import { GameState } from '../../types';

/**
 * Создает минимальное валидное GameState для тестов
 */
export function createTestState(): GameState {
  return {
    world: {
      worldDescription: 'Test world',
      gameGenre: 'cyberpunk'
    },
    locations: [
      {
        id: 'loc_001',
        name: 'Офис',
        description: 'Тестовый офис',
        currentSituation: 'Тихо',
        state: 'Normal',
        connections: []
      }
    ],
    players: [
      {
        id: 'char_001',
        name: 'Тестовый игрок',
        description: 'Описание игрока',
        health: 100,
        state: 'OK',
        locationId: 'loc_001'
      }
    ],
    objects: [
      {
        id: 'obj_001',
        name: 'Тестовый объект',
        description: 'Описание объекта',
        connectionId: 'loc_001',
        state: 'Normal'
      }
    ]
  };
}

/**
 * Создает расширенное GameState с несколькими объектами, игроками и локациями
 * для тестирования сложных сценариев
 */
export function createExtendedTestState(): GameState {
  return {
    world: {
      worldDescription: 'Extended test world',
      gameGenre: 'cyberpunk'
    },
    locations: [
      {
        id: 'loc_001',
        name: 'Офис',
        description: 'Тестовый офис',
        currentSituation: 'Тихо',
        state: 'Normal',
        connections: [
          {
            targetLocationId: 'loc_002',
            type: 'out'
          }
        ]
      },
      {
        id: 'loc_002',
        name: 'Улица',
        description: 'Тестовая улица',
        currentSituation: 'Шумно',
        state: 'Normal',
        connections: [
          {
            targetLocationId: 'loc_001',
            type: 'in'
          }
        ]
      }
    ],
    players: [
      {
        id: 'char_001',
        name: 'Игрок 1',
        description: 'Первый игрок',
        health: 100,
        state: 'OK',
        locationId: 'loc_001'
      },
      {
        id: 'char_002',
        name: 'Игрок 2',
        description: 'Второй игрок',
        health: 80,
        state: 'Устал',
        locationId: 'loc_002'
      }
    ],
    objects: [
      {
        id: 'obj_001',
        name: 'Револьвер',
        description: 'Оружие',
        connectionId: 'char_001',
        state: 'Заряжен'
      },
      {
        id: 'obj_002',
        name: 'Ящик',
        description: 'Контейнер',
        connectionId: 'loc_001',
        state: 'Закрыт'
      },
      {
        id: 'obj_003',
        name: 'Ключ',
        description: 'Ключ от ящика',
        connectionId: 'obj_002',
        state: 'Normal'
      },
      {
        id: 'obj_004',
        name: 'Документ',
        description: 'Важный документ',
        connectionId: 'loc_002',
        state: 'Normal'
      }
    ]
  };
}

/**
 * Создает состояние с циклическими зависимостями для тестирования защиты от циклов
 */
export function createCyclicTestState(): GameState {
  return {
    world: {
      worldDescription: 'Cyclic test world',
      gameGenre: 'cyberpunk'
    },
    locations: [
      {
        id: 'loc_001',
        name: 'Офис',
        description: 'Тестовый офис',
        currentSituation: 'Тихо',
        state: 'Normal',
        connections: []
      }
    ],
    players: [
      {
        id: 'char_001',
        name: 'Игрок',
        description: 'Тестовый игрок',
        health: 100,
        state: 'OK',
        locationId: 'loc_001'
      }
    ],
    objects: [
      {
        id: 'obj_001',
        name: 'Ящик A',
        description: 'Первый ящик',
        connectionId: 'obj_002', // A находится в B
        state: 'Normal'
      },
      {
        id: 'obj_002',
        name: 'Ящик B',
        description: 'Второй ящик',
        connectionId: 'obj_001', // B находится в A - прямая цикличность
        state: 'Normal'
      },
      {
        id: 'obj_003',
        name: 'Ящик C',
        description: 'Третий ящик',
        connectionId: 'obj_004', // C в D
        state: 'Normal'
      },
      {
        id: 'obj_004',
        name: 'Ящик D',
        description: 'Четвертый ящик',
        connectionId: 'obj_005', // D в E
        state: 'Normal'
      },
      {
        id: 'obj_005',
        name: 'Ящик E',
        description: 'Пятый ящик',
        connectionId: 'obj_003', // E в C - косвенная цикличность
        state: 'Normal'
      }
    ]
  };
}

/**
 * Сравнивает два GameState на глубокое равенство
 */
export function statesEqual(state1: GameState, state2: GameState): boolean {
  return JSON.stringify(state1) === JSON.stringify(state2);
}



