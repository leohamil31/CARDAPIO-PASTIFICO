/**
 * Microinterações compartilhadas por todas as telas:
 * - "onda" (ripple) a partir do ponto tocado em botões, categorias e ícones;
 * - respeita quem prefere menos movimento.
 */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const TARGETS = '.button, .chip, .add-button, .stepper button, .icon-button, .tool-button, .site-nav a, .site-nav-button, .cart-fab, .segmented label, .option';

  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest(TARGETS);
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
})();
