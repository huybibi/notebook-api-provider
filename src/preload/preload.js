'use strict';

/**
 * preload.js — Cầu nối an toàn. Renderer chỉ thấy đúng những hàm dưới đây.
 * Không expose ipcRenderer thô, không expose require.
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('notebook', {
  snapshot: () => invoke('app:snapshot'),
  recompute: () => invoke('app:recompute'),
  openDataFolder: () => invoke('app:openDataFolder'),
  openExternal: (url) => invoke('app:openExternal', url),
  presets: () => invoke('presets:list'),

  settings: {
    set: (patch) => invoke('settings:set', patch),
  },

  providers: {
    create: (payload) => invoke('provider:create', payload),
    addPresets: (keys) => invoke('provider:addPresets', keys),
    update: (id, patch) => invoke('provider:update', { id, patch }),
    remove: (id) => invoke('provider:delete', id),
    duplicate: (id) => invoke('provider:duplicate', id),
  },

  keys: {
    create: (args) => invoke('key:create', args),
    bulkCreate: (args) => invoke('key:bulkCreate', args),
    update: (id, patch) => invoke('key:update', { id, patch }),
    remove: (id) => invoke('key:delete', id),
    reveal: (id) => invoke('key:reveal', id),
    copy: (id) => invoke('key:copy', id),
    resetCooldown: (id) => invoke('key:resetCooldown', id),
  },

  models: {
    upsert: (args) => invoke('model:upsert', args),
    bulkAdd: (args) => invoke('model:bulkAdd', args),
    update: (id, patch) => invoke('model:update', { id, patch }),
    remove: (id) => invoke('model:delete', id),
    setAllEnabled: (providerId, enabled) => invoke('model:setAllEnabled', { providerId, enabled }),
    discover: (providerId) => invoke('model:discover', { providerId }),
    priceWeb: (providerId, url) => invoke('price:web', { providerId, url }),
  },

  probe: {
    provider: (args) => invoke('probe:provider', args),
    all: (args) => invoke('probe:all', args || {}),
    suggestModel: (providerId) => invoke('probe:suggestModel', providerId),
  },

  gateway: {
    start: () => invoke('gateway:start'),
    stop: () => invoke('gateway:stop'),
    status: () => invoke('gateway:status'),
  },

  journal: {
    add: (args) => invoke('journal:add', args),
    remove: (id) => invoke('journal:delete', id),
  },

  alerts: {
    markSeen: () => invoke('alerts:markSeen'),
    clear: () => invoke('alerts:clear'),
  },

  exporter: {
    preview: (kind, options) => invoke('export:preview', { kind, options }),
    save: (kind, options, suggestedName) => invoke('export:save', { kind, options, suggestedName }),
    restore: () => invoke('vault:restore'),
  },

  clipboard: {
    write: (text) => invoke('clipboard:write', { text }),
  },

  onProbeProgress: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on('probe:progress', listener);
    return () => ipcRenderer.removeListener('probe:progress', listener);
  },

  onMenuProbeAll: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('menu:probeAll', listener);
    return () => ipcRenderer.removeListener('menu:probeAll', listener);
  },
});
