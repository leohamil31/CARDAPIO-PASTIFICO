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
// O som fica LIGADO por padrão; só desliga se a equipe apertar o botão.
// (Chave nova: ignora o "desligado" salvo pela versão antiga, que começava sem som.)
let soundOn = storage.get('pastifico-som') !== 'off';
let pin = null;

// ---------- som de novo pedido (Web Audio, sem arquivos) ----------
// Um único AudioContext para a página inteira. Antes era criado um contexto novo
// a cada aviso: o navegador limita a quantidade de contextos e, sem um toque do
// usuário, eles nascem "suspensos" (mudos) — por isso o som parava de tocar.
let audioContext = null;
let pendingChime = false;

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioCtor();
  return audioContext;
}

function playTones(context) {
  const start = context.currentTime + 0.02;
  // Toca a sequência duas vezes para chamar a atenção na cozinha.
  [0, 0.9].forEach((offset) => {
    [880, 1320].forEach((frequency, index) => {
      const at = start + offset + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  });
}

async function chime() {
  if (!soundOn) return;
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state !== 'running') await context.resume();
  } catch { /* segue para a checagem abaixo */ }
  if (context.state !== 'running') {
    // O navegador bloqueou o áudio porque ninguém tocou na tela ainda:
    // guarda o aviso e toca no primeiro toque/clique.
    if (!pendingChime) toast('Toque na tela para ativar o som dos pedidos.', 'info');
    pendingChime = true;
    return;
  }
  pendingChime = false;
  try { playTones(context); } catch { /* áudio indisponível */ }
}

/** Qualquer interação da equipe "destrava" o áudio para os próximos pedidos. */
function unlockAudio() {
  const context = getAudioContext();
  if (!context) return;
  const after = () => { if (pendingChime) chime(); };
  if (context.state === 'running') after();
  else context.resume().then(after, () => {});
}
['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
  document.addEventListener(type, unlockAudio, { capture: true, passive: true });
});

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
          <li><b>${escapeHtml(item.quantity)}×</b> <span>${escapeHtml(item.name)}${item.options?.length ? `<small>${escapeHtml(item.options.join(' · '))}</small>` : ''}</span></li>`).join('')}
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
  storage.set('pastifico-som', soundOn ? 'on' : 'off');
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
