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
    newState.objects.forEach(newObj => {
      const oldObj = oldState.objects.find(o => o.id === newObj.id);
      if (!oldObj) {
        changes.push(<div key={`new-obj-${newObj.id}`} className="text-green-400">+ New Object: {newObj.name}</div>);
      } else {
        if (oldObj.state !== newObj.state) {
          changes.push(
            <div key={`obj-state-${newObj.id}`} className="mb-1">
              <span className="text-blue-400 font-bold">Object {newObj.name} State:</span> 
              <span className="text-red-400 line-through mx-2">{oldObj.state}</span>
              <span className="text-gray-500">→</span>
              <span className="text-green-400 mx-2">{newObj.state}</span>
            </div>
          );
        }
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

    // Compare Players
    newState.players.forEach(newPl => {
      const oldPl = oldState.players.find(p => p.id === newPl.id);
      if(oldPl && oldPl.state !== newPl.state) {
        changes.push(
            <div key={`pl-state-${newPl.id}`} className="mb-1">
              <span className="text-yellow-400 font-bold">Player {newPl.name} State:</span> 
              <span className="text-red-400 line-through mx-2">{oldPl.state}</span>
              <span className="text-gray-500">→</span>
              <span className="text-green-400 mx-2">{newPl.state}</span>
            </div>
          );
      }
    });

    // Compare Locations
    newState.locations.forEach(newLoc => {
        const oldLoc = oldState.locations.find(l => l.id === newLoc.id);
        if(oldLoc && oldLoc.state !== newLoc.state) {
          changes.push(
              <div key={`loc-state-${newLoc.id}`} className="mb-1">
                <span className="text-purple-400 font-bold">Location {newLoc.name} State:</span> 
                <span className="text-red-400 line-through mx-2">{oldLoc.state}</span>
                <span className="text-gray-500">→</span>
                <span className="text-green-400 mx-2">{newLoc.state}</span>
              </div>
            );
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
