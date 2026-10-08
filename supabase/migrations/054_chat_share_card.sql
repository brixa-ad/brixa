-- =====================================================================
-- BRIXA — migration 054: a listing sent to another agency opens
-- In a conversation with another agency a listing's card carries the listing's public page (as a
-- shared link): the colleague sees its photo and opens it with a tap, and the broker hears when.
-- =====================================================================

create or replace function public.send_chat_card(target_room uuid, card_kind text, target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
  shared_room boolean;
  card_data jsonb;
  new_id uuid;
  share_token uuid;
begin
  if not public.is_chat_member(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select shared into shared_room from public.chat_rooms where id = target_room;
  -- a client or a deal never goes to another agency
  if card_kind in ('client', 'deal') and shared_room then
    raise exception 'not_with_other_agencies';
  end if;

  if card_kind = 'property' then
    if not public.can_view_property(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', p.title, 'operation', p.operation_type, 'status', p.status,
        'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
        'place', concat_ws(', ', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
                                 (select s.name from public.geo_settlements s where s.id = p.settlement_id)),
        'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
        'org', p.organization_id)
    into card_data
    from public.properties p where p.id = target and p.organization_id = org;
  elsif card_kind = 'client' then
    if not public.can_view_client(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'name', c.full_name, 'types', c.types, 'class', c.client_class,
        'operation', s.operation, 'budget_max', s.budget_max, 'currency', s.currency)
    into card_data
    from public.clients c left join public.client_searches s on s.client_id = c.id
    where c.id = target and c.organization_id = org;
  elsif card_kind = 'deal' then
    if not public.can_view_deal(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', coalesce(p.title, c.full_name, '—'), 'client', c.full_name,
        'stage', d.stage, 'status', d.status, 'kind', d.kind, 'price', d.price, 'currency', d.currency)
    into card_data
    from public.deals d
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.id = target and d.organization_id = org;
  else
    raise exception 'bad_kind';
  end if;
  if card_data is null then raise exception 'not_allowed' using errcode = '42501'; end if;

  -- for another agency: the listing's public page (photos, the broker), as a shared link — the
  -- broker hears when it's opened
  if card_kind = 'property' and shared_room then
    select token into share_token
    from public.property_shares
    where property_id = target and created_by = auth.uid() and client_id is null and revoked_at is null
    order by created_at desc limit 1;
    if share_token is null then
      insert into public.property_shares (property_id, organization_id, created_by)
      values (target, org, auth.uid())
      returning token into share_token;
    end if;
    card_data := card_data || jsonb_build_object('share', share_token);
  end if;

  insert into public.chat_messages (room_id, sender_id, organization_id, kind, ref_id, card)
  values (target_room, auth.uid(), org, card_kind, target, card_data)
  returning id into new_id;
  return new_id;
end;
$$;
