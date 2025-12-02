import { GameState, PlayerData, ObjectData, LocationData } from '../types';

export const cloneState = (state: GameState): GameState => {
  return JSON.parse(JSON.stringify(state));
};

/**
 * Нормализует состояние игры, гарантируя, что все сущности имеют инициализированный attributes.
 * Используется при загрузке данных из localStorage или при парсинге JSON.
 */
export const normalizeState = (state: GameState): GameState => {
  return {
    ...state,
    players: state.players.map((p: PlayerData) => ({
      ...p,
      attributes: p.attributes || {}
    })),
    objects: state.objects.map((o: ObjectData) => ({
      ...o,
      attributes: o.attributes || {}
    })),
    locations: state.locations.map((l: LocationData) => ({
      ...l,
      attributes: l.attributes || {}
    }))
  };
};
