-- =====================================================================
-- BRIXA — seed data (run after schema.sql)
-- Safe to re-run: every insert skips rows that already exist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
insert into public.property_categories (code, name, name_en, sort_order) values
  ('residential', 'Жилищни',   'Residential', 1),
  ('commercial',  'Търговски', 'Commercial',  2),
  ('land',        'Земя',      'Land',        3),
  ('other',       'Други',     'Other',       4)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Subtypes
-- ---------------------------------------------------------------------
insert into public.property_subtypes (category_id, code, name, name_en, sort_order)
select c.id, v.code, v.name, v.name_en, v.sort_order
from (values
  ('residential', 'studio',        'Едностаен апартамент',  'Studio apartment',      1),
  ('residential', 'two_room',      'Двустаен апартамент',   'One-bedroom apartment', 2),
  ('residential', 'three_room',    'Тристаен апартамент',   'Two-bedroom apartment', 3),
  ('residential', 'four_room',     'Четиристаен апартамент','Three-bedroom apartment',4),
  ('residential', 'multi_room',    'Многостаен апартамент', 'Large apartment',       5),
  ('residential', 'maisonette',    'Мезонет',               'Maisonette',            6),
  ('residential', 'atelier',       'Ателие / Таван',        'Atelier / Attic',       7),
  ('residential', 'house',         'Къща',                  'House',                 8),
  ('residential', 'house_floor',   'Етаж от къща',          'House floor',           9),
  ('residential', 'villa',         'Вила',                  'Villa',                10),
  ('commercial',  'office',        'Офис',                  'Office',                1),
  ('commercial',  'shop',          'Магазин',               'Shop',                  2),
  ('commercial',  'restaurant',    'Заведение',             'Restaurant / Bar',      3),
  ('commercial',  'hotel',         'Хотел',                 'Hotel',                 4),
  ('commercial',  'warehouse',     'Склад',                 'Warehouse',             5),
  ('commercial',  'industrial',    'Промишлено помещение',  'Industrial premises',   6),
  ('land',        'plot',          'Парцел',                'Building plot',         1),
  ('land',        'agricultural',  'Земеделска земя',       'Agricultural land',     2),
  ('land',        'forest',        'Гора',                  'Forest',                3),
  ('other',       'garage',        'Гараж',                 'Garage',                1),
  ('other',       'parking_space', 'Паркомясто',            'Parking space',         2)
) as v(category_code, code, name, name_en, sort_order)
join public.property_categories c on c.code = v.category_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Features
-- ---------------------------------------------------------------------
insert into public.property_features (code, name, name_en) values
  ('elevator',           'Асансьор',                  'Elevator'),
  ('parking',            'Паркомясто',                'Parking space'),
  ('garage',             'Гараж',                     'Garage'),
  ('basement',           'Мазе',                      'Basement'),
  ('attic',              'Таван',                     'Attic storage'),
  ('terrace',            'Тераса',                    'Terrace'),
  ('yard',               'Двор',                      'Yard'),
  ('pool',               'Басейн',                    'Swimming pool'),
  ('security',           'Охрана',                    'Security guard'),
  ('video_surveillance', 'Видеонаблюдение',           'Video surveillance'),
  ('access_control',     'Контрол на достъпа',        'Access control'),
  ('gated_complex',      'Затворен комплекс',         'Gated complex'),
  ('sea_view',           'Изглед към море',           'Sea view'),
  ('mountain_view',      'Изглед към планина',        'Mountain view'),
  ('pets_allowed',       'Домашни любимци позволени', 'Pets allowed'),
  ('electricity',        'Ток',                       'Electricity'),
  ('water',              'Вода',                      'Water'),
  ('sewerage',           'Канализация',               'Sewerage'),
  ('gas',                'Газ',                       'Gas'),
  ('road_access',        'Път',                       'Road access'),
  ('regulated',          'В регулация',               'Zoned for building'),
  ('shop_window',        'Витрина',                   'Shop window'),
  ('street_access',      'Вход от улицата',           'Street entrance'),
  ('reception',          'Рецепция',                  'Reception'),
  ('loading_ramp',       'Товарна рампа',             'Loading ramp'),
  ('three_phase',        'Трифазен ток',              'Three-phase power'),
  ('ev_charger',         'Зарядна станция',           'EV charger')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Which features belong to which subtype
-- ---------------------------------------------------------------------
insert into public.property_subtype_features (subtype_id, feature_id)
select s.id, f.id
from (values
  -- apartments
  ('studio',       array['elevator','parking','garage','basement','attic','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('two_room',     array['elevator','parking','garage','basement','attic','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('three_room',   array['elevator','parking','garage','basement','attic','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('four_room',    array['elevator','parking','garage','basement','attic','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('multi_room',   array['elevator','parking','garage','basement','attic','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('maisonette',   array['elevator','parking','garage','basement','terrace','security','video_surveillance','access_control','gated_complex','sea_view','mountain_view','pets_allowed']),
  ('atelier',      array['elevator','parking','basement','terrace','sea_view','mountain_view','pets_allowed']),
  -- houses
  ('house',        array['yard','pool','garage','parking','basement','attic','terrace','security','video_surveillance','gated_complex','sea_view','mountain_view','pets_allowed','gas','sewerage']),
  ('house_floor',  array['yard','garage','parking','basement','attic','terrace','sea_view','mountain_view','pets_allowed']),
  ('villa',        array['yard','pool','garage','parking','basement','terrace','security','video_surveillance','gated_complex','sea_view','mountain_view','pets_allowed']),
  -- commercial
  ('office',       array['elevator','parking','garage','security','video_surveillance','access_control','reception','three_phase']),
  ('shop',         array['parking','shop_window','street_access','security','video_surveillance','three_phase']),
  ('restaurant',   array['parking','shop_window','street_access','terrace','three_phase','gas','sea_view']),
  ('hotel',        array['elevator','parking','pool','reception','security','video_surveillance','sea_view','mountain_view']),
  ('warehouse',    array['parking','loading_ramp','three_phase','security','video_surveillance','road_access']),
  ('industrial',   array['parking','loading_ramp','three_phase','security','video_surveillance','road_access','water','gas']),
  -- land
  ('plot',         array['electricity','water','sewerage','gas','road_access','regulated','sea_view','mountain_view']),
  ('agricultural', array['electricity','water','road_access']),
  ('forest',       array['road_access']),
  -- other
  ('garage',        array['electricity','security','video_surveillance','access_control','ev_charger']),
  ('parking_space', array['security','video_surveillance','access_control','ev_charger'])
) as v(subtype_code, feature_codes)
join public.property_subtypes s on s.code = v.subtype_code
join public.property_features f on f.code = any (v.feature_codes)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Regions (28 oblasts)
-- ---------------------------------------------------------------------
insert into public.geo_regions (code, name) values
  ('BLG', 'Благоевград'),
  ('BGS', 'Бургас'),
  ('VAR', 'Варна'),
  ('VTR', 'Велико Търново'),
  ('VID', 'Видин'),
  ('VRC', 'Враца'),
  ('GAB', 'Габрово'),
  ('DOB', 'Добрич'),
  ('KRZ', 'Кърджали'),
  ('KNL', 'Кюстендил'),
  ('LOV', 'Ловеч'),
  ('MON', 'Монтана'),
  ('PAZ', 'Пазарджик'),
  ('PER', 'Перник'),
  ('PVN', 'Плевен'),
  ('PDV', 'Пловдив'),
  ('RAZ', 'Разград'),
  ('RSE', 'Русе'),
  ('SLS', 'Силистра'),
  ('SLV', 'Сливен'),
  ('SML', 'Смолян'),
  ('SFO', 'София (област)'),
  ('SOF', 'София (столица)'),
  ('SZR', 'Стара Загора'),
  ('TGV', 'Търговище'),
  ('HKV', 'Хасково'),
  ('SHU', 'Шумен'),
  ('JAM', 'Ямбол')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Settlements (main towns + popular villages).
-- For the full list, import the official EKATTE register into
-- geo_settlements with the same columns.
-- ---------------------------------------------------------------------
insert into public.geo_settlements (region_id, name, settlement_type)
select r.id, v.name, v.settlement_type
from (values
  ('BLG','Благоевград','гр.'),('BLG','Банско','гр.'),('BLG','Разлог','гр.'),('BLG','Сандански','гр.'),
  ('BLG','Петрич','гр.'),('BLG','Гоце Делчев','гр.'),('BLG','Симитли','гр.'),('BLG','Якоруда','гр.'),
  ('BLG','Добринище','гр.'),('BLG','Ковачевица','с.'),('BLG','Лещен','с.'),

  ('BGS','Бургас','гр.'),('BGS','Несебър','гр.'),('BGS','Поморие','гр.'),('BGS','Созопол','гр.'),
  ('BGS','Приморско','гр.'),('BGS','Царево','гр.'),('BGS','Черноморец','гр.'),('BGS','Айтос','гр.'),
  ('BGS','Карнобат','гр.'),('BGS','Средец','гр.'),('BGS','Обзор','гр.'),('BGS','Свети Влас','гр.'),
  ('BGS','Ахелой','гр.'),('BGS','Китен','гр.'),('BGS','Ахтопол','гр.'),
  ('BGS','Равда','с.'),('BGS','Кошарица','с.'),('BGS','Лозенец','с.'),('BGS','Синеморец','с.'),
  ('BGS','Равадиново','с.'),('BGS','Тънково','с.'),

  ('VAR','Варна','гр.'),('VAR','Аксаково','гр.'),('VAR','Белослав','гр.'),('VAR','Девня','гр.'),
  ('VAR','Провадия','гр.'),('VAR','Бяла','гр.'),('VAR','Долни чифлик','гр.'),('VAR','Суворово','гр.'),
  ('VAR','Игнатиево','гр.'),
  ('VAR','Константиново','с.'),('VAR','Звездица','с.'),('VAR','Каменар','с.'),('VAR','Тополи','с.'),
  ('VAR','Близнаци','с.'),('VAR','Осеново','с.'),('VAR','Кичево','с.'),('VAR','Приселци','с.'),
  ('VAR','Шкорпиловци','с.'),

  ('VTR','Велико Търново','гр.'),('VTR','Горна Оряховица','гр.'),('VTR','Лясковец','гр.'),
  ('VTR','Свищов','гр.'),('VTR','Павликени','гр.'),('VTR','Елена','гр.'),('VTR','Дебелец','гр.'),
  ('VTR','Килифарево','гр.'),('VTR','Стражица','гр.'),('VTR','Полски Тръмбеш','гр.'),
  ('VTR','Арбанаси','с.'),('VTR','Самоводене','с.'),

  ('VID','Видин','гр.'),('VID','Белоградчик','гр.'),('VID','Кула','гр.'),('VID','Брегово','гр.'),
  ('VID','Дунавци','гр.'),

  ('VRC','Враца','гр.'),('VRC','Мездра','гр.'),('VRC','Козлодуй','гр.'),('VRC','Бяла Слатина','гр.'),
  ('VRC','Оряхово','гр.'),

  ('GAB','Габрово','гр.'),('GAB','Севлиево','гр.'),('GAB','Трявна','гр.'),('GAB','Дряново','гр.'),
  ('GAB','Плачковци','гр.'),('GAB','Боженци','с.'),

  ('DOB','Добрич','гр.'),('DOB','Балчик','гр.'),('DOB','Каварна','гр.'),('DOB','Генерал Тошево','гр.'),
  ('DOB','Тервел','гр.'),('DOB','Шабла','гр.'),
  ('DOB','Кранево','с.'),('DOB','Оброчище','с.'),('DOB','Българево','с.'),

  ('KRZ','Кърджали','гр.'),('KRZ','Момчилград','гр.'),('KRZ','Ардино','гр.'),('KRZ','Крумовград','гр.'),
  ('KRZ','Джебел','гр.'),

  ('KNL','Кюстендил','гр.'),('KNL','Дупница','гр.'),('KNL','Бобов дол','гр.'),
  ('KNL','Сапарева баня','гр.'),('KNL','Рила','гр.'),

  ('LOV','Ловеч','гр.'),('LOV','Троян','гр.'),('LOV','Тетевен','гр.'),('LOV','Луковит','гр.'),
  ('LOV','Априлци','гр.'),('LOV','Угърчин','гр.'),('LOV','Орешак','с.'),('LOV','Чифлик','с.'),

  ('MON','Монтана','гр.'),('MON','Лом','гр.'),('MON','Берковица','гр.'),('MON','Вършец','гр.'),

  ('PAZ','Пазарджик','гр.'),('PAZ','Велинград','гр.'),('PAZ','Панагюрище','гр.'),('PAZ','Пещера','гр.'),
  ('PAZ','Септември','гр.'),('PAZ','Батак','гр.'),('PAZ','Ракитово','гр.'),('PAZ','Брацигово','гр.'),

  ('PER','Перник','гр.'),('PER','Радомир','гр.'),('PER','Брезник','гр.'),('PER','Трън','гр.'),

  ('PVN','Плевен','гр.'),('PVN','Червен бряг','гр.'),('PVN','Левски','гр.'),('PVN','Белене','гр.'),
  ('PVN','Кнежа','гр.'),('PVN','Никопол','гр.'),

  ('PDV','Пловдив','гр.'),('PDV','Асеновград','гр.'),('PDV','Карлово','гр.'),('PDV','Сопот','гр.'),
  ('PDV','Стамболийски','гр.'),('PDV','Раковски','гр.'),('PDV','Първомай','гр.'),('PDV','Хисаря','гр.'),
  ('PDV','Съединение','гр.'),('PDV','Кричим','гр.'),('PDV','Перущица','гр.'),
  ('PDV','Марково','с.'),('PDV','Белащица','с.'),('PDV','Брестник','с.'),('PDV','Труд','с.'),
  ('PDV','Цалапица','с.'),('PDV','Скутаре','с.'),('PDV','Рогош','с.'),('PDV','Костиево','с.'),

  ('RAZ','Разград','гр.'),('RAZ','Исперих','гр.'),('RAZ','Кубрат','гр.'),('RAZ','Завет','гр.'),

  ('RSE','Русе','гр.'),('RSE','Бяла','гр.'),('RSE','Две могили','гр.'),('RSE','Мартен','гр.'),
  ('RSE','Николово','с.'),('RSE','Басарбово','с.'),('RSE','Иваново','с.'),

  ('SLS','Силистра','гр.'),('SLS','Тутракан','гр.'),('SLS','Дулово','гр.'),

  ('SLV','Сливен','гр.'),('SLV','Нова Загора','гр.'),('SLV','Котел','гр.'),('SLV','Твърдица','гр.'),

  ('SML','Смолян','гр.'),('SML','Чепеларе','гр.'),('SML','Мадан','гр.'),('SML','Девин','гр.'),
  ('SML','Златоград','гр.'),('SML','Рудозем','гр.'),('SML','Широка лъка','с.'),('SML','Момчиловци','с.'),

  ('SFO','Самоков','гр.'),('SFO','Ботевград','гр.'),('SFO','Ихтиман','гр.'),('SFO','Своге','гр.'),
  ('SFO','Етрополе','гр.'),('SFO','Костинброд','гр.'),('SFO','Елин Пелин','гр.'),('SFO','Сливница','гр.'),
  ('SFO','Правец','гр.'),('SFO','Годеч','гр.'),('SFO','Пирдоп','гр.'),('SFO','Златица','гр.'),
  ('SFO','Костенец','гр.'),('SFO','Долна баня','гр.'),('SFO','Говедарци','с.'),('SFO','Равно поле','с.'),

  ('SOF','София','гр.'),('SOF','Банкя','гр.'),('SOF','Нови Искър','гр.'),('SOF','Бухово','гр.'),
  ('SOF','Панчарево','с.'),('SOF','Бистрица','с.'),('SOF','Лозен','с.'),('SOF','Герман','с.'),
  ('SOF','Кокаляне','с.'),('SOF','Железница','с.'),('SOF','Мало Бучино','с.'),('SOF','Владая','с.'),

  ('SZR','Стара Загора','гр.'),('SZR','Казанлък','гр.'),('SZR','Чирпан','гр.'),('SZR','Раднево','гр.'),
  ('SZR','Гълъбово','гр.'),('SZR','Павел баня','гр.'),('SZR','Шипка','гр.'),

  ('TGV','Търговище','гр.'),('TGV','Попово','гр.'),('TGV','Омуртаг','гр.'),('TGV','Опака','гр.'),

  ('HKV','Хасково','гр.'),('HKV','Димитровград','гр.'),('HKV','Свиленград','гр.'),('HKV','Харманли','гр.'),
  ('HKV','Любимец','гр.'),

  ('SHU','Шумен','гр.'),('SHU','Нови пазар','гр.'),('SHU','Велики Преслав','гр.'),('SHU','Каолиново','гр.'),

  ('JAM','Ямбол','гр.'),('JAM','Елхово','гр.'),('JAM','Стралджа','гр.')
) as v(region_code, name, settlement_type)
join public.geo_regions r on r.code = v.region_code
where not exists (
  select 1 from public.geo_settlements s
  where s.region_id = r.id and s.name = v.name and s.settlement_type = v.settlement_type
);

-- ---------------------------------------------------------------------
-- Neighborhoods for the four biggest cities
-- ---------------------------------------------------------------------
insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('SOF','София','Център'),('SOF','София','Лозенец'),('SOF','София','Изток'),('SOF','София','Изгрев'),
  ('SOF','София','Иван Вазов'),('SOF','София','Хиподрума'),('SOF','София','Стрелбище'),
  ('SOF','София','Манастирски ливади'),('SOF','София','Кръстова вада'),('SOF','София','Бояна'),
  ('SOF','София','Драгалевци'),('SOF','София','Симеоново'),('SOF','София','Витоша'),
  ('SOF','София','Младост 1'),('SOF','София','Младост 2'),('SOF','София','Младост 3'),
  ('SOF','София','Младост 4'),('SOF','София','Студентски град'),('SOF','София','Дружба 1'),
  ('SOF','София','Дружба 2'),('SOF','София','Гео Милев'),('SOF','София','Дианабад'),
  ('SOF','София','Оборище'),('SOF','София','Докторски паметник'),('SOF','София','Красно село'),
  ('SOF','София','Борово'),('SOF','София','Белите брези'),('SOF','София','Овча купел'),
  ('SOF','София','Люлин'),('SOF','София','Надежда'),('SOF','София','Сухата река'),
  ('SOF','София','Банишора'),('SOF','София','Хладилника'),

  ('VAR','Варна','Център'),('VAR','Варна','Гръцка махала'),('VAR','Варна','Бриз'),
  ('VAR','Варна','Чайка'),('VAR','Варна','Левски'),('VAR','Варна','Младост'),
  ('VAR','Варна','Възраждане'),('VAR','Варна','Владиславово'),('VAR','Варна','Аспарухово'),
  ('VAR','Варна','Галата'),('VAR','Варна','Виница'),('VAR','Варна','Трошево'),
  ('VAR','Варна','Окръжна болница'),('VAR','Варна','Лятно кино Тракия'),
  ('VAR','Варна','ВИНС-Червен площад'),('VAR','Варна','Колхозен пазар'),
  ('VAR','Варна','Цветен квартал'),('VAR','Варна','Кайсиева градина'),
  ('VAR','Варна','Изгрев'),('VAR','Варна','Св. Св. Константин и Елена'),

  ('PDV','Пловдив','Център'),('PDV','Пловдив','Кършияка'),('PDV','Пловдив','Тракия'),
  ('PDV','Пловдив','Смирненски'),('PDV','Пловдив','Кючук Париж'),('PDV','Пловдив','Каменица 1'),
  ('PDV','Пловдив','Каменица 2'),('PDV','Пловдив','Мараша'),('PDV','Пловдив','Западен'),
  ('PDV','Пловдив','Южен'),('PDV','Пловдив','Остромила'),('PDV','Пловдив','Коматево'),
  ('PDV','Пловдив','Съдийски'),('PDV','Пловдив','Гагарин'),('PDV','Пловдив','Изгрев'),
  ('PDV','Пловдив','Беломорски'),

  ('BGS','Бургас','Център'),('BGS','Бургас','Лазур'),('BGS','Бургас','Възраждане'),
  ('BGS','Бургас','Братя Миладинови'),('BGS','Бургас','Зорница'),('BGS','Бургас','Изгрев'),
  ('BGS','Бургас','Славейков'),('BGS','Бургас','Меден рудник'),('BGS','Бургас','Сарафово'),
  ('BGS','Бургас','Крайморие'),('BGS','Бургас','Победа'),('BGS','Бургас','Долно Езерово')
) as v(region_code, city, name)
join public.geo_regions r on r.code = v.region_code
join public.geo_settlements s on s.region_id = r.id and s.name = v.city and s.settlement_type = 'гр.'
where not exists (
  select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and n.name = v.name
);
