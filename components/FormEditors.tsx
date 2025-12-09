import React, { useState, useRef, useEffect } from 'react';
import { WorldData, LocationData, PlayerData, ObjectData } from '../types';
import { deleteObjectWithChildren } from '../utils/gameUtils';

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

interface SelectOption {
  id: string;
  label: string;
  group?: string;
}

const SelectField = ({ label, value, onChange, options, placeholder = "Выберите...", className = "", onSave }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  onSave?: () => void;
}) => {
  const finalId = `select_${Math.random().toString(36).substr(2, 9)}`;

  // Группируем опции по group
  const grouped = options.reduce((acc, opt) => {
    const group = opt.group || 'Другое';
    if (!acc[group]) acc[group] = [];
    acc[group].push(opt);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  // Сортируем опции внутри каждой группы по алфавиту
  Object.keys(grouped).forEach(groupName => {
    grouped[groupName].sort((a, b) => {
      const labelA = (a.label || '').toLowerCase();
      const labelB = (b.label || '').toLowerCase();
      return labelA.localeCompare(labelB, 'ru');
    });
  });

  // Сортируем группы по алфавиту
  const sortedGroups = Object.entries(grouped).sort(([nameA], [nameB]) => {
    return nameA.localeCompare(nameB, 'ru');
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (onSave) onSave();
    }
  };

  return (
    <div className={`mb-3 ${className}`}>
      <label htmlFor={finalId} className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">{label}</label>
      <select
        id={finalId}
        className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded px-2 py-2 focus:outline-none focus:border-purple-500 transition-colors"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      >
        <option value="" className="text-gray-500">{placeholder}</option>
        {sortedGroups.map(([groupName, groupOptions]) => (
          <optgroup key={groupName} label={groupName} className="bg-gray-900">
            {groupOptions.map(opt => (
              <option key={opt.id} value={opt.id} className="bg-gray-950">
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

const AttributesEditor = ({ attributes, onChange, onSave }: { attributes: Record<string, string>, onChange: (attrs: Record<string, string>) => void, onSave?: () => void }) => {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (newKey.trim() && newValue.trim()) {
      onChange({ ...attributes, [newKey.trim()]: newValue.trim() });
      setNewKey('');
      setNewValue('');
    }
  };

  const handleDelete = (key: string) => {
    const newAttrs = { ...attributes };
    delete newAttrs[key];
    onChange(newAttrs);
  };

  const handleUpdate = (key: string, value: string) => {
    onChange({ ...attributes, [key]: value });
  };

  return (
    <div className="mb-3">
      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">Attributes</label>
      <div className="border border-gray-800 rounded p-2 bg-gray-900">
        {Object.entries(attributes || {}).map(([key, value]) => (
          <div key={key} className="mb-2 last:mb-0 flex gap-2 items-start">
            <div className="flex-1">
              <div className="text-[10px] text-gray-400 mb-1">{key}</div>
              <TextAreaField
                label=""
                value={value}
                onChange={(v: string) => handleUpdate(key, v)}
                rows={2}
                onSave={onSave}
              />
            </div>
            <button
              type="button"
              onClick={() => handleDelete(key)}
              className="mt-5 px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-800 rounded hover:border-red-700"
            >
              ×
            </button>
          </div>
        ))}
        <div className="mt-2 pt-2 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <InputField
              label="Название"
              value={newKey}
              onChange={setNewKey}
              placeholder="health, condition..."
              onSave={onSave}
            />
            <InputField
              label="Значение"
              value={newValue}
              onChange={setNewValue}
              placeholder="ранен, но может продолжать..."
              onSave={onSave}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="w-full py-1 text-xs text-gray-400 hover:text-gray-300 border border-gray-700 rounded hover:border-gray-600"
          >
            + Добавить атрибут
          </button>
        </div>
      </div>
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
    <div className="border border-gray-800 rounded mb-2 bg-gray-900">
      <div
        className={`flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800 transition-colors ${isOpen ? 'rounded-t' : 'rounded'}`}
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
        <div className="p-2 border-t border-gray-800 bg-black/40 rounded-b">
          {children}
        </div>
      )}
    </div>
  );
};

// --- Types ---

export interface LocationOption {
  id: string;
  name: string;
}

// --- Custom Components ---

interface HierarchyOption {
  id: string;
  path: { id: string; name: string; type: string }[];
  isGroupHeader?: boolean;
  groupName?: string;
}

const HierarchySelect = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Выберите...",
  className = ""
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: HierarchyOption[];
  placeholder?: string;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find current selected option to display
  const selectedOption = options.find(o => o.id === value);
  const displayValue = selectedOption
    ? selectedOption.path.map(p => p.name).join(' > ')
    : value ? `(ID: ${value})` : placeholder;

  return (
    <div className={`mb-3 relative ${className}`} ref={containerRef}>
      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-wider">{label}</label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded px-2 py-2 text-left focus:outline-none focus:border-purple-500 transition-colors flex justify-between items-center"
      >
        <span className="truncate">{displayValue}</span>
        <span className="text-gray-600 text-[10px] ml-2">▼</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-xl max-h-60 overflow-y-auto left-0">
          <div className="p-1 space-y-px">
            {options.map((opt) => {
              if (opt.isGroupHeader) {
                return (
                  <div key={`group-${opt.groupName}`} className="px-2 py-1.5 text-[10px] font-bold text-gray-500 bg-gray-950 uppercase tracking-wider sticky top-0">
                    {opt.groupName}
                  </div>
                );
              }

              const isSelected = opt.id === value;

              return (
                <div
                  key={opt.id}
                  className={`px-2 py-1.5 rounded flex flex-wrap items-center gap-1 ${isSelected ? 'bg-purple-900/30' : 'hover:bg-gray-800'}`}
                >
                  {opt.path.map((segment, idx) => {
                    const isLast = idx === opt.path.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-gray-600 text-[10px]">&gt;</span>}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange(segment.id);
                            setIsOpen(false);
                          }}
                          className={`
                             text-xs px-1.5 py-0.5 rounded border border-gray-700 transition-colors
                             ${segment.id === value ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:border-gray-500'}
                             ${isLast ? 'font-medium' : 'opacity-80'}
                           `}
                        >
                          {segment.name}
                        </button>
                      </React.Fragment>
                    );
                  })}
                  {/* Invisible overlay for the whole row to catch clicks in empty space? 
                      Actually, better to just let the row be the main selector for the *item itself*?
                      But the user wants chips. If I click empty space in the row, maybe select the item (last chip)?
                  */}
                  <div
                    className="flex-grow h-4 cursor-pointer"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ConnectionEditor = ({ locId, connections, onChange, onSave, availableLocations = [] }: {
  locId: string,
  connections: LocationData['connections'],
  onChange: (c: LocationData['connections']) => void,
  onSave?: () => void,
  availableLocations?: LocationOption[]
}) => {
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

  // Фильтруем локации: исключаем текущую
  const filteredLocations = availableLocations.filter(loc => loc.id !== locId);

  return (
    <div className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-800">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold text-gray-500">CONNECTIONS</span>
        <button type="button" onClick={addConnection} className="text-[10px] text-purple-400 font-bold">+ ADD</button>
      </div>
      {connections.map((conn, idx) => (
        <div key={idx} className="flex gap-1 mb-1">
          <select
            className="flex-1 bg-gray-950 border border-gray-800 text-[10px] px-1 py-1 text-gray-300"
            value={conn.targetLocationId}
            onChange={(e) => updateConnection(idx, 'targetLocationId', e.target.value)}
          >
            <option value="" className="text-gray-500">Выберите локацию...</option>
            {filteredLocations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.id})
              </option>
            ))}
          </select>
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
  const add = () => onChange([...data, { id: `loc_${Date.now()}`, name: 'New Loc', description: '', currentSituation: '', connections: [], attributes: {} }]);
  return (
    <div className="p-4">
      <button type="button" onClick={add} className="w-full py-1 mb-3 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW LOCATION</button>
      {data.map((item, i) => (
        <ListItem key={i} id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== i))}>
          <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[i].name = v; onChange(n); }} onSave={onSave} />
          <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[i].id = v; onChange(n); }} onSave={onSave} />
          <TextAreaField label="Description" value={item.description} onChange={(v: string) => { const n = [...data]; n[i].description = v; onChange(n); }} onSave={onSave} />
          <TextAreaField label="Situation" value={item.currentSituation} onChange={(v: string) => { const n = [...data]; n[i].currentSituation = v; onChange(n); }} onSave={onSave} />
          <AttributesEditor attributes={item.attributes || {}} onChange={(attrs) => { const n = [...data]; n[i].attributes = attrs; onChange(n); }} onSave={onSave} />
          <ConnectionEditor
            locId={item.id}
            connections={item.connections}
            onChange={(c) => { const n = [...data]; n[i].connections = c; onChange(n); }}
            onSave={onSave}
            availableLocations={data.map(loc => ({ id: loc.id, name: loc.name }))}
          />
        </ListItem>
      ))}
    </div>
  );
};

export const PlayersEditor: React.FC<{
  data: PlayerData[];
  onChange: (d: PlayerData[]) => void;
  onSave?: () => void;
  availableLocations?: LocationOption[];
}> = ({ data, onChange, onSave, availableLocations = [] }) => {
  const add = () => onChange([...data, { id: `char_${Date.now()}`, name: 'New Char', description: '', locationId: '', attributes: {} }]);

  // Преобразуем локации в опции для SelectField
  const locationOptions: SelectOption[] = availableLocations.map(loc => ({
    id: loc.id,
    label: `${loc.name} (${loc.id})`,
    group: '📍 Локации'
  }));

  return (
    <div className="p-4">
      <button type="button" onClick={add} className="w-full py-1 mb-3 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW PLAYER</button>
      {data.map((item, i) => (
        <ListItem key={i} id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== i))}>
          <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[i].name = v; onChange(n); }} onSave={onSave} />
          <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[i].id = v; onChange(n); }} onSave={onSave} />
          <TextAreaField label="Description" value={item.description} onChange={(v: string) => { const n = [...data]; n[i].description = v; onChange(n); }} onSave={onSave} />
          <AttributesEditor attributes={item.attributes || {}} onChange={(attrs) => { const n = [...data]; n[i].attributes = attrs; onChange(n); }} onSave={onSave} />
          <SelectField
            label="Location"
            value={item.locationId}
            onChange={(v: string) => { const n = [...data]; n[i].locationId = v; onChange(n); }}
            options={locationOptions}
            placeholder="Выберите локацию..."
            onSave={onSave}
          />
        </ListItem>
      ))}
    </div>
  );
};

export interface ConnectionTarget {
  id: string;
  name: string;
  type: 'player' | 'location' | 'object';
}

export const ObjectsEditor: React.FC<{
  data: ObjectData[];
  onChange: (d: ObjectData[]) => void;
  onUpdatePlayers?: (d: PlayerData[]) => void;
  onSave?: () => void;
  connectionTargets?: ConnectionTarget[];
  locations?: LocationData[];
  players?: PlayerData[];
}> = ({ data, onChange, onUpdatePlayers, onSave, connectionTargets = [], locations = [], players = [] }) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    const newSet = new Set(collapsedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCollapsedIds(newSet);
  };

  const add = () => onChange([...data, { id: `obj_${Date.now()}`, name: 'New Obj', connectionId: '', attributes: {} }]);

  // --- Map Building ---
  const connectionTargetMap = new Map(connectionTargets.map(t => [t.id, t]));
  const objectsMap = new Map<string, ObjectData>(data.map(obj => [obj.id, obj]));
  const playersMap = new Map<string, PlayerData>(players.map(p => [p.id, p]));

  // --- Hierarchy Logic ---
  const getChildren = (parentId: string): { type: 'object' | 'player', data: ObjectData | PlayerData }[] => {
    const children: { type: 'object' | 'player', data: ObjectData | PlayerData }[] = [];
    data.forEach(obj => {
      if (obj.connectionId === parentId) children.push({ type: 'object', data: obj });
    });
    players.forEach(p => {
      if (p.connectionId === parentId) children.push({ type: 'player', data: p });
    });
    return children;
  };

  const sortEntities = (items: { type: 'object' | 'player', data: ObjectData | PlayerData }[]) => {
    return [...items].sort((a, b) => {
      const nameA = (a.data.name || '').toLowerCase();
      const nameB = (b.data.name || '').toLowerCase();
      const cmp = nameA.localeCompare(nameB, 'ru');
      if (cmp !== 0) return cmp;
      if (a.type === 'player' && b.type !== 'player') return -1;
      if (a.type !== 'player' && b.type === 'player') return 1;
      return 0;
    });
  };

  // --- Data Preparation ---
  const rootItems: { type: 'object' | 'player', data: ObjectData | PlayerData }[] = [];
  const ungroupedItems: { type: 'object' | 'player', data: ObjectData | PlayerData }[] = [];

  data.forEach(obj => {
    if (!obj.connectionId) { ungroupedItems.push({ type: 'object', data: obj }); return; }
    const target = connectionTargetMap.get(obj.connectionId);
    if (!target) { ungroupedItems.push({ type: 'object', data: obj }); return; }

    if (target.type === 'location') {
      rootItems.push({ type: 'object', data: obj });
    }
  });

  players.forEach(p => {
    if (!p.connectionId) { ungroupedItems.push({ type: 'player', data: p }); return; }
    const target = connectionTargetMap.get(p.connectionId);
    if (!target) { ungroupedItems.push({ type: 'player', data: p }); return; }

    if (target.type === 'location') {
      rootItems.push({ type: 'player', data: p });
    }
  });

  const groupedRootItems = new Map<string, { type: 'object' | 'player', data: ObjectData | PlayerData }[]>();
  rootItems.forEach(item => {
    const parentId = item.data.connectionId;
    if (!groupedRootItems.has(parentId)) groupedRootItems.set(parentId, []);
    groupedRootItems.get(parentId)!.push(item);
  });

  const sortedUngrouped = sortEntities(ungroupedItems);

  const displayGroups = Array.from(groupedRootItems.keys())
    .map(connectionId => {
      const target = connectionTargetMap.get(connectionId);
      let icon = '❓';
      if (target?.type === 'location') icon = '📍';
      else if (target?.type === 'player') icon = '👤';
      else if (target?.type === 'object') icon = '📦';

      return {
        id: connectionId,
        name: target?.name || connectionId,
        icon: icon,
        items: sortEntities(groupedRootItems.get(connectionId)!)
      };
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // --- Hierarchy Options ---
  const getHierarchyInfo = (targetId: string, visited = new Set<string>()): { path: string[] } => {
    if (visited.has(targetId)) return { path: [] };
    visited.add(targetId);
    const target = connectionTargetMap.get(targetId);
    if (!target) return { path: [targetId] };
    if (target.type === 'location') return { path: [targetId] };

    let parentId: string | undefined;
    if (target.type === 'object') parentId = objectsMap.get(targetId)?.connectionId;
    else if (target.type === 'player') parentId = playersMap.get(targetId)?.connectionId;

    if (parentId) return { path: [...getHierarchyInfo(parentId, new Set(visited)).path, targetId] };
    return { path: [targetId] };
  };

  const hierarchyOptions: HierarchyOption[] = [];
  const itemsByGroup: Record<string, typeof connectionTargets> = { '📍 Locations': [], '👤 Players': [] };
  const connectedContainerGroups: Record<string, typeof connectionTargets> = {};
  const unconnectedContainers: typeof connectionTargets = [];

  connectionTargets.forEach(t => {
    if (t.type === 'location') { itemsByGroup['📍 Locations'].push(t); return; }

    let connectionId: string | undefined;
    if (t.type === 'object') connectionId = objectsMap.get(t.id)?.connectionId;
    if (t.type === 'player') connectionId = playersMap.get(t.id)?.connectionId;

    if (!connectionId) {
      if (t.type === 'player') itemsByGroup['👤 Players'].push(t);
      else unconnectedContainers.push(t);
      return;
    }

    const info = getHierarchyInfo(t.id);
    const rootId = info.path[0];
    const rootTarget = connectionTargetMap.get(rootId);

    if (!rootTarget) { unconnectedContainers.push(t); return; }

    if (rootTarget.type === 'location') {
      const groupName = `📍 ${rootTarget.name}`;
      if (!connectedContainerGroups[groupName]) connectedContainerGroups[groupName] = [];
      connectedContainerGroups[groupName].push(t);
    } else if (rootTarget.type === 'player') {
      if (rootTarget.id === t.id) itemsByGroup['👤 Players'].push(t);
      else {
        const groupName = `👤 ${rootTarget.name}`;
        if (!connectedContainerGroups[groupName]) connectedContainerGroups[groupName] = [];
        connectedContainerGroups[groupName].push(t);
      }
    } else {
      if (rootTarget.id === t.id) unconnectedContainers.push(t);
      else {
        const groupName = `📦 ${rootTarget.name}`;
        if (!connectedContainerGroups[groupName]) connectedContainerGroups[groupName] = [];
        connectedContainerGroups[groupName].push(t);
      }
    }
  });

  const addGroup = (groupName: string, items: typeof connectionTargets) => {
    if (items.length === 0) return;
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    hierarchyOptions.push({ id: `group-${groupName}`, path: [], isGroupHeader: true, groupName });
    items.forEach(item => {
      const pathIds = getHierarchyInfo(item.id).path;
      const path = pathIds.map(id => {
        const t = connectionTargetMap.get(id);
        return { id: id, name: t?.name || id, type: t?.type || '?' };
      });
      hierarchyOptions.push({ id: item.id, path });
    });
  };

  addGroup('📍 Locations', itemsByGroup['📍 Locations']);
  addGroup('👤 Players', itemsByGroup['👤 Players']);
  Object.keys(connectedContainerGroups).sort().forEach(g => addGroup(g, connectedContainerGroups[g]));
  addGroup('📦 Unconnected', unconnectedContainers);

  // --- Handlers ---
  const findRootLocation = (entityId: string): string | undefined => {
    let currentId = entityId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) return undefined; // Cycle detected
      visited.add(currentId);

      // Check if it's a location
      const loc = locations.find(l => l.id === currentId);
      if (loc) return loc.id;

      // Check if it's an object
      const obj = objectsMap.get(currentId);
      if (obj) {
        currentId = obj.connectionId;
        continue;
      }

      // Check if it's a player
      const player = playersMap.get(currentId);
      if (player) {
        currentId = player.connectionId;
        continue;
      }

      // Dead end
      return undefined;
    }
    return undefined;
  };

  const handleDrop = (draggedId: string, targetId: string) => {
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) return;

    const targetHierarchy = getHierarchyInfo(targetId);
    if (targetHierarchy.path.includes(draggedId)) {
      alert(`Cannot drop into its own descendant!`);
      return;
    }

    let isPlayer = false;
    let draggedItem = data.find(o => o.id === draggedId);
    if (!draggedItem) {
      const draggedPlayer = players.find(p => p.id === draggedId);
      if (draggedPlayer) {
        isPlayer = true;
        if (onUpdatePlayers) {
          const newPlayers = [...players];
          const pIndex = newPlayers.findIndex(p => p.id === draggedId);
          if (pIndex !== -1) {
            // Calculate locationId by traversing up from targetId
            const rootLocationId = findRootLocation(targetId);
            newPlayers[pIndex] = {
              ...newPlayers[pIndex],
              connectionId: targetId,
              locationId: rootLocationId
            };
            onUpdatePlayers(newPlayers);
          }
        }
      }
    } else {
      const newObjects = [...data];
      const oIndex = newObjects.findIndex(o => o.id === draggedId);
      if (oIndex !== -1) {
        newObjects[oIndex] = { ...newObjects[oIndex], connectionId: targetId };
        onChange(newObjects);
      }
    }
    if (onSave) setTimeout(onSave, 100);
  };

  const renderEntity = (item: { type: 'object' | 'player', data: ObjectData | PlayerData }, depth: number = 0) => {
    const isPlayer = item.type === 'player';
    const id = item.data.id;
    const name = item.data.name;
    const children = getChildren(id);
    const sortedChildren = sortEntities(children);

    const handleDelete = () => {
      if (isPlayer) {
        if (confirm(`Delete player ${name}?`)) {
          if (onUpdatePlayers) onUpdatePlayers(players.filter(p => p.id !== id));
        }
      } else {
        const newObjects = deleteObjectWithChildren(data, id, locations, players);
        onChange(newObjects);
      }
      if (onSave) onSave();
    };

    const isDragOver = dragOverId === id;
    const hasChildren = sortedChildren.length > 0;
    const isCollapsed = collapsedIds.has(id);

    const renderEditor = () => {
      if (isPlayer) {
        const p = item.data as PlayerData;
        return (
          <div>
            <div className="flex gap-2 mb-2">
              <div className="bg-purple-900/40 text-purple-200 text-[10px] px-2 py-0.5 rounded border border-purple-500/30 font-bold uppercase tracking-wider">
                👤 Player
              </div>
            </div>
            <InputField
              label="Name"
              value={p.name}
              onChange={(v: string) => {
                if (!onUpdatePlayers) return;
                const newP = [...players];
                const idx = newP.findIndex(x => x.id === id);
                if (idx !== -1) { newP[idx].name = v; onUpdatePlayers(newP); }
              }}
              onSave={onSave}
            />
            <InputField
              label="ID"
              value={p.id}
              onChange={(v: string) => {
                if (!onUpdatePlayers) return;
                const newP = [...players];
                const idx = newP.findIndex(x => x.id === id);
                if (idx !== -1) { newP[idx].id = v; onUpdatePlayers(newP); }
              }}
              onSave={onSave}
            />
            <HierarchySelect
              label="Connected To"
              value={p.connectionId}
              onChange={(v: string) => {
                if (!onUpdatePlayers) return;
                const newP = [...players];
                const idx = newP.findIndex(x => x.id === id);
                if (idx !== -1) { newP[idx].connectionId = v; onUpdatePlayers(newP); }
              }}
              options={hierarchyOptions.filter(opt => opt.id !== id)}
            />
          </div>
        );
      } else {
        const o = item.data as ObjectData;
        return (
          <>
            <InputField
              label="Name"
              value={o.name}
              onChange={(v: string) => {
                const newO = [...data];
                const idx = newO.findIndex(x => x.id === id);
                if (idx !== -1) { newO[idx].name = v; onChange(newO); }
              }}
              onSave={onSave}
            />
            <InputField
              label="ID"
              value={o.id}
              onChange={(v: string) => {
                const newO = [...data];
                const idx = newO.findIndex(x => x.id === id);
                if (idx !== -1) { newO[idx].id = v; onChange(newO); }
              }}
              onSave={onSave}
            />
            <AttributesEditor
              attributes={o.attributes || {}}
              onChange={(attrs) => {
                const newO = [...data];
                const idx = newO.findIndex(x => x.id === id);
                if (idx !== -1) { newO[idx].attributes = attrs; onChange(newO); }
              }}
              onSave={onSave}
            />
            <HierarchySelect
              label="Connected To"
              value={o.connectionId}
              onChange={(v: string) => {
                const newO = [...data];
                const idx = newO.findIndex(x => x.id === id);
                if (idx !== -1) { newO[idx].connectionId = v; onChange(newO); }
              }}
              options={hierarchyOptions.filter(opt => opt.id !== id)}
              placeholder="Выберите владельца/контейнер..."
            />
          </>
        );
      }
    };

    return (
      <div
        key={id}
        className={`${depth > 0 ? `ml-4 border-l-2 ${isDragOver ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700'} pl-2` : isDragOver ? 'bg-purple-900/20 rounded' : ''} transition-colors duration-200 mt-1`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', id);
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOverId(id);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragOverId === id) setDragOverId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedId = e.dataTransfer.getData('text/plain');
          handleDrop(draggedId, id);
        }}
      >
        <div className="flex items-start gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
              className="mt-2 w-4 h-4 flex-shrink-0 flex items-center justify-center text-[10px] text-gray-400 hover:text-white bg-gray-900 border border-gray-700 rounded transition-colors"
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : (
            <div className="w-4 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <ListItem id={id} name={`${isPlayer ? '👤 ' : '📦 '}${name}`} onDelete={handleDelete}>
              {renderEditor()}
            </ListItem>

            {hasChildren && !isCollapsed && (
              <div className="mt-1">
                {sortedChildren.map(child => renderEntity(child, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 p-4 pb-2 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800">
        <button type="button" onClick={add} className="w-full py-1 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW OBJECT</button>
      </div>

      <div className="p-4 pt-2">
        {sortedUngrouped.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
              📦/👤 Без связи / В корне
            </div>
            {sortedUngrouped.map(item => renderEntity(item, 0))}
          </div>
        )}

        {displayGroups.map(({ id: connectionId, name: connectionName, icon, items }) => {
          const isGroupDragOver = dragOverId === connectionId;
          const isGroupCollapsed = collapsedIds.has(connectionId);

          return (
            <div
              key={connectionId}
              className={`mb-4 rounded p-1 transition-colors ${isGroupDragOver ? 'bg-purple-900/30 ring-2 ring-purple-500/50' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(connectionId);
              }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                handleDrop(draggedId, connectionId);
              }}
            >
              <div
                className="flex items-center gap-2 mb-2 px-1 cursor-pointer hover:bg-gray-800/50 rounded py-1"
                onClick={() => toggleCollapse(connectionId)}
              >
                <span className="text-purple-400 text-[10px]">{isGroupCollapsed ? '▶' : '▼'}</span>
                <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider pointer-events-none">
                  {icon} {connectionName} <span className="text-gray-600 ml-1">({items.length})</span>
                </div>
              </div>
              {!isGroupCollapsed && items.map(item => renderEntity(item, 0))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
