import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';

import * as t from 'io-ts';
import { pipe } from 'fp-ts/lib/function';

type StoreName = string;
type Store = { key: string, codec: t.Mixed };

export type DBSchema = {
  version: number;
  stores: Record<StoreName, Store>;
};

export type DBSchemas = DBSchema[];

export type DatabaseInfo = { database: IDBDatabase, schema: DBSchema };

export const open = (
  dbName: string,
  schema: DBSchema,
): TE.TaskEither<DOMException, DatabaseInfo> => {
  const initDb = () => new Promise<DatabaseInfo>((resolve, reject) => {
    // eslint-disable-next-line no-undef
    const req = window.indexedDB.open(dbName, schema.version);
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
    req.addEventListener('error', function (this: IDBOpenDBRequest) {
      reject(this.error);
    });
  });
  return TE.tryCatch(
    initDb,
    (e: unknown) => e as DOMException,
  );
};

export const insert = <A>(
  db: DatabaseInfo,
  storeName: string,
): (v: A) => TE.TaskEither<DOMException, A> => {
  return (v: A) => {
    const insertTransaction = () => new Promise<A>((resolve, reject) => {
      pipe(
        db.schema.stores,
        R.lookup(storeName),
        O.fold(
          () => reject(new DOMException('Store not found')),
          (c) => {
            pipe(
              c.codec.decode(v),
              E.fold(
                reject,
                (item: A) => {
                  const tx = db.database.transaction(storeName, 'readwrite');
                  const objectStore = tx.objectStore(storeName);
                  const addRequest = objectStore.add(item);
                  addRequest.addEventListener('success', () => resolve(v));
                  addRequest.addEventListener('error', function (this: IDBOpenDBRequest) {
                    reject(this.error);
                  });
                }
              )
            );
          }
        )
      );
    });
    return TE.tryCatch(
      insertTransaction,
      (e: unknown) => e as DOMException,
    );
  };
};

export const update = <A>(
  db: DatabaseInfo,
  storeName: string,
): (v: A) => TE.TaskEither<DOMException, A> => {
  return (v: A) => {
    const insertTransaction = () => new Promise<A>((resolve, reject) => {
      pipe(
        db.schema.stores,
        R.lookup(storeName),
        O.fold(
          () => reject(new DOMException('Store not found')),
          (c) => {
            pipe(
              c.codec.decode(v),
              E.fold(
                reject,
                (item: A) => {
                  const tx = db.database.transaction(storeName, 'readwrite');
                  const objectStore = tx.objectStore(storeName);
                  const updateRequest = objectStore.put(item);
                  updateRequest.addEventListener('success', () => resolve(v));
                  updateRequest.addEventListener('error', function (this: IDBOpenDBRequest) {
                    reject(this.error);
                  });
                }
              )
            );
          }
        )
      );
    });
    return TE.tryCatch(
      insertTransaction,
      (e: unknown) => e as DOMException,
    );
  };
};

export const get = <A>(
  db: DatabaseInfo,
  storeName: string,
) => {
  const getTransaction = () => new Promise<A[]>((resolve, reject) => {
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
  return TE.tryCatch<string | DOMException, A[]>(
    getTransaction,
    (e: unknown) => typeof e === 'string' ? e : e as DOMException,
  );
};

export const remove = (
  db: DatabaseInfo,
  storeName: string,
): (v: IDBValidKey) => TE.TaskEither<DOMException, boolean> => {
  return (v: IDBValidKey) => {
    const insertTransaction = () => new Promise<boolean>((resolve, reject) => {
      const tx = db.database.transaction(storeName, 'readwrite');
      const objectStore = tx.objectStore(storeName);
      const removeRequest = objectStore.delete(v);
      removeRequest.addEventListener('success', () => resolve(true));
      removeRequest.addEventListener('error', function (this: IDBOpenDBRequest) {
        reject(this.error);
      });
    });
    return TE.tryCatch(
      insertTransaction,
      (e) => e as DOMException,
    );
  };
};
