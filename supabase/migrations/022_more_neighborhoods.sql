-- =====================================================================
-- BRIXA — migration 022: the rest of the neighborhoods in Sofia, Plovdiv and Burgas
--   The first list had only the biggest ones. With these, listings get a
--   precise location and the portals' average prices are recognised when
--   pasted on the Market page.
-- Run once in Supabase → SQL Editor → New query → Run (after 021).
-- =====================================================================

-- София
insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('Бенковски'), ('Бъкстон'), ('Военна рампа'), ('Враждебна'), ('Връбница'), ('Гевгелийски'),
  ('Горна баня'), ('Горубляне'), ('Гоце Делчев'), ('Дървеница'), ('Западен парк'), ('Захарна фабрика'),
  ('Зона Б-18'), ('Зона Б-19'), ('Зона Б-5'), ('Илинден'), ('Карпузица'), ('Киноцентъра'),
  ('Княжево'), ('Красна поляна'), ('Лагера'), ('Малашевци'), ('Малинова долина'), ('Медицинска академия'),
  ('Младост 1А'), ('Модерно предградие'), ('Мотописта'), ('Мусагеница'), ('Обеля'), ('Орландовци'),
  ('Павлово'), ('Подуяне'), ('Полигона'), ('Разсадника'), ('Редута'), ('Света Троица'),
  ('Сердика'), ('Слатина'), ('Сточна гара'), ('Суходол'), ('Толстой'), ('Факултета'),
  ('Филиповци'), ('Хаджи Димитър'), ('Христо Смирненски'), ('Южен парк'), ('Яворов')
) as v(name)
join public.geo_regions r on r.code = 'SOF'
join public.geo_settlements s on s.region_id = r.id and s.name = 'София' and s.settlement_type = 'гр.'
where not exists (
  select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and n.name = v.name
);

-- Пловдив
insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('Въстанически'), ('Гребна база'), ('Захарна фабрика'), ('Изток'), ('Индустриална зона Север'), ('Индустриална зона Тракия'),
  ('Индустриална зона Юг'), ('Коматевски възел'), ('Младежки хълм'), ('Отдих и култура'), ('Прослав'), ('Старият град'),
  ('Столипиново'), ('Филипово'), ('Христо Ботев'), ('Шекер махала')
) as v(name)
join public.geo_regions r on r.code = 'PDV'
join public.geo_settlements s on s.region_id = r.id and s.name = 'Пловдив' and s.settlement_type = 'гр.'
where not exists (
  select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and n.name = v.name
);

-- Бургас
insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('Акациите'), ('Банево'), ('Ветрен'), ('Горно Езерово'), ('Индустриална зона Север'), ('Индустриална зона Юг'),
  ('Лозово'), ('Морска градина'), ('Рудник'), ('Черно море')
) as v(name)
join public.geo_regions r on r.code = 'BGS'
join public.geo_settlements s on s.region_id = r.id and s.name = 'Бургас' and s.settlement_type = 'гр.'
where not exists (
  select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and n.name = v.name
);
