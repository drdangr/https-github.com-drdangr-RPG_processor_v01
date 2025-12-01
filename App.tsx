import React, { useState, useEffect } from 'react';
import { GameState, SimulationResult, WorldData, LocationData, PlayerData, ObjectData } from './types';
import { INITIAL_STATE } from './constants';
import { ALL_TOOLS } from './tools/index';
import { processGameTurn } from './services/geminiService';
import { WorldEditor, LocationsEditor, PlayersEditor, ObjectsEditor } from './components/FormEditors';
import DiffView from './components/DiffView';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [playerInput, setPlayerInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'world' | 'locations' | 'players' | 'objects'>('world');
  
  // State for enabled tools. Default all to true.
  const [toolEnabledState, setToolEnabledState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ALL_TOOLS.forEach(t => initial[t.definition.name] = true);
    return initial;
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

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

  const updateWorld = (w: WorldData) => setGameState(prev => ({ ...prev, world: w }));
  const updateLocations = (l: LocationData[]) => setGameState(prev => ({ ...prev, locations: l }));
  const updatePlayers = (p: PlayerData[]) => setGameState(prev => ({ ...prev, players: p }));
  const updateObjects = (o: ObjectData[]) => setGameState(prev => ({ ...prev, objects: o }));

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
      const result = await processGameTurn(gameState, playerInput, enabledTools);
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
      setGameState(lastResult.newState);
      setLastResult(null);
      setPlayerInput('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-purple-500 selection:text-white flex flex-col" data-no-translate>
      
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
            {apiKeyMissing && (
                <div className="text-xs font-bold text-red-500 bg-red-900/20 px-3 py-1 rounded border border-red-900 animate-pulse">
                    MISSING API KEY
                </div>
            )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        
        {/* Left Column: Data Editor */}
        <section className="col-span-3 border-r border-gray-800 flex flex-col bg-gray-900/50">
          <div className="flex border-b border-gray-800">
            {['world', 'locations', 'players', 'objects'].map((tab) => (
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
                {tab}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'world' && <WorldEditor data={gameState.world} onChange={updateWorld} />}
            {activeTab === 'locations' && <LocationsEditor data={gameState.locations} onChange={updateLocations} />}
            {activeTab === 'players' && <PlayersEditor data={gameState.players} onChange={updatePlayers} />}
            {activeTab === 'objects' && <ObjectsEditor data={gameState.objects} onChange={updateObjects} />}
          </div>
        </section>

        {/* Middle Column: Action */}
        <section className="col-span-5 border-r border-gray-800 flex flex-col bg-gray-950 relative">
            <div className="h-1/3 border-b border-gray-800 p-4 overflow-y-auto bg-gray-900/30">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider flex justify-between">
                    <span>Loaded Tools ({ALL_TOOLS.length})</span>
                    <span className="text-purple-400">{ALL_TOOLS.filter(t => toolEnabledState[t.definition.name]).length} Active</span>
                </h3>
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

            <div className="flex-1 p-6 flex flex-col gap-4 relative">
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

        {/* Right Column: Results */}
        <section className="col-span-4 bg-gray-900 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-800 bg-gray-800/50">
                <h3 className="text-sm font-bold text-gray-200">Результат симуляции</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                             <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                                {lastResult.narrative}
                             </p>
                        </div>

                        <div className="mb-6">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-wider">Лог инструментов</h4>
                            <div className="space-y-2">
                                {lastResult.toolLogs.length === 0 ? (
                                    <div className="text-xs text-gray-600 italic">Инструменты не использовались.</div>
                                ) : (
                                    lastResult.toolLogs.map((log, idx) => (
                                        <div key={idx} className="text-xs bg-black rounded p-2 font-mono border border-gray-800">
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
                                    ))
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
