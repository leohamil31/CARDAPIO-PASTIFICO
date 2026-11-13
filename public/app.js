const { escapeHtml, formatCurrency, toast, storage } = window.Pastifico;

const state = {
  categories: [],
  products: [],
  selectedCategory: 'all',
  search: '',
  cart: [],
  customizing: null,
  quantity: 1
};

const $ = (selector) => document.querySelector(selector);
const els = {
  categories: $('#categories'),
  products: $('#products'),
  search: $('#search'),
  cart: $('#cart'),
  cartItems: $('#cart-items'),
  cartCount: $('#cart-count'),
  total: $('#total'),
  form: $('#order-form'),
  name: $('#customerName'),
  table: $('#tableNumber'),
  fab: $('#cart-fab'),
  fabCount: $('#cart-fab-count'),
  fabTotal: $('#cart-fab-total'),
  backdrop: $('#cart-backdrop'),
  cartClose: $('#cart-close'),
  customizeModal: $('#customize-modal'),
  customizeImage: $('#customize-image'),
  customizeTitle: $('#customize-title'),
  customizeDescription: $('#customize-description'),
  customizeOptions: $('#customize-options'),
  customizeQuantity: $('#customize-quantity'),
  customizeTotal: $('#customize-total'),
  checkoutModal: $('#checkout-modal'),
  checkoutSummary: $('#checkout-summary'),
  confirmCheckout: $('#confirm-checkout'),
  dataSource: $('#data-source')
};

// ---------- regras de personalização (o preço final é sempre recalculado no servidor) ----------
const FOOD_OPTIONS = [
  { id: 'molho-extra', name: 'Molho extra da casa', price: 4 },
  { id: 'parmesao', name: 'Parmesão ralado na hora', price: 3 },
  { id: 'bacon', name: 'Bacon crocante', price: 5 },
  { id: 'frango', name: 'Frango grelhado', price: 8 },
  { id: 'pimenta', name: 'Pimenta calabresa', price: 2 }
];
const DESSERT_OPTIONS = [
  { id: 'calda-chocolate', name: 'Calda de chocolate extra', price: 3 },
  { id: 'chantilly', name: 'Chantilly', price: 3 },
  { id: 'amendoas', name: 'Raspas de amêndoas', price: 4 }
];
const WINES = ['Vinho Toscano', 'Chianti Classico', 'Pinot Grigio delle Venezie', 'Prosecco Veneto', 'Montepulciano d’Abruzzo'];
const SODAS = ['Coca-Cola 600ml', 'Guaraná Antarctica 600ml', 'Fanta Laranja 600ml'];

function getOptions(product) {
  if (WINES.includes(product.name)) {
    return [
      { id: 'garrafa-vinho', name: 'Garrafa de vinho', price: 0, replacePrice: product.price, type: 'radio', group: 'formato', default: true },
      { id: 'taca-vinho', name: 'Taça de vinho', price: 0, replacePrice: 18, type: 'radio', group: 'formato' }
    ];
  }
  if (SODAS.includes(product.name)) {
    return [
      { id: 'garrafa-600ml', name: 'Garrafa 600 ml', price: 0, replacePrice: product.price, type: 'radio', group: 'formato', default: true },
      { id: 'lata', name: 'Lata 350 ml', price: 0, replacePrice: 7.5, type: 'radio', group: 'formato' },
      { id: 'copo-gelo', name: 'Copo com gelo', price: 1.5 },
      { id: 'limao', name: 'Com limão', price: 1 },
      { id: 'laranja', name: 'Com laranja', price: 1 }
    ];
  }
  const category = state.categories.find((item) => item.id === product.categoryId);
  if (category?.name === 'Bebidas') return [];
  if (category?.name === 'Sobremesas') return DESSERT_OPTIONS;
  return FOOD_OPTIONS;
}

function priceWith(product, options) {
  const replacement = options.find((option) => Number.isFinite(option.replacePrice));
  const extras = options.reduce((sum, option) => sum + option.price, 0);
  return Math.round(((replacement ? replacement.replacePrice : product.price) + extras) * 100) / 100;
}

// ---------- catálogo ----------
function filteredProducts() {
  const term = state.search.trim().toLowerCase();
  return state.products.filter((product) => {
    if (state.selectedCategory !== 'all' && product.categoryId !== state.selectedCategory) return false;
    if (!term) return true;
    return `${product.name} ${product.description}`.toLowerCase().includes(term);
  });
}

function renderCategories() {
  const all = [{ id: 'all', name: 'Todos' }, ...state.categories];
  els.categories.innerHTML = all.map((category) => {
    const count = category.id === 'all' ? state.products.length : state.products.filter((p) => p.categoryId === category.id).length;
    const active = state.selectedCategory === category.id;
    return `
      <button class="chip ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-category="${escapeHtml(category.id)}" type="button">
        ${escapeHtml(category.name)}
        <small>${count}</small>
      </button>`;
  }).join('');
}

function productCard(product, index) {
  const unavailable = !product.isAvailable;
  return `
    <article class="product-card reveal ${unavailable ? 'is-unavailable' : ''}" style="--i:${index % 9}" data-product-id="${escapeHtml(product.id)}"
      tabindex="${unavailable ? -1 : 0}" role="button" aria-label="${escapeHtml(product.name)}, ${formatCurrency(product.price)}${unavailable ? ', indisponível' : ''}">
      <div class="product-media" data-name="${escapeHtml(product.name)}">
        <img src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async" />
        ${unavailable ? '<span class="badge badge-muted">Indisponível</span>' : ''}
      </div>
      <div class="product-body">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-footer">
          <strong class="price">${formatCurrency(product.price)}</strong>
          <span class="add-button" aria-hidden="true">${unavailable ? '—' : '+'}</span>
        </div>
      </div>
    </article>`;
}

function renderProducts() {
  const products = filteredProducts();

  if (!products.length) {
    els.products.innerHTML = `<div class="empty-state"><p>Nenhum item encontrado${state.search ? ` para “${escapeHtml(state.search)}”` : ''}.</p></div>`;
    return;
  }

  if (state.selectedCategory === 'all' && !state.search) {
    els.products.innerHTML = state.categories.map((category) => {
      const items = products.filter((product) => product.categoryId === category.id);
      if (!items.length) return '';
      return `
        <section class="menu-section" aria-labelledby="cat-${escapeHtml(category.id)}">
          <header class="menu-section-header">
            <h3 id="cat-${escapeHtml(category.id)}">${escapeHtml(category.name)}</h3>
            <p>${escapeHtml(category.description || '')}</p>
          </header>
          <div class="product-grid">${items.map(productCard).join('')}</div>
        </section>`;
    }).join('');
  } else {
    els.products.innerHTML = `<div class="product-grid">${products.map(productCard).join('')}</div>`;
  }

  els.products.querySelectorAll('.product-media img').forEach((image) => {
    image.addEventListener('error', () => image.closest('.product-media')?.classList.add('no-image'), { once: true });
  });
  observeReveal();
}

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -40px 0px' })
  : null;

function observeReveal() {
  document.querySelectorAll('.reveal:not(.in-view)').forEach((element) => {
    if (revealObserver) revealObserver.observe(element);
    else element.classList.add('in-view');
  });
}

// ---------- personalização ----------
function selectedOptions() {
  if (!state.customizing) return [];
  const options = getOptions(state.customizing);
  return Array.from(els.customizeOptions.querySelectorAll('input:checked'))
    .map((input) => options.find((option) => option.id === input.value))
    .filter(Boolean);
}

function updateCustomizeTotal() {
  const unit = priceWith(state.customizing, selectedOptions());
  els.customizeQuantity.textContent = String(state.quantity);
  els.customizeTotal.textContent = formatCurrency(unit * state.quantity);
}

function openCustomize(product) {
  if (!product?.isAvailable) return;
  state.customizing = product;
  state.quantity = 1;
  els.customizeImage.closest('.customize-media').classList.remove('no-image');
  els.customizeImage.closest('.customize-media').dataset.name = product.name;
  els.customizeImage.src = product.image;
  els.customizeImage.alt = product.name;
  els.customizeTitle.textContent = product.name;
  els.customizeDescription.textContent = product.description;

  const options = getOptions(product);
  els.customizeOptions.innerHTML = options.length
    ? options.map((option) => `
        <label class="option">
          <input type="${option.type || 'checkbox'}" name="${option.group || option.id}" value="${option.id}" ${option.default ? 'checked' : ''} />
          <span class="option-name">${escapeHtml(option.name)}</span>
          <span class="option-price">${Number.isFinite(option.replacePrice) ? formatCurrency(option.replacePrice) : `+ ${formatCurrency(option.price)}`}</span>
        </label>`).join('')
    : '<p class="muted">Este item já vem pronto para servir.</p>';

  updateCustomizeTotal();
  openModal(els.customizeModal);
}

// ---------- carrinho ----------
function saveCart() {
  storage.set('pastifico-cart', JSON.stringify(state.cart));
}

function addToCart(product, options, quantity) {
  const key = `${product.id}:${options.map((option) => option.id).sort().join(',')}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
  else {
    state.cart.push({
      key,
      productId: product.id,
      name: product.name,
      image: product.image,
      price: priceWith(product, options),
      quantity,
      options: options.map((option) => option.name)
    });
  }
  saveCart();
  renderCart();
  bump(els.fab);
  bump(els.cartCount);
  toast(`${quantity}× ${product.name} adicionado ao pedido`, 'success');
}

function changeQuantity(key, delta) {
  const item = state.cart.find((entry) => entry.key === key);
  if (!item) return;
  item.quantity = Math.min(99, item.quantity + delta);
  if (item.quantity <= 0) state.cart = state.cart.filter((entry) => entry.key !== key);
  saveCart();
  renderCart();
}

const cartTotal = () => state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
const cartQuantity = () => state.cart.reduce((sum, item) => sum + item.quantity, 0);

function renderCart() {
  const quantity = cartQuantity();
  const total = cartTotal();
  els.cartCount.textContent = `${quantity} ${quantity === 1 ? 'item' : 'itens'}`;
  els.total.textContent = formatCurrency(total);
  els.fabCount.textContent = String(quantity);
  els.fabTotal.textContent = formatCurrency(total);
  els.fab.classList.toggle('visible', quantity > 0);

  if (!state.cart.length) {
    els.cartItems.innerHTML = '<div class="cart-empty"><span class="tricolore" aria-hidden="true"></span><p>Seu pedido está vazio.<br />Toque em um prato para começar.</p></div>';
    return;
  }

  els.cartItems.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <div class="cart-item-info">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${item.options.length ? escapeHtml(item.options.join(' · ')) : 'Receita original'}</small>
        <span class="cart-item-price">${formatCurrency(item.price * item.quantity)}</span>
      </div>
      <div class="stepper stepper-small">
        <button type="button" data-key="${escapeHtml(item.key)}" data-delta="-1" aria-label="Remover um ${escapeHtml(item.name)}">−</button>
        <output>${item.quantity}</output>
        <button type="button" data-key="${escapeHtml(item.key)}" data-delta="1" aria-label="Adicionar um ${escapeHtml(item.name)}">+</button>
      </div>
    </div>`).join('');
}

function bump(element) {
  element.classList.remove('bump');
  void element.offsetWidth; // reinicia a animação
  element.classList.add('bump');
}

// ---------- modais e gaveta do carrinho ----------
let lastFocus = null;
function openModal(modal) {
  lastFocus = document.activeElement;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('open'));
  document.body.classList.add('no-scroll');
  modal.querySelector('.modal-close')?.focus();
}

function closeModal(modal) {
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { modal.hidden = true; }, 220);
  lastFocus?.focus?.();
}

function setCartOpen(open) {
  document.body.classList.toggle('cart-open', open);
  els.backdrop.hidden = !open;
  els.fab.setAttribute('aria-expanded', String(open));
  if (open) els.cartClose.focus();
}

// ---------- checkout ----------
const paymentMethod = () => els.form.querySelector('input[name="paymentMethod"]:checked')?.value || 'Cartão';

function validateForm() {
  if (!state.cart.length) return 'Adicione pelo menos um item ao pedido.';
  if (!els.name.value.trim()) { els.name.focus(); return 'Informe seu nome.'; }
  const table = Number(els.table.value);
  if (!Number.isInteger(table) || table < 1 || table > 999) { els.table.focus(); return 'Informe um número de mesa válido.'; }
  return null;
}

function renderCheckoutSummary() {
  els.checkoutSummary.innerHTML = `
    <dl class="summary-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(els.name.value.trim())}</dd></div>
      <div><dt>Mesa</dt><dd>${escapeHtml(els.table.value)}</dd></div>
      <div><dt>Pagamento</dt><dd>${escapeHtml(paymentMethod())}</dd></div>
    </dl>
    <ul class="summary-items">
      ${state.cart.map((item) => `
        <li><span>${item.quantity}× ${escapeHtml(item.name)}${item.options.length ? `<small>${escapeHtml(item.options.join(', '))}</small>` : ''}</span>
        <strong>${formatCurrency(item.price * item.quantity)}</strong></li>`).join('')}
    </ul>
    <div class="summary-total"><span>Total estimado</span><strong>${formatCurrency(cartTotal())}</strong></div>`;
}

async function confirmOrder() {
  const error = validateForm();
  if (error) { closeModal(els.checkoutModal); toast(error, 'error'); return; }

  els.confirmCheckout.disabled = true;
  els.confirmCheckout.classList.add('loading');
  try {
    const order = await window.Pastifico.createOrder({
      customerName: els.name.value.trim(),
      tableNumber: Number(els.table.value),
      paymentMethod: paymentMethod(),
      items: state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity, options: item.options }))
    });
    state.cart = [];
    saveCart();
    storage.set('pastifico-last-order', order.id);
    window.location.href = `order-status.html?orderId=${encodeURIComponent(order.id)}&novo=1`;
  } catch (err) {
    toast(err.message || 'Não foi possível enviar o pedido.', 'error');
    els.confirmCheckout.disabled = false;
    els.confirmCheckout.classList.remove('loading');
  }
}

// ---------- eventos ----------
els.categories.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.selectedCategory = button.dataset.category;
  renderCategories();
  renderProducts();
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = els.search.value;
    renderProducts();
  }, 150);
});

els.products.addEventListener('click', (event) => {
  const card = event.target.closest('.product-card[data-product-id]');
  if (card) openCustomize(state.products.find((product) => product.id === card.dataset.productId));
});
els.products.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.product-card[data-product-id]');
  if (!card) return;
  event.preventDefault();
  openCustomize(state.products.find((product) => product.id === card.dataset.productId));
});

els.customizeOptions.addEventListener('change', updateCustomizeTotal);
$('#customize-decrease').addEventListener('click', () => { state.quantity = Math.max(1, state.quantity - 1); updateCustomizeTotal(); });
$('#customize-increase').addEventListener('click', () => { state.quantity = Math.min(99, state.quantity + 1); updateCustomizeTotal(); });
$('#add-customized').addEventListener('click', () => {
  if (!state.customizing) return;
  addToCart(state.customizing, selectedOptions(), state.quantity);
  closeModal(els.customizeModal);
});
$('#close-customize').addEventListener('click', () => closeModal(els.customizeModal));
els.customizeImage.addEventListener('error', () => els.customizeImage.closest('.customize-media')?.classList.add('no-image'));

els.cartItems.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-key]');
  if (button) changeQuantity(button.dataset.key, Number(button.dataset.delta));
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = validateForm();
  if (error) { toast(error, 'error'); return; }
  renderCheckoutSummary();
  openModal(els.checkoutModal);
});
els.confirmCheckout.addEventListener('click', confirmOrder);
$('#cancel-checkout').addEventListener('click', () => closeModal(els.checkoutModal));
$('#close-checkout').addEventListener('click', () => closeModal(els.checkoutModal));

[els.customizeModal, els.checkoutModal].forEach((modal) => {
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(modal); });
});

els.fab.addEventListener('click', () => setCartOpen(true));
els.cartClose.addEventListener('click', () => setCartOpen(false));
els.backdrop.addEventListener('click', () => setCartOpen(false));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!els.checkoutModal.hidden) closeModal(els.checkoutModal);
  else if (!els.customizeModal.hidden) closeModal(els.customizeModal);
  else if (document.body.classList.contains('cart-open')) setCartOpen(false);
});

// ---------- inicialização ----------
async function init() {
  try { state.cart = JSON.parse(storage.get('pastifico-cart') || '[]'); } catch { state.cart = []; }
  renderCart();

  try {
    const { categories, products } = await window.Pastifico.getCatalog();
    state.categories = categories;
    state.products = products;
    $('#fact-items').textContent = String(products.filter((product) => product.isAvailable).length);
    // Descarta do carrinho salvo itens que não existem mais.
    state.cart = state.cart.filter((item) => products.some((product) => product.id === item.productId && product.isAvailable));
    saveCart();
    renderCategories();
    renderProducts();
    renderCart();
    els.dataSource.textContent = window.Pastifico.mode === 'supabase' ? 'Dados em tempo real via Supabase' : 'Dados via API Node.js';
  } catch (error) {
    els.products.innerHTML = `<div class="empty-state"><p>Não foi possível carregar o cardápio.<br /><small>${escapeHtml(error.message)}</small></p><button class="button button-ghost" type="button" onclick="location.reload()">Tentar novamente</button></div>`;
  }
}

init();
