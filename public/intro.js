/**
 * Tela de boas-vindas + animação de abertura do cardápio.
 * 1) Tela escura de boas-vindas com o logotipo e o botão "Fazer pedido".
 * 2) Ao tocar: o texto some e o logotipo fica no centro com uma barra de
 *    carregamento nas cores da Itália.
 * 3) Um círculo se abre do centro revelando o cardápio, que sai do desfoque.
 *
 * Pula a abertura quando a URL tem #âncora (ex.: index.html#menu) ou ?semIntro.
 */
(function () {
  const intro = document.querySelector('#intro');
  if (!intro) return;

  const params = new URLSearchParams(location.search);
  const skip = location.hash || params.has('semIntro');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behind = Array.from(document.body.children).filter((element) => element !== intro && element.tagName !== 'SCRIPT');

  const finish = () => {
    intro.remove();
    document.body.classList.remove('intro-active', 'intro-reveal', 'no-scroll');
    behind.forEach((element) => element.removeAttribute('inert'));
  };

  if (skip) {
    finish();
    return;
  }

  document.body.classList.add('intro-active', 'no-scroll');
  behind.forEach((element) => element.setAttribute('inert', ''));
  const cta = intro.querySelector('.intro-cta');
  requestAnimationFrame(() => cta.focus({ preventScroll: true }));

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let started = false;
  async function start() {
    if (started) return;
    started = true;
    behind.forEach((element) => element.removeAttribute('inert'));
    window.scrollTo(0, 0);

    if (reducedMotion) {
      intro.classList.add('is-fading');
      await wait(300);
      finish();
      return;
    }

    intro.classList.add('is-loading');
    await wait(1300);

    intro.classList.add('is-revealing');
    document.body.classList.add('intro-reveal');
    await wait(1500);
    finish();
  }

  cta.addEventListener('click', (event) => {
    event.stopPropagation();
    start();
  });
  // Totem: tocar em qualquer lugar da tela de boas-vindas também começa.
  intro.addEventListener('click', start);
})();
