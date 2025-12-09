import { GameTool, GameState } from '../types';
import { Type } from "@google/genai";

const tool: GameTool = {
    definition: {
        name: "find_entity_location",
        description: "Понять, где находится сущность (игрок или объект). Возвращает текущую корневую локацию и цепочку вложенности (например: Игрок -> Машина -> Гараж -> Локация). Используй этот инструмент, если connectionId указывает на объект, и нужно понять, где этот объект находится физически.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                entityId: {
                    type: Type.STRING,
                    description: "ID сущности (Player ID или Object ID)."
                },
            },
            required: ["entityId"],
        },
    },
    apply: (state: GameState, args: any) => {
        const { entityId } = args;

        if (!entityId) {
            return { newState: state, result: `Ошибка: entityId не указан` };
        }

        let currentId = entityId;
        const path: string[] = [];
        const visited = new Set<string>();

        let rootLocation = null;

        // Traverse up
        while (currentId) {
            if (visited.has(currentId)) {
                return { newState: state, result: `Ошибка: Обнаружен цикл (${[...visited, currentId].join(' -> ')})` };
            }
            visited.add(currentId);

            const loc = state.locations.find(l => l.id === currentId);
            if (loc) {
                rootLocation = loc;
                break; // Found root
            }

            const obj = state.objects.find(o => o.id === currentId);
            if (obj) {
                path.push(`${obj.name} (${obj.id})`);
                currentId = obj.connectionId;
                continue;
            }

            const pl = state.players.find(p => p.id === currentId);
            if (pl) {
                path.push(`${pl.name} (${pl.id})`);
                currentId = pl.connectionId;
                continue;
            }

            // Dead end (not found or invalid ID)
            if (currentId === entityId) {
                return { newState: state, result: `Сущность "${entityId}" не найдена` };
            }
            return { newState: state, result: `Цепочка оборвалась на "${currentId}" (не найдено)` };
        }

        if (rootLocation) {
            const fullPath = [rootLocation.name, ...path.reverse()].join(" > ");
            return {
                newState: state,
                result: `Местонахождение: "${rootLocation.name}" (${rootLocation.id}).\nПолный путь: ${fullPath}`
            };
        }

        return { newState: state, result: `Не удалось определить локацию (возможно объект нигде не находится).` };
    }
};

export default tool;
