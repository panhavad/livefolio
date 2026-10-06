import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Small JSON-file database. Writes are serialized and atomic (write + rename),
// which is plenty for a single-container deployment.
export function createStore(dataDir) {
  const file = path.join(dataDir, "db.json");
  const imagesDir = path.join(dataDir, "images");
  let db = null;
  let loading = null;
  let writing = Promise.resolve();

  async function load() {
    if (db) return db;
    loading ??= (async () => {
      await mkdir(imagesDir, { recursive: true });
      try {
        db = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        db = {};
      }
      db.users ??= {};
      db.sessions ??= {};
      db.images ??= {};
      return db;
    })();
    return loading;
  }

  function persist() {
    const snapshot = JSON.stringify(db);
    writing = writing.catch(() => {}).then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, file);
    });
    return writing;
  }

  const imagePath = (file) => path.join(imagesDir, path.basename(file));

  async function writeImage(file, buffer) {
    const tmp = `${imagePath(file)}.tmp`;
    await writeFile(tmp, buffer, { mode: 0o600 });
    await rename(tmp, imagePath(file));
  }

  const deleteImage = (file) => rm(imagePath(file), { force: true });

  return { load, persist, imagePath, writeImage, deleteImage };
}
