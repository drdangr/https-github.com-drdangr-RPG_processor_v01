// Утилита для работы с пресетами системных промптов

export interface PromptPreset {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  type: 'simulation' | 'narrative'; // тип промпта
}

// Загрузка всех пресетов с сервера
export const getAllPresets = async (type: 'simulation' | 'narrative'): Promise<PromptPreset[]> => {
  try {
    const response = await fetch(`/api/prompts?type=${type}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.prompts) {
        console.log(`[Presets] Loaded ${data.prompts.length} ${type} presets:`, data.prompts.map((p: PromptPreset) => p.name));
        return data.prompts;
      }
    }
  } catch (e) {
    console.warn('[Presets] Failed to load presets from server:', e);
    // Fallback: попытка загрузить из localStorage (для обратной совместимости)
    try {
      const key = type === 'simulation' ? 'rpg_prompt_presets_simulation' : 'rpg_prompt_presets_narrative';
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as PromptPreset[];
        return parsed.filter(p => p.type === type);
      }
    } catch (localError) {
      console.warn('[Presets] Failed to load from localStorage:', localError);
    }
  }
  return [];
};

// Синхронная версия для обратной совместимости (возвращает пустой массив, так как загрузка асинхронная)
export const getAllPresetsSync = (type: 'simulation' | 'narrative'): PromptPreset[] => {
  console.warn('[Presets] getAllPresetsSync is deprecated, use getAllPresets instead');
  return [];
};

// Добавление пресета
export const addPreset = async (type: 'simulation' | 'narrative', preset: Omit<PromptPreset, 'id' | 'type'>): Promise<PromptPreset> => {
  const newPreset: PromptPreset = {
    ...preset,
    id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type
  };

  try {
    const response = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPreset)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return data.prompt || newPreset;
      }
    }
    throw new Error('Failed to save preset');
  } catch (e) {
    console.error('[Presets] Failed to save preset:', e);
    throw e;
  }
};

// Обновление промпта
export const updatePreset = async (type: 'simulation' | 'narrative', presetId: string, preset: Partial<Omit<PromptPreset, 'id' | 'type'>>): Promise<PromptPreset> => {
  try {
    const existingPreset = await getPresetById(type, presetId);
    if (!existingPreset) {
      throw new Error('Preset not found');
    }

    const updatedPreset: PromptPreset = {
      ...existingPreset,
      ...preset,
      id: presetId,
      type
    };

    const response = await fetch(`/api/prompts?type=${type}&id=${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPreset)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return data.prompt || updatedPreset;
      }
    }
    throw new Error('Failed to update preset');
  } catch (e) {
    console.error('[Presets] Failed to update preset:', e);
    throw e;
  }
};

// Удаление пресета
export const deletePreset = async (type: 'simulation' | 'narrative', presetId: string): Promise<void> => {
  try {
    const response = await fetch(`/api/prompts?type=${type}&id=${presetId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete preset');
    }
  } catch (e) {
    console.error('[Presets] Failed to delete preset:', e);
    throw e;
  }
};

// Получение пресета по ID
export const getPresetById = async (type: 'simulation' | 'narrative', presetId: string): Promise<PromptPreset | undefined> => {
  try {
    const response = await fetch(`/api/prompts?type=${type}&id=${presetId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.prompt) {
        return data.prompt;
      }
    }
  } catch (e) {
    console.warn('[Presets] Failed to load preset from server:', e);
  }

  return undefined;
};

