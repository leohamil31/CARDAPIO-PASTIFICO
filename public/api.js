/**
 * Camada de dados do front-end.
 * As telas chamam sempre as mesmas funções (Pastifico.getCatalog, createOrder...);
 * aqui decidimos se a fonte é a API Node.js (Express) ou o Supabase direto
 * (usado na versão publicada no GitHub Pages, que é só HTML/CSS/JS).
 */
(function () {
  const config = window.PASTIFICO_CONFIG || {};
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  let mode = null;
  let supabaseClient = null;

  // ---------- utilidades compartilhadas ----------
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatCurrency = (value) => currency.format(Number(value) || 0);

  /** Imagens salvas como "/images/x.jpg" viram "images/x.jpg" para funcionar em subpastas (GitHub Pages). */
  const normalizeImage = (image) => (typeof image === 'string' && image.startsWith('/') && !image.startsWith('//') ? image.slice(1) : image);

  const timeAgo = (iso) => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours} h ${minutes % 60} min`;
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca do Supabase.'));
    document.head.appendChild(script);
  });

  // ---------- mapeamento Supabase (snake_case) → formato da API (camelCase) ----------
  const mapProduct = (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    image: normalizeImage(row.image),
    isAvailable: row.is_available,
    categoryId: row.category_id,
    createdAt: row.created_at
  });

  const mapOrder = (row) => ({
    id: row.id,
    customerName: row.customer_name,
    tableNumber: row.table_number,
    status: row.status,
    total: Number(row.total),
    createdAt: row.created_at,
    paymentMethod: row.payment_method || 'Dinheiro',
    paymentStatus: row.payment_status === 'Pago' ? 'Pago' : 'Aguardando no caixa',
    items: (row.order_items || []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      options: item.options || []
    }))
  });

  const fixOrder = (order) => ({ ...order, total: Number(order.total), items: (order.items || []).map((item) => ({ ...item, unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal) })) });

  // ---------- detecção do modo ----------
  async function probeApi() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch('api/health', { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) return false;
      const body = await response.json();
      return body && body.name === 'Pastifico API';
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  const ready = (async () => {
    const forced = new URLSearchParams(location.search).get('fonte');
    const wanted = forced || config.mode || 'auto';

    if (wanted === 'api') mode = 'api';
    else if (wanted === 'supabase' || location.hostname.endsWith('github.io')) mode = 'supabase';
    else mode = (await probeApi()) ? 'api' : 'supabase';

    if (mode === 'supabase') {
      if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Supabase não configurado em config.js.');
      if (!window.supabase) await loadScript(SUPABASE_CDN);
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
    document.documentElement.dataset.dataSource = mode;
    return mode;
  })();

  // ---------- REST ----------
  async function rest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `Erro ${response.status}`);
    return body;
  }

  const sb = () => supabaseClient;
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message || 'Erro ao acessar o banco de dados.');
    return data;
  };

  // ---------- API pública usada pelas telas ----------
  async function getCatalog() {
    await ready;
    if (mode === 'api') {
      const [categories, products] = await Promise.all([rest('categories'), rest('products')]);
      return { categories, products: products.map((product) => ({ ...product, image: normalizeImage(product.image) })) };
    }
    const [categories, products] = await Promise.all([
      sb().from('categories').select('*').order('created_at').then(check),
      sb().from('products').select('*').order('name').then(check)
    ]);
    return {
      categories: categories.map((row) => ({ id: row.id, name: row.name, description: row.description, createdAt: row.created_at })),
      products: products.map(mapProduct)
    };
  }

  async function createOrder(payload) {
    await ready;
    if (mode === 'api') return rest('orders', { method: 'POST', body: JSON.stringify(payload) });
    const data = check(await sb().rpc('create_order', {
      p_customer_name: payload.customerName,
      p_table_number: payload.tableNumber,
      p_payment_method: payload.paymentMethod,
      p_items: payload.items.map((item) => ({ productId: item.productId, quantity: item.quantity, options: item.options || [] }))
    }));
    return fixOrder(data);
  }

  async function getOrder(id) {
    await ready;
    if (mode === 'api') return rest(`orders/${encodeURIComponent(id)}`);
    const data = check(await sb().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle());
    if (!data) throw new Error('Pedido não encontrado.');
    return mapOrder(data);
  }

  async function listOrders({ openOnly = false, limit = 200 } = {}) {
    await ready;
    if (mode === 'api') return rest(openOnly ? 'orders/kitchen' : 'orders');
    let query = sb().from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(limit);
    if (openOnly) query = query.neq('status', 'Entregue');
    const rows = check(await query);
    return rows.map(mapOrder).reverse();
  }

  async function updateOrderStatus(id, status, pin) {
    await ready;
    if (mode === 'api') return rest(`orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    return fixOrder(check(await sb().rpc('update_order_status', { p_order_id: id, p_status: status, p_pin: pin })));
  }

  async function checkKitchenPin(pin) {
    await ready;
    if (mode === 'api') return true;
    return Boolean(check(await sb().rpc('check_kitchen_pin', { p_pin: pin })));
  }

  /**
   * Avisa a tela quando houver mudança nos pedidos.
   * Supabase: tempo real (Realtime) + verificação periódica de segurança.
   * API REST: verificação periódica.
   * Retorna uma função para cancelar e informa o estado da conexão por onStatus.
   */
  function subscribeOrders(onChange, onStatus = () => {}) {
    let timer = null;
    let channel = null;
    let debounce = null;
    const fire = () => {
      clearTimeout(debounce);
      debounce = setTimeout(onChange, 250);
    };

    ready.then(() => {
      if (mode === 'supabase') {
        channel = sb()
          .channel('pastifico-orders')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fire)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fire)
          .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'polling' : 'connecting'));
        timer = setInterval(onChange, 20000);
      } else {
        onStatus('polling');
        timer = setInterval(onChange, 4000);
      }
    }).catch(() => onStatus('offline'));

    return () => {
      clearInterval(timer);
      if (channel) sb().removeChannel(channel);
    };
  }

  function toast(message, type = 'info') {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.textContent = message;
    region.appendChild(element);
    setTimeout(() => {
      element.classList.add('leaving');
      element.addEventListener('animationend', () => element.remove(), { once: true });
      setTimeout(() => element.remove(), 600);
    }, 3800);
  }

  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* armazenamento indisponível */ } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* armazenamento indisponível */ } }
  };

  window.Pastifico = {
    ready,
    get mode() { return mode; },
    get requiresPin() { return mode === 'supabase'; },
    getCatalog,
    createOrder,
    getOrder,
    listOrders,
    updateOrderStatus,
    checkKitchenPin,
    subscribeOrders,
    escapeHtml,
    formatCurrency,
    normalizeImage,
    timeAgo,
    toast,
    storage
  };
})();
