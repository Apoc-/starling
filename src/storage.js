// Durable save and portable import/export boundary.
export const SAVE_VERSION = 1;

export async function openStore({ indexedDB = globalThis.indexedDB, validateState, name = 'starling-save' } = {}) {
  if (typeof validateState !== 'function') throw new TypeError('A validateState validator is required.');
  if (!indexedDB || typeof indexedDB.open !== 'function') throw new Error('IndexedDB is unavailable; progress cannot be saved.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Save database opening is blocked by another tab. Close the other tab and retry.'));
    };
    request.onupgradeneeded = () => {
      if (blocked) request.transaction.abort();
      else request.result.createObjectStore('saves');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });

  function read(key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('saves', 'readonly');
      const request = transaction.objectStore('saves').get(key);
      transaction.oncomplete = () => {
        try {
          resolve(request.result === undefined ? null : checkEnvelope(request.result, validateState));
        } catch (error) { reject(error); }
      };
      transaction.onabort = () => reject(transaction.error || new Error('Save transaction aborted.'));
    });
  }

  async function commit(state, expectedRevision) {
    if (expectedRevision === null) expectedRevision = 0;
    const snapshot = structuredClone(state);
    checkEnvelope({ version: SAVE_VERSION, revision: 1, state: snapshot }, validateState);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const saves = transaction.objectStore('saves');
      const request = saves.get('current');
      let next;
      let failure;
      request.onsuccess = () => {
        try {
          const current = request.result;
          if (current !== undefined) checkEnvelope(current, validateState);
          if ((current?.revision ?? 0) !== expectedRevision) {
            const error = new Error(`Save revision conflict: expected ${expectedRevision}, found ${current?.revision ?? 0}.`);
            error.name = 'SaveConflictError';
            throw error;
          }
          next = { version: SAVE_VERSION, revision: (current?.revision ?? 0) + 1, state: snapshot };
          checkEnvelope(next, validateState);
          if (current !== undefined) saves.put(current, 'backup');
          saves.put(next, 'current');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(failure || transaction.error || new Error('Save transaction aborted.'));
    });
  }

  return {
    commit,
    load: () => read('current'),
    backup: () => read('backup'),
    close: () => db.close(),
  };
}

function checkEnvelope(envelope, validateState) {
  if (typeof validateState !== 'function') throw new TypeError('A validateState validator is required.');
  if (!envelope || Object.getPrototypeOf(envelope) !== Object.prototype) {
    throw new Error('Malformed save envelope.');
  }
  if (envelope.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${envelope.version}. Expected version ${SAVE_VERSION}.`);
  }
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 1) {
    throw new Error('Malformed save revision: expected a positive safe integer.');
  }
  if (validateState(envelope.state) !== true) throw new Error('Invalid save state.');
  return envelope;
}

function checkText(text) {
  if (typeof text !== 'string') throw new TypeError('Save text must be a string.');
  if (text.length > 100000) throw new Error('Save is too large; maximum length is 100000 characters.');
  return text;
}

export function parseSave(text, validateState) {
  return checkEnvelope(JSON.parse(checkText(text)), validateState);
}

export function exportSave(envelope, validateState) {
  const text = checkText(JSON.stringify(checkEnvelope(envelope, validateState)));
  // Validate what the file actually contains, including JSON's number conversions.
  parseSave(text, validateState);
  return text;
}
