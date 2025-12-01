import { GameState } from '../types';

export const cloneState = (state: GameState): GameState => {
  return JSON.parse(JSON.stringify(state));
};
