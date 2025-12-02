# Система Инструментов (Tools)

Приложение использует модульную систему инструментов. Каждый инструмент — это отдельный файл, который содержит определение для ИИ (Schema) и логику выполнения (Implementation).

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
    result: string;      // Текстовый отчет (напр. "Объект перемещён игроку Jack")
  };
}
```

## Доступные инструменты

| Инструмент | Описание |
|------------|----------|
| `move_object` | Перемещение объекта к игроку, в локацию или внутрь другого объекта |
| `change_object_state` | Изменение состояния объекта (сломан, активирован и т.д.) |
| `change_player_state` | Изменение состояния игрока (без сознания, воодушевлён и т.д.) |
| `change_location_state` | Изменение состояния локации (затоплена, тишина и т.д.) |

## Создание нового инструмента

1.  Создайте новый файл в папке `tools/` (например, `tools/healPlayer.ts`).
2.  Скопируйте шаблон существующего инструмента.
3.  Опишите `definition` (имя, описание, параметры).
4.  Реализуйте функцию `apply` с учетом правил валидации (см. ниже).
5.  **Зарегистрируйте** инструмент в `tools/index.ts` (см. раздел "Регистрация").

## Правила реализации `apply`

### 1. Валидация входных данных
Всегда проверяйте обязательные параметры в начале функции:
```typescript
apply: (state: GameState, args: any) => {
  const { objectId, newState: stateDescription } = args;
  
  // Валидация пустых значений
  if (!objectId || !stateDescription) {
    return { 
      newState: state,  // ← Возвращаем ОРИГИНАЛЬНОЕ состояние
      result: `Ошибка: objectId и newState обязательны` 
    };
  }
  // ...
}
```

### 2. Проверка существования сущностей
Убедитесь, что ID существует в состоянии:
```typescript
const obj = clonedState.objects.find(o => o.id === objectId);
if (!obj) {
  return { 
    newState: state,  // ← Возвращаем ОРИГИНАЛЬНОЕ состояние при ошибке
    result: `Ошибка: Объект "${objectId}" не найден` 
  };
}
```

### 3. Защита от логических ошибок
Для `move_object` реализованы дополнительные проверки:
- Нельзя переместить объект в самого себя
- Проверка на циклические зависимости (A внутри B, B внутри A)
- Валидация существования целевого контейнера

### 4. Иммутабельность
**Важно:** Всегда используйте `cloneState(state)` перед модификацией:
```typescript
import { cloneState } from '../utils/gameUtils';

apply: (state: GameState, args: any) => {
  const clonedState = cloneState(state);  // Глубокое клонирование
  // Модифицируем clonedState, НЕ state
  return { newState: clonedState, result: "..." };
}
```

### 5. Человекочитаемые результаты
Возвращайте информативный `result` на русском языке — этот текст увидит ИИ и использует его для генерации нарратива:
```typescript
result: `Объект "${obj.name}" передан игроку "${targetPlayer.name}"`
```

## Регистрация инструментов

Поскольку проект использует **Vite** (а не Webpack), автозагрузка через `require.context` недоступна. Инструменты регистрируются **вручную** в файле `tools/index.ts`:

```typescript
// tools/index.ts
import moveObject from './moveObject';
import changeObjectState from './changeObjectState';
import changePlayerState from './changePlayerState';
import changeLocationState from './changeLocationState';
import myNewTool from './myNewTool';  // ← Добавьте импорт

let tools: GameTool[] = [
  moveObject,
  changeObjectState,
  changePlayerState,
  changeLocationState,
  myNewTool  // ← Добавьте в массив
];

export const ALL_TOOLS = tools;
```

После добавления инструмент автоматически появится в UI и станет доступен ИИ.

## Включение/Отключение инструментов в UI

В интерфейсе приложения (средняя колонка) отображается список всех зарегистрированных инструментов. Каждый инструмент можно включить или отключить кнопкой ENABLED/DISABLED. Отключённые инструменты не передаются в Gemini API.
