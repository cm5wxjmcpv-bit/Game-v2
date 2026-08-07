const params = new URL(window.location.href).searchParams;

if (params.get('from') === 'testing') {
  const backButton = document.getElementById('backToBuilderBtn');
  if (backButton) {
    backButton.textContent = 'Back to Testing Space';
    backButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = 'testing-space.html';
    }, true);
  }
}

if (params.get('autoload') === '1') {
  const loadButton = document.getElementById('loadPreviewBtn');
  if (loadButton) queueMicrotask(() => loadButton.click());
}
