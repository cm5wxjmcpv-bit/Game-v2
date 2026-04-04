/**
 * Google Apps Script Web App (DRY-RUN ONLY)
 * -----------------------------------------
 * Accepts builder game_sync_package payloads and performs validation only.
 * This script does NOT write files, does NOT call GitHub, and does NOT store secrets.
 */

var LEVEL_PATH_RE = /^data\/levels\/[a-z0-9_\-]+\.json$/;
var TEXTURE_PATH_RE = /^assets\/textures\/starter\/[a-z0-9_\-]+\.png$/;
var SAFE_ID_RE = /^[a-z0-9_\-]+$/;

function doGet() {
  return jsonResponse({
    ok: true,
    mode: 'dry_run',
    validated: true,
    errors: [],
    warnings: [],
    wouldWrite: {
      levelFile: null,
      textures: [],
      texturePackPatch: []
    },
    message: 'Google Apps Script dry-run endpoint is live. Use POST with game_sync_package.'
  });
}

function doPost(e) {
  var parseResult = parseRequestBody(e);
  if (!parseResult.ok) {
    return jsonResponse(buildFailureResponse(parseResult.errors, []));
  }

  var payload = parseResult.payload;
  var validation = validateGameSyncPackage(payload);
  if (!validation.ok) {
    return jsonResponse(buildFailureResponse(validation.errors, validation.warnings));
  }

  return jsonResponse({
    ok: true,
    mode: 'dry_run',
    validated: true,
    errors: [],
    warnings: validation.warnings,
    wouldWrite: {
      levelFile: {
        filename: payload.levelFile.filename,
        targetPath: payload.levelFile.targetPath
      },
      textures: payload.textures.map(function (entry) {
        return {
          id: entry.id,
          pngFilename: entry.pngFilename,
          targetPath: entry.targetPath
        };
      }),
      texturePackPatch: Array.isArray(payload.texturePackAdditions) ? payload.texturePackAdditions : []
    }
  });
}

function parseRequestBody(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return { ok: false, errors: ['Missing POST body.'] };
  }
  try {
    var payload = JSON.parse(e.postData.contents);
    if (!payload || typeof payload !== 'object') {
      return { ok: false, errors: ['Request body must be a JSON object.'] };
    }
    return { ok: true, payload: payload };
  } catch (error) {
    return { ok: false, errors: ['Invalid JSON: ' + String(error && error.message ? error.message : error)] };
  }
}

function validateGameSyncPackage(payload) {
  var errors = [];
  var warnings = [];

  if (payload.type !== 'game_sync_package') {
    errors.push('Invalid type. Expected "game_sync_package".');
  }
  if (payload.version !== 1) {
    errors.push('Unsupported version. Expected 1.');
  }

  if (!payload.levelFile || typeof payload.levelFile !== 'object') {
    errors.push('Missing levelFile object.');
  } else {
    validateLevelFile(payload.levelFile, errors);
  }

  if (!Array.isArray(payload.textures)) {
    errors.push('Missing textures array.');
  } else {
    payload.textures.forEach(function (entry, index) {
      validateTextureEntry(entry, index, errors, warnings);
    });
  }

  if (payload.texturePackPatchTarget !== 'data/texturepacks/default-pack.json') {
    errors.push('texturePackPatchTarget must be "data/texturepacks/default-pack.json".');
  }

  if (payload.texturePackAdditions !== undefined && !Array.isArray(payload.texturePackAdditions)) {
    errors.push('texturePackAdditions must be an array when provided.');
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

function validateLevelFile(levelFile, errors) {
  if (!isSafeFilename(levelFile.filename, '.json')) {
    errors.push('levelFile.filename is invalid. Expected a safe *.json filename.');
  }
  if (typeof levelFile.targetPath !== 'string' || !LEVEL_PATH_RE.test(levelFile.targetPath)) {
    errors.push('levelFile.targetPath is invalid. Must match data/levels/<safe-id>.json');
  }
}

function validateTextureEntry(entry, index, errors, warnings) {
  if (!entry || typeof entry !== 'object') {
    errors.push('textures[' + index + '] must be an object.');
    return;
  }
  if (!isSafeId(entry.id)) {
    errors.push('textures[' + index + '].id is invalid.');
  }
  if (!isSafeFilename(entry.pngFilename, '.png')) {
    errors.push('textures[' + index + '].pngFilename is invalid.');
  }
  if (typeof entry.targetPath !== 'string' || !TEXTURE_PATH_RE.test(entry.targetPath)) {
    errors.push('textures[' + index + '].targetPath is invalid.');
  }

  if (!entry.entryPatch || typeof entry.entryPatch !== 'object') {
    errors.push('textures[' + index + '].entryPatch is required.');
    return;
  }
  if (!isSafeId(entry.entryPatch.id)) {
    errors.push('textures[' + index + '].entryPatch.id is invalid.');
  }
  if (entry.entryPatch.id !== entry.id) {
    warnings.push('textures[' + index + '].entryPatch.id does not match texture id.');
  }
  if (typeof entry.entryPatch.image !== 'string' || !TEXTURE_PATH_RE.test(entry.entryPatch.image)) {
    errors.push('textures[' + index + '].entryPatch.image is invalid.');
  }
}

function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID_RE.test(value);
}

function isSafeFilename(value, extension) {
  if (typeof value !== 'string' || value.length < 3) {
    return false;
  }
  var ext = extension || '';
  if (ext && value.slice(-ext.length) !== ext) {
    return false;
  }
  var base = ext ? value.slice(0, -ext.length) : value;
  return SAFE_ID_RE.test(base);
}

function buildFailureResponse(errors, warnings) {
  return {
    ok: false,
    mode: 'dry_run',
    validated: false,
    errors: errors || [],
    warnings: warnings || [],
    wouldWrite: {
      levelFile: null,
      textures: [],
      texturePackPatch: []
    }
  };
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

