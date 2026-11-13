/**
 * Tela de boas-vindas + animação de abertura do cardápio.
 * 1) Apresentação (título, fotos e destaques) com o botão "Fazer pedido";
 *    os números "embaralham" até o valor final.
 * 2) Ao tocar: a apresentação some e aparece a marca com uma barra de
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

  const finish = (played = true) => {
    // Evita que as animações de entrada padrão do hero rodem de novo depois da abertura.
    if (played) document.body.classList.add('intro-done');
    intro.remove();
    document.body.classList.remove('intro-active', 'intro-reveal', 'no-scroll');
    behind.forEach((element) => element.removeAttribute('inert'));
  };

  if (skip) {
    finish(false);
    return;
  }

  document.body.classList.add('intro-active', 'no-scroll');
  behind.forEach((element) => element.setAttribute('inert', ''));
  const cta = intro.querySelector('.intro-cta');
  requestAnimationFrame(() => cta.focus({ preventScroll: true }));
  if (!reducedMotion) setTimeout(() => intro.querySelectorAll('[data-scramble]').forEach((element) => scramble(element)), 700);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Embaralha os dígitos até chegar ao texto final (efeito do vídeo). */
  function scramble(element, duration = 1200) {
    const finalText = element.textContent;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      let digitIndex = 0;
      const digits = finalText.replace(/\D/g, '').length || 1;
      element.textContent = finalText.replace(/\d/g, (digit) => {
        digitIndex += 1;
        // Cada dígito "trava" no valor certo um pouco depois do anterior.
        return progress >= digitIndex / (digits + 1) + 0.25 ? digit : String(Math.floor(Math.random() * 10));
      });
      if (progress < 1) requestAnimationFrame(step);
      else element.textContent = finalText;
    };
    requestAnimationFrame(step);
  }

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

  cta.addEventListener('click', start);
})();
