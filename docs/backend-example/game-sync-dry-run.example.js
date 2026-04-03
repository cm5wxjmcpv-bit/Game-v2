/**
 * Example backend dry-run handler for builder game sync packages.
 * This is a sample/stub only. It does NOT write files or push to GitHub.
 *
 * Usage (example):
 *   const express = require('express');
 *   const app = express();
 *   app.use(express.json({ limit: '5mb' }));
 *   app.post('/api/game-sync/dry-run', gameSyncDryRunHandler);
 */

function isSafeLevelPath(pathValue) {
  return typeof pathValue === 'string'
    && /^data\/levels\/[a-z0-9_\-]+\.json$/.test(pathValue);
}

function isSafeTexturePath(pathValue) {
  return typeof pathValue === 'string'
    && /^assets\/textures\/starter\/[a-z0-9_\-]+\.png$/.test(pathValue);
}

function validateGameSyncPackage(payload) {
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a JSON object.');
    return { errors, warnings };
  }
  if (payload.type !== 'game_sync_package' || payload.version !== 1) {
    errors.push('Invalid package type/version.');
  }

  if (!payload.levelFile || typeof payload.levelFile !== 'object') {
    errors.push('Missing levelFile object.');
  } else if (!isSafeLevelPath(payload.levelFile.targetPath)) {
    errors.push('Invalid levelFile targetPath.');
  }

  if (!Array.isArray(payload.textures)) {
    errors.push('Missing textures array.');
  } else {
    payload.textures.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        errors.push(`textures[${index}] must be an object.`);
        return;
      }
      if (!entry.id || typeof entry.id !== 'string') {
        errors.push(`textures[${index}] missing valid id.`);
      }
      if (!isSafeTexturePath(entry.targetPath)) {
        errors.push(`textures[${index}] has invalid targetPath.`);
      }
      if (!entry.entryPatch || typeof entry.entryPatch !== 'object') {
        errors.push(`textures[${index}] missing entryPatch.`);
      } else {
        if (entry.entryPatch.id !== entry.id) {
          warnings.push(`textures[${index}] entryPatch.id does not match texture id.`);
        }
        if (!isSafeTexturePath(entry.entryPatch.image)) {
          errors.push(`textures[${index}] entryPatch.image has invalid path.`);
        }
      }
    });
  }

  if (payload.texturePackPatchTarget !== 'data/texturepacks/default-pack.json') {
    errors.push('texturePackPatchTarget must be data/texturepacks/default-pack.json.');
  }

  return { errors, warnings };
}

function gameSyncDryRunHandler(req, res) {
  const payload = req.body;
  const { errors, warnings } = validateGameSyncPackage(payload);
  const ok = errors.length === 0;

  return res.status(ok ? 200 : 400).json({
    ok,
    mode: 'dry_run',
    validated: ok,
    errors,
    warnings,
    wouldWrite: ok
      ? {
          levelFile: payload.levelFile,
          textures: payload.textures.map((entry) => ({
            id: entry.id,
            targetPath: entry.targetPath
          })),
          texturePackPatch: Array.isArray(payload.texturePackAdditions) ? payload.texturePackAdditions : []
        }
      : {
          levelFile: null,
          textures: [],
          texturePackPatch: []
        }
  });
}

module.exports = {
  gameSyncDryRunHandler,
  validateGameSyncPackage
};

