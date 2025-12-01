import { GameState } from './types';
import { INITIAL_WORLD } from './data/world';
import { INITIAL_LOCATIONS } from './data/locations';
import { INITIAL_PLAYERS } from './data/players';
import { INITIAL_OBJECTS } from './data/objects';

export const INITIAL_STATE: GameState = {
  world: INITIAL_WORLD,
  locations: INITIAL_LOCATIONS,
  players: INITIAL_PLAYERS,
  objects: INITIAL_OBJECTS
};