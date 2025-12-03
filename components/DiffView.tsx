import React from 'react';
import { GameState } from '../types';

interface DiffViewProps {
  oldState: GameState;
  newState: GameState;
}

const DiffView: React.FC<DiffViewProps> = ({ oldState, newState }) => {
  // A very basic object comparison for visualization
  const getDiffs = () => {
    const changes: React.ReactNode[] = [];

    // Compare objects
    // Сначала проверяем новые и измененные объекты
    newState.objects.forEach(newObj => {
      const oldObj = oldState.objects.find(o => o.id === newObj.id);
      if (!oldObj) {
        changes.push(<div key={`new-obj-${newObj.id}`} className="text-green-400">+ New Object: {newObj.name}</div>);
      } else {
        // Compare attributes
        const oldAttrs = oldObj.attributes || {};
        const newAttrs = newObj.attributes || {};
        const allAttrKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
        allAttrKeys.forEach(attrKey => {
          if (oldAttrs[attrKey] !== newAttrs[attrKey]) {
            const isDeleted = oldAttrs[attrKey] !== undefined && newAttrs[attrKey] === undefined;
          changes.push(
              <div key={`obj-attr-${newObj.id}-${attrKey}`} className="mb-1">
                <span className="text-blue-400 font-bold">Object {newObj.name} {attrKey}:</span> 
                <span className="text-red-400 line-through mx-2">{oldAttrs[attrKey] || '(нет)'}</span>
              <span className="text-gray-500">→</span>
                {isDeleted ? (
                  <span className="text-red-500 mx-2 font-bold">[УДАЛЕНО]</span>
                ) : (
                  <span className="text-green-400 mx-2">{newAttrs[attrKey] || '(нет)'}</span>
                )}
            </div>
          );
        }
        });
        if (oldObj.connectionId !== newObj.connectionId) {
           changes.push(
            <div key={`obj-loc-${newObj.id}`} className="mb-1">
              <span className="text-blue-400 font-bold">Object {newObj.name} Location:</span> 
              <span className="text-red-400 line-through mx-2">{oldObj.connectionId}</span>
              <span className="text-gray-500">→</span>
              <span className="text-green-400 mx-2">{newObj.connectionId}</span>
            </div>
          );
        }
      }
    });
    
    // Проверяем удаленные объекты
    oldState.objects.forEach(oldObj => {
      const newObj = newState.objects.find(o => o.id === oldObj.id);
      if (!newObj) {
        changes.push(<div key={`deleted-obj-${oldObj.id}`} className="text-red-500">- Deleted Object: {oldObj.name}</div>);
      }
    });

    // Compare Players
    newState.players.forEach(newPl => {
      const oldPl = oldState.players.find(p => p.id === newPl.id);
      if (oldPl) {
        // Compare attributes
        const oldAttrs = oldPl.attributes || {};
        const newAttrs = newPl.attributes || {};
        const allAttrKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
        allAttrKeys.forEach(attrKey => {
          if (oldAttrs[attrKey] !== newAttrs[attrKey]) {
            const isDeleted = oldAttrs[attrKey] !== undefined && newAttrs[attrKey] === undefined;
        changes.push(
              <div key={`pl-attr-${newPl.id}-${attrKey}`} className="mb-1">
                <span className="text-yellow-400 font-bold">Player {newPl.name} {attrKey}:</span> 
                <span className="text-red-400 line-through mx-2">{oldAttrs[attrKey] || '(нет)'}</span>
              <span className="text-gray-500">→</span>
                {isDeleted ? (
                  <span className="text-red-500 mx-2 font-bold">[УДАЛЕНО]</span>
                ) : (
                  <span className="text-green-400 mx-2">{newAttrs[attrKey] || '(нет)'}</span>
                )}
            </div>
          );
          }
        });
      }
    });
    
    // Проверяем удаленных игроков
    oldState.players.forEach(oldPl => {
      const newPl = newState.players.find(p => p.id === oldPl.id);
      if (!newPl) {
        changes.push(<div key={`deleted-player-${oldPl.id}`} className="text-red-500">- Deleted Player: {oldPl.name}</div>);
      }
    });

    // Compare Locations
    newState.locations.forEach(newLoc => {
        const oldLoc = oldState.locations.find(l => l.id === newLoc.id);
        if (oldLoc) {
          // Compare attributes
          const oldAttrs = oldLoc.attributes || {};
          const newAttrs = newLoc.attributes || {};
          const allAttrKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);
          allAttrKeys.forEach(attrKey => {
            if (oldAttrs[attrKey] !== newAttrs[attrKey]) {
              const isDeleted = oldAttrs[attrKey] !== undefined && newAttrs[attrKey] === undefined;
          changes.push(
                <div key={`loc-attr-${newLoc.id}-${attrKey}`} className="mb-1">
                  <span className="text-purple-400 font-bold">Location {newLoc.name} {attrKey}:</span> 
                  <span className="text-red-400 line-through mx-2">{oldAttrs[attrKey] || '(нет)'}</span>
                <span className="text-gray-500">→</span>
                  {isDeleted ? (
                    <span className="text-red-500 mx-2 font-bold">[УДАЛЕНО]</span>
                  ) : (
                    <span className="text-green-400 mx-2">{newAttrs[attrKey] || '(нет)'}</span>
                  )}
              </div>
            );
            }
          });
        }
      });
    
    // Проверяем удаленные локации
    oldState.locations.forEach(oldLoc => {
      const newLoc = newState.locations.find(l => l.id === oldLoc.id);
      if (!newLoc) {
        changes.push(<div key={`deleted-location-${oldLoc.id}`} className="text-red-500">- Deleted Location: {oldLoc.name}</div>);
        }
      });

    if (changes.length === 0) {
      return <div className="text-gray-500 italic">No structural data changes detected.</div>;
    }

    return changes;
  };

  return (
    <div className="bg-black bg-opacity-30 rounded p-4 border border-gray-700 font-mono text-sm h-full overflow-y-auto">
        <h4 className="text-gray-400 text-xs uppercase mb-3 border-b border-gray-700 pb-2">Data Diffs</h4>
      {getDiffs()}
    </div>
  );
};

export default DiffView;
