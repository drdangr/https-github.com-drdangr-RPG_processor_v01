import { LocationData } from '../types';

export const INITIAL_LOCATIONS: LocationData[] = [
    {
      id: "loc_001",
      name: "Офис детектива",
      description: "Тесный, прокуренный офис с жалюзи, которые не открывались годами.",
      currentSituation: "Тихо, пылинки танцуют в свете мерцающей неоновой вывески снаружи.",
      state: "Беспорядок после недавней драки",
      connections: [
        { targetLocationId: "loc_002", type: "out" }
      ]
    },
    {
      id: "loc_002",
      name: "Улица: Хромовая Аллея",
      description: "Мокрая мощеная улица, отражающая голографическую рекламу сверху.",
      currentSituation: "Оживленное движение зависимых от имплантов.",
      state: "Скользко от кислотного дождя",
      connections: [
        { targetLocationId: "loc_001", type: "in" }
      ]
    }
  ];