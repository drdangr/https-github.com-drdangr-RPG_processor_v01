# Модель Данных (Game State)

Состояние игры хранится в едином объекте `GameState`. Ниже описаны основные сущности.

## 1. World (Мир)
Общие настройки сеттинга.
```typescript
interface WorldData {
  worldDescription: string; // Литературное описание атмосферы
  gameGenre: string;        // Жанр (влияет на стиль ответов ИИ)
}
```

## 2. Locations (Локации)
Места, где могут находиться персонажи и предметы.
```typescript
interface LocationData {
  id: string;               // Уникальный ID (напр. "loc_001")
  name: string;             // Название
  description: string;      // Статичное описание
  currentSituation: string; // Динамическое описание (погода, события)
  state: string;            // Краткий статус (напр. "Затоплена")
  connections: Array<{      // Связи (граф переходов)
    targetLocationId: string;
    type: 'in' | 'out' | 'bidirectional';
  }>;
}
```

## 3. Players (Игроки/Персонажи)
Активные действующие лица.
```typescript
interface PlayerData {
  id: string;          // Уникальный ID (напр. "char_001")
  name: string;
  description: string;
  health: number;
  state: string;       // Физическое/ментальное состояние
  locationId: string;  // ID локации, где находится персонаж (ВАЖНО для видимости предметов)
}
```

## 4. Objects (Предметы)
Все интерактивные объекты в мире.
```typescript
interface ObjectData {
  id: string;           // Уникальный ID (напр. "obj_001")
  name: string;
  description: string;
  state: string;        // Состояние (напр. "Сломан", "Заряжен")
  connectionId: string; // ID родителя. Это может быть:
                        // - ID Локации (лежит на полу)
                        // - ID Игрока (объект принадлежит игроку)
                        // - ID Другого объекта (внутри ящика)
}
```

## Принципы связей
*   **Location Awareness:** ИИ определяет, что видит игрок, сравнивая `player.locationId` с `object.connectionId` (если объект в локации) или проверяя `object.connectionId === player.id` (если объект принадлежит игроку).
*   **Перемещение:** Перемещение предмета означает изменение его `connectionId`.
