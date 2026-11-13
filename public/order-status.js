const { escapeHtml, formatCurrency, timeAgo, toast, storage } = window.Pastifico;

const panel = document.querySelector('#order-status-panel');
const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') || storage.get('pastifico-last-order');

const STEPS = [
  { status: 'Recebido', title: 'Pedido recebido', text: 'A cozinha já recebeu o seu pedido.', icon: '🧾' },
  { status: 'Preparando', title: 'Em preparo', text: 'A massa está no fogo!', icon: '👨‍🍳' },
  { status: 'Pronto', title: 'Pronto para retirar', text: 'Retire no balcão e pague no caixa.', icon: '🔔' },
  { status: 'Entregue', title: 'Entregue', text: 'Buon appetito!', icon: '🍝' }
];

let lastStatus = null;

function render(order) {
  const current = STEPS.findIndex((step) => step.status === order.status);
  const step = STEPS[Math.max(0, current)];

  panel.innerHTML = `
    <div class="status-hero status-${escapeHtml(order.status.toLowerCase())}">
      <span class="status-icon" aria-hidden="true">${step.icon}</span>
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
    panel.innerHTML = `<div class="empty-state"><span aria-hidden="true">🤔</span><p>${escapeHtml(error.message)}</p></div>`;
  }
}

if (!orderId) {
  panel.innerHTML = '<div class="empty-state"><span aria-hidden="true">🍝</span><p>Você ainda não fez um pedido neste aparelho.</p></div>';
} else {
  if (params.get('novo')) toast('Pedido enviado para a cozinha!', 'success');
  load();
  window.Pastifico.subscribeOrders(load, () => {}, orderId);
}
