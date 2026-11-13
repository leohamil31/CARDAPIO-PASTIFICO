const { escapeHtml, formatCurrency, timeAgo, toast, storage } = window.Pastifico;

const panel = document.querySelector('#order-status-panel');
const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') || storage.get('pastifico-last-order');

// Ícones em SVG (traço), no lugar de emojis, para manter o padrão visual.
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  Recebido: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  Preparando: svg('<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 11h20"/><path d="M9 7c0-1.5 1-1.5 1-3M13 7c0-1.5 1-1.5 1-3"/>'),
  Pronto: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/><path d="M12 3v2"/>'),
  Entregue: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>')
};

const STEPS = [
  { status: 'Recebido', title: 'Pedido recebido', text: 'A cozinha já recebeu o seu pedido.' },
  { status: 'Preparando', title: 'Em preparo', text: 'A massa está no fogo!' },
  { status: 'Pronto', title: 'Pronto para retirar', text: 'Retire no balcão e pague no caixa.' },
  { status: 'Entregue', title: 'Entregue', text: 'Buon appetito!' }
];

let lastStatus = null;

function render(order) {
  const current = STEPS.findIndex((step) => step.status === order.status);
  const step = STEPS[Math.max(0, current)];

  panel.innerHTML = `
    <div class="status-hero status-${escapeHtml(order.status.toLowerCase())}">
      <span class="status-icon">${ICONS[step.status]}</span>
      <div>
        <p class="kicker">Pedido #${escapeHtml(order.id.slice(0, 6))} · ${timeAgo(order.createdAt)}</p>
        <h1>${step.title}</h1>
        <p>${step.text}</p>
      </div>
    </div>

    <ol class="progress" aria-label="Andamento do pedido">
      ${STEPS.map((item, index) => `
        <li class="${index < current ? 'done' : index === current ? 'current' : ''}">
          <span class="progress-dot" aria-hidden="true">${index < current ? '✓' : index + 1}</span>
          <span>${item.title}</span>
        </li>`).join('')}
    </ol>

    <dl class="summary-grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(order.customerName)}</dd></div>
      <div><dt>Mesa</dt><dd>${escapeHtml(order.tableNumber)}</dd></div>
      <div><dt>Pagamento</dt><dd>${escapeHtml(order.paymentMethod)} · ${escapeHtml(order.paymentStatus)}</dd></div>
    </dl>

    <ul class="summary-items">
      ${order.items.map((item) => `
        <li><span>${item.quantity}× ${escapeHtml(item.name)}${item.options?.length ? `<small>${escapeHtml(item.options.join(', '))}</small>` : ''}</span>
        <strong>${formatCurrency(item.subtotal)}</strong></li>`).join('')}
    </ul>
    <div class="summary-total"><span>Total</span><strong>${formatCurrency(order.total)}</strong></div>
    <p class="muted small center">Esta tela se atualiza sozinha.</p>`;

  if (lastStatus && lastStatus !== order.status) {
    toast(`Seu pedido agora está: ${order.status}`, 'success');
    if (navigator.vibrate) navigator.vibrate(200);
  }
  lastStatus = order.status;
}

async function load() {
  try {
    render(await window.Pastifico.getOrder(orderId));
  } catch (error) {
    panel.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

if (!orderId) {
  panel.innerHTML = '<div class="empty-state"><p>Você ainda não fez um pedido neste aparelho.</p><a class="button button-primary" href="index.html">Fazer pedido</a></div>';
} else {
  if (params.get('novo')) toast('Pedido enviado para a cozinha!', 'success');
  load();
  window.Pastifico.subscribeOrders(load, () => {}, orderId);
}
