-- =============================================================================
-- Pedidos visíveis só para a equipe (execute depois de public-access.sql).
--
-- * Cliente: vê apenas o PRÓPRIO pedido, pelo id (UUID impossível de adivinhar),
--   via get_order(id).
-- * Equipe (cozinha e histórico): list_orders(pin, ...) exige o PIN da cozinha.
-- * As tabelas orders/order_items deixam de ser legíveis pela chave pública.
-- * Tempo real sem expor dados: um gatilho envia só um "aviso" (id e status)
--   no canal público "pastifico-orders"; as telas então buscam os dados pelas
--   funções acima.
-- =============================================================================

drop policy if exists "Pedidos visíveis para cozinha e cliente" on public.orders;
drop policy if exists "Itens visíveis para cozinha e cliente" on public.order_items;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
    alter publication supabase_realtime drop table public.order_items;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime drop table public.orders;
  end if;
end $$;

create or replace function private.check_pin(p_pin text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select extensions.crypt(p_pin, pin_hash) = pin_hash from private.kitchen_settings where id), false);
$$;
revoke all on function private.check_pin(text) from public, anon, authenticated;

-- Pedido do cliente (só quem tem o id).
create or replace function public.get_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public.order_to_json(p_order_id);
  if v is null then raise exception 'Pedido não encontrado.'; end if;
  return v;
end;
$$;

-- Lista para a equipe (exige PIN).
create or replace function public.list_orders(p_pin text, p_open_only boolean default false, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_pin(p_pin) then raise exception 'PIN da cozinha incorreto.'; end if;
  return coalesce((
    select jsonb_agg(public.order_to_json(o.id) order by o.created_at)
    from (
      select id, created_at from public.orders
      where not p_open_only or status <> 'Entregue'
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) o
  ), '[]'::jsonb);
end;
$$;

create or replace function public.check_kitchen_pin(p_pin text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.check_pin(p_pin);
$$;

revoke all on function public.get_order(uuid) from public;
revoke all on function public.list_orders(text, boolean, integer) from public;
grant execute on function public.get_order(uuid) to anon, authenticated;
grant execute on function public.list_orders(text, boolean, integer) to anon, authenticated;

-- Aviso em tempo real (sem nome do cliente, sem itens).
create or replace function private.notify_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', coalesce(new.id, old.id), 'status', coalesce(new.status, old.status), 'op', tg_op),
    'changed', 'pastifico-orders', false
  );
  return null;
end;
$$;

drop trigger if exists orders_notify_change on public.orders;
create trigger orders_notify_change after insert or update or delete on public.orders
for each row execute function private.notify_order_change();
