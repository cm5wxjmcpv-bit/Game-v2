(function () {
  'use strict';

  const select = document.getElementById('mapTypeSelect');
  if (!select) return;

  const importInput = document.getElementById('importInput');
  const rawExportButton = document.getElementById('exportBtn');
  const mapTypeLabel = document.getElementById('mapTypeLabel');
  const gameSyncPanel = document.querySelector('.game-sync-preview-panel');
  let aliasing = false;
  let importToken = 0;

  if (![...select.options].some((option) => option.value === 'building')) {
    const option = document.createElement('option');
    option.value = 'building';
    option.textContent = 'Building';
    select.appendChild(option);
  }

  function setBuildingUi(active) {
    document.body.dataset.builderMapType = active ? 'building' : select.value;
    if (active && mapTypeLabel) mapTypeLabel.textContent = 'building';
    if (gameSyncPanel) gameSyncPanel.hidden = active;
  }

  function useTownEditorBehaviorForBuilding() {
    if (aliasing || select.value !== 'building') return;
    aliasing = true;
    select.value = 'town';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = 'building';
    aliasing = false;
    setBuildingUi(true);
  }

  select.addEventListener('change', function () {
    if (aliasing) return;
    if (select.value === 'building') {
      useTownEditorBehaviorForBuilding();
      return;
    }
    setBuildingUi(false);
  });

  if (rawExportButton) {
    rawExportButton.addEventListener('click', function () {
      if (select.value !== 'building') return;
      aliasing = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      aliasing = false;
      window.setTimeout(useTownEditorBehaviorForBuilding, 0);
    }, true);
  }

  if (importInput) {
    importInput.addEventListener('change', function (event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const token = ++importToken;
      file.text().then(function (text) {
        if (token !== importToken) return;
        const parsed = JSON.parse(text);
        const source = parsed && typeof parsed.map === 'object' ? parsed.map : parsed;
        const type = String(source?.mapType || source?.type || '').toLowerCase();
        if (type !== 'building') return;
        const expectedId = String(source?.mapId || source?.id || '').trim().toLowerCase();
        let attempts = 0;
        const timer = window.setInterval(function () {
          attempts += 1;
          const currentId = String(document.getElementById('mapIdInput')?.value || '').trim().toLowerCase();
          const imported = !expectedId || currentId === expectedId;
          if (!imported && attempts < 100) return;
          window.clearInterval(timer);
          select.value = 'building';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }, 20);
      }).catch(function () {
        // The established builder import handler owns malformed-file reporting.
      });
    });
  }

  if (select.value === 'building') useTownEditorBehaviorForBuilding();
  else setBuildingUi(false);
})();
