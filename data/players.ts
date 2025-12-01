import { PlayerData } from '../types';

export const INITIAL_PLAYERS: PlayerData[] = [
    {
      id: "char_001",
      name: "Джек 'Волк' Картер",
      description: "Седой детектив с кибернетическим глазом. Циничный, но эффективный.",
      inventory: ["obj_001", "obj_002"],
      health: 80,
      state: "Уставший и голодный",
      locationId: "loc_001"
    }
  ];