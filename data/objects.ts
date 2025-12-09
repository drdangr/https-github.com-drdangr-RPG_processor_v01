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
    "id": "obj_002",
    "name": "Датапад",
    "connectionId": "char_001",
    "attributes": {
      "condition": "разбитый экран, но работает",
      "type": "стандартный полицейский планшет",
      "purpose": "выявляет скрытые следы и предметы"
    }
  },
  {
    "id": "obj_003",
    "name": "Бутылка виски",
    "connectionId": "obj_1764817473286",
    "attributes": {
      "condition": "почти пустая",
      "quality": "дешевый синтетический",
      "content": "алкоголь"
    }
  },
  {
    "id": "obj_1764621899013",
    "name": "Статуэтка в виде бюста Наполеона",
    "connectionId": "loc_001",
    "attributes": {
      "condition": "целая",
      "size": "небольшая",
      "material": "гипсовая",
      "appearance": "в виде бюста Наполеона",
      "feature": "внутри обычно спрятан пакетик с травкой"
    }
  },
  {
    "id": "obj_1764644085541_jv8h",
    "name": "Пакетик с травкой",
    "connectionId": "obj_1764621899013",
    "attributes": {
      "condition": "запечатан",
      "size": "небольшой",
      "sealing": "герметичный",
      "content": "высушенные листья неизвестного происхождения",
      "smell": "пахнет терпко и сладко"
    }
  },
  {
    "id": "obj_1764693090407",
    "name": "Сундук",
    "connectionId": "loc_001",
    "attributes": {
      "condition": "заперт ",
      "feature": "имеет отверстие для ключа"
    }
  },
  {
    "id": "obj_1764712841260",
    "name": "Модуль реанимации",
    "connectionId": "loc_001",
    "attributes": {
      "technology": "суперсовременный",
      "capability": "способен творить чудеса с тяжело ранеными",
      "position": "в углу кабинета",
      "appearance": "мигает лампочками и блестит хромом",
      "condition": "новенький"
    }
  },
  {
    "id": "obj_1764714563883",
    "name": "Книга полезных заклинаний",
    "connectionId": "obj_1764693090407",
    "attributes": {
      "type": "сборник полезных заклинаний на все случаи жизни",
      "title": "Заклининания для Dummy"
    }
  },
  {
    "id": "obj_1764715037332_ozwb",
    "name": "Яблоко",
    "connectionId": "char_001",
    "attributes": {
      "condition": "откушено наполовину",
      "appearance": "наливное красное",
      "smell": "пахнет свежестью"
    }
  },
  {
    "id": "obj_1764715037332_eb7i",
    "name": "Яблоко",
    "connectionId": "char_1764641742185",
    "attributes": {
      "condition": "свежее",
      "appearance": "наливное красное",
      "smell": "пахнет свежестью"
    }
  },
  {
    "id": "obj_1764718477192_7wyh",
    "name": "Сапог (надетый Джеком)",
    "connectionId": "char_001",
    "attributes": {
      "condition": "потертый, но крепкий"
    }
  },
  {
    "id": "obj_1764718477192_s71y",
    "name": "Сапог Джека",
    "connectionId": "obj_1764817473286",
    "attributes": {
      "condition": "потертый, но крепкий"
    }
  },
  {
    "id": "obj_1764789648713",
    "name": "Ключ от от сундука",
    "connectionId": "char_1764641742185",
    "attributes": {
      "position": "болтается на тонкой веревочке на шее у Пью"
    }
  },
  {
    "id": "obj_1764807474394",
    "name": "Книга \"Жизнь детективов\"",
    "connectionId": "char_001",
    "attributes": {
      "bookmark": "закладка на главе \"Детективы, как они есть, пьють и спять\"",
      "description": "занятное чтиво, чтобы скоротать вечер",
      "status": "читается вслух Джеком"
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
    "id": "obj_1764816467751_ox4z",
    "name": "Сигара",
    "connectionId": "char_001",
    "attributes": {
      "condition": "новая",
      "type": "табачное изделие"
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
    "id": "obj_1764817851476",
    "name": "Камушек",
    "connectionId": "obj_1764718477192_s71y",
    "attributes": {
      "size": "маленький, меньше сантиметра",
      "feature": "острый, может быть досадной помехой",
      "material": "гранит"
    }
  },
  {
    "id": "obj_1764821357679_1m73",
    "name": "Ковбойская шляпа",
    "connectionId": "char_001",
    "attributes": {
      "condition": "потертая, но крепкая"
    }
  },
  {
    "id": "obj_1764821357679_knb2",
    "name": "Кожаный жилет",
    "connectionId": "char_001",
    "attributes": {
      "condition": "потертый, но крепкий"
    }
  },
  {
    "id": "obj_1764821357680_9p0y",
    "name": "Джинсы",
    "connectionId": "char_001",
    "attributes": {
      "condition": "потертые, но крепкие"
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
    "id": "obj_1765252836137_m22l",
    "name": "Большая матрешка",
    "connectionId": "obj_1764817473286",
    "attributes": {
      "size": "большая",
      "material": "дерево",
      "appearance": "расписана под кибер-самурая",
      "feature": "состоит из двух половинок",
      "condition": "закрыта, внутри находится средняя матрешка"
    }
  },
  {
    "id": "obj_1765253034214_degp",
    "name": "Средняя матрешка",
    "connectionId": "obj_1765252836137_m22l",
    "attributes": {
      "size": "средняя",
      "material": "дерево",
      "appearance": "расписана под кибер-ниндзя",
      "feature": "состоит из двух половинок",
      "condition": "закрыта, внутри находится маленькая матрешка"
    }
  },
  {
    "id": "obj_1765253034215_0cec",
    "name": "Маленькая матрешка",
    "connectionId": "obj_1765253034214_degp",
    "attributes": {
      "size": "маленькая",
      "material": "дерево",
      "appearance": "расписана под кибер-гейшу",
      "feature": "состоит из двух половинок",
      "condition": "закрыта, внутри находится самая маленькая матрешка"
    }
  },
  {
    "id": "obj_1765253034215_vrzq",
    "name": "Самая маленькая матрешка",
    "connectionId": "obj_1765253034215_0cec",
    "attributes": {
      "size": "крошечная",
      "material": "дерево",
      "appearance": "не расписана, просто деревянная",
      "feature": "цельная, не открывается"
    }
  }
];
