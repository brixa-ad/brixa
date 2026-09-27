-- =====================================================================
-- BRIXA — migration 021: the rest of Varna's neighborhoods
--   The first list had 20; portals and brokers use many more. With
--   these, listings get a precise location and the portals' average
--   prices are recognised when pasted on the Market page.
-- Run once in Supabase → SQL Editor → New query → Run (after 020).
-- =====================================================================

insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('Автогара'), ('Базар Левски'), ('Военна болница'), ('Генералите'), ('Гранд Мол'),
  ('ЖП Гара'), ('Западна промишлена зона'), ('Зимно кино Тракия'), ('Конфуто'), ('Максуда'),
  ('Метро'), ('Морска градина'), ('Нептун'), ('Общината'), ('Операта'), ('Победа'),
  ('Погребите'), ('Спортна зала'), ('Терапевтична болница'), ('Хеи'), ('Христо Ботев'),
  ('Чаталджа'), ('м-т Акчелар'), ('м-т Ален мак'), ('м-т Боровец'), ('м-т Ваялар'),
  ('м-т Евксиноград'), ('м-т Зеленика'), ('м-т Прибой'), ('м-т Пчелина'), ('м-т Св. Никола'),
  ('м-т Сотира'), ('м-т Траката'), ('к.к. Златни пясъци')
) as v(name)
join public.geo_regions r on r.code = 'VAR'
join public.geo_settlements s on s.region_id = r.id and s.name = 'Варна' and s.settlement_type = 'гр.'
where not exists (
  select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and n.name = v.name
);
