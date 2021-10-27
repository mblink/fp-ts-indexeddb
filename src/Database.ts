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

const isError = (u: unknown): u is Error => typeof u === 'object' && u !== null && 'name' in u && 'message' in u;
const isDOMException = (u: unknown): u is DOMException => typeof u === 'object' && u != null && 'code' in u && 'message' in u && 'name' in u;

const handlePromiseError = (u: unknown): IndexedDbError => isError(u) || isDOMException(u) ? u : new Error(`Unhandled error: ${u}`);

const getObjectStore = (db: DatabaseInfo, mode: IDBTransactionMode) => (storeName: string): IDBObjectStore =>
  db.database.transaction(storeName, mode).objectStore(storeName);

const findStore = (db: DatabaseInfo, storeName: string) => pipe(
  db.schema.stores,
  R.lookup(storeName)
);

const handleRequestError = <A>(req: IDBRequest<A>, fn: (error: O.Option<DOMException>) => void) => {
  req.addEventListener('error', function (this: IDBOpenDBRequest) {
    fn(O.fromNullable(this.error));
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
) => (v: A): TE.TaskEither<IndexedDbError, A> =>
  TE.tryCatch(
    () => new Promise<A>((resolve, reject) => {
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
                  const addRequest = getObjectStore(db, 'readwrite')(storeName).add(v);
                  addRequest.addEventListener('success', () => resolve(v));
                  handleRequestError(addRequest, reject);
                }
              )
            );
          }
        )
      );
    }),
    handlePromiseError,
  );

export const put = <A>(
  db: DatabaseInfo,
  storeName: string,
) => (v: A): TE.TaskEither<IndexedDbError, A> =>
  TE.tryCatch(
    () => new Promise<A>((resolve, reject) => {
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
                  const updateRequest = getObjectStore(db, 'readwrite')(storeName).put(item);
                  updateRequest.addEventListener('success', () => resolve(v));
                  handleRequestError(updateRequest, reject);
                }
              )
            );
          }
        )
      );
    }),
    handlePromiseError,
  );

export const getAll = <A>(
  db: DatabaseInfo,
  storeName: string,
) =>
  TE.tryCatch<IndexedDbError, A[]>(
    () => new Promise<A[]>((resolve, reject) => {
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
    }),
    handlePromiseError,
  );

export const get = <A>(
  db: DatabaseInfo,
  storeName: string,
) => (v: IDBValidKey): TE.TaskEither<IndexedDbError, A> =>
  TE.tryCatch(
    () => new Promise<A>((resolve, reject) => {
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
    }),
    handlePromiseError,
  );


export const remove = (
  db: DatabaseInfo,
  storeName: string,
) => (v: IDBValidKey): TE.TaskEither<IndexedDbError, boolean> =>
  TE.tryCatch(
    () => new Promise<boolean>((resolve, reject) => {
      const removeRequest = getObjectStore(db, 'readwrite')(storeName).delete(v);
      removeRequest.addEventListener('success', () => resolve(true));
      handleRequestError(removeRequest, reject);
    }),
    handlePromiseError,
  );

export const clearStore = (
  db: DatabaseInfo,
  storeName: string,
): TE.TaskEither<IndexedDbError, boolean> =>
  TE.tryCatch(
    () => new Promise<boolean>((resolve, reject) => {
      const clearRequest = getObjectStore(db, 'readwrite')(storeName).clear();
      clearRequest.addEventListener('success', () => resolve(true));
      handleRequestError(clearRequest, reject);
    }),
    handlePromiseError,
  );
