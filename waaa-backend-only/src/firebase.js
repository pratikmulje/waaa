/*
==================================================
WAAA STORAGE (formerly Firestore)
==================================================
This project no longer uses Firebase/Firestore — data
is stored locally as JSON files under /data at the
project root (see src/db/localStore.js + src/db/db.js).

This file is kept, exporting the same `db` name, so every
file that already does `import { db } from "../firebase.js"`
(or "./firebase.js") continues to work completely
unchanged — only the implementation behind `db` changed,
from a real Firestore client to a local-file-backed shim
with the same chainable API.

No more:
- firebase/serviceAccountKey.json (delete it, it's unused)
- Firestore read/write quotas
- "create a composite index" errors (queries are just JS
  array filtering now, not a real database query planner)

Your data lives in /data/*.json — back it up like any other
file if you care about it, since there's no cloud copy
anymore.
==================================================
*/

export { db } from "./db/db.js";
