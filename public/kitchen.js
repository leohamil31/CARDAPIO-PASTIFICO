const { escapeHtml, formatCurrency, timeAgo, toast, storage } = window.Pastifico;
const api = window.Pastifico;

const COLUMNS = ['Recebido', 'Preparando', 'Pronto'];
const NEXT = {
  Recebido: { status: 'Preparando', label: 'Iniciar preparo', variant: 'button-primary' },
  Preparando: { status: 'Pronto', label: 'Marcar como pronto', variant: 'button-success' },
  Pronto: { status: 'Entregue', label: 'Entregar', variant: 'button-light' }
};

const els = {
  liveStatus: document.querySelector('#live-status'),
  liveLabel: document.querySelector('#live-label'),
  clock: document.querySelector('#clock'),
  sound: document.querySelector('#sound-toggle'),
  logout: document.querySelector('#logout-button'),
  board: document.querySelector('.kitchen-board')
};

let orders = [];
let knownIds = null;
let soundOn = storage.get('pastifico-sound') === '1';
let pin = null;

// ---------- som de novo pedido (Web Audio, sem arquivos) ----------
function chime() {
  if (!soundOn) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.18 + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.4);
    });
  } catch { /* áudio indisponível */ }
}

function renderSoundButton() {
  els.sound.textContent = soundOn ? 'Som ligado' : 'Som desligado';
  els.sound.setAttribute('aria-pressed', String(soundOn));
}

// ---------- renderização ----------
function card(order, isNew) {
  const next = NEXT[order.status];
  const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const urgency = order.status !== 'Pronto' && minutes >= 20 ? 'late' : order.status !== 'Pronto' && minutes >= 12 ? 'warn' : '';
  return `
    <article class="ticket ${isNew ? 'ticket-new' : ''} ${urgency}" data-order-id="${escapeHtml(order.id)}">
      <header class="ticket-top">
        <div class="ticket-table"><small>Mesa</small><strong>${escapeHtml(order.tableNumber)}</strong></div>
        <div class="ticket-meta">
          <strong>${escapeHtml(order.customerName)}</strong>
          <span>#${escapeHtml(order.id.slice(0, 6))} · <time data-created="${escapeHtml(order.createdAt)}">${timeAgo(order.createdAt)}</time></span>
        </div>
      </header>
      <ul class="ticket-items">
        ${order.items.map((item) => `
          <li><b>${item.quantity}×</b> <span>${escapeHtml(item.name)}${item.options?.length ? `<small>${escapeHtml(item.options.join(' · '))}</small>` : ''}</span></li>`).join('')}
      </ul>
      <footer class="ticket-footer">
        <span class="ticket-pay">${escapeHtml(order.paymentMethod)} · ${formatCurrency(order.total)}</span>
        ${next ? `<button class="button ${next.variant} ticket-action" type="button" data-id="${escapeHtml(order.id)}" data-next="${next.status}">${next.label}</button>` : ''}
      </footer>
    </article>`;
}

function render() {
  const newIds = knownIds ? orders.filter((order) => !knownIds.has(order.id)).map((order) => order.id) : [];
  if (newIds.length && orders.some((order) => newIds.includes(order.id) && order.status === 'Recebido')) {
    chime();
    toast(newIds.length === 1 ? 'Novo pedido chegou!' : `${newIds.length} novos pedidos!`, 'success');
  }
  knownIds = new Set(orders.map((order) => order.id));

  COLUMNS.forEach((status) => {
    const list = els.board.querySelector(`[data-list="${status}"]`);
    const items = orders.filter((order) => order.status === status);
    els.board.querySelector(`[data-count="${status}"]`).textContent = String(items.length);
    list.innerHTML = items.length
      ? items.map((order) => card(order, newIds.includes(order.id))).join('')
      : `<p class="kitchen-empty">${status === 'Recebido' ? 'Sem pedidos novos — cozinha tranquila.' : status === 'Preparando' ? 'Nada no fogo agora.' : 'Nenhum pedido aguardando retirada.'}</p>`;
  });
}

async function load() {
  try {
    orders = await api.listOrders({ openOnly: true });
    orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    render();
  } catch (error) {
    if (/PIN/i.test(error.message)) api.logoutStaff();
    setLive('offline');
    toast(error.message, 'error');
  }
}

function setLive(state) {
  const labels = { live: 'Ao vivo', polling: 'Atualizando', connecting: 'Conectando…', offline: 'Sem conexão' };
  els.liveStatus.dataset.state = state;
  els.liveLabel.textContent = labels[state] || state;
}

// ---------- ações ----------
async function advance(id, nextStatus, button) {
  button?.classList.add('loading');
  if (button) button.disabled = true;
  try {
    await api.updateOrderStatus(id, nextStatus, pin);
    const order = orders.find((item) => item.id === id);
    if (order) order.status = nextStatus;
    orders = orders.filter((item) => item.status !== 'Entregue');
    render();
    if (nextStatus === 'Entregue') toast('Pedido entregue. Buon appetito!', 'success');
  } catch (error) {
    if (/PIN/i.test(error.message)) api.logoutStaff();
    toast(error.message, 'error');
    if (button) { button.disabled = false; button.classList.remove('loading'); }
  }
}

els.board.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-next]');
  if (button) advance(button.dataset.id, button.dataset.next, button);
});

els.sound.addEventListener('click', () => {
  soundOn = !soundOn;
  storage.set('pastifico-sound', soundOn ? '1' : '0');
  renderSoundButton();
  if (soundOn) chime();
});

els.logout.addEventListener('click', () => api.logoutStaff());

// ---------- relógio e tempos ----------
function tick() {
  els.clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.querySelectorAll('time[data-created]').forEach((element) => {
    element.textContent = timeAgo(element.dataset.created);
  });
}

// ---------- início ----------
renderSoundButton();
tick();
setInterval(tick, 30000);

api.requireStaff()
  .then((staffPin) => {
    pin = staffPin;
    els.logout.hidden = !api.requiresPin;
    load();
    api.subscribeOrders(load, setLive);
  })
  .catch((error) => {
    setLive('offline');
    toast(error.message, 'error');
  });
