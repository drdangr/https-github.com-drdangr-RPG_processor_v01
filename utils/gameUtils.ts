import { GameState, PlayerData, ObjectData, LocationData } from '../types';

export const cloneState = (state: GameState): GameState => {
  return JSON.parse(JSON.stringify(state));
};

/**
 * Нормализует состояние игры, гарантируя, что все сущности имеют инициализированный attributes.
 * Используется при загрузке данных из localStorage или при парсинге JSON.
 */
export const normalizeState = (state: GameState): GameState => {
  return {
    ...state,
    players: state.players.map((p: PlayerData) => ({
      ...p,
      attributes: p.attributes || {}
    })),
    objects: state.objects.map((o: ObjectData) => ({
      ...o,
      attributes: o.attributes || {}
    })),
    locations: state.locations.map((l: LocationData) => ({
      ...l,
      attributes: l.attributes || {}
    }))
  };
};

/**
 * Рекурсивно находит все потомки объекта (всё дерево вложенных объектов)
 * Проверяет как точное совпадение connectionId, так и случаи с пустой строкой/undefined
 */
export const getAllDescendants = (objectId: string, allObjects: ObjectData[]): ObjectData[] => {
  // Находим прямых потомков (connectionId точно равен objectId)
  const directChildren = allObjects.filter(o => o.connectionId === objectId);
  const allDescendants: ObjectData[] = [...directChildren];
  
  // Рекурсивно находим потомков каждого дочернего объекта
  for (const child of directChildren) {
    const childDescendants = getAllDescendants(child.id, allObjects);
    allDescendants.push(...childDescendants);
  }
  
  return allDescendants;
};

/**
 * Находит корневую локацию или игрока для объекта, поднимаясь по цепочке connectionId.
 * Если объект напрямую связан с локацией или игроком, возвращает этот ID.
 * Если объект вложен в другой объект, рекурсивно поднимается до локации/игрока.
 * Если цепочка прерывается или объект без связи, возвращает null.
 */
export const findRootLocationOrPlayer = (
  objectId: string,
  allObjects: ObjectData[],
  locations: LocationData[],
  players: PlayerData[]
): string | null => {
  const object = allObjects.find(o => o.id === objectId);
  
  if (!object || !object.connectionId) {
    // Объект не найден или без связи
    return null;
  }
  
  const connectionId = object.connectionId.trim();
  if (!connectionId) {
    return null;
  }
  
  // Проверяем, является ли connectionId локацией
  const location = locations.find(l => l.id === connectionId);
  if (location) {
    return connectionId;
  }
  
  // Проверяем, является ли connectionId игроком
  const player = players.find(p => p.id === connectionId);
  if (player) {
    return connectionId;
  }
  
  // Проверяем, является ли connectionId другим объектом - поднимаемся выше
  const parentObject = allObjects.find(o => o.id === connectionId);
  if (parentObject) {
    return findRootLocationOrPlayer(connectionId, allObjects, locations, players);
  }
  
  // connectionId указывает на несуществующую сущность
  return null;
};

/**
 * Удаляет объект из массива объектов, перемещая только ПРЯМЫХ потомков к родителю удаляемого объекта.
 * Вложенные потомки (потомки потомков) остаются на своих местах, сохраняя структуру дерева.
 * 
 * Если родитель - другой объект, прямые потомки переходят к нему.
 * Если родитель - локация/игрок, прямые потомки переходят туда.
 * Если родителя нет, прямые потомки переходят к корневой локации/игроку, найденной по цепочке вверх.
 * Если локация/игрок не найдены, connectionId становится undefined.
 * 
 * @param objects - массив всех объектов
 * @param objectIdToDelete - ID объекта для удаления
 * @param locations - массив всех локаций (для поиска корневой локации)
 * @param players - массив всех игроков (для поиска корневого игрока)
 * @returns новый массив объектов без удалённого объекта, с обновлёнными connectionId только у прямых потомков
 */
export const deleteObjectWithChildren = (
  objects: ObjectData[],
  objectIdToDelete: string,
  locations: LocationData[] = [],
  players: PlayerData[] = []
): ObjectData[] => {
  // Создаём копию массива
  const newObjects = [...objects];
  
  // Находим индекс удаляемого объекта
  const objectIndex = newObjects.findIndex(o => o.id === objectIdToDelete);
  
  if (objectIndex === -1) {
    // Объект не найден, возвращаем исходный массив
    return newObjects;
  }
  
  const objectToDelete = newObjects[objectIndex];
  
  // Определяем, куда переместить ПРЯМЫХ потомков
  let targetConnectionId: string | undefined;
  
  if (objectToDelete.connectionId && objectToDelete.connectionId.trim() !== '') {
    // У удаляемого объекта есть родитель
    const parentConnectionId = objectToDelete.connectionId;
    
    // Проверяем, является ли родитель локацией или игроком
    const isLocation = locations.some(l => l.id === parentConnectionId);
    const isPlayer = players.some(p => p.id === parentConnectionId);
    
    if (isLocation || isPlayer) {
      // Родитель - локация или игрок, прямые потомки переходят туда
      targetConnectionId = parentConnectionId;
    } else {
      // Родитель - другой объект, прямые потомки переходят к нему
      targetConnectionId = parentConnectionId;
    }
  } else {
    // У удаляемого объекта нет родителя - ищем корневую локацию/игрока по цепочке вверх
    const rootLocationOrPlayer = findRootLocationOrPlayer(objectIdToDelete, newObjects, locations, players);
    targetConnectionId = rootLocationOrPlayer || undefined;
  }
  
  // Находим только ПРЯМЫХ потомков (не рекурсивно!)
  // Это объекты, у которых connectionId === objectIdToDelete
  const directChildren = newObjects.filter(o => o.connectionId === objectIdToDelete);
  
  // Перемещаем только прямых потомков к найденной цели
  // Вложенные потомки остаются на своих местах (их connectionId указывает на прямых потомков)
  for (const directChild of directChildren) {
    const childIndex = newObjects.findIndex(o => o.id === directChild.id);
    if (childIndex !== -1) {
      newObjects[childIndex] = {
        ...newObjects[childIndex],
        connectionId: targetConnectionId
      };
    }
  }
  
  // Удаляем объект из массива
  newObjects.splice(objectIndex, 1);
  
  return newObjects;
};