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
    // O cliente só enxerga o próprio pedido, pelo id (as tabelas não são públicas).
    return fixOrder(check(await sb().rpc('get_order', { p_order_id: id })));
  }

  /** Lista de pedidos: só para a equipe (no Supabase exige o PIN da cozinha). */
  async function listOrders({ openOnly = false, limit = 200 } = {}) {
    await ready;
    if (mode === 'api') return rest(openOnly ? 'orders/kitchen' : 'orders');
    const rows = check(await sb().rpc('list_orders', { p_pin: staffPin(), p_open_only: openOnly, p_limit: limit }));
    return (rows || []).map(fixOrder);
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
  function subscribeOrders(onChange, onStatus = () => {}, filterId = null) {
    let timer = null;
    let channel = null;
    let debounce = null;
    const fire = () => {
      clearTimeout(debounce);
      debounce = setTimeout(onChange, 250);
    };

    ready.then(() => {
      if (mode === 'supabase') {
        // O banco envia só um aviso (id e status) neste canal; os dados são buscados pelas funções.
        channel = sb()
          .channel('pastifico-orders')
          .on('broadcast', { event: 'changed' }, (message) => { if (!filterId || message.payload?.id === filterId) fire(); })
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

  const STAFF_KEY = 'pastifico-kitchen-pin';
  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* armazenamento indisponível */ } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* armazenamento indisponível */ } }
  };

  const staffPin = () => storage.get(STAFF_KEY);

  /**
   * Portão da equipe: cozinha e histórico só abrem com o PIN (no modo Supabase).
   * Resolve quando o PIN foi validado; a tela fica bloqueada até lá.
   */
  async function requireStaff() {
    await ready;
    if (mode !== 'supabase') return null;
    const saved = staffPin();
    if (saved && (await checkKitchenPin(saved).catch(() => false))) return saved;
    storage.remove(STAFF_KEY);

    return new Promise((resolve) => {
      const gate = document.createElement('div');
      gate.className = 'modal staff-gate open';
      gate.innerHTML = `
        <form class="modal-card pin-card" role="dialog" aria-modal="true" aria-labelledby="gate-title">
          <span class="brand-mark gate-mark" aria-hidden="true">P</span>
          <p class="kicker">Área da equipe</p>
          <h3 id="gate-title">Acesso restrito</h3>
          <p class="muted small">Esta tela é só para os funcionários do Pastifico. Informe o PIN da cozinha.</p>
          <input class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="••••••" required />
          <p class="form-error" role="alert"></p>
          <div class="modal-actions">
            <a class="button button-ghost" href="index.html">Ir ao cardápio</a>
            <button class="button button-primary" type="submit">Entrar</button>
          </div>
        </form>`;
      document.body.appendChild(gate);
      document.body.classList.add('no-scroll', 'staff-locked');
      const input = gate.querySelector('input');
      const error = gate.querySelector('.form-error');
      setTimeout(() => input.focus(), 50);
      gate.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const pin = input.value.trim();
        try {
          if (!(await checkKitchenPin(pin))) {
            error.textContent = 'PIN incorreto.';
            input.select();
            return;
          }
          storage.set(STAFF_KEY, pin);
          gate.remove();
          document.body.classList.remove('no-scroll', 'staff-locked');
          resolve(pin);
        } catch (err) {
          error.textContent = err.message;
        }
      });
    });
  }

  function logoutStaff() {
    storage.remove(STAFF_KEY);
    location.reload();
  }

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
    requireStaff,
    logoutStaff,
    staffPin,
    subscribeOrders,
    escapeHtml,
    formatCurrency,
    normalizeImage,
    timeAgo,
    toast,
    storage
  };
})();
