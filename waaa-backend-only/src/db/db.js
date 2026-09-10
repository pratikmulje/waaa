/*
==================================================
WAAA "db" SHIM
==================================================
A drop-in replacement for the Firestore Admin `db`
object, backed by local JSON files (localStore.js)
instead of Google Cloud. Implements exactly the
subset of the Firestore API this project actually
uses: collection().doc()/.where()/.orderBy()/.limit(),
.get(), .set(), .add(), .count(), .onSnapshot().

Why this exists: every file that used to talk to
Firestore imports `db` from this same path and calls
the same chainable methods. By matching that shape
here, none of those files needed to change — only
this file (and its former Firestore-SDK version) did.

Date handling: Firestore Timestamps support .toDate()
and .toMillis(). Plain JS Date values passed into
.set()/.add() are stored on disk tagged as
{ __waaaDate: true, iso }, and re-hydrated on read
into a small object exposing the same .toDate()/
.toMillis() methods, so calling code doesn't need to
know or care that storage is now local JSON instead
of Firestore.
==================================================
*/

import fs from "fs";
import { readCollection, writeCollection, withCollectionLock, collectionFilePath, genId } from "./localStore.js";
import { getBaseDataDir } from "../intelligence/storageConfig.js";
import fsSync from "fs";
import path from "path";

function __filePath(name) {
  return path.join(getBaseDataDir(), `${name}.json`);
}

// Lock-free read/write, for use ONLY inside a block already holding the
// collection lock (via withCollectionLock) — calling the locked
// readCollection/writeCollection here would deadlock against ourselves.
function readCollectionUnlocked(name) {
  const fp = __filePath(name);
  if (!fsSync.existsSync(fp)) return [];
  const raw = fsSync.readFileSync(fp, "utf-8").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeCollectionUnlocked(name, docs) {
  const dataDir = getBaseDataDir();
  if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });
  const fp = __filePath(name);
  const tmp = `${fp}.tmp.${process.pid}.${Date.now()}`;
  fsSync.writeFileSync(tmp, JSON.stringify(docs, null, 2), "utf-8");
  fsSync.renameSync(tmp, fp);
}

const DATE_TAG = "__waaaDate";

function wrapDates(value) {
  if (value instanceof Date) {
    return { [DATE_TAG]: true, iso: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(wrapDates);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = wrapDates(v);
    return out;
  }
  return value;
}

function unwrapDates(value) {
  if (value && typeof value === "object" && value[DATE_TAG]) {
    const iso = value.iso;
    return {
      toDate: () => new Date(iso),
      toMillis: () => new Date(iso).getTime(),
      toISOString: () => iso,
    };
  }
  if (Array.isArray(value)) {
    return value.map(unwrapDates);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = unwrapDates(v);
    return out;
  }
  return value;
}

// A raw stored field's plain comparable value, for where()/orderBy() —
// unwraps a tagged date into epoch ms, leaves everything else as-is.
function comparableValue(raw) {
  if (raw && typeof raw === "object" && raw[DATE_TAG]) {
    return new Date(raw.iso).getTime();
  }
  return raw;
}

function applyOp(rawFieldValue, op, target) {
  const v = comparableValue(rawFieldValue);
  switch (op) {
    case "==":
      return v === target;
    case "!=":
      return v !== target;
    case ">":
      return v > target;
    case ">=":
      return v >= target;
    case "<":
      return v < target;
    case "<=":
      return v <= target;
    default:
      return false;
  }
}

class DocSnapshot {
  constructor(id, raw) {
    this.id = id;
    this._raw = raw;
    this.exists = Boolean(raw);
  }

  data() {
    if (!this._raw) return undefined;
    const { id, ...rest } = this._raw;
    return unwrapDates(rest);
  }
}

class QuerySnapshot {
  constructor(rawDocs) {
    this.docs = rawDocs.map((d) => new DocSnapshot(d.id, d));
    this.size = rawDocs.length;
    this.empty = rawDocs.length === 0;
  }
}

class DocRef {
  constructor(collectionName, id) {
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    const docs = await readCollection(this.collectionName);
    const raw = docs.find((d) => d.id === this.id);
    return new DocSnapshot(this.id, raw);
  }

  async set(data, options = {}) {
    const merge = Boolean(options.merge);
    const wrapped = wrapDates(data);

    await withCollectionLock(this.collectionName, async () => {
      const docs = await readCollectionUnlocked(this.collectionName);
      const idx = docs.findIndex((d) => d.id === this.id);

      if (idx === -1) {
        docs.push({ id: this.id, ...wrapped });
      } else {
        docs[idx] = merge ? { ...docs[idx], ...wrapped, id: this.id } : { id: this.id, ...wrapped };
      }

      await writeCollectionUnlocked(this.collectionName, docs);
    });
  }

  // Mimics Firestore's onSnapshot(doc, onNext, onError) -> unsubscribe fn.
  // Fires once immediately with current state, then again on every
  // change to the underlying collection file (debounced — an atomic
  // rename can fire more than one raw fs event for a single write).
  //
  // IMPORTANT: watches the DIRECTORY, not the file itself, and filters
  // by filename. fs.watch() on a specific file breaks after that file's
  // first atomic rename (the rename swaps in a new inode at that path,
  // orphaning a watcher that was attached to the old one) — confirmed
  // by testing: a watcher on the file caught the first change but
  // silently missed every write after that. Watching the parent
  // directory doesn't have this problem, since the directory itself is
  // never replaced.
  onSnapshot(onNext, onError) {
    let debounceTimer = null;
    let watcher = null;
    let closed = false;

    const emit = async () => {
      if (closed) return;
      try {
        const snap = await this.get();
        onNext(snap);
      } catch (err) {
        onError?.(err);
      }
    };

    emit();

    try {
      const fp = collectionFilePath(this.collectionName);
      const dir = path.dirname(fp);
      const targetName = path.basename(fp);
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, "[]", "utf-8");

      watcher = fs.watch(dir, { persistent: true }, (eventType, filename) => {
        if (filename && filename !== targetName) return; // ignore other collections' files
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(emit, 150);
      });
    } catch (err) {
      onError?.(err);
    }

    return () => {
      closed = true;
      clearTimeout(debounceTimer);
      watcher?.close();
    };
  }
}

class CollectionRef {
  constructor(name) {
    this.name = name;
    this._wheres = [];
    this._orderBy = null;
    this._limit = null;
  }

  _clone() {
    const c = new CollectionRef(this.name);
    c._wheres = [...this._wheres];
    c._orderBy = this._orderBy;
    c._limit = this._limit;
    return c;
  }

  doc(id) {
    return new DocRef(this.name, id ?? genId());
  }

  where(field, op, value) {
    const c = this._clone();
    c._wheres.push({ field, op, value });
    return c;
  }

  orderBy(field, direction = "asc") {
    const c = this._clone();
    c._orderBy = { field, direction };
    return c;
  }

  limit(n) {
    const c = this._clone();
    c._limit = n;
    return c;
  }

  async add(data) {
    const id = genId();
    const wrapped = wrapDates(data);

    await withCollectionLock(this.name, async () => {
      const docs = await readCollectionUnlocked(this.name);
      docs.push({ id, ...wrapped });
      await writeCollectionUnlocked(this.name, docs);
    });

    return new DocRef(this.name, id);
  }

  async get() {
    let docs = await readCollection(this.name);

    for (const w of this._wheres) {
      docs = docs.filter((d) => applyOp(d[w.field], w.op, w.value));
    }

    if (this._orderBy) {
      const { field, direction } = this._orderBy;
      const dir = direction === "desc" ? -1 : 1;
      docs = [...docs].sort((a, b) => {
        const av = comparableValue(a[field]);
        const bv = comparableValue(b[field]);
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return av > bv ? dir : -dir;
      });
    }

    if (this._limit != null) {
      docs = docs.slice(0, this._limit);
    }

    return new QuerySnapshot(docs);
  }

  count() {
    const self = this;
    return {
      async get() {
        const snap = await self.get();
        return { data: () => ({ count: snap.size }) };
      },
    };
  }
}

class LocalDb {
  collection(name) {
    return new CollectionRef(name);
  }
}

export const db = new LocalDb();
