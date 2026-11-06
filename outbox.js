// Спільний модуль сторінки і service worker: IndexedDB + черга відправки.
const DBN = 'vyizd_ik', DBV = 2;
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, DBV);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['ph', 'outbox', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return idb().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode); let out; const q = fn(t.objectStore(store));
    if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const IDB = {
  get: (s, k) => tx(s, 'readonly', st => st.get(k)),
  put: (s, k, v) => tx(s, 'readwrite', st => st.put(v, k)),
  del: (s, k) => tx(s, 'readwrite', st => st.delete(k)),
  keys: s => tx(s, 'readonly', st => st.getAllKeys())
};
let flushing = false;
// Відправляє чергу. Помилка мережі — зупиняємось і повторюємо пізніше.
// Помилка сервера по одному запису (напр. об'єкт видалено) — запис позначається і НЕ блокує решту черги.
async function flushOutbox(onProgress) {
  if (flushing) return { busy: true };
  flushing = true; let sent = 0, err = null; const failed = [];
  try {
    const url = await IDB.get('kv', 'url');
    if (!url) return { err: 'Не вказано адресу сервера' };
    const keys = (await IDB.keys('outbox')).sort();
    for (const k of keys) {
      const it = await IDB.get('outbox', k); if (!it) continue;
      let j;
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: it.body });
        j = await r.json();
      } catch (e) { err = 'немає зв\'язку з сервером'; break; }       // мережа — стоп
      if (j && j.ok) { await IDB.del('outbox', k); sent++; if (onProgress) onProgress(sent, keys.length, it); }
      else {                                                            // сервер відмовив — позначити, йти далі
        it.fail = String((j && j.error) || 'помилка сервера'); it.tries = (it.tries || 0) + 1; it.failedAt = new Date().toISOString();
        await IDB.put('outbox', k, it); failed.push({ key: k, label: it.label, visit: it.visit, error: it.fail });
      }
    }
  } finally { flushing = false; }
  return { sent, err: err || (failed.length ? failed.length + ' запис(ів) відхилено сервером: ' + failed[0].error : null), failed };
}
