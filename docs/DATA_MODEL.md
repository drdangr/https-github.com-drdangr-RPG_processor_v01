# Модель Данных (Game State)

Состояние игры хранится в едином объекте `GameState`. Ниже описаны основные сущности.

## Полная структура GameState

```typescript
interface GameState {
  world: WorldData;
  locations: LocationData[];
  players: PlayerData[];
  objects: ObjectData[];
}
```

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
  state: string;            // Краткий статус (напр. "Затоплена", "Тишина")
  connections: Array<{      // Связи (граф переходов между локациями)
    targetLocationId: string;
    type: 'in' | 'out' | 'bidirectional';
  }>;
}
```

**Типы связей:**
*   `bidirectional` — можно перемещаться в обе стороны
*   `in` — можно только войти (из целевой локации в текущую)
*   `out` — можно только выйти (из текущей локации в целевую)

## 3. Players (Игроки/Персонажи)
Активные действующие лица.
```typescript
interface PlayerData {
  id: string;          // Уникальный ID (напр. "char_001")
  name: string;        // Имя персонажа
  description: string; // Описание внешности, характера
  health: number;      // Очки здоровья
  state: string;       // Физическое/ментальное состояние (напр. "пьян", "ранен")
  locationId: string;  // ID локации, где находится персонаж
}
```

**Важно:** `locationId` определяет, какие объекты "видит" персонаж (см. раздел "Принципы связей").

## 4. Objects (Предметы)
Все интерактивные объекты в мире.
```typescript
interface ObjectData {
  id: string;           // Уникальный ID (напр. "obj_001")
  name: string;         // Название
  description: string;  // Описание
  state: string;        // Состояние (напр. "Сломан", "Заряжен", "Открыт")
  connectionId: string; // ID родителя (владельца/контейнера)
}
```

### connectionId — ключевое поле
Определяет, где находится объект:

| connectionId указывает на | Значение |
|---------------------------|----------|
| ID Локации | Объект лежит в этой локации |
| ID Игрока | Объект принадлежит этому игроку (в инвентаре) |
| ID Другого объекта | Объект находится внутри контейнера |

**Пример иерархии:**
```
loc_saloon (локация)
├── obj_table (стол) — connectionId: "loc_saloon"
│   └── obj_bottle (бутылка) — connectionId: "obj_table"
└── char_jack (игрок) — locationId: "loc_saloon"
    └── obj_gun (пистолет) — connectionId: "char_jack"
```

## Принципы связей

### Location Awareness (Видимость объектов)
ИИ определяет, что видит игрок, анализируя связи:

1. **Объекты в локации игрока:**
   ```
   object.connectionId === player.locationId
   ```

2. **Объекты у игрока:**
   ```
   object.connectionId === player.id
   ```

3. **Объекты внутри видимых контейнеров:**
   Рекурсивная проверка `connectionId` до локации или игрока.

### Перемещение объектов
Перемещение предмета = изменение его `connectionId`:
```typescript
// Игрок берёт ключ со стола
obj_key.connectionId = "char_jack"  // было: "obj_table"
```

### Защита от ошибок
Инструмент `move_object` проверяет:
*   Существование объекта и цели
*   Нельзя переместить объект в самого себя
*   Нельзя создать циклическую зависимость (A содержит B, B содержит A)

## Соглашения по именованию ID

| Тип сущности | Префикс | Пример |
|--------------|---------|--------|
| Локация | `loc_` | `loc_saloon`, `loc_street` |
| Игрок/Персонаж | `char_` | `char_jack`, `char_sheriff` |
| Объект | `obj_` | `obj_gun`, `obj_key`, `obj_table` |

Это соглашение не является обязательным, но помогает ИИ и разработчику быстро идентифицировать тип сущности по ID.
