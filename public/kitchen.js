const { escapeHtml, formatCurrency, timeAgo, toast, storage } = window.Pastifico;

const COLUMNS = ['Recebido', 'Preparando', 'Pronto'];
const NEXT = {
  Recebido: { status: 'Preparando', label: 'Iniciar preparo' },
  Preparando: { status: 'Pronto', label: 'Marcar como pronto' },
  Pronto: { status: 'Entregue', label: 'Entregar' }
};

const els = {
  liveStatus: document.querySelector('#live-status'),
  liveLabel: document.querySelector('#live-label'),
  clock: document.querySelector('#clock'),
  sound: document.querySelector('#sound-toggle'),
  pinButton: document.querySelector('#pin-button'),
  pinModal: document.querySelector('#pin-modal'),
  pinForm: document.querySelector('#pin-form'),
  pinInput: document.querySelector('#pin-input'),
  pinError: document.querySelector('#pin-error'),
  board: document.querySelector('.kitchen-board')
};

let orders = [];
let knownIds = null;
let soundOn = storage.get('pastifico-sound') === '1';
let pin = storage.get('pastifico-kitchen-pin');
let pendingAction = null;

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
  els.sound.textContent = soundOn ? '🔔 Som' : '🔕 Som';
  els.sound.setAttribute('aria-pressed', String(soundOn));
}

function renderPinButton() {
  if (!window.Pastifico.requiresPin) { els.pinButton.hidden = true; return; }
  els.pinButton.hidden = false;
  els.pinButton.textContent = pin ? '🔓 Sair' : '🔒 Entrar';
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
        ${next ? `<button class="button ticket-action" type="button" data-id="${escapeHtml(order.id)}" data-next="${next.status}">${next.label}</button>` : ''}
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
    orders = await window.Pastifico.listOrders({ openOnly: true });
    orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    render();
  } catch (error) {
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
  if (window.Pastifico.requiresPin && !pin) {
    pendingAction = { id, nextStatus };
    openPin();
    return;
  }
  button?.classList.add('loading');
  if (button) button.disabled = true;
  try {
    await window.Pastifico.updateOrderStatus(id, nextStatus, pin);
    const order = orders.find((item) => item.id === id);
    if (order) order.status = nextStatus;
    orders = orders.filter((item) => item.status !== 'Entregue');
    render();
    if (nextStatus === 'Entregue') toast('Pedido entregue. Buon appetito!', 'success');
  } catch (error) {
    if (/PIN/i.test(error.message)) {
      pin = null;
      storage.remove('pastifico-kitchen-pin');
      renderPinButton();
      pendingAction = { id, nextStatus };
      openPin('PIN inválido. Tente novamente.');
    } else {
      toast(error.message, 'error');
    }
    if (button) { button.disabled = false; button.classList.remove('loading'); }
  }
}

function openPin(message = '') {
  els.pinError.textContent = message;
  els.pinInput.value = '';
  els.pinModal.hidden = false;
  requestAnimationFrame(() => els.pinModal.classList.add('open'));
  setTimeout(() => els.pinInput.focus(), 50);
}

function closePin() {
  els.pinModal.classList.remove('open');
  setTimeout(() => { els.pinModal.hidden = true; }, 220);
}

els.pinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const candidate = els.pinInput.value.trim();
  if (!candidate) return;
  try {
    if (!(await window.Pastifico.checkKitchenPin(candidate))) {
      els.pinError.textContent = 'PIN incorreto.';
      els.pinInput.select();
      return;
    }
    pin = candidate;
    storage.set('pastifico-kitchen-pin', pin);
    renderPinButton();
    closePin();
    toast('Acesso liberado para a equipe.', 'success');
    if (pendingAction) {
      const { id, nextStatus } = pendingAction;
      pendingAction = null;
      advance(id, nextStatus);
    }
  } catch (error) {
    els.pinError.textContent = error.message;
  }
});

document.querySelector('#pin-close').addEventListener('click', () => { pendingAction = null; closePin(); });
els.pinModal.addEventListener('click', (event) => { if (event.target === els.pinModal) { pendingAction = null; closePin(); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !els.pinModal.hidden) closePin(); });

els.pinButton.addEventListener('click', () => {
  if (pin) {
    pin = null;
    storage.remove('pastifico-kitchen-pin');
    renderPinButton();
    toast('Sessão da equipe encerrada.');
  } else {
    openPin();
  }
});

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

window.Pastifico.ready
  .then(() => {
    renderPinButton();
    load();
    window.Pastifico.subscribeOrders(load, setLive);
  })
  .catch((error) => {
    setLive('offline');
    toast(error.message, 'error');
  });
