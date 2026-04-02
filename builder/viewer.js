(function () {
  'use strict';

  const DEFAULT_WIDTH = 30;
  const DEFAULT_HEIGHT = 30;
  const STORAGE_PREVIEW_KEY = 'levelBuilderPreviewMap';

  const ID_COLORS = {
    floor_grass_a: '#9ac8b4',
    floor_grass_b: '#7fb299',
    floor_stone_a: '#d3be95',
    floor_stone_b: '#b6a277',
    floor_dirt_a: '#96724f',
    floor_dirt_b: '#7b5d40',
    floor_sand_a: '#ebd089',
    floor_wood_a: '#9f7851',
    floor_marble_a: '#e2e8f0',
    floor_ice_a: '#a5d8ee',
    wall_rock_a: '#4c5563',
    wall_rock_b: '#5d6471',
    wall_brick_a: '#994b3f',
    wall_brick_b: '#7b8795',
    wall_wood_a: '#6b4a2f',
    hazard_lava: '#e65032',
    hazard_water: '#2a78c8',
    hazard_swamp: '#5e7f45',
    hazard_poison: '#4d9c34',
    special_portal_pad: '#8f6a3b',
    empty: '#e9edf3',
    floor_stone: '#d3be95',
    floor_wood: '#c4b0e2',
    floor_grass: '#9ac8b4',
    floor_sand: '#ebd089',
    wall_stone: '#4c5563',
    bridge: '#8f6a3b',
    water: '#2a78c8',
    lava: '#e65032',
    swamp: '#5e7f45',
    player_start: '#22c55e',
    portal_level: '#6c4ad2',
    enemy_spawn_basic: '#8b5a2b',
    blacksmith: '#b45309',
    armor_shop: '#7c3aed',
    potion_shop: '#be185d',
    special_shop: '#9333ea',
    general_shop: '#0f766e',
    fountain: '#0ea5e9',
    npc_spot: '#64748b',
    chest_common: '#92400e',
    trigger_marker: '#1d4ed8',
    enemy_spawn_boss: '#991b1b'
  };

  const LEGACY_ID_TO_TYPE = {
    0: 'empty',
    1: 'wall_stone',
    2: 'water',
    3: 'lava',
    4: 'player_start',
    5: 'portal_level',
    6: 'enemy_spawn_basic',
    7: 'bridge',
    10: 'floor_stone',
    11: 'floor_wood',
    12: 'floor_grass',
    13: 'floor_sand',
    21: 'swamp',
    100: 'blacksmith',
    101: 'armor_shop',
    102: 'potion_shop',
    103: 'special_shop',
    104: 'general_shop',
    105: 'fountain',
    106: 'npc_spot',
    120: 'chest_common',
    121: 'trigger_marker',
    122: 'enemy_spawn_boss'
  };

  const dom = {
    viewerGridContainer: document.getElementById('viewerGridContainer'),
    viewerImportInput: document.getElementById('viewerImportInput'),
    viewerGridSizeLabel: document.getElementById('viewerGridSizeLabel'),
    viewerGridSizeLabel2: document.getElementById('viewerGridSizeLabel2'),
    viewerMapTypeLabel: document.getElementById('viewerMapTypeLabel'),
    viewerMapIdLabel: document.getElementById('viewerMapIdLabel'),
    viewerMessage: document.getElementById('viewerMessage'),
    viewerTileLegend: document.getElementById('viewerTileLegend'),
    loadPreviewBtn: document.getElementById('loadPreviewBtn'),
    backToBuilderBtn: document.getElementById('backToBuilderBtn')
  };

  const state = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    mapType: 'level',
    mapId: 'unknown',
    tileLayer: createLayerGrid(DEFAULT_WIDTH, DEFAULT_HEIGHT, 'empty'),
    objectLayer: createLayerGrid(DEFAULT_WIDTH, DEFAULT_HEIGHT, 'none')
  };

  initialize();

  function initialize() {
    renderLegend();
    renderGrid();
    bindEvents();
    updateMapLabels();
    updateStatus('Viewer ready. Load a JSON file or load preview from builder.');
  }

  function createLayerGrid(width, height, value) {
    return Array.from({ length: height }, function () {
      return Array(width).fill(value);
    });
  }

  function bindEvents() {
    dom.viewerImportInput.addEventListener('change', function (event) {
      if (!event.target.files || !event.target.files[0]) {
        return;
      }
      importMapFromFile(event.target.files[0]);
      event.target.value = '';
    });

    dom.loadPreviewBtn.addEventListener('click', function () {
      try {
        const raw = window.localStorage.getItem(STORAGE_PREVIEW_KEY);
        if (!raw) {
          updateStatus('No preview map found. Open viewer from builder after editing a map.', true);
          return;
        }
        const parsed = JSON.parse(raw);
        const normalized = normalizeImportedPayload(parsed);
        applyImportedPayload(normalized, 'Preview loaded from builder.');
      } catch (error) {
        updateStatus('Failed to load preview from builder: ' + error.message, true);
      }
    });

    dom.backToBuilderBtn.addEventListener('click', function () {
      window.location.href = 'index.html';
    });
  }

  function renderLegend() {
    dom.viewerTileLegend.innerHTML = '';
    dom.viewerTileLegend.innerHTML = '<li>Tile colors = tile layer, colored dot = object/marker layer.</li>';
  }

  function renderGrid() {
    dom.viewerGridContainer.innerHTML = '';
    dom.viewerGridContainer.style.setProperty('--grid-width', String(state.width));
    dom.viewerGridContainer.style.setProperty('--grid-height', String(state.height));

    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const cell = document.createElement('div');
        const marker = document.createElement('span');
        marker.className = 'cell-marker';
        cell.className = 'cell';
        const tileId = state.tileLayer[row][col];
        const objectId = state.objectLayer[row][col];
        cell.style.backgroundColor = getColor(tileId, '#9ca3af');
        marker.textContent = objectId !== 'none' ? '●' : '';
        marker.style.color = objectId !== 'none' ? getColor(objectId, '#7c3aed') : 'transparent';
        marker.title = objectId !== 'none' ? objectId : '';
        cell.appendChild(marker);
        dom.viewerGridContainer.appendChild(cell);
      }
    }

    dom.viewerGridSizeLabel.textContent = String(state.width);
    dom.viewerGridSizeLabel2.textContent = String(state.height);
    updateMapLabels();
  }

  function getColor(id, fallback) {
    return Object.prototype.hasOwnProperty.call(ID_COLORS, id) ? ID_COLORS[id] : fallback;
  }

  function importMapFromFile(file) {
    const reader = new FileReader();

    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const normalized = normalizeImportedPayload(parsed);
        applyImportedPayload(normalized, 'Map loaded from file.');
      } catch (error) {
        updateStatus('Load failed: ' + error.message, true);
      }
    };

    reader.onerror = function () {
      updateStatus('Load failed: unable to read file.', true);
    };

    reader.readAsText(file);
  }

  function normalizeImportedPayload(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('JSON must be an object.');
    }

    if (data.map && typeof data.map === 'object') {
      return normalizeMapLikeObject(data.map);
    }

    return normalizeMapLikeObject(data);
  }

  function normalizeMapLikeObject(mapData) {
    const width = Number.isInteger(mapData.width) ? mapData.width : Number.isInteger(mapData.gridSize) ? mapData.gridSize : null;
    const height = Number.isInteger(mapData.height) ? mapData.height : Number.isInteger(mapData.gridSize) ? mapData.gridSize : null;

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('width/height (or gridSize) must be positive integers.');
    }

    const tileSource = Array.isArray(mapData.tileLayer) ? mapData.tileLayer : mapData.tiles;
    if (!Array.isArray(tileSource) || tileSource.length !== height) {
      throw new Error('tiles must be an array with exactly height rows.');
    }

    const tileLayer = tileSource.map(function (row) {
      if (!Array.isArray(row) || row.length !== width) {
        throw new Error('Each tile row must have exactly width columns.');
      }
      return row.map(function (entry) {
        return normalizeTile(entry);
      });
    });

    let objectLayer = createLayerGrid(width, height, 'none');

    if (Array.isArray(mapData.objectLayer) && mapData.objectLayer.length === height) {
      objectLayer = mapData.objectLayer.map(function (row) {
        if (!Array.isArray(row) || row.length !== width) {
          throw new Error('Each object row must have exactly width columns.');
        }
        return row.map(function (entry) {
          return normalizeObject(entry);
        });
      });
    } else if (Array.isArray(mapData.objects)) {
      mapData.objects.forEach(function (entry) {
        if (entry && Number.isInteger(entry.x) && Number.isInteger(entry.y) && entry.x >= 0 && entry.x < width && entry.y >= 0 && entry.y < height) {
          objectLayer[entry.y][entry.x] = normalizeObject(entry.id);
        }
      });
    } else {
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const normalized = normalizeLegacyCombined(tileSource[row][col]);
          tileLayer[row][col] = normalized.tile;
          objectLayer[row][col] = normalized.object;
        }
      }
    }

    return {
      width: width,
      height: height,
      mapType: mapData.type === 'town' || mapData.mapType === 'town' ? 'town' : 'level',
      mapId: String(mapData.id || mapData.mapId || 'imported_map'),
      tileLayer: tileLayer,
      objectLayer: objectLayer
    };
  }

  function normalizeLegacyCombined(value) {
    const normalized = typeof value === 'number' ? LEGACY_ID_TO_TYPE[value] : value;
    if (typeof normalized !== 'string') {
      return { tile: 'empty', object: 'none' };
    }
    if (normalized.indexOf('floor_') === 0 || normalized.indexOf('wall_') === 0 || normalized === 'empty' || normalized === 'bridge' || normalized === 'water' || normalized === 'lava' || normalized === 'swamp') {
      return { tile: normalized, object: 'none' };
    }
    return { tile: 'empty', object: normalized };
  }

  function normalizeTile(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (Number.isInteger(value)) {
      const mapped = LEGACY_ID_TO_TYPE[value];
      if (mapped) {
        return normalizeLegacyCombined(mapped).tile;
      }
    }
    return 'empty';
  }

  function normalizeObject(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (Number.isInteger(value) && LEGACY_ID_TO_TYPE[value]) {
      return normalizeLegacyCombined(LEGACY_ID_TO_TYPE[value]).object;
    }
    return 'none';
  }

  function applyImportedPayload(normalized, successMessage) {
    state.width = normalized.width;
    state.height = normalized.height;
    state.mapType = normalized.mapType;
    state.mapId = normalized.mapId;
    state.tileLayer = normalized.tileLayer;
    state.objectLayer = normalized.objectLayer;

    renderGrid();
    updateStatus(successMessage);
  }

  function updateMapLabels() {
    dom.viewerMapTypeLabel.textContent = state.mapType;
    dom.viewerMapIdLabel.textContent = state.mapId;
  }

  function updateStatus(text, isError) {
    dom.viewerMessage.textContent = text;
    dom.viewerMessage.style.color = isError ? '#b42318' : '#42556f';
  }
})();
