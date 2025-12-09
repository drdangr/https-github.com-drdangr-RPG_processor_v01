# Система Инструментов (Tools)

Приложение использует модульную систему инструментов. Каждый инструмент — это отдельный файл, который содержит определение для ИИ (Schema) и логику выполнения (Implementation).

## Доступные инструменты

| Инструмент | Описание |
|------------|----------|
| `move_object` | Перемещение объекта к игроку, в локацию или внутрь другого объекта |
| `move_player` | Перемещение игрока между локациями с проверкой связей |
| `set_attribute` | Создание/изменение нарративного атрибута у игрока, объекта или локации |
| `delete_attribute` | Удаление атрибута у игрока, объекта или локации |
| `create_object` | Создание нового объекта с набором атрибутов |
| `delete_object` | Удаление объекта (вложенные объекты перемещаются к родителю) |

## Структура Инструмента

Каждый файл в папке `tools/` должен экспортировать объект типа `GameTool` по умолчанию (`export default`).

```typescript
// types.ts
export interface GameTool {
  // Определение для Gemini API
  definition: {
    name: string;        // Уникальное имя функции (напр. "move_object")
    description: string; // Описание для ИИ, когда использовать
    parameters: {        // JSON Schema аргументов
      type: Type.OBJECT,
      properties: { ... },
      required: [...]
    }
  };
  
  // Логика выполнения
  apply: (state: GameState, args: any) => { 
    newState: GameState; // Клонированное и измененное состояние
    result: string;      // Текстовый отчет
  };
}
```

## Детальное описание инструментов

### move_object

Перемещает объект между владельцами/контейнерами.

**Параметры:**

- `objectId` (required) — ID объекта для перемещения
- `targetId` (required) — ID цели (игрок, локация или другой объект)

**Защита:**

- Проверка существования объекта и цели
- Нельзя переместить объект в себя
- Защита от циклических зависимостей

### move_player

Перемещает игрока из одной локации в другую.

**Параметры:**

- `playerId` (required) — ID игрока
- `targetLocationId` (required) — ID целевой локации

**Защита:**

- Проверка существования игрока и локаций
- Проверка наличия связи между локациями (`out` или `bidirectional` из текущей)
- Нельзя переместить в ту же локацию

### set_attribute

Устанавливает нарративное описание характеристики.

**Параметры:**

- `entityType` (required) — "player" | "object" | "location"
- `entityId` (required) — ID сущности
- `attributeName` (required) — название атрибута (любое)
- `value` (required) — текстовое описание

**Примеры:**

```typescript
// Игрок получил ранение
{ entityType: "player", entityId: "char_001", 
  attributeName: "health", value: "ранен в плечо, но может продолжать" }

// Объект изменил состояние
{ entityType: "object", entityId: "obj_bottle",
  attributeName: "condition", value: "пустая" }
```

### delete_attribute

Удаляет атрибут у сущности (когда он больше не актуален).

**Параметры:**

- `entityType` (required) — "player" | "object" | "location"
- `entityId` (required) — ID сущности
- `attributeName` (required) — название атрибута для удаления

**Пример использования:** Эффект отравления прошёл — удаляем атрибут "poison".

### create_object

Создаёт новый объект в мире игры.

**Параметры:**

- `name` (required) — название объекта
- `connectionId` (required) — ID владельца/контейнера
- `attributes` (optional) — JSON строка с атрибутами

**Пример:**

```typescript
{
  name: "Бутылка рома",
  connectionId: "char_001",
  attributes: '{"condition": "полная", "content": "качественный ром", "material": "стекло"}'
}
```

**Особенности:**

- ID генерируется автоматически (`obj_{timestamp}_{random}`)
- Если `attributes` не передан, создаётся `condition: "в хорошем состоянии"`
- Поддерживает JSON строку или объект

### delete_object

Удаляет объект из мира.

**Параметры:**

- `objectId` (required) — ID объекта для удаления

**Особенности:**

- Вложенные объекты автоматически перемещаются к родителю удаляемого объекта
- Если родитель — игрок или локация, вложенные объекты остаются там

## Многоходовый цикл

AI может вызывать инструменты **несколько раз подряд** в рамках одного хода:

```
Пользователь: "Джек находит ключ и открывает им сундук"

Шаг 1: create_object (создаёт ключ)
Шаг 2: move_object (перемещает ключ к игроку)
Шаг 3: set_attribute (сундук: condition → "открыт")
Шаг 4: AI генерирует нарратив
```

Максимум итераций: **5** (защита от бесконечного цикла).

## Создание нового инструмента

1. Создайте файл в `tools/` (например, `tools/myNewTool.ts`)
2. Реализуйте `definition` и `apply`
3. Зарегистрируйте в `tools/index.ts`:

```typescript
// tools/index.ts
import myNewTool from './myNewTool';

let tools: GameTool[] = [
  moveObject,
  setAttribute,
  deleteAttribute,
  createObject,
  deleteObject,
  myNewTool  // ← Добавьте сюда
];
```

4. Создайте тесты в `tools/__tests__/myNewTool.test.ts`

## Правила реализации `apply`

### 1. Валидация входных данных

```typescript
if (!objectId || !targetId) {
  return { 
    newState: state,  // ← ОРИГИНАЛЬНОЕ состояние
    result: `Ошибка: objectId и targetId обязательны` 
  };
}
```

### 2. Проверка существования сущностей

```typescript
const obj = clonedState.objects.find(o => o.id === objectId);
if (!obj) {
  return { 
    newState: state,
    result: `Ошибка: Объект "${objectId}" не найден` 
  };
}
```

### 3. Иммутабельность

**Всегда** используйте `cloneState(state)` перед модификацией:

```typescript
import { cloneState } from '../utils/gameUtils';

apply: (state: GameState, args: any) => {
  const clonedState = cloneState(state);
  // Модифицируем clonedState, НЕ state
  return { newState: clonedState, result: "..." };
}
```

### 4. Информативные результаты

Возвращайте понятный `result` на русском языке:

```typescript
result: `Объект "${obj.name}" передан игроку "${player.name}"`
```

## Тестирование

Каждый инструмент должен иметь тесты в `tools/__tests__/`:

```bash
# Запуск всех тестов
npm test

# Запуск тестов конкретного инструмента
npx vitest run setAttribute
```

Тесты должны проверять:

- Успешные операции
- Валидацию входных данных
- Обработку ошибок
- Иммутабельность состояния

## Включение/Отключение в UI

В интерфейсе (средняя колонка) отображается список всех инструментов. Каждый можно включить/отключить кнопкой **ENABLED/DISABLED**. Отключённые инструменты не передаются в Gemini API.
