-- =============================================================================
-- Acesso público para a versão estática (GitHub Pages) do Pastifico.
--
-- O site estático fala direto com o Supabase usando a chave PUBLICÁVEL (anon).
-- Por isso as regras de segurança ficam no banco:
--   * leitura do cardápio e dos pedidos liberada (RLS: somente SELECT);
--   * nenhuma escrita direta nas tabelas;
--   * pedidos só são criados pela função create_order, que recalcula os preços
--     no servidor (mesmas regras do back-end Node.js);
--   * status só muda pela função update_order_status, que exige o PIN da cozinha.
--
-- Execute depois do schema.sql. Para definir/trocar o PIN da cozinha:
--   select private.set_kitchen_pin('SEU-PIN');
-- =============================================================================

-- ---------- RLS: somente leitura para visitantes ----------
drop policy if exists "Cardápio público (categorias)" on public.categories;
create policy "Cardápio público (categorias)" on public.categories for select to anon, authenticated using (true);

drop policy if exists "Cardápio público (produtos)" on public.products;
create policy "Cardápio público (produtos)" on public.products for select to anon, authenticated using (true);

drop policy if exists "Pedidos visíveis para cozinha e cliente" on public.orders;
create policy "Pedidos visíveis para cozinha e cliente" on public.orders for select to anon, authenticated using (true);

drop policy if exists "Itens visíveis para cozinha e cliente" on public.order_items;
create policy "Itens visíveis para cozinha e cliente" on public.order_items for select to anon, authenticated using (true);

-- ---------- PIN da cozinha (schema privado, fora da API) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.kitchen_settings (
  id boolean primary key default true check (id),
  pin_hash text not null
);

create or replace function private.set_kitchen_pin(p_pin text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.kitchen_settings (id, pin_hash)
  values (true, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (id) do update set pin_hash = excluded.pin_hash;
$$;
revoke all on function private.set_kitchen_pin(text) from public, anon, authenticated;

-- ---------- Monta o pedido no mesmo formato JSON da API REST ----------
create or replace function public.order_to_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'customerName', o.customer_name,
    'tableNumber', o.table_number,
    'status', o.status,
    'total', o.total,
    'paymentMethod', o.payment_method,
    'paymentStatus', o.payment_status,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'productId', i.product_id, 'name', i.name, 'quantity', i.quantity,
        'unitPrice', i.unit_price, 'subtotal', i.subtotal, 'options', to_jsonb(i.options)
      ))
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o where o.id = p_order_id;
$$;

-- ---------- Criação de pedido com preço calculado no servidor ----------
create or replace function public.create_order(
  p_customer_name text,
  p_table_number integer,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_qty numeric;
  v_options text[];
  v_option text;
  v_unit numeric;
  v_total numeric := 0;
  v_idx integer := 0;
  c_wines constant text[] := array['Vinho Toscano', 'Chianti Classico', 'Pinot Grigio delle Venezie', 'Prosecco Veneto', 'Montepulciano d’Abruzzo'];
  c_sodas constant text[] := array['Coca-Cola 600ml', 'Guaraná Antarctica 600ml', 'Fanta Laranja 600ml'];
  c_desserts constant text[] := array['Tiramisu', 'Panna Cotta', 'Cannoli', 'Pavê de Chocolate', 'Torta de Ricota', 'Affogato'];
  c_food_prices constant jsonb := '{"Molho extra da casa": 4, "Parmesão ralado na hora": 3, "Bacon crocante": 5, "Frango grelhado": 8, "Pimenta calabresa": 2}';
  c_dessert_prices constant jsonb := '{"Calda de chocolate extra": 3, "Chantilly": 3, "Raspas de amêndoas": 4}';
begin
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Informe um nome válido (até 100 caracteres).';
  end if;
  if p_table_number is null or p_table_number < 1 or p_table_number > 999 then
    raise exception 'Número da mesa inválido.';
  end if;
  if coalesce(p_payment_method, '') not in ('PIX', 'Cartão', 'Dinheiro') then
    raise exception 'Método de pagamento inválido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido deve ter ao menos um item.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'O pedido pode ter no máximo 50 itens.';
  end if;

  insert into public.orders (id, customer_name, table_number, status, total, payment_method, payment_status)
  values (v_order_id, v_name, p_table_number, 'Recebido', 0, p_payment_method, 'Aguardando no caixa');

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'O item % do pedido é inválido.', v_idx;
    end if;

    -- quantidade: inteiro entre 1 e 99 (padrão 1)
    if v_item ? 'quantity' and jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception 'A quantidade do item % é inválida.', v_idx;
    end if;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    if v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 99 then
      raise exception 'A quantidade do item % deve ser um inteiro entre 1 e 99.', v_idx;
    end if;

    -- produto
    v_product_id := v_item ->> 'productId';
    if v_product_id is null or v_product_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'O produto do item % é inválido.', v_idx;
    end if;
    select * into v_product from public.products where id = v_product_id::uuid;
    if not found or not v_product.is_available then
      raise exception 'Produto do item % não encontrado ou indisponível.', v_idx;
    end if;

    -- adicionais: lista de textos
    if v_item ? 'options' and jsonb_typeof(v_item -> 'options') <> 'array' then
      raise exception 'Os adicionais do item % devem ser uma lista.', v_idx;
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb)) e where jsonb_typeof(e) <> 'string') then
      raise exception 'Os adicionais do item % devem ser textos.', v_idx;
    end if;
    select coalesce(array_agg(value), '{}') into v_options
    from jsonb_array_elements_text(coalesce(v_item -> 'options', '[]'::jsonb));

    -- preço autoritativo (mesmas regras de src/repositories/orderRepository.ts)
    if v_product.name = any (c_wines) then
      foreach v_option in array v_options loop
        if v_option not in ('Taça de vinho', 'Garrafa de vinho') then raise exception 'Adicional inválido para vinho.'; end if;
      end loop;
      v_unit := case when 'Taça de vinho' = any (v_options) then 18 else v_product.price end;
    elsif v_product.name = any (c_sodas) then
      foreach v_option in array v_options loop
        if v_option not in ('Lata 350 ml', 'Garrafa 600 ml', 'Copo com gelo', 'Com limão', 'Com laranja') then
          raise exception 'Adicional inválido para refrigerante.';
        end if;
      end loop;
      v_unit := case when 'Lata 350 ml' = any (v_options) then 7.5 else v_product.price end
        + case when 'Copo com gelo' = any (v_options) then 1.5 else 0 end
        + case when 'Com limão' = any (v_options) then 1 else 0 end
        + case when 'Com laranja' = any (v_options) then 1 else 0 end;
    elsif v_product.name = any (c_desserts) then
      v_unit := v_product.price;
      foreach v_option in array v_options loop
        if not (c_dessert_prices ? v_option) then raise exception 'Adicional de sobremesa inválido.'; end if;
        v_unit := v_unit + (c_dessert_prices ->> v_option)::numeric;
      end loop;
    else
      v_unit := v_product.price;
      foreach v_option in array v_options loop
        if not (c_food_prices ? v_option) then raise exception 'Adicional de prato inválido.'; end if;
        v_unit := v_unit + (c_food_prices ->> v_option)::numeric;
      end loop;
    end if;

    v_unit := round(v_unit, 2);
    insert into public.order_items (order_id, product_id, name, quantity, unit_price, subtotal, options)
    values (v_order_id, v_product.id, v_product.name, v_qty::integer, v_unit, round(v_unit * v_qty, 2), v_options);
    v_total := v_total + round(v_unit * v_qty, 2);
  end loop;

  update public.orders set total = round(v_total, 2) where id = v_order_id;
  return public.order_to_json(v_order_id);
end;
$$;

-- ---------- Atualização de status protegida por PIN ----------
create or replace function public.update_order_status(p_order_id uuid, p_status text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  select pin_hash into v_hash from private.kitchen_settings where id;
  if v_hash is null or p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    raise exception 'PIN da cozinha incorreto.';
  end if;
  if p_status not in ('Recebido', 'Preparando', 'Pronto', 'Entregue') then
    raise exception 'Status do pedido inválido.';
  end if;
  update public.orders set status = p_status where id = p_order_id;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  return public.order_to_json(p_order_id);
end;
$$;

-- Verifica o PIN sem alterar nada (usado pela tela da cozinha ao entrar).
create or replace function public.check_kitchen_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select extensions.crypt(p_pin, pin_hash) = pin_hash from private.kitchen_settings where id), false);
$$;

revoke all on function public.order_to_json(uuid) from public, anon, authenticated;
revoke all on function public.create_order(text, integer, text, jsonb) from public;
revoke all on function public.update_order_status(uuid, text, text) from public;
revoke all on function public.check_kitchen_pin(text) from public;
grant execute on function public.create_order(text, integer, text, jsonb) to anon, authenticated;
grant execute on function public.update_order_status(uuid, text, text) to anon, authenticated;
grant execute on function public.check_kitchen_pin(text) to anon, authenticated;

-- ---------- Tempo real para o painel da cozinha e a tela de status ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- ---------- Alerta do Supabase Advisor ----------
-- rls_auto_enable é um gatilho de evento; não precisa ser chamado pela API.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
