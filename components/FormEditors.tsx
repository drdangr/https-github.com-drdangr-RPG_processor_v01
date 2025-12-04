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

// --- Types ---

export interface LocationOption {
  id: string;
  name: string;
}

// --- Editors ---

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
  onSave?: () => void;
  connectionTargets?: ConnectionTarget[];
}> = ({ data, onChange, onSave, connectionTargets = [] }) => {
  const add = () => onChange([...data, { id: `obj_${Date.now()}`, name: 'New Obj', connectionId: '', attributes: {} }]);
  
  // Создаем карту всех connectionTargets для быстрого поиска названий
  const connectionTargetMap = new Map(connectionTargets.map(t => [t.id, t]));
  
  // Создаем карту объектов по ID для быстрого поиска
  const objectsMap = new Map(data.map(obj => [obj.id, obj]));
  
  // Находим корневые объекты (подключены к локациям или игрокам) и объекты без связи
  const rootObjects: ObjectData[] = [];
  const ungroupedObjects: ObjectData[] = [];
  const objectsByParent = new Map<string, ObjectData[]>();
  
  data.forEach(obj => {
    if (!obj.connectionId) {
      ungroupedObjects.push(obj);
    } else {
      const target = connectionTargetMap.get(obj.connectionId);
      if (target && (target.type === 'location' || target.type === 'player')) {
        // Это корневой объект (подключен к локации или игроку)
        rootObjects.push(obj);
      } else {
        // Это вложенный объект (подключен к другому объекту)
        const parentId = obj.connectionId;
        if (!objectsByParent.has(parentId)) {
          objectsByParent.set(parentId, []);
        }
        objectsByParent.get(parentId)!.push(obj);
      }
    }
  });
  
  // Функция для получения всех дочерних объектов рекурсивно
  const getChildren = (parentId: string): ObjectData[] => {
    return objectsByParent.get(parentId) || [];
  };
  
  // Функция для сортировки объектов: объекты с именем "New Obj" вверху, затем по алфавиту
  const sortObjects = (objects: ObjectData[]) => {
    return [...objects].sort((a, b) => {
      const aIsNew = (a.name || '').trim() === 'New Obj';
      const bIsNew = (b.name || '').trim() === 'New Obj';
      
      // Если один новый, а другой нет - новый идет первым
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      
      // Если оба новые или оба заполненные - сортируем по алфавиту
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'ru');
    });
  };
  
  // Сортируем корневые объекты
  const sortedRootObjects = sortObjects(rootObjects);
  
  // Сортируем объекты без связи
  const sortedUngroupedObjects = sortObjects(ungroupedObjects);
  
  // Сортируем дочерние объекты для каждого родителя
  objectsByParent.forEach((children, parentId) => {
    objectsByParent.set(parentId, sortObjects(children));
  });
  
  // Группируем корневые объекты по их connectionId (локация/игрок)
  const groupedByRoot = new Map<string, ObjectData[]>();
  sortedRootObjects.forEach(obj => {
    if (obj.connectionId) {
      if (!groupedByRoot.has(obj.connectionId)) {
        groupedByRoot.set(obj.connectionId, []);
      }
      groupedByRoot.get(obj.connectionId)!.push(obj);
    }
  });
  
  // Сортируем объекты внутри каждой группы (новые объекты вверху)
  groupedByRoot.forEach((objects, connectionId) => {
    groupedByRoot.set(connectionId, sortObjects(objects));
  });
  
  // Сортируем группы по названию локации/игрока
  const sortedGroups = Array.from(groupedByRoot.keys())
    .map(connectionId => {
      const target = connectionTargetMap.get(connectionId);
      const icon = target?.type === 'player' ? '👤' : '📍';
      return {
        id: connectionId,
        name: target?.name || connectionId,
        icon: icon,
        objects: groupedByRoot.get(connectionId)!
      };
    })
    .sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'ru');
    });
  
  // Преобразуем targets в опции для SelectField и сортируем по алфавиту
  const connectionOptions: SelectOption[] = connectionTargets
    .map(t => ({
      id: t.id,
      label: `${t.name} (${t.id})`,
      group: t.type === 'player' ? '👤 Игроки' : t.type === 'location' ? '📍 Локации' : '📦 Объекты'
    }))
    .sort((a, b) => {
      const labelA = (a.label || '').toLowerCase();
      const labelB = (b.label || '').toLowerCase();
      return labelA.localeCompare(labelB, 'ru');
    });

  // Рекурсивная функция для рендеринга объекта и его вложенных объектов
  const renderObjectWithChildren = (item: ObjectData, depth: number = 0) => {
    const originalIndex = data.findIndex(obj => obj.id === item.id);
    const children = getChildren(item.id);
    const sortedChildren = sortObjects(children);
    
    return (
      <div key={item.id} className={depth > 0 ? `ml-4 border-l-2 border-gray-700 pl-2` : ''}>
        <ListItem id={item.id} name={item.name} onDelete={() => onChange(data.filter((_, idx) => idx !== originalIndex))}>
           <InputField label="Name" value={item.name} onChange={(v: string) => { const n = [...data]; n[originalIndex].name = v; onChange(n); }} onSave={onSave} />
           <InputField label="ID" value={item.id} onChange={(v: string) => { const n = [...data]; n[originalIndex].id = v; onChange(n); }} onSave={onSave} />
           <AttributesEditor attributes={item.attributes || {}} onChange={(attrs) => { const n = [...data]; n[originalIndex].attributes = attrs; onChange(n); }} onSave={onSave} />
           <SelectField 
             label="Connected To" 
             value={item.connectionId} 
             onChange={(v: string) => { const n = [...data]; n[originalIndex].connectionId = v; onChange(n); }} 
             options={connectionOptions.filter(opt => opt.id !== item.id)} 
             placeholder="Выберите владельца/контейнер..."
             onSave={onSave} 
           />
        </ListItem>
        {/* Рекурсивно рендерим дочерние объекты */}
        {sortedChildren.length > 0 && (
          <div className="mt-1">
            {sortedChildren.map(child => renderObjectWithChildren(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Фиксированная кнопка сверху */}
      <div className="sticky top-0 z-10 p-4 pb-2 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800">
        <button type="button" onClick={add} className="w-full py-1 border border-gray-700 text-gray-400 text-xs rounded hover:bg-gray-800">+ NEW OBJECT</button>
      </div>
      
      {/* Контент с отступом */}
      <div className="p-4 pt-2">
        {/* Объекты без связи - в начале */}
        {sortedUngroupedObjects.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
              📦 Без связи
            </div>
            {sortedUngroupedObjects.map(obj => renderObjectWithChildren(obj, 0))}
          </div>
        )}
        
        {/* Группы по Connected To */}
        {sortedGroups.map(({ id: connectionId, name: connectionName, icon, objects }) => (
          <div key={connectionId} className="mb-4">
            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2 px-1">
              {icon} {connectionName}
            </div>
            {objects.map(obj => renderObjectWithChildren(obj, 0))}
          </div>
        ))}
      </div>
    </div>
  );
};
