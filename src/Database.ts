import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

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

export type IndexedDbError = DOMException | Error;

const handlePromiseError = (e: unknown) => e as IndexedDbError;

const getObjectStore = (db: DatabaseInfo, mode: IDBTransactionMode) =>
  (storeName: string): IDBObjectStore => db.database.transaction(storeName, mode).objectStore(storeName);

const findStore = (db: DatabaseInfo, storeName: string) => pipe(
  db.schema.stores,
  R.lookup(storeName)
);

const handleRequestError = <A>(req: IDBRequest<A>, fn: (error: DOMException | null) => void) => {
  req.addEventListener('error', function (this: IDBOpenDBRequest) {
    fn(this.error);
  });
};

export const open = (
  dbName: string,
  schema: DBSchema,
): TE.TaskEither<IndexedDbError, DatabaseInfo> => {
  const initDb = () => new Promise<DatabaseInfo>((resolve, reject) => {
    // eslint-disable-next-line no-undef
    const req = window.indexedDB.open(dbName, schema.version);
    req.onupgradeneeded = () => pipe(
      schema.stores,
      R.mapWithIndex((storeName: string, v: Store) => req.result.createObjectStore(storeName, { keyPath: v.key }))
    );

    req.onsuccess = () => resolve({ database: req.result, schema: schema });
    handleRequestError(req, reject);
  });
  return TE.tryCatch(
    initDb,
    handlePromiseError
  );
};

export const insert = <A>(
  db: DatabaseInfo,
  storeName: string,
): (v: A) => TE.TaskEither<IndexedDbError, A> => {
  return (v: A) => {
    const insertTransaction = () => new Promise<A>((resolve, reject) => {
      pipe(
        findStore(db, storeName),
        O.fold(
          () => reject(new Error('Store not found')),
          (c) => {
            pipe(
              c.codec.decode(v),
              E.fold(
                reject,
                () => {
                  const objectStore = pipe(
                    storeName,
                    getObjectStore(db, 'readwrite')
                  );
                  const addRequest = objectStore.add(v);
                  addRequest.addEventListener('success', () => resolve(v));
                  handleRequestError(addRequest, reject);
                }
              )
            );
          }
        )
      );
    });
    return TE.tryCatch(
      insertTransaction,
      handlePromiseError,
    );
  };
};

export const put = <A>(
  db: DatabaseInfo,
  storeName: string,
): (v: A) => TE.TaskEither<IndexedDbError, A> => {
  return (v: A) => {
    const putTransaction = () => new Promise<A>((resolve, reject) => {
      pipe(
        findStore(db, storeName),
        O.fold(
          () => reject(new Error('Store not found')),
          (c) => {
            pipe(
              c.codec.decode(v),
              E.fold(
                reject,
                (item: A) => {
                  const objectStore = pipe(
                    storeName,
                    getObjectStore(db, 'readwrite')
                  );
                  const updateRequest = objectStore.put(item);
                  updateRequest.addEventListener('success', () => resolve(v));
                  handleRequestError(updateRequest, reject);
                }
              )
            );
          }
        )
      );
    });
    return TE.tryCatch(
      putTransaction,
      handlePromiseError,
    );
  };
};

export const getAll = <A>(
  db: DatabaseInfo,
  storeName: string,
) => {
  const getTransaction = () => new Promise<A[]>((resolve, reject) => {
    const objectStore = pipe(
      storeName,
      getObjectStore(db, 'readonly')
    );
    const req = objectStore.getAll();
    req.addEventListener('success', function (this: ReturnType<typeof objectStore.getAll>) {
      pipe(
        findStore(db, storeName),
        O.fold(
          () => reject(new Error('Store not found')),
          (s) => {
            pipe(
              t.array(s.codec).decode(this.result),
              E.fold(
                reject,
                resolve
              )
            );
          }
        )
      );
    });
    handleRequestError(req, reject);
  });
  return TE.tryCatch<IndexedDbError, A[]>(
    getTransaction,
    handlePromiseError,
  );
};

export const get = <A>(
  db: DatabaseInfo,
  storeName: string,
): (v: IDBValidKey) => TE.TaskEither<IndexedDbError, A> => {
  return (v: IDBValidKey) => {
    const getTransaction = () => new Promise<A>((resolve, reject) => {
      const objectStore = pipe(
        storeName,
        getObjectStore(db, 'readonly')
      );

      const getRequest = objectStore.get(v);

      getRequest.addEventListener('success', function (this: ReturnType<typeof objectStore.get>) {
        pipe(
          findStore(db, storeName),
          O.fold(
            () => reject(new Error('Store not found')),
            (s) => {
              pipe(
                s.codec.decode(this.result),
                E.fold(
                  reject,
                  resolve
                )
              );
            }
          )
        );
      });
      handleRequestError(getRequest, reject);
    });
    return TE.tryCatch(
      getTransaction,
      handlePromiseError,
    );
  };
};

export const remove = (
  db: DatabaseInfo,
  storeName: string,
): (v: IDBValidKey) => TE.TaskEither<IndexedDbError, boolean> => {
  return (v: IDBValidKey) => {
    const removeTransaction = () => new Promise<boolean>((resolve, reject) => {
      const objectStore = pipe(
        storeName,
        getObjectStore(db, 'readwrite')
      );
      const removeRequest = objectStore.delete(v);
      removeRequest.addEventListener('success', () => resolve(true));
      handleRequestError(removeRequest, reject);
    });
    return TE.tryCatch(
      removeTransaction,
      handlePromiseError,
    );
  };
};

export const clearStore = (
  db: DatabaseInfo,
  storeName: string,
): TE.TaskEither<IndexedDbError, boolean> => {
  const clearTransaction = () => new Promise<boolean>((resolve, reject) => {
    const objectStore = pipe(
      storeName,
      getObjectStore(db, 'readwrite')
    );
    const clearRequest = objectStore.clear();
    clearRequest.addEventListener('success', () => resolve(true));
    handleRequestError(clearRequest, reject);
  });
  return TE.tryCatch(
    clearTransaction,
    handlePromiseError,
  );
};