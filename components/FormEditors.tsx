import React, { useState } from 'react';
import { WorldData, LocationData, PlayerData, ObjectData } from '../types';

// --- UI Primitives ---

const InputField = ({ label, value, onChange, type = "text", placeholder = "", className = "", name, id, onSave }: any) => {
  // Generate a random ID if none provided to avoid extension conflicts
  const finalId = id || `field_${Math.random().toString(36).substr(2, 9)}`;
  const finalName = name || `input_${Math.random().toString(36).substr(2, 9)}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+Enter или Cmd+Enter для сохранения
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (onSave) {
        onSave();
      }
    }
  };

  return (
    <div className={`mb-3 ${className}`}>
        <label htmlFor={finalId} className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">{label}</label>
        <input
        type={type}
        id={finalId}
        name={finalName}
        className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded px-2 py-2 focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-700"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="new-password"
        data-gramm="false"
        data-lpignore="true"
        data-1p-ignore="true" 
        spellCheck="false"
        />
    </div>
  );
};

const TextAreaField = ({ label, value, onChange, rows = 3, name, id, onSave }: any) => {
    const finalId = id || `text_${Math.random().toString(36).substr(2, 9)}`;
    const finalName = name || `area_${Math.random().toString(36).substr(2, 9)}`;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter или Cmd+Enter для сохранения в textarea
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (onSave) {
          onSave();
        }
      }
    };

    return (
    <div className="mb-3">
        <label htmlFor={finalId} className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">{label}</label>
        <textarea
        id={finalId}
        name={finalName}
        className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded px-2 py-2 focus:outline-none focus:border-purple-500 transition-colors resize-none placeholder-gray-700"
        rows={rows}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        data-gramm="false"
        data-lpignore="true"
        data-1p-ignore="true"
        spellCheck="false"
        />
    </div>
    );
};

// --- Generic List Item Wrapper ---

interface ListItemProps {
  id: string;
  name: string;
  onDelete: () => void;
  children: React.ReactNode;
}

const ListItem: React.FC<ListItemProps> = ({ id, name, onDelete, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-800 rounded mb-2 bg-gray-900 overflow-hidden">
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-xs font-bold text-gray-300">{name || 'Unnamed'} <span className="text-gray-600 font-normal">({id})</span></span>
        <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-600 hover:text-red-500 px-2"
        >
            ×
        </button>
      </div>
      
      {isOpen && (
        <div className="p-2 border-t border-gray-800 bg-black/40">
            {children}
        </div>
      )}
    </div>
  );
};

// --- Editors ---

const ConnectionEditor = ({ locId, connections, onChange, onSave }: { locId: string, connections: LocationData['connections'], onChange: (c: LocationData['connections']) => void, onSave?: () => void }) => {
    const addConnection = () => {
        onChange([...connections, { targetLocationId: '', type: 'bidirectional' }]);
    };

    const updateConnection = (index: number, field: keyof LocationData['connections'][0], value: string) => {
        const newConns = [...connections];
        newConns[index] = { ...newConns[index], [field]: value };
        onChange(newConns);
    };

    const removeConnection = (index: number) => {
        onChange(connections.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Ctrl+Enter или Cmd+Enter для сохранения
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (onSave) {
                onSave();
            }
        }
    };

    return (
        <div className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-800">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-gray-500">CONNECTIONS</span>
                <button type="button" onClick={addConnection} className="text-[10px] text-purple-400 font-bold">+ ADD</button>
            </div>
            {connections.map((conn, idx) => (
                <div key={idx} className="flex gap-1 mb-1">
                    <input 
                        className="flex-1 bg-gray-950 border border-gray-800 text-[10px] px-1 py-1 text-gray-300"
                        placeholder="Target ID"
                        value={conn.targetLocationId}
                        onChange={(e) => updateConnection(idx, 'targetLocationId', e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        data-lpignore="true"
                    />
                    <select
                        className="w-16 bg-gray-950 border border-gray-800 text-[10px] text-gray-300"
                        value={conn.type}
                        onChange={(e) => updateConnection(idx, 'type', e.target.value as any)}
                    >
                        <option value="bidirectional">Bi</option>
                        <option value="in">In</option>
                        <option value="out">Out</option>
                    </select>
                    <button type="button" onClick={() => removeConnection(idx)} className="text-red-500 px-1 hover:text-red-400">×</button>
                </div>
            ))}
        </div>
    );
};

export const WorldEditor: React.FC<{ data: WorldData; onChange: (d: WorldData) => void; onSave?: () => void }> = ({ data, onChange, onSave }) => {
  return (
    <div className="p-4">
      <InputField label="Genre" value={data.gameGenre} onChange={(v: string) => onChange({ ...data, gameGenre: v })} onSave={onSave} />
      <TextAreaField label="Description" value={data.worldDescription} onChange={(v: string) => onChange({ ...data, worldDescription: v })} rows={12} onSave={onSave} />
    </div>
  );
};

export const LocationsEditor: React.FC<{ data: LocationData[]; onChange: (d: LocationData[]) => void; onSave?: () => void }> = ({ data, onChange, onSave }) => {
  const add = () => onChange([...data, { id: `loc_${Date.now()}`, name: 'New Loc', description: '', currentSituation: '', state: 'Normal', connections: [] }]);
  return (
    <div className="p-4">
      <button type="button" onClick={add} className="w-full py-1 mb-3 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW LOCATION</button>
      {data.map((item, i) => (
        <ListItem key={i} id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== i))}>
           <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[i].name = v; onChange(n); }} onSave={onSave} />
           <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[i].id = v; onChange(n); }} onSave={onSave} />
           <InputField label="State" value={item.state} onChange={(v: string) => { const n = [...data]; n[i].state = v; onChange(n); }} onSave={onSave} />
           <TextAreaField label="Situation" value={item.currentSituation} onChange={(v: string) => { const n = [...data]; n[i].currentSituation = v; onChange(n); }} onSave={onSave} />
           <ConnectionEditor locId={item.id} connections={item.connections} onChange={(c) => { const n = [...data]; n[i].connections = c; onChange(n); }} onSave={onSave} />
        </ListItem>
      ))}
    </div>
  );
};

export const PlayersEditor: React.FC<{ data: PlayerData[]; onChange: (d: PlayerData[]) => void; onSave?: () => void }> = ({ data, onChange, onSave }) => {
  const add = () => onChange([...data, { id: `char_${Date.now()}`, name: 'New Char', description: '', health: 100, state: 'OK', inventory: [], locationId: '' }]);
  return (
    <div className="p-4">
      <button type="button" onClick={add} className="w-full py-1 mb-3 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW PLAYER</button>
      {data.map((item, i) => (
        <ListItem key={i} id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== i))}>
           <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[i].name = v; onChange(n); }} onSave={onSave} />
           <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[i].id = v; onChange(n); }} onSave={onSave} />
           <div className="grid grid-cols-2 gap-2">
             <InputField label="HP" type="number" value={item.health} onChange={(v: string) => { const n = [...data]; n[i].health = parseInt(v)||0; onChange(n); }} onSave={onSave} />
             <InputField label="State" value={item.state} onChange={(v: string) => { const n = [...data]; n[i].state = v; onChange(n); }} onSave={onSave} />
           </div>
           <InputField label="Location ID" value={item.locationId} onChange={(v: string) => { const n = [...data]; n[i].locationId = v; onChange(n); }} onSave={onSave} />
           <InputField label="Inventory" value={item.inventory.join(', ')} onChange={(v: string) => { const n = [...data]; n[i].inventory = v.split(',').map(s=>s.trim()); onChange(n); }} onSave={onSave} />
        </ListItem>
      ))}
    </div>
  );
};

export const ObjectsEditor: React.FC<{ data: ObjectData[]; onChange: (d: ObjectData[]) => void; onSave?: () => void }> = ({ data, onChange, onSave }) => {
  const add = () => onChange([...data, { id: `obj_${Date.now()}`, name: 'New Obj', description: '', connectionId: '', state: 'Normal' }]);
  return (
    <div className="p-4">
      <button type="button" onClick={add} className="w-full py-1 mb-3 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW OBJECT</button>
      {data.map((item, i) => (
        <ListItem key={i} id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== i))}>
           <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[i].name = v; onChange(n); }} onSave={onSave} />
           <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[i].id = v; onChange(n); }} onSave={onSave} />
           <InputField label="State" value={item.state} onChange={(v: string) => { const n = [...data]; n[i].state = v; onChange(n); }} onSave={onSave} />
           <InputField label="Connected To (ID)" value={item.connectionId} onChange={(v: string) => { const n = [...data]; n[i].connectionId = v; onChange(n); }} onSave={onSave} />
           <TextAreaField label="Description" value={item.description} onChange={(v: string) => { const n = [...data]; n[i].description = v; onChange(n); }} onSave={onSave} />
        </ListItem>
      ))}
    </div>
  );
};
