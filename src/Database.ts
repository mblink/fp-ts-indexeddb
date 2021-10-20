import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';
import { pipe } from 'fp-ts/lib/function';

type StoreName = string;

type Store = { codec: t.Mixed, key: string };

export type DBSchema = {
  version: number;
  stores: Record<StoreName, Store>;
};

export type DBSchemas = DBSchema[];

export type DatabaseInfo = { database: IDBDatabase, schema: DBSchema };

export const open = (
  dbName: string,
  schema: DBSchema,
): TE.TaskEither<string, DatabaseInfo> => {
  const initDb = () => new Promise<DatabaseInfo>((resolve, reject) => {
    /* eslint-disable no-undef */
    const req = window.indexedDB.open(dbName, schema.version);
    /* eslint-enable no-undef */
    req.onupgradeneeded = () => {
      const db = req.result;
      pipe(
        schema.stores,
        R.mapWithIndex((storeName: string, v: Store) => {
          db.createObjectStore(storeName, { keyPath: v.key });
        })
      );
      resolve({ database: db, schema: schema });
    };
    req.onsuccess = () => resolve({ database: req.result, schema: schema });
    req.onerror = reject;
  });
  return TE.tryCatch(
    initDb,
    () => 'Error opening database',
  );
};

export const insert = <T>(
  db: DatabaseInfo,
  storeName: string,
): (v: T) => TE.TaskEither<string, boolean> => {
  return (v: T) => {
    const insertTransaction = () => new Promise<boolean>((resolve, reject) => {
      pipe(
        db.schema.stores,
        R.lookup(storeName),
        O.filter(c => c.codec.is(v)),
        O.fold(
          () => reject('Codec validation error'),
          () => {
            const tx = db.database.transaction(storeName, 'readwrite');
            const objectStore = tx.objectStore(storeName);
            const addRequest = objectStore.add(v);
            addRequest.addEventListener('success', () => resolve(true));
            addRequest.addEventListener('error', () => reject());
          }
        )
      );

    });
    return TE.tryCatch(
      insertTransaction,
      () => 'Error inserting object',
    );
  };
};

export const update = <T>(
  db: DatabaseInfo,
  storeName: string,
): (v: T) => TE.TaskEither<string, boolean> => {
  return (v: T) => {
    const insertTransaction = () => new Promise<boolean>((resolve, reject) => {
      pipe(
        db.schema.stores,
        R.lookup(storeName),
        O.filter(c => c.codec.is(v)),
        O.fold(
          () => reject('Codec validation error'),
          () => {
            const tx = db.database.transaction(storeName, 'readwrite');
            const objectStore = tx.objectStore(storeName);
            const addRequest = objectStore.put(v);
            addRequest.addEventListener('success', () => resolve(true));
            addRequest.addEventListener('error', () => reject());
          }
        )
      );

    });
    return TE.tryCatch(
      insertTransaction,
      () => 'Error inserting object',
    );
  };
};

export const get = <T>(
  db: DatabaseInfo,
  storeName: string,
) => {
  const getTransaction = () => new Promise<T[]>((resolve, reject) => {
    const tx = db.database.transaction(storeName, 'readonly');
    const objectStore = tx.objectStore(storeName);
    const req = objectStore.getAll();
    req.addEventListener('error', reject);
    req.addEventListener('success', function (this: ReturnType<typeof objectStore.getAll>) {
      pipe(
        db.schema.stores,
        R.lookup(storeName),
        O.filter(c => t.array(c.codec).is(this.result)),
        O.fold(
          () => reject('Codec validation error'),
          () => resolve(this.result)
        )
      );
    });
  });
  return TE.tryCatch(
    getTransaction,
    () => 'Error getting records',
  );
};

export const remove = (
  db: DatabaseInfo,
  storeName: string,
): (v: IDBValidKey) => TE.TaskEither<string, boolean> => {
  return (v: IDBValidKey) => {
    const insertTransaction = () => new Promise<boolean>((resolve, reject) => {
      const tx = db.database.transaction(storeName, 'readwrite');
      const objectStore = tx.objectStore(storeName);
      const addRequest = objectStore.delete(v);
      addRequest.addEventListener('success', () => resolve(true));
      addRequest.addEventListener('error', () => reject());
    });
    return TE.tryCatch(
      insertTransaction,
      () => 'Error removing item',
    );
  };
};
