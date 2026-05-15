// Custom tooltip — delegates from [data-tip] attributes
(function () {
  const el = document.getElementById('tip');
  let hideTimer;

  function show(text, x, y) {
    clearTimeout(hideTimer);
    el.textContent = text;
    // position: prefer below, flip above if clipped
    const GAP = 8;
    const rect = el.getBoundingClientRect();
    let top = y + GAP;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - GAP;
    let left = x + GAP;
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - GAP;
    el.style.left = left + 'px';
    el.style.top  = top  + 'px';
    el.classList.add('visible');
  }

  function hide() {
    hideTimer = setTimeout(() => el.classList.remove('visible'), 80);
  }

  document.addEventListener('mouseover', function (e) {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    show(target.dataset.tip, e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', function (e) {
    if (!el.classList.contains('visible')) return;
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    const GAP = 8;
    let top  = e.clientY + GAP;
    let left = e.clientX + GAP;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (top  + h > window.innerHeight - 8) top  = e.clientY - h - GAP;
    if (left + w > window.innerWidth  - 8) left = e.clientX - w - GAP;
    el.style.left = left + 'px';
    el.style.top  = top  + 'px';
  });

  document.addEventListener('mouseout', function (e) {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    hide();
  });

  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', hide);
})();
