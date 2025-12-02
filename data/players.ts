import { PlayerData } from '../types';

export const INITIAL_PLAYERS: PlayerData[] = [
  {
    "id": "char_001",
    "name": "Джек 'Волк' Картер",
    "description": "Седой детектив с кибернетическим глазом. Циничный, но эффективный.",
    "locationId": "loc_001",
    "attributes": {
      "health": "уставший и голодный, но способен действовать",
      "condition": "ранен в плечо, но рана не критична"
    }
  },
  {
    "id": "char_1764641742185",
    "name": "Хромой Пью",
    "description": "Старый друг Джека. Бывалый детектив. Не в лучшей кондиции, но с острым умом. ",
    "locationId": "loc_001",
    "attributes": {
      "health": "в хорошей форме",
      "condition": "готов к действию"
    }
  }
];
