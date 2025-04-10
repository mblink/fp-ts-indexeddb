import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

import * as t from 'io-ts';
import { Mutex } from 'async-mutex';
import type { ReadonlyRecord } from 'fp-ts/lib/ReadonlyRecord';
import { pipe } from 'fp-ts/lib/function';

const mutex = new Mutex();

type StoreName = string;
type Store<StoreC extends t.Mixed> = { key: string, codec: StoreC };

export type DBSchema<StoreC extends t.Mixed> = {
  version: number;
  stores: ReadonlyRecord<StoreName, Store<StoreC>>;
};

export type DBSchemas<StoreC extends t.Mixed> = ReadonlyArray<DBSchema<StoreC>>;
export type DatabaseInfo<StoreC extends t.Mixed> = { database: IDBDatabase, schema: DBSchema<StoreC> };
export type IndexedDbError = DOMException | Error;

const isError = (u: unknown): u is Error => typeof u === 'object' && u !== null && 'name' in u && 'message' in u;
const isDOMException = (u: unknown): u is DOMException => typeof u === 'object' && u != null && 'code' in u && 'message' in u && 'name' in u;

const handlePromiseError = (u: unknown): IndexedDbError => isError(u) || isDOMException(u) ? u : new Error(`Unhandled error: ${u}`);

const getObjectStore = <StoreC extends t.Mixed>(db: DatabaseInfo<StoreC>, mode: IDBTransactionMode) => (storeName: string): IDBObjectStore =>
  db.database.transaction(storeName, mode).objectStore(storeName);

const findStore = <StoreC extends t.Mixed>(db: DatabaseInfo<StoreC>, storeName: string) => pipe(
  db.schema.stores,
  R.lookup(storeName)
);

const handleRequestError = <A>(req: IDBRequest<A>, fn: (error: O.Option<DOMException>) => void) => {
  req.addEventListener('error', function (this: IDBOpenDBRequest) {
    fn(O.fromNullable(this.error));
  });
};

export const open = <StoreC extends t.Mixed>(
  dbName: string,
  schema: DBSchema<StoreC>,
): TE.TaskEither<IndexedDbError, DatabaseInfo<StoreC>> => {
  const initDb = () => new Promise<DatabaseInfo<StoreC>>((resolve, reject) => {
    // eslint-disable-next-line no-undef
    const req = window.indexedDB.open(dbName, schema.version);
    req.onupgradeneeded = () => pipe(
      schema.stores,
      R.mapWithIndex((storeName: string, v: Store<StoreC>) => req.result.createObjectStore(storeName, { keyPath: v.key }))
    );

    req.onsuccess = () => resolve({ database: req.result, schema: schema });
    handleRequestError(req, reject);
  });
  return TE.tryCatch(
    initDb,
    handlePromiseError
  );
};

export const insert = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
) => (v: StoreC['_A']): TE.TaskEither<IndexedDbError, StoreC['_A']> =>
  TE.tryCatch(
    () => mutex.runExclusive(() => new Promise<StoreC['_A']>((resolve, reject) => {
      pipe(
        findStore(db, storeName),
        O.fold(
          () => reject(new Error('Store not found')),
          (store) => {
            const addRequest = getObjectStore(db, 'readwrite')(storeName).add(store.codec.encode(v));
            addRequest.addEventListener('success', () => resolve(v));
            handleRequestError(addRequest, reject);
          }
        )
      );
    })),
    handlePromiseError,
  );

export const put = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
) => (v: StoreC['_A']): TE.TaskEither<IndexedDbError, StoreC['_A']> =>
  TE.tryCatch(
    () => mutex.runExclusive(() => new Promise<StoreC['_A']>((resolve, reject) => {
      pipe(
        findStore(db, storeName),
        O.fold(
          () => reject(new Error('Store not found')),
          (store) => {
            const updateRequest = getObjectStore(db, 'readwrite')(storeName).put(store.codec.encode(v));
            updateRequest.addEventListener('success', () => resolve(v));
            handleRequestError(updateRequest, reject);
          }
        )
      );
    })),
    handlePromiseError,
  );

export const getAll = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
) =>
  TE.tryCatch<IndexedDbError, Array<StoreC['_A']>>(
    () => mutex.runExclusive(() => new Promise<Array<StoreC['_A']>>((resolve, reject) => {
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
    })),
    handlePromiseError,
  );

export const get = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
) => (v: IDBValidKey): TE.TaskEither<IndexedDbError, StoreC['_A']> =>
  TE.tryCatch(
    () => mutex.runExclusive(() => new Promise<StoreC['_A']>((resolve, reject) => {
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
    })),
    handlePromiseError,
  );


export const remove = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
) => (v: IDBValidKey): TE.TaskEither<IndexedDbError, boolean> =>
  TE.tryCatch(
    () => mutex.runExclusive(() => new Promise<boolean>((resolve, reject) => {
      const removeRequest = getObjectStore(db, 'readwrite')(storeName).delete(v);
      removeRequest.addEventListener('success', () => resolve(true));
      handleRequestError(removeRequest, reject);
    })),
    handlePromiseError,
  );

export const clearStore = <StoreC extends t.Mixed>(
  db: DatabaseInfo<StoreC>,
  storeName: string,
): TE.TaskEither<IndexedDbError, boolean> =>
  TE.tryCatch(
    () => mutex.runExclusive(() => new Promise<boolean>((resolve, reject) => {
      const clearRequest = getObjectStore(db, 'readwrite')(storeName).clear();
      clearRequest.addEventListener('success', () => resolve(true));
      handleRequestError(clearRequest, reject);
    })),
    handlePromiseError,
  );
