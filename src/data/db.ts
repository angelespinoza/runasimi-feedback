import { openDB, type DBSchema } from 'idb';
import type { Feedback, Reply, Visitor } from './types';

interface FincaDB extends DBSchema {
  visitors: { key: string; value: Visitor };
  feedback: { key: string; value: Feedback; indexes: { createdAt: string } };
  replies: { key: string; value: Reply; indexes: { feedbackId: string } };
  settings: { key: string; value: unknown };
}

const dbPromise = openDB<FincaDB>('finca-feedback', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('visitors', { keyPath: 'id' });
      db.createObjectStore('feedback', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      db.createObjectStore('replies', { keyPath: 'id' }).createIndex('feedbackId', 'feedbackId');
    }
    if (oldVersion < 2) db.createObjectStore('settings');
  },
});

export const newId = () => crypto.randomUUID();

export async function saveVisitor(v: Visitor) {
  await (await dbPromise).put('visitors', v);
}

export async function getVisitor(id: string) {
  return (await dbPromise).get('visitors', id);
}

export async function saveFeedback(f: Feedback) {
  await (await dbPromise).put('feedback', f);
}

export async function getFeedback(id: string) {
  return (await dbPromise).get('feedback', id);
}

export async function updateFeedback(id: string, patch: Partial<Feedback>) {
  const db = await dbPromise;
  const tx = db.transaction('feedback', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) throw new Error(`Reseña ${id} no existe`);
  const next = { ...current, ...patch };
  // El audio original se borra tras procesarse (privacidad).
  if (patch.audioBlob === undefined && 'audioBlob' in patch) delete next.audioBlob;
  await tx.store.put(next);
  await tx.done;
  return next;
}

// Más recientes primero.
export async function listFeedback(): Promise<Feedback[]> {
  return (await (await dbPromise).getAllFromIndex('feedback', 'createdAt')).reverse();
}

// "Borrar todos los datos": visitantes, reseñas, respuestas y PIN. Los modelos se conservan.
export async function deleteAllData() {
  const db = await dbPromise;
  await Promise.all([db.clear('visitors'), db.clear('feedback'), db.clear('replies'), db.clear('settings')]);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await (await dbPromise).get('settings', key)) as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  await (await dbPromise).put('settings', value, key);
}

export async function saveReply(r: Reply) {
  await (await dbPromise).put('replies', r);
}

export async function listReplies(feedbackId: string): Promise<Reply[]> {
  return (await dbPromise).getAllFromIndex('replies', 'feedbackId', feedbackId);
}
