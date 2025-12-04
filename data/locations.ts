import { LocationData } from '../types';

export const INITIAL_LOCATIONS: LocationData[] = [
  {
    "id": "loc_001",
    "name": "Офис детектива",
    "description": "Тесный, прокуренный офис с жалюзи, которые не открывались годами.",
    "currentSituation": "Тихо, пылинки танцуют в свете мерцающей неоновой вывески снаружи.",
    "connections": [
      {
        "targetLocationId": "loc_002",
        "type": "out"
      }
    ],
    "attributes": {
      "state": "беспорядок после недавней драки",
      "safety": "относительно безопасно",
      "состояние стены": "на стене выстреляно сердце из пулевых отверстий"
    }
  },
  {
    "id": "loc_002",
    "name": "Улица: Хромовая Аллея",
    "description": "Мокрая мощеная улица, отражающая голографическую рекламу сверху.",
    "currentSituation": "Оживленное движение зависимых от имплантов.",
    "connections": [
      {
        "targetLocationId": "loc_001",
        "type": "bidirectional"
      }
    ],
    "attributes": {
      "state": "скользко от кислотного дождя",
      "safety": "опасно, стоит быть настороже",
      "time of day": "ранний вечер"
    }
  },
  {
    "id": "loc_1764698263182",
    "name": "Библиотека",
    "description": "Старая библиотека с кучей книг.",
    "currentSituation": "Очень тихо в воздухе  пыль.",
    "connections": [
      {
        "targetLocationId": "loc_001",
        "type": "bidirectional"
      }
    ],
    "attributes": {}
  }
];
