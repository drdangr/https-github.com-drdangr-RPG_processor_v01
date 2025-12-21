import { ObjectData } from '../types';

export const INITIAL_OBJECTS: ObjectData[] = [
  {
    "id": "obj_001",
    "name": "Револьвер",
    "connectionId": "char_001",
    "attributes": {
      "condition": "заряжен пятью патронами",
      "durability": "старый, но надежный",
      "type": "кинетическая ручная пушка",
      "capacity": "шестизарядная",
      "caliber": "крупного калибра",
      "style": "старая школа"
    }
  },
  {
    "id": "obj_1764693090407",
    "name": "Сундук",
    "connectionId": "loc_1764698263182",
    "attributes": {
      "condition": "открыт и пуст, ключ вошел в замок и повернулся",
      "feature": "имеет отверстие для ключа"
    }
  },
  {
    "id": "obj_1764816249204",
    "name": "Кресло",
    "connectionId": "loc_001",
    "attributes": {
      "condition": "старое, но еще крепкое",
      "description": "кожаное кресло, в котором любит лидеть Джек"
    }
  },
  {
    "id": "obj_1764817473286",
    "name": "Письменный стол",
    "connectionId": "loc_001",
    "attributes": {
      "positioning": "в центре кабинета",
      "description": "массивный дубовый стол"
    }
  },
  {
    "id": "obj_1764821654183",
    "name": "Диван",
    "connectionId": "loc_001",
    "attributes": {
      "condition": "старый, но крепкий",
      "material": "кожаный",
      "color": "черный"
    }
  },
  {
    "id": "obj_1765650618446",
    "name": "Бутылка виски",
    "connectionId": "obj_1764817473286",
    "attributes": {}
  }
];
