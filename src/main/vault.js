'use strict';

/**
 * vault.js — Bọc secret của API key.
 * Trên Windows dùng DPAPI qua Electron safeStorage; nếu không có thì rơi về base64
 * (có ghi rõ trong record là enc:false để UI cảnh báo người dùng).
 */

const crypto = require('crypto');
let safeStorage = null;

try {
  safeStorage = require('electron').safeStorage || null;
} catch (_) {
  safeStorage = null;
}

function isAvailable() {
  try {
    return !!(safeStorage && safeStorage.isEncryptionAvailable());
  } catch (_) {
    return false;
  }
}

function backendName() {
  if (!isAvailable()) return 'plain';
  try {
    return String(safeStorage.getSelectedStorageBackend ? safeStorage.getSelectedStorageBackend() : 'dpapi');
  } catch (_) {
    return 'dpapi';
  }
}

function encryptSecret(plain, preferEncrypt) {
  const text = plain == null ? '' : String(plain);
  if (preferEncrypt !== false && text && isAvailable()) {
    try {
      return { enc: true, v: 'dpapi', data: safeStorage.encryptString(text).toString('base64') };
    } catch (_) {
      /* rơi xuống plain */
    }
  }
  return { enc: false, v: 'plain', data: Buffer.from(text, 'utf8').toString('base64') };
}

function decryptSecret(rec) {
  if (!rec || !rec.data) return '';
  try {
    if (rec.enc) {
      if (!isAvailable()) return '';
      return safeStorage.decryptString(Buffer.from(rec.data, 'base64'));
    }
    return Buffer.from(rec.data, 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
}

function fingerprint(secret) {
  const s = secret == null ? '' : String(secret);
  if (!s) return { last4: '', prefix: '', sha256: '' };
  return {
    last4: s.slice(-4),
    prefix: s.slice(0, Math.min(8, Math.max(0, s.length - 4))),
    sha256: crypto.createHash('sha256').update(s).digest('hex').slice(0, 16),
  };
}

/** Che secret để hiển thị: sk-abcd…wxyz */
function maskSecret(secret) {
  const s = secret == null ? '' : String(secret);
  if (!s) return '';
  if (s.length <= 8) return '•'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4);
}

/** Che mọi secret xuất hiện trong 1 chuỗi (dùng cho log/lỗi). */
function redact(text, secrets) {
  let out = String(text == null ? '' : text);
  for (const s of secrets || []) {
    if (!s || s.length < 6) continue;
    out = out.split(s).join(maskSecret(s));
  }
  return out.replace(/(sk-[A-Za-z0-9_\-]{6,})/g, (m) => maskSecret(m));
}

module.exports = {
  isAvailable,
  backendName,
  encryptSecret,
  decryptSecret,
  fingerprint,
  maskSecret,
  redact,
};
