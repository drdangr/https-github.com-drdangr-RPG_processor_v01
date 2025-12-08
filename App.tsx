import React, { useState, useEffect, useRef } from 'react';
import { GameState, SimulationResult, WorldData, LocationData, PlayerData, ObjectData, AISettings, DEFAULT_AI_SETTINGS, AVAILABLE_MODELS, TurnHistory } from './types';
import { INITIAL_STATE } from './constants';
import { ALL_TOOLS } from './tools/index';
import { processGameTurn } from './services/geminiService';
import { WorldEditor, LocationsEditor, PlayersEditor, ObjectsEditor, ConnectionTarget, LocationOption } from './components/FormEditors';
import DiffView from './components/DiffView';
import NarrativeText from './components/NarrativeText';
import { saveDataFiles } from './utils/dataExporter';
import { normalizeState } from './utils/gameUtils';
import { getAllPresets, addPreset, deletePreset, getPresetById, updatePreset, PromptPreset } from './utils/promptPresets';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [playerInput, setPlayerInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'world' | 'locations' | 'players' | 'objects' | 'history'>('world');
  const [history, setHistory] = useState<TurnHistory[]>([]); // История ходов игры
  
  // State for enabled tools. Default all to true, except move_player which is disabled by default.
  const [toolEnabledState, setToolEnabledState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ALL_TOOLS.forEach(t => {
      // Отключаем move_player по умолчанию
      initial[t.definition.name] = t.definition.name !== 'move_player';
    });
    return initial;
  });

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [middleTab, setMiddleTab] = useState<'tools' | 'settings'>('tools');
  
  // Presets management state
  const [simulationPresets, setSimulationPresets] = useState<PromptPreset[]>([]);
  const [narrativePresets, setNarrativePresets] = useState<PromptPreset[]>([]);
  const [editingPreset, setEditingPreset] = useState<{ type: 'simulation' | 'narrative', id: string } | null>(null);
  const [editingPresetData, setEditingPresetData] = useState<Partial<PromptPreset>>({});
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [savedPreset, setSavedPreset] = useState<string | null>(null);
  const [showPresetsList, setShowPresetsList] = useState<{ type: 'simulation' | 'narrative' | null }>({ type: null });
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const savePresetTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Refs for auto-resizing textareas
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const narrativePromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Function to auto-resize textarea (max 20 lines)
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate the height based on scrollHeight
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 16;
    const maxHeight = lineHeight * 20; // 20 lines max
    const minHeight = lineHeight * 1; // 1 line min
    
    if (textarea.scrollHeight <= maxHeight) {
      textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
      textarea.style.overflowY = 'hidden';
    } else {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    }
  };
  
  // Initialize textarea heights when values change
  useEffect(() => {
    autoResizeTextarea(systemPromptTextareaRef.current);
  }, [aiSettings.systemPromptOverride, simulationPresets]);
  
  useEffect(() => {
    autoResizeTextarea(narrativePromptTextareaRef.current);
  }, [aiSettings.narrativePromptOverride, narrativePresets]);
  
  // Load presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const simPresets = await getAllPresets('simulation');
        const narPresets = await getAllPresets('narrative');
        setSimulationPresets(simPresets);
        setNarrativePresets(narPresets);
        
        // Автоматически выбираем промпт "default", если ничего не выбрано
        setAiSettings(prev => {
          const updates: Partial<typeof prev> = {};
          
          if (!prev.systemPromptPresetId && !prev.systemPromptOverride) {
            const defaultSimPreset = simPresets.find(p => p.id === 'default');
            if (defaultSimPreset) {
              updates.systemPromptPresetId = 'default';
              updates.systemPromptOverride = defaultSimPreset.prompt;
            }
          }
          
          if (!prev.narrativePromptPresetId && !prev.narrativePromptOverride) {
            const defaultNarPreset = narPresets.find(p => p.id === 'default');
            if (defaultNarPreset) {
              updates.narrativePromptPresetId = 'default';
              updates.narrativePromptOverride = defaultNarPreset.prompt;
            }
          }
          
          return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
        });
      } catch (e) {
        console.error('[App] Failed to load presets:', e);
        // Оставляем пустые массивы, если загрузка не удалась
        setSimulationPresets([]);
        setNarrativePresets([]);
      }
    };
    loadPresets();
  }, []);

  // Автоматическая перезагрузка промптов при открытии списка управления
  useEffect(() => {
    if (showPresetsList.type) {
      refreshPresets(showPresetsList.type);
    }
  }, [showPresetsList.type]);
  
  // Refresh presets
  const refreshPresets = async (type: 'simulation' | 'narrative') => {
    try {
      const presets = await getAllPresets(type);
      if (type === 'simulation') {
        setSimulationPresets(presets);
      } else {
        setNarrativePresets(presets);
      }
    } catch (e) {
      console.error('[App] Failed to refresh presets:', e);
    }
  };
  
  // Auto-save preset with debounce
  const schedulePresetSave = (type: 'simulation' | 'narrative', presetId: string, data: Partial<PromptPreset>) => {
    const key = `${type}_${presetId}`;
    
    // Clear existing timeout
    if (savePresetTimeoutRef.current[key]) {
      clearTimeout(savePresetTimeoutRef.current[key]);
    }
    
    // Set saving state
    setSavingPreset(key);
    setSavedPreset(null);
    
    // Schedule save
    savePresetTimeoutRef.current[key] = setTimeout(async () => {
      try {
        await updatePreset(type, presetId, data);
        setSavingPreset(null);
        setSavedPreset(key);
        setTimeout(() => setSavedPreset(null), 2000);
        await refreshPresets(type);
      } catch (e) {
        console.error('[App] Failed to save preset:', e);
        setSavingPreset(null);
      }
    }, 1500); // 1.5 секунды паузы
  };
  
  // Handle preset field change
  const handlePresetFieldChange = (type: 'simulation' | 'narrative', presetId: string, field: keyof PromptPreset, value: any) => {
    const currentData = editingPresetData;
    const newData = { ...currentData, [field]: value };
    setEditingPresetData(newData);
    
    // Schedule auto-save
    schedulePresetSave(type, presetId, newData);
  };

  // Resizer state for middle column panels
  const [topPanelHeight, setTopPanelHeight] = useState(550); // pixels (larger = smaller input panel)
  const middleColumnRef = useRef<HTMLElement | null>(null);
  const isResizing = useRef(false);

  // Column width state (percentages)
  const [leftColumnWidth, setLeftColumnWidth] = useState(25); // %
  const [rightColumnWidth, setRightColumnWidth] = useState(33); // %
  const mainRef = useRef<HTMLElement | null>(null);
  const isResizingColumn = useRef<'left' | 'right' | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message?.includes('control') || event.message?.includes('message port') || event.message?.includes('resize')) {
        return;
      }
      setGlobalErrors(prev => [...prev, event.message]);
    };
    window.addEventListener('error', handleGlobalError);
    
    try {
        const key = typeof process !== 'undefined' && process.env ? process.env.API_KEY : null;
        if (!key) {
            setApiKeyMissing(true);
        }
    } catch(e) {
        console.warn("Could not check env", e);
        setApiKeyMissing(true);
    }

    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  // Resizer handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !middleColumnRef.current) return;
      
      const containerRect = middleColumnRef.current.getBoundingClientRect();
      const tabsHeight = 36; // Height of tabs
      const newHeight = e.clientY - containerRect.top - tabsHeight;
      
      // Constrain between 100px and container height - 100px (min input panel height)
      const maxHeight = containerRect.height - tabsHeight - 100;
      const constrainedHeight = Math.max(100, Math.min(newHeight, maxHeight));
      
      setTopPanelHeight(constrainedHeight);
    };
    
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Column resizer handlers
  const handleColumnResizeStart = (column: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingColumn.current = column;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingColumn.current || !mainRef.current) return;
      
      const containerRect = mainRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      const percentage = (mouseX / containerWidth) * 100;
      
      if (isResizingColumn.current === 'left') {
        // Left resizer: adjust left column width
        const newWidth = Math.max(15, Math.min(percentage, 40));
        setLeftColumnWidth(newWidth);
      } else {
        // Right resizer: adjust right column width
        const newWidth = Math.max(20, Math.min(100 - percentage, 50));
        setRightColumnWidth(newWidth);
      }
    };
    
    const handleMouseUp = () => {
      isResizingColumn.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const updateWorld = (w: WorldData) => {
    setGameState(prev => {
      const newState = { ...prev, world: w };
      setHasUnsavedChanges(true);
      scheduleAutoSave(newState);
      return newState;
    });
  };
  
  const updateLocations = (l: LocationData[]) => {
    setGameState(prev => {
      const newState = { ...prev, locations: l };
      setHasUnsavedChanges(true);
      scheduleAutoSave(newState);
      return newState;
    });
  };
  
  const updatePlayers = (p: PlayerData[]) => {
    setGameState(prev => {
      const newState = { ...prev, players: p };
      setHasUnsavedChanges(true);
      scheduleAutoSave(newState);
      return newState;
    });
  };
  
  const updateObjects = (o: ObjectData[]) => {
    setGameState(prev => {
      const newState = { ...prev, objects: o };
      setHasUnsavedChanges(true);
      scheduleAutoSave(newState);
      return newState;
    });
  };

  // Автоматическое сохранение с задержкой
  const scheduleAutoSave = (state: GameState) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDataToServer(state);
    }, 2000); // Сохраняем через 2 секунды после последнего изменения
  };

  // Сохранение данных на сервер (если API доступен) или в localStorage
  const saveDataToServer = async (state: GameState) => {
    try {
      // Попытка сохранить через API
      const response = await fetch('/api/save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      
      if (response.ok) {
        const result = await response.json();
        setHasUnsavedChanges(false);
        console.log('[App] ✅ Данные сохранены в файлы папки data:', result);
        return;
      } else {
        console.warn('[App] ⚠️ Сервер вернул ошибку:', response.status);
      }
    } catch (err) {
      // API недоступен, сохраняем в localStorage как резервную копию
      console.log('[App] ⚠️ API недоступен, сохраняем в localStorage как резервную копию');
    }
    
    // Резервное сохранение в localStorage
    try {
      localStorage.setItem('rpg_game_state_backup', JSON.stringify(state));
      console.log('[App] 💾 Данные сохранены в localStorage (резервная копия)');
    } catch (e) {
      console.error('[App] ❌ Ошибка сохранения в localStorage:', e);
    }
  };

  // Загрузка данных из localStorage при старте (если есть)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rpg_game_state_backup');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Проверяем, что данные валидны
        if (parsed.world && parsed.locations && parsed.players && parsed.objects) {
          console.log('[App] Найдены сохраненные данные в localStorage');
          // Нормализуем состояние - гарантируем наличие attributes
          const normalized = normalizeState(parsed as GameState);
          // Не перезаписываем автоматически, только если пользователь хочет
        }
      }
    } catch (e) {
      console.warn('[App] Не удалось загрузить из localStorage:', e);
    }
  }, []);

  // Автоматический скролл вниз при появлении новых результатов
  useEffect(() => {
    if (lastResult && resultsContainerRef.current) {
      // Небольшая задержка для того, чтобы контент успел отрендериться
      setTimeout(() => {
        if (resultsContainerRef.current) {
          resultsContainerRef.current.scrollTo({
            top: resultsContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [lastResult]);

  // Ручное сохранение в файлы
  const handleSaveToFiles = async () => {
    // Сохраняем только через API на сервер
    await saveDataToServer(gameState);
  };

  const toggleTool = (toolName: string) => {
      setToolEnabledState(prev => ({
          ...prev,
          [toolName]: !prev[toolName]
      }));
  };

  const handleRunSimulation = async () => {
    console.log("[App] Process Turn button clicked.");
    
    if (!playerInput.trim()) {
        setErrorMsg("Пожалуйста, введите описание сценария в текстовое поле.");
        return;
    }

    if (apiKeyMissing) {
        setErrorMsg("КРИТИЧЕСКАЯ ОШИБКА: API Key отсутствует. Приложение не может работать без него.");
    }
    
    setIsProcessing(true);
    setErrorMsg(null);
    setLastResult(null);

    // Filter enabled tools
    const enabledTools = ALL_TOOLS.filter(t => toolEnabledState[t.definition.name]);

    try {
      console.log("[App] Sending history to processGameTurn:", {
        historyLength: history.length,
        history: history.map(h => ({ turn: h.turn, userPrompt: h.userPrompt.substring(0, 50) + '...' }))
      });
      const result = await processGameTurn(gameState, playerInput, enabledTools, aiSettings, history);
      console.log("[App] Result received:", result);
      setLastResult(result);
    } catch (err: any) {
      console.error("[App] Simulation Exception:", err);
      setErrorMsg(err.message || "Произошла неизвестная ошибка.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitChanges = () => {
    if (lastResult) {
      // Сохраняем ход в историю перед обновлением состояния
      const turnNumber = history.length + 1;
      const turnEntry: TurnHistory = {
        turn: turnNumber,
        userPrompt: playerInput,
        narrative: lastResult.narrative,
        toolLogs: lastResult.toolLogs
      };
      
      setHistory(prev => {
        const newHistory = [...prev, turnEntry];
        console.log("[App] History updated:", {
          oldLength: prev.length,
          newLength: newHistory.length,
          lastTurn: turnEntry.turn
        });
        return newHistory;
      });
      setGameState(lastResult.newState);
      setHasUnsavedChanges(true);
      scheduleAutoSave(lastResult.newState);
      setLastResult(null);
      setPlayerInput('');
    }
  };

  return (
    <div className="h-screen bg-gray-950 text-gray-200 font-sans selection:bg-purple-500 selection:text-white flex flex-col overflow-hidden" data-no-translate>
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex justify-between items-center shadow-md shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(147,51,234,0.5)]">
                <span className="font-bold text-white text-lg">GM</span>
            </div>
            <div>
                <h1 className="text-xl font-bold tracking-tight text-white">AI D&D Processor</h1>
                <p className="text-xs text-gray-500">Module: State Engine (v1.3 RU)</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            {hasUnsavedChanges && (
                <div className="text-xs font-bold text-yellow-500 bg-yellow-900/20 px-3 py-1 rounded border border-yellow-900">
                    НЕСОХРАНЕНО
                </div>
            )}
            {apiKeyMissing && (
                <div className="text-xs font-bold text-red-500 bg-red-900/20 px-3 py-1 rounded border border-red-900 animate-pulse">
                    MISSING API KEY
                </div>
            )}
        </div>
      </header>

      <main ref={mainRef} className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Data Editor */}
        <section style={{ width: `${leftColumnWidth}%` }} className="shrink-0 flex flex-col bg-gray-900/50 min-h-0">
          <div className="flex border-b border-gray-800">
            {['world', 'locations', 'players', 'objects', 'history'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${
                  activeTab === tab 
                    ? 'text-purple-400 border-b-2 border-purple-500 bg-gray-800/50' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                }`}
              >
                {tab === 'history' ? `history (${history.length})` : tab}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'world' && <WorldEditor data={gameState.world} onChange={updateWorld} onSave={handleSaveToFiles} />}
            {activeTab === 'locations' && <LocationsEditor data={gameState.locations} onChange={updateLocations} onSave={handleSaveToFiles} />}
            {activeTab === 'players' && (
              <PlayersEditor 
                data={gameState.players} 
                onChange={updatePlayers} 
                onSave={handleSaveToFiles}
                availableLocations={gameState.locations.map(l => ({ id: l.id, name: l.name }))}
              />
            )}
            {activeTab === 'objects' && (
              <ObjectsEditor 
                data={gameState.objects} 
                onChange={updateObjects}
                onSave={handleSaveToFiles}
                connectionTargets={[
                  ...gameState.players.map(p => ({ id: p.id, name: p.name, type: 'player' as const })),
                  ...gameState.locations.map(l => ({ id: l.id, name: l.name, type: 'location' as const })),
                  ...gameState.objects.map(o => ({ id: o.id, name: o.name, type: 'object' as const }))
                ]}
                locations={gameState.locations}
                players={gameState.players}
              />
            )}
            {activeTab === 'history' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">История ходов</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Всего ходов: {history.length}</span>
                    {history.length > 0 && (
                      <button
                        onClick={() => {
                          if (confirm('Очистить всю историю?')) {
                            setHistory([]);
                          }
                        }}
                        className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
                {history.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg mb-2">История пуста</p>
                    <p className="text-sm">История будет заполняться после каждого коммита изменений</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.map((turn, idx) => (
                      <div key={idx} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-bold text-purple-400">Ход {turn.turn}</h3>
                          <span className="text-xs text-gray-500">
                            {turn.toolLogs.length} инструмент{turn.toolLogs.length !== 1 ? 'ов' : ''}
                          </span>
                        </div>
                        
                        <div className="mb-3">
                          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Запрос игрока:</div>
                          <div className="text-sm text-gray-200 bg-gray-900/50 p-2 rounded">
                            "{turn.userPrompt}"
                          </div>
                        </div>

                        {turn.toolLogs.length > 0 && (
                          <div className="mb-3">
                            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Выполненные действия:</div>
                            <div className="space-y-1">
                              {turn.toolLogs.map((log, logIdx) => (
                                <div key={logIdx} className="text-xs text-cyan-300 bg-gray-900/50 p-2 rounded font-mono">
                                  <span className="text-cyan-500">{log.name}</span>
                                  {' → '}
                                  <span className="text-gray-300">{log.result}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Нарратив:</div>
                          <div className="text-sm text-gray-200 bg-gray-900/50 p-3 rounded">
                            <NarrativeText text={turn.narrative} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Left Resizer */}
        <div 
          onMouseDown={handleColumnResizeStart('left')}
          className="w-1.5 bg-gray-800 hover:bg-purple-600 cursor-col-resize shrink-0 flex items-center justify-center group transition-colors"
        >
          <div className="h-12 w-0.5 bg-gray-600 group-hover:bg-purple-300 rounded transition-colors" />
        </div>

        {/* Middle Column: Action */}
        <section ref={middleColumnRef} style={{ width: `${100 - leftColumnWidth - rightColumnWidth}%` }} className="shrink-0 flex flex-col bg-gray-950 relative">
            {/* Tabs: Tools / Settings */}
            <div className="flex border-b border-gray-800 bg-gray-900/50 shrink-0">
              <button
                type="button"
                onClick={() => setMiddleTab('tools')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  middleTab === 'tools' 
                    ? 'text-purple-400 border-b-2 border-purple-500 bg-gray-800/50' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                }`}
              >
                🔧 Tools ({ALL_TOOLS.filter(t => toolEnabledState[t.definition.name]).length}/{ALL_TOOLS.length})
              </button>
              <button
                type="button"
                onClick={() => setMiddleTab('settings')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  middleTab === 'settings' 
                    ? 'text-cyan-400 border-b-2 border-cyan-500 bg-gray-800/50' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                }`}
              >
                ⚙️ Settings
              </button>
            </div>

            {/* Tools Tab */}
            {middleTab === 'tools' && (
              <div style={{ height: topPanelHeight }} className="shrink-0 p-4 overflow-y-auto bg-gray-900/30">
                <div className="grid grid-cols-1 gap-2">
                    {ALL_TOOLS.map(tool => {
                        const isEnabled = toolEnabledState[tool.definition.name];
                        return (
                            <div key={tool.definition.name} className={`bg-black/40 border p-2 rounded flex flex-col gap-1 transition-all ${isEnabled ? 'border-purple-900/50' : 'border-gray-800/30 opacity-60'}`}>
                                <div className="flex justify-between items-center">
                                    <span className={`font-mono text-xs ${isEnabled ? 'text-blue-400' : 'text-gray-500'}`}>{tool.definition.name}</span>
                                    <button 
                                        type="button"
                                        onClick={() => toggleTool(tool.definition.name)}
                                        className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider transition-colors ${isEnabled ? 'bg-green-900 text-green-300 hover:bg-green-800' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
                                    >
                                        {isEnabled ? 'ENABLED' : 'DISABLED'}
                                    </button>
                                </div>
                                <span className="text-gray-500 text-[10px]">{tool.definition.description}</span>
                            </div>
                        );
                    })}
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {middleTab === 'settings' && (
              <div style={{ height: topPanelHeight }} className="shrink-0 p-4 overflow-y-auto bg-gray-900/30">
                <div className="space-y-4">
                  {/* Model Selection */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Модель AI</label>
                    <select
                      value={aiSettings.modelId}
                      onChange={(e) => setAiSettings(prev => ({ ...prev, modelId: e.target.value }))}
                      className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
                    >
                      {AVAILABLE_MODELS.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Max Iterations */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Макс. шагов: <span className="text-cyan-400">{aiSettings.maxIterations}</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={aiSettings.maxIterations}
                      onChange={(e) => setAiSettings(prev => ({ ...prev, maxIterations: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                    <div className="flex justify-between text-[9px] text-gray-600">
                      <span>1</span>
                      <span>5</span>
                      <span>10</span>
                    </div>
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Temperature: <span className="text-cyan-400">{aiSettings.temperature.toFixed(1)}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={aiSettings.temperature}
                      onChange={(e) => setAiSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                    <div className="flex justify-between text-[9px] text-gray-600">
                      <span>0 (точный)</span>
                      <span>1</span>
                      <span>2 (креативный)</span>
                    </div>
                  </div>

                  {/* Thinking Budget */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Thinking Budget: <span className="text-cyan-400">{aiSettings.thinkingBudget}</span> токенов
                    </label>
                    <input
                      type="range"
                      min="512"
                      max="8192"
                      step="512"
                      value={aiSettings.thinkingBudget}
                      onChange={(e) => setAiSettings(prev => ({ ...prev, thinkingBudget: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                    <div className="flex justify-between text-[9px] text-gray-600">
                      <span>512</span>
                      <span>4096</span>
                      <span>8192</span>
                    </div>
                  </div>

                  {/* System Prompt Override with Presets */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Системный промпт (симуляция)</label>
                      {(() => {
                        const defaultPrompt = simulationPresets.find(p => p.id === 'default')?.prompt;
                        const hasNonDefaultPreset = aiSettings.systemPromptPresetId && aiSettings.systemPromptPresetId !== 'default';
                        const hasCustomOverride = aiSettings.systemPromptOverride && aiSettings.systemPromptOverride !== defaultPrompt;
                        return hasNonDefaultPreset || hasCustomOverride;
                      })() && (
                        <button
                          type="button"
                          onClick={async () => {
                            // Сбрасываем к промпту "default" из файлов
                            const defaultPreset = simulationPresets.find(p => p.id === 'default');
                            if (defaultPreset) {
                              setAiSettings(prev => ({ 
                                ...prev, 
                                systemPromptOverride: defaultPreset.prompt,
                                systemPromptPresetId: 'default'
                              }));
                            } else {
                              // Если default не найден, просто очищаем
                              setAiSettings(prev => ({ 
                                ...prev, 
                                systemPromptOverride: undefined,
                                systemPromptPresetId: undefined
                              }));
                            }
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                    
                    {/* Preset Selector */}
                    <div className="mb-2">
                      <div className="flex gap-2 mb-2">
                        <select
                          value={aiSettings.systemPromptPresetId || simulationPresets.find(p => p.id === 'default')?.id || ''}
                          onFocus={() => refreshPresets('simulation')}
                          onChange={async (e) => {
                            const presetId = e.target.value;
                            if (presetId) {
                              const preset = await getPresetById('simulation', presetId);
                              setAiSettings(prev => ({ 
                                ...prev, 
                                systemPromptPresetId: presetId,
                                systemPromptOverride: preset ? preset.prompt : undefined
                              }));
                            }
                          }}
                          className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          {simulationPresets.length === 0 ? (
                            <option value="">Нет доступных промптов</option>
                          ) : (
                            simulationPresets.map(preset => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}{preset.description ? ` - ${preset.description}` : ''}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            const newType = showPresetsList.type === 'simulation' ? null : 'simulation';
                            setShowPresetsList({ type: newType });
                            if (newType === 'simulation') {
                              await refreshPresets('simulation');
                            }
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-300 hover:bg-cyan-800/50 whitespace-nowrap"
                        >
                          {showPresetsList.type === 'simulation' ? '▼' : '▶'} Управление
                        </button>
                      </div>
                      
                      {/* Presets List */}
                      {showPresetsList.type === 'simulation' && (
                        <div className="mb-2 space-y-2 max-h-64 overflow-y-auto bg-gray-800/30 rounded p-2 border border-gray-700">
                          {simulationPresets.map(preset => (
                            <div key={preset.id} className="bg-black/40 border border-gray-700 rounded p-2">
                              {editingPreset?.type === 'simulation' && editingPreset.id === preset.id ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <input
                                      type="text"
                                      value={editingPresetData.name ?? preset.name}
                                      onChange={(e) => handlePresetFieldChange('simulation', preset.id, 'name', e.target.value)}
                                      className="flex-1 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                                      placeholder="Название"
                                    />
                                    <div className="flex gap-1 ml-2">
                                      {savingPreset === `simulation_${preset.id}` && (
                                        <span className="text-[9px] text-yellow-400">Сохранение...</span>
                                      )}
                                      {savedPreset === `simulation_${preset.id}` && (
                                        <span className="text-[9px] text-green-400">✓ Сохранено</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPreset(null);
                                          setEditingPresetData({});
                                        }}
                                        className="text-[9px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      >
                                        Готово
                                      </button>
                                    </div>
                                  </div>
                                  <input
                                    type="text"
                                    value={editingPresetData.description ?? preset.description ?? ''}
                                    onChange={(e) => handlePresetFieldChange('simulation', preset.id, 'description', e.target.value || undefined)}
                                    className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                                    placeholder="Описание (опционально)"
                                  />
                                  <textarea
                                    value={editingPresetData.prompt ?? preset.prompt}
                                    onChange={(e) => handlePresetFieldChange('simulation', preset.id, 'prompt', e.target.value)}
                                    className="w-full h-32 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-cyan-500 resize-none"
                                    placeholder="Промпт"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-cyan-300">{preset.name}</span>
                                      </div>
                                      {preset.description && (
                                        <p className="text-[10px] text-gray-400 mt-0.5">{preset.description}</p>
                                      )}
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (confirm('Удалить этот промпт?')) {
                                            try {
                                              await deletePreset('simulation', preset.id);
                                              await refreshPresets('simulation');
                                            } catch (e) {
                                              console.error('Failed to delete preset:', e);
                                            }
                                          }
                                        }}
                                        className="text-[9px] px-2 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                                      >
                                        Удалить
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPreset({ type: 'simulation', id: preset.id });
                                          setEditingPresetData({
                                            name: preset.name,
                                            description: preset.description,
                                            prompt: preset.prompt
                                          });
                                        }}
                                        className="text-[9px] px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-300 hover:bg-cyan-800/50"
                                      >
                                        Редактировать
                                      </button>
                                    </div>
                                  </div>
                                  <pre className="text-[9px] text-gray-500 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto mt-1">
                                    {preset.prompt.substring(0, 150)}{preset.prompt.length > 150 ? '...' : ''}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                          
                          {/* Add New Preset */}
                          <div className="border-t border-gray-700 pt-2 mt-2">
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                                placeholder="Название нового промпта"
                              />
                              <input
                                type="text"
                                value={newPresetDescription}
                                onChange={(e) => setNewPresetDescription(e.target.value)}
                                className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-500"
                                placeholder="Описание (опционально)"
                              />
                              <textarea
                                value={newPresetPrompt}
                                onChange={(e) => setNewPresetPrompt(e.target.value)}
                                className="w-full h-24 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-cyan-500 resize-none"
                                placeholder="Промпт"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (newPresetName && newPresetPrompt) {
                                    try {
                                      await addPreset('simulation', {
                                        name: newPresetName,
                                        description: newPresetDescription || undefined,
                                        prompt: newPresetPrompt
                                      });
                                      await refreshPresets('simulation');
                                      setNewPresetName('');
                                      setNewPresetDescription('');
                                      setNewPresetPrompt('');
                                    } catch (e) {
                                      console.error('Failed to add preset:', e);
                                    }
                                  }
                                }}
                                disabled={!newPresetName || !newPresetPrompt}
                                className="w-full py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded text-xs transition-colors"
                              >
                                Добавить промпт
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <textarea
                      ref={systemPromptTextareaRef}
                      value={aiSettings.systemPromptOverride ?? (simulationPresets.find(p => p.id === 'default')?.prompt || '')}
                      onChange={async (e) => {
                        const value = e.target.value;
                        const defaultPreset = simulationPresets.find(p => p.id === 'default');
                        const isDefault = defaultPreset && value === defaultPreset.prompt;
                        let currentPreset: PromptPreset | undefined = undefined;
                        if (aiSettings.systemPromptPresetId) {
                          currentPreset = await getPresetById('simulation', aiSettings.systemPromptPresetId);
                        }
                        const isPresetValue = currentPreset && value === currentPreset.prompt;
                        setAiSettings(prev => ({ 
                          ...prev, 
                          systemPromptOverride: isDefault ? undefined : value,
                          // Сбрасываем пресет, если пользователь вручную редактирует промпт (и он отличается от пресета)
                          systemPromptPresetId: isDefault || !isPresetValue ? undefined : prev.systemPromptPresetId
                        }));
                        autoResizeTextarea(e.currentTarget);
                      }}
                      onInput={(e) => autoResizeTextarea(e.currentTarget)}
                      className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-cyan-500 resize-none overflow-y-auto"
                      placeholder="Системный промпт для AI..."
                      style={{ minHeight: '1.5rem' }}
                    />
                    <p className="text-[9px] text-gray-600 mt-1">
                      {aiSettings.systemPromptPresetId 
                        ? `📋 Используется пресет: ${simulationPresets.find(p => p.id === aiSettings.systemPromptPresetId)?.name || 'неизвестно'}`
                        : aiSettings.systemPromptOverride 
                        ? '✏️ Промпт отредактирован вручную' 
                        : '📄 Используется промпт по умолчанию (default)'}
                    </p>
                  </div>

                  {/* Разделитель для нарративных настроек */}
                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">
                      🎭 Настройки для нарратива (финальный запрос)
                    </h3>
                    <p className="text-[9px] text-gray-500 mb-3">
                      Если не заданы, используются настройки симуляции выше
                    </p>

                    {/* Narrative Model Selection */}
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Модель для нарратива: <span className="text-cyan-400">
                          {aiSettings.narrativeModelId || aiSettings.modelId}
                        </span>
                      </label>
                      <select
                        value={aiSettings.narrativeModelId || ''}
                        onChange={(e) => setAiSettings(prev => ({ 
                          ...prev, 
                          narrativeModelId: e.target.value || undefined 
                        }))}
                        className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Использовать модель симуляции</option>
                        {AVAILABLE_MODELS.map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Narrative Temperature */}
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Temperature для нарратива: <span className="text-cyan-400">
                          {(aiSettings.narrativeTemperature ?? aiSettings.temperature).toFixed(1)}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={aiSettings.narrativeTemperature ?? aiSettings.temperature}
                        onChange={(e) => setAiSettings(prev => ({ 
                          ...prev, 
                          narrativeTemperature: parseFloat(e.target.value) === prev.temperature ? undefined : parseFloat(e.target.value)
                        }))}
                        className="w-full accent-cyan-500"
                      />
                      <div className="flex justify-between text-[9px] text-gray-600">
                        <span>0 (точный)</span>
                        <span>1</span>
                        <span>2 (креативный)</span>
                      </div>
                    </div>

                    {/* Narrative Thinking Budget */}
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Thinking Budget для нарратива: <span className="text-cyan-400">
                          {aiSettings.narrativeThinkingBudget ?? aiSettings.thinkingBudget}
                        </span> токенов
                      </label>
                      <input
                        type="range"
                        min="512"
                        max="8192"
                        step="512"
                        value={aiSettings.narrativeThinkingBudget ?? aiSettings.thinkingBudget}
                        onChange={(e) => setAiSettings(prev => ({ 
                          ...prev, 
                          narrativeThinkingBudget: parseInt(e.target.value) === prev.thinkingBudget ? undefined : parseInt(e.target.value)
                        }))}
                        className="w-full accent-cyan-500"
                      />
                      <div className="flex justify-between text-[9px] text-gray-600">
                        <span>512</span>
                        <span>4096</span>
                        <span>8192</span>
                      </div>
                    </div>

                    {/* Narrative System Prompt Override with Presets */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Системный промпт для нарратива</label>
                        {(() => {
                          const defaultPrompt = narrativePresets.find(p => p.id === 'default')?.prompt;
                          const hasNonDefaultPreset = aiSettings.narrativePromptPresetId && aiSettings.narrativePromptPresetId !== 'default';
                          const hasCustomOverride = aiSettings.narrativePromptOverride && aiSettings.narrativePromptOverride !== defaultPrompt;
                          return hasNonDefaultPreset || hasCustomOverride;
                        })() && (
                          <button
                            type="button"
                            onClick={async () => {
                              // Сбрасываем к промпту "default" из файлов
                              const defaultPreset = narrativePresets.find(p => p.id === 'default');
                              if (defaultPreset) {
                                setAiSettings(prev => ({ 
                                  ...prev, 
                                  narrativePromptOverride: defaultPreset.prompt,
                                  narrativePromptPresetId: 'default'
                                }));
                              } else {
                                // Если default не найден, просто очищаем
                                setAiSettings(prev => ({ 
                                  ...prev, 
                                  narrativePromptOverride: undefined,
                                  narrativePromptPresetId: undefined
                                }));
                              }
                            }}
                            className="text-[9px] px-2 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                          >
                            Сбросить
                          </button>
                        )}
                      </div>
                      
                      {/* Preset Selector */}
                      <div className="mb-2">
                        <div className="flex gap-2 mb-2">
                          <select
                            value={aiSettings.narrativePromptPresetId || narrativePresets.find(p => p.id === 'default')?.id || ''}
                            onFocus={() => refreshPresets('narrative')}
                            onChange={async (e) => {
                              const presetId = e.target.value;
                              if (presetId) {
                                const preset = await getPresetById('narrative', presetId);
                                setAiSettings(prev => ({ 
                                  ...prev, 
                                  narrativePromptPresetId: presetId,
                                  narrativePromptOverride: preset ? preset.prompt : undefined
                                }));
                              }
                            }}
                            className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                          >
                            {narrativePresets.length === 0 ? (
                              <option value="">Нет доступных промптов</option>
                            ) : (
                              narrativePresets.map(preset => (
                                <option key={preset.id} value={preset.id}>
                                  {preset.name}{preset.description ? ` - ${preset.description}` : ''}
                                </option>
                              ))
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={async () => {
                              const newType = showPresetsList.type === 'narrative' ? null : 'narrative';
                              setShowPresetsList({ type: newType });
                              if (newType === 'narrative') {
                                await refreshPresets('narrative');
                              }
                            }}
                            className="text-[9px] px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 hover:bg-purple-800/50 whitespace-nowrap"
                          >
                            {showPresetsList.type === 'narrative' ? '▼' : '▶'} Управление
                          </button>
                        </div>
                        
                        {/* Presets List */}
                        {showPresetsList.type === 'narrative' && (
                          <div className="mb-2 space-y-2 max-h-64 overflow-y-auto bg-gray-800/30 rounded p-2 border border-gray-700">
                            {narrativePresets.map(preset => (
                              <div key={preset.id} className="bg-black/40 border border-gray-700 rounded p-2">
                                {editingPreset?.type === 'narrative' && editingPreset.id === preset.id ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <input
                                        type="text"
                                        value={editingPresetData.name ?? preset.name}
                                        onChange={(e) => handlePresetFieldChange('narrative', preset.id, 'name', e.target.value)}
                                        className="flex-1 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                                        placeholder="Название"
                                      />
                                      <div className="flex gap-1 ml-2">
                                        {savingPreset === `narrative_${preset.id}` && (
                                          <span className="text-[9px] text-yellow-400">Сохранение...</span>
                                        )}
                                        {savedPreset === `narrative_${preset.id}` && (
                                          <span className="text-[9px] text-green-400">✓ Сохранено</span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingPreset(null);
                                            setEditingPresetData({});
                                          }}
                                          className="text-[9px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                                        >
                                          Готово
                                        </button>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={editingPresetData.description ?? preset.description ?? ''}
                                      onChange={(e) => handlePresetFieldChange('narrative', preset.id, 'description', e.target.value || undefined)}
                                      className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                                      placeholder="Описание (опционально)"
                                    />
                                    <textarea
                                      value={editingPresetData.prompt ?? preset.prompt}
                                      onChange={(e) => handlePresetFieldChange('narrative', preset.id, 'prompt', e.target.value)}
                                      className="w-full h-32 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-500 resize-none"
                                      placeholder="Промпт"
                                    />
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-purple-300">{preset.name}</span>
                                        </div>
                                        {preset.description && (
                                          <p className="text-[10px] text-gray-400 mt-0.5">{preset.description}</p>
                                        )}
                                      </div>
                                      <div className="flex gap-1 ml-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (confirm('Удалить этот промпт?')) {
                                              try {
                                                await deletePreset('narrative', preset.id);
                                                await refreshPresets('narrative');
                                              } catch (e) {
                                                console.error('Failed to delete preset:', e);
                                              }
                                            }
                                          }}
                                          className="text-[9px] px-2 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                                        >
                                          Удалить
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingPreset({ type: 'narrative', id: preset.id });
                                            setEditingPresetData({
                                              name: preset.name,
                                              description: preset.description,
                                              prompt: preset.prompt
                                            });
                                          }}
                                          className="text-[9px] px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 hover:bg-purple-800/50"
                                        >
                                          Редактировать
                                        </button>
                                      </div>
                                    </div>
                                    <pre className="text-[9px] text-gray-500 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto mt-1">
                                      {preset.prompt.substring(0, 150)}{preset.prompt.length > 150 ? '...' : ''}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            {/* Add New Preset */}
                            <div className="border-t border-gray-700 pt-2 mt-2">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={newPresetName}
                                  onChange={(e) => setNewPresetName(e.target.value)}
                                  className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                                  placeholder="Название нового промпта"
                                />
                                <input
                                  type="text"
                                  value={newPresetDescription}
                                  onChange={(e) => setNewPresetDescription(e.target.value)}
                                  className="w-full bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                                  placeholder="Описание (опционально)"
                                />
                                <textarea
                                  value={newPresetPrompt}
                                  onChange={(e) => setNewPresetPrompt(e.target.value)}
                                  className="w-full h-24 bg-black/60 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-500 resize-none"
                                  placeholder="Промпт"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (newPresetName && newPresetPrompt) {
                                      try {
                                        await addPreset('narrative', {
                                          name: newPresetName,
                                          description: newPresetDescription || undefined,
                                          prompt: newPresetPrompt
                                        });
                                        await refreshPresets('narrative');
                                        setNewPresetName('');
                                        setNewPresetDescription('');
                                        setNewPresetPrompt('');
                                      } catch (e) {
                                        console.error('Failed to add preset:', e);
                                      }
                                    }
                                  }}
                                  disabled={!newPresetName || !newPresetPrompt}
                                  className="w-full py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded text-xs transition-colors"
                                >
                                  Добавить промпт
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <textarea
                        ref={narrativePromptTextareaRef}
                        value={aiSettings.narrativePromptOverride ?? (narrativePresets.find(p => p.id === 'default')?.prompt || '')}
                        onChange={async (e) => {
                          const value = e.target.value;
                          const defaultPreset = narrativePresets.find(p => p.id === 'default');
                          const isDefault = defaultPreset && value === defaultPreset.prompt;
                          let currentPreset: PromptPreset | undefined = undefined;
                          if (aiSettings.narrativePromptPresetId) {
                            currentPreset = await getPresetById('narrative', aiSettings.narrativePromptPresetId);
                          }
                          const isPresetValue = currentPreset && value === currentPreset.prompt;
                          setAiSettings(prev => ({ 
                            ...prev, 
                            narrativePromptOverride: isDefault ? undefined : value,
                            // Сбрасываем пресет, если пользователь вручную редактирует промпт (и он отличается от пресета)
                            narrativePromptPresetId: isDefault || !isPresetValue ? undefined : prev.narrativePromptPresetId
                          }));
                          autoResizeTextarea(e.currentTarget);
                        }}
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        className="w-full bg-black/40 border border-gray-700 rounded px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-purple-500 resize-none overflow-y-auto"
                        placeholder="Системный промпт для нарратива..."
                        style={{ minHeight: '1.5rem' }}
                      />
                      <p className="text-[9px] text-gray-600 mt-1">
                        {aiSettings.narrativePromptPresetId 
                          ? `📋 Используется пресет: ${narrativePresets.find(p => p.id === aiSettings.narrativePromptPresetId)?.name || 'неизвестно'}`
                          : aiSettings.narrativePromptOverride 
                          ? '✏️ Промпт отредактирован вручную' 
                          : '📄 Используется промпт по умолчанию (default)'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resizer */}
            <div 
              onMouseDown={handleResizeStart}
              className="h-2 bg-gray-800 hover:bg-purple-600 cursor-row-resize shrink-0 flex items-center justify-center group transition-colors border-y border-gray-700"
            >
              <div className="w-12 h-0.5 bg-gray-600 group-hover:bg-purple-300 rounded transition-colors" />
            </div>

            <div className="flex-1 p-6 flex flex-col gap-4 relative min-h-0">
                <div className="flex-1 flex flex-col">
                    <label htmlFor="scenario-input" className="text-sm font-bold text-gray-300 mb-2">Ввод сценария / Действие</label>
                    <textarea 
                        id="scenario-input"
                        name="scenario-input"
                        className="w-full h-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 focus:outline-none focus:border-purple-500 transition-all resize-none shadow-inner font-sans"
                        placeholder="например: 'Джек обыскивает стол и находит скрытый ключ, но случайно опрокидывает бутылку виски.'"
                        value={playerInput}
                        onChange={(e) => setPlayerInput(e.target.value)}
                        autoComplete="off"
                        data-gramm="false"
                        spellCheck="false"
                    />
                </div>
                
                {errorMsg && (
                    <div className="bg-red-900/80 border border-red-500 text-white p-3 rounded text-xs font-mono">
                        <strong>Системная Ошибка:</strong> {errorMsg}
                    </div>
                )}

                <div className="flex justify-end items-center gap-4">
                    <button
                        type="button"
                        onClick={handleRunSimulation}
                        className={`px-6 py-3 rounded-lg font-bold text-sm tracking-wide shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${
                            isProcessing
                            ? 'bg-gray-700 text-gray-400 cursor-wait' 
                            : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-500/25'
                        }`}
                    >
                        {isProcessing ? 'ОБРАБОТКА...' : 'ВЫПОЛНИТЬ ХОД'}
                    </button>
                </div>
            </div>

            {/* Global Error Console */}
            {globalErrors.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-950/90 border-t-2 border-red-600 max-h-32 overflow-y-auto p-2 text-[10px] font-mono text-red-200 z-50">
                    <div className="flex justify-between items-center mb-1 sticky top-0 bg-red-950/90">
                        <span className="font-bold">SYSTEM/BROWSER ERRORS:</span>
                        <button onClick={() => setGlobalErrors([])} className="text-white hover:text-red-200 underline">CLEAR</button>
                    </div>
                    {globalErrors.map((err, i) => (
                        <div key={i} className="border-b border-red-900/50 py-1">{err}</div>
                    ))}
                </div>
            )}
        </section>

        {/* Right Resizer */}
        <div 
          onMouseDown={handleColumnResizeStart('right')}
          className="w-1.5 bg-gray-800 hover:bg-purple-600 cursor-col-resize shrink-0 flex items-center justify-center group transition-colors"
        >
          <div className="h-12 w-0.5 bg-gray-600 group-hover:bg-purple-300 rounded transition-colors" />
        </div>

        {/* Right Column: Results */}
        <section style={{ width: `${rightColumnWidth}%` }} className="shrink-0 bg-gray-900 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-800 bg-gray-800/50">
                <h3 className="text-sm font-bold text-gray-200">Результат симуляции</h3>
            </div>
            
            <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
                {!lastResult && !isProcessing && (
                     <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                        <p className="text-xs uppercase tracking-widest">Ожидание ввода...</p>
                     </div>
                )}

                {lastResult && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-black/30 rounded-lg p-4 border border-gray-700 shadow-lg mb-6 relative">
                             <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 rounded-l"></div>
                             <h4 className="text-[10px] font-bold text-purple-400 uppercase mb-2 tracking-wider">Повествование</h4>
                             <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                                <NarrativeText 
                                  text={lastResult.narrative}
                                  onEntityClick={(type, id, name) => {
                                    console.log(`Clicked ${type}: ${name} (${id})`);
                                    // Можно добавить навигацию к объекту или показать детали
                                  }}
                                />
                             </div>
                             
                             {/* Информация о токенах и стоимости */}
                             {lastResult.costInfo && lastResult.tokenUsage && (
                                 <div className="mt-4 pt-4 border-t border-gray-700">
                                     <div className="flex flex-wrap gap-4 text-xs">
                                         <div className="text-gray-400">
                                             <span className="font-bold text-cyan-400">Токены:</span>{' '}
                                             {lastResult.tokenUsage.total.totalTokens.toLocaleString()} 
                                             {' '}(вход: {lastResult.tokenUsage.total.promptTokens.toLocaleString()}, 
                                             выход: {lastResult.tokenUsage.total.candidatesTokens.toLocaleString()})
                                         </div>
                                         <div className="text-gray-400">
                                             <span className="font-bold text-green-400">Стоимость:</span>{' '}
                                             ${lastResult.costInfo.totalCost.toFixed(6)}
                                             {' '}(вход: ${lastResult.costInfo.inputCost.toFixed(6)}, 
                                             выход: ${lastResult.costInfo.outputCost.toFixed(6)})
                                         </div>
                                         <div className="text-gray-500 text-[10px]">
                                             Модель: {lastResult.costInfo.model}
                                         </div>
                                     </div>
                                 </div>
                             )}
                        </div>

                        {/* Мысли симуляции */}
                        {(lastResult.simulationThinking || lastResult.simulationDebugInfo) && (
                            <div className="mb-6">
                                <details className="group">
                                    <summary className="cursor-pointer list-none">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-500/70 uppercase tracking-wider mb-2 hover:text-cyan-400 transition-colors">
                                            <span className="transform transition-transform group-open:rotate-90">▶</span>
                                            <span>⚙️ Мысли модели (симуляция)</span>
                                            {lastResult.simulationThinking && (
                                                <span className="text-gray-600 font-normal lowercase">({lastResult.simulationThinking.length} символов)</span>
                                            )}
                                        </div>
                                    </summary>
                                    <div className="bg-cyan-950/20 rounded-lg p-3 border border-cyan-900/30 mt-2 space-y-4">
                                        {lastResult.simulationThinking && (
                                            <div>
                                                <h5 className="text-[9px] font-bold text-cyan-400 uppercase mb-2">Мысли модели:</h5>
                                                <p className="text-cyan-200/60 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                                                    {lastResult.simulationThinking}
                                                </p>
                                            </div>
                                        )}
                                        
                                        {lastResult.simulationDebugInfo && (
                                            <div className="border-t border-cyan-900/50 pt-3 mt-3">
                                                <h5 className="text-[9px] font-bold text-cyan-400 uppercase mb-2">🔧 Техническая информация:</h5>
                                                
                                                {lastResult.simulationDebugInfo.responseStructure && (
                                                    <div className="mb-3">
                                                        <p className="text-[9px] text-cyan-300/70 mb-1">
                                                            <strong>Структура ответа:</strong> {lastResult.simulationDebugInfo.responseStructure.totalParts} частей
                                                        </p>
                                                        <div className="text-[8px] text-cyan-200/50 font-mono space-y-1">
                                                            {lastResult.simulationDebugInfo.responseStructure.partTypes.map((part: any, idx: number) => {
                                                                const types: string[] = [];
                                                                if (part.hasText) types.push('📝 текст');
                                                                if (part.hasThought) types.push('💭 мысль');
                                                                if (part.hasFunctionCall) types.push('🔧 инструмент');
                                                                if (types.length === 0) types.push('⚪ пусто');
                                                                
                                                                return (
                                                                    <div key={idx} className="flex gap-2 items-center">
                                                                        <span className="text-cyan-400">Часть {idx + 1}:</span>
                                                                        <span className="text-green-300">{types.join(', ')}</span>
                                                                        {part.textLength > 0 && (
                                                                            <span className="text-gray-500">({part.textLength} симв.)</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {lastResult.simulationDebugInfo.functionCallsCount !== undefined && (
                                                    <p className="text-[9px] text-cyan-300/70 mb-3">
                                                        <strong>Вызовов инструментов:</strong> {lastResult.simulationDebugInfo.functionCallsCount}
                                                    </p>
                                                )}
                                                
                                                {lastResult.simulationDebugInfo.allParts && lastResult.simulationDebugInfo.allParts.length > 0 && (
                                                    <details className="mt-2">
                                                        <summary className="text-[9px] text-cyan-400/70 cursor-pointer hover:text-cyan-300">
                                                            Показать все части ответа ({lastResult.simulationDebugInfo.allParts.length})
                                                        </summary>
                                                        <div className="mt-2 space-y-2">
                                                            {lastResult.simulationDebugInfo.allParts.map((part: any, idx: number) => {
                                                                const getTypeLabel = (type: string) => {
                                                                    const labels: Record<string, string> = {
                                                                        'text': '📝 Текст',
                                                                        'thought': '💭 Мысль',
                                                                        'functionCall': '🔧 Вызов инструмента',
                                                                        'empty': '⚪ Пустая часть',
                                                                        'unknown': '❓ Неизвестный тип'
                                                                    };
                                                                    return labels[type] || type.toUpperCase();
                                                                };
                                                                
                                                                const getTypeColor = (type: string) => {
                                                                    const colors: Record<string, string> = {
                                                                        'text': 'text-green-400',
                                                                        'thought': 'text-yellow-400',
                                                                        'functionCall': 'text-red-400',
                                                                        'empty': 'text-gray-400',
                                                                        'unknown': 'text-orange-400'
                                                                    };
                                                                    return colors[type] || 'text-cyan-400';
                                                                };
                                                                
                                                                return (
                                                                    <div key={idx} className="bg-black/30 rounded p-2 border border-cyan-900/30">
                                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                            <span className={`text-[8px] font-bold ${getTypeColor(part.type)}`}>
                                                                                {getTypeLabel(part.type)}
                                                                            </span>
                                                                            {part.length > 0 && (
                                                                                <span className="text-[8px] text-gray-500">
                                                                                    ({part.length} символов)
                                                                                </span>
                                                                            )}
                                                                            {part.details && (
                                                                                <span className="text-[7px] text-gray-600 italic">
                                                                                    {part.details}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {part.content && part.length > 0 && (
                                                                            <pre className="text-[8px] text-cyan-200/60 font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                                                                                {part.content.substring(0, 500)}{part.content.length > 500 ? '...' : ''}
                                                                            </pre>
                                                                        )}
                                                                        {part.length === 0 && (
                                                                            <p className="text-[8px] text-gray-600 italic">
                                                                                Часть не содержит данных
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Мысли нарратива */}
                        {(lastResult.narrativeThinking || lastResult.narrativeDebugInfo) && (
                            <div className="mb-6">
                                <details className="group">
                                    <summary className="cursor-pointer list-none">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-purple-500/70 uppercase tracking-wider mb-2 hover:text-purple-400 transition-colors">
                                            <span className="transform transition-transform group-open:rotate-90">▶</span>
                                            <span>🎭 Мысли модели (нарратив)</span>
                                            {lastResult.narrativeThinking && (
                                                <span className="text-gray-600 font-normal lowercase">({lastResult.narrativeThinking.length} символов)</span>
                                            )}
                                        </div>
                                    </summary>
                                    <div className="bg-purple-950/20 rounded-lg p-3 border border-purple-900/30 mt-2 space-y-4">
                                        {lastResult.narrativeThinking && (
                                            <div>
                                                <h5 className="text-[9px] font-bold text-purple-400 uppercase mb-2">Мысли модели:</h5>
                                                <p className="text-purple-200/60 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                                                    {lastResult.narrativeThinking}
                                                </p>
                                            </div>
                                        )}
                                        
                                        {lastResult.narrativeDebugInfo && (
                                            <div className="border-t border-purple-900/50 pt-3 mt-3">
                                                <h5 className="text-[9px] font-bold text-purple-400 uppercase mb-2">🔧 Техническая информация:</h5>
                                                
                                                {lastResult.narrativeDebugInfo.responseStructure && (
                                                    <div className="mb-3">
                                                        <p className="text-[9px] text-purple-300/70 mb-1">
                                                            <strong>Структура ответа:</strong> {lastResult.narrativeDebugInfo.responseStructure.totalParts} частей
                                                        </p>
                                                        <div className="text-[8px] text-purple-200/50 font-mono space-y-1">
                                                            {lastResult.narrativeDebugInfo.responseStructure.partTypes.map((part: any, idx: number) => {
                                                                const types: string[] = [];
                                                                if (part.hasText) types.push('📝 текст');
                                                                if (part.hasThought) types.push('💭 мысль');
                                                                if (part.hasFunctionCall) types.push('🔧 инструмент');
                                                                if (types.length === 0) types.push('⚪ пусто');
                                                                
                                                                return (
                                                                    <div key={idx} className="flex gap-2 items-center">
                                                                        <span className="text-purple-400">Часть {idx + 1}:</span>
                                                                        <span className="text-green-300">{types.join(', ')}</span>
                                                                        {part.textLength > 0 && (
                                                                            <span className="text-gray-500">({part.textLength} симв.)</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {lastResult.narrativeDebugInfo.functionCallsCount !== undefined && (
                                                    <p className="text-[9px] text-purple-300/70 mb-3">
                                                        <strong>Вызовов инструментов:</strong> {lastResult.narrativeDebugInfo.functionCallsCount}
                                                    </p>
                                                )}
                                                
                                                {lastResult.narrativeDebugInfo.allParts && lastResult.narrativeDebugInfo.allParts.length > 0 && (
                                                    <details className="mt-2">
                                                        <summary className="text-[9px] text-purple-400/70 cursor-pointer hover:text-purple-300">
                                                            Показать все части ответа ({lastResult.narrativeDebugInfo.allParts.length})
                                                        </summary>
                                                        <div className="mt-2 space-y-2">
                                                            {lastResult.narrativeDebugInfo.allParts.map((part: any, idx: number) => {
                                                                const getTypeLabel = (type: string) => {
                                                                    const labels: Record<string, string> = {
                                                                        'text': '📝 Текст',
                                                                        'thought': '💭 Мысль',
                                                                        'functionCall': '🔧 Вызов инструмента',
                                                                        'empty': '⚪ Пустая часть',
                                                                        'unknown': '❓ Неизвестный тип'
                                                                    };
                                                                    return labels[type] || type.toUpperCase();
                                                                };
                                                                
                                                                const getTypeColor = (type: string) => {
                                                                    const colors: Record<string, string> = {
                                                                        'text': 'text-green-400',
                                                                        'thought': 'text-yellow-400',
                                                                        'functionCall': 'text-red-400',
                                                                        'empty': 'text-gray-400',
                                                                        'unknown': 'text-orange-400'
                                                                    };
                                                                    return colors[type] || 'text-purple-400';
                                                                };
                                                                
                                                                return (
                                                                    <div key={idx} className="bg-black/30 rounded p-2 border border-purple-900/30">
                                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                            <span className={`text-[8px] font-bold ${getTypeColor(part.type)}`}>
                                                                                {getTypeLabel(part.type)}
                                                                            </span>
                                                                            {part.length > 0 && (
                                                                                <span className="text-[8px] text-gray-500">
                                                                                    ({part.length} символов)
                                                                                </span>
                                                                            )}
                                                                            {part.details && (
                                                                                <span className="text-[7px] text-gray-600 italic">
                                                                                    {part.details}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {part.content && part.length > 0 && (
                                                                            <pre className="text-[8px] text-purple-200/60 font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                                                                                {part.content.substring(0, 500)}{part.content.length > 500 ? '...' : ''}
                                                                            </pre>
                                                                        )}
                                                                        {part.length === 0 && (
                                                                            <p className="text-[8px] text-gray-600 italic">
                                                                                Часть не содержит данных
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Обратная совместимость: старый блок thinking, если новые поля не заполнены */}
                        {!lastResult.simulationThinking && !lastResult.narrativeThinking && lastResult.thinking && (
                            <div className="mb-6">
                                <details className="group">
                                    <summary className="cursor-pointer list-none">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-500/70 uppercase tracking-wider mb-2 hover:text-cyan-400 transition-colors">
                                            <span className="transform transition-transform group-open:rotate-90">▶</span>
                                            <span>💭 Мысли модели</span>
                                            <span className="text-gray-600 font-normal lowercase">({lastResult.thinking.length} символов)</span>
                                        </div>
                                    </summary>
                                    <div className="bg-cyan-950/20 rounded-lg p-3 border border-cyan-900/30 mt-2">
                                        <p className="text-cyan-200/60 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                                            {lastResult.thinking}
                                        </p>
                                    </div>
                                </details>
                            </div>
                        )}

                        <div className="mb-6">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-wider">
                                Лог инструментов
                                {lastResult.toolLogs.length > 0 && (
                                    <span className="ml-2 text-gray-600 font-normal">
                                        ({lastResult.toolLogs.length} вызов{lastResult.toolLogs.length === 1 ? '' : lastResult.toolLogs.length < 5 ? 'а' : 'ов'}, {Math.max(...lastResult.toolLogs.map(l => l.iteration ?? 0)) + 1} шаг{Math.max(...lastResult.toolLogs.map(l => l.iteration ?? 0)) === 0 ? '' : Math.max(...lastResult.toolLogs.map(l => l.iteration ?? 0)) < 4 ? 'а' : 'ов'})
                                    </span>
                                )}
                            </h4>
                            <div className="space-y-2">
                                {lastResult.toolLogs.length === 0 ? (
                                    <div className="text-xs text-gray-600 italic">Инструменты не использовались.</div>
                                ) : (
                                    lastResult.toolLogs.map((log, idx, arr) => {
                                        const currentIteration = log.iteration ?? 0;
                                        const prevIteration = idx > 0 ? (arr[idx - 1].iteration ?? 0) : -1;
                                        const showIterationHeader = currentIteration !== prevIteration;
                                        
                                        return (
                                            <React.Fragment key={idx}>
                                                {showIterationHeader && (
                                                    <div className="flex items-center gap-2 mt-3 first:mt-0">
                                                        <div className="h-px flex-1 bg-gray-700"></div>
                                                        <span className="text-[9px] font-bold text-yellow-500/80 uppercase tracking-wider px-2">
                                                            Шаг {currentIteration + 1}
                                                        </span>
                                                        <div className="h-px flex-1 bg-gray-700"></div>
                                                    </div>
                                                )}
                                                <div className="text-xs bg-black rounded p-2 font-mono border border-gray-800">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-blue-500 font-bold">FN:</span>
                                                <span className="text-gray-300">{log.name}</span>
                                            </div>
                                            <div className="text-gray-500 mb-1 break-all pl-6">
                                                ARGS: {JSON.stringify(log.args)}
                                            </div>
                                            <div className="text-green-600/80 break-all pl-6">
                                                RES: {log.result}
                                            </div>
                                        </div>
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="h-64 mb-4">
                            <DiffView oldState={gameState} newState={lastResult.newState} />
                        </div>
                        
                        <button 
                            type="button"
                            onClick={handleCommitChanges}
                            className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded shadow-lg text-xs tracking-wider uppercase transition-colors"
                        >
                            Принять и Обновить состояние
                        </button>
                    </div>
                )}
            </div>
        </section>
      </main>
      
    </div>
  );
};

export default App;
