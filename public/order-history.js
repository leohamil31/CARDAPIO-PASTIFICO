const { escapeHtml, formatCurrency } = window.Pastifico;

const panel = document.querySelector('#history-panel');
const filters = document.querySelector('#filters');
document.querySelector('#logout-button').addEventListener('click', () => window.Pastifico.logoutStaff());
let orders = [];
let filter = 'all';

function render() {
  const list = orders.filter((order) => filter === 'all' || order.status === filter);
  if (!list.length) {
    panel.innerHTML = '<div class="empty-state"><p>Nenhum pedido por aqui.</p></div>';
    return;
  }

  panel.innerHTML = list.map((order, index) => `
    <article class="history-card reveal in-view" style="--i:${index % 9}">
      <header>
        <div>
          <strong>Mesa ${escapeHtml(order.tableNumber)} · ${escapeHtml(order.customerName)}</strong>
          <small>#${escapeHtml(order.id.slice(0, 6))} · ${new Date(order.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
        </div>
        <span class="status-badge status-${escapeHtml(order.status.toLowerCase())}">${escapeHtml(order.status)}</span>
      </header>
      <ul>
        ${order.items.map((item) => `<li><span>${item.quantity}× ${escapeHtml(item.name)}</span><span>${formatCurrency(item.subtotal)}</span></li>`).join('')}
      </ul>
      <footer><span>${escapeHtml(order.paymentMethod)}</span><strong>${formatCurrency(order.total)}</strong></footer>
    </article>`).join('');
}

async function load() {
  try {
    orders = (await window.Pastifico.listOrders({ limit: 100 })).reverse();
    render();
  } catch (error) {
    if (/PIN/i.test(error.message)) window.Pastifico.logoutStaff();
    panel.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

filters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  filters.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('active', chip === button));
  render();
});

window.Pastifico.requireStaff()
  .then(() => {
    load();
    window.Pastifico.subscribeOrders(load);
  })
  .catch((error) => {
    panel.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
  });
