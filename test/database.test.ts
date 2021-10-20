import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';

import {
  DBSchema,
  DatabaseInfo,
  get,
  insert,
  open,
  remove,
  update
} from '../src/Database';
import { pipe } from 'fp-ts/lib/function';

const schema: DBSchema = {
  version: 1,
  stores: {
    'users': {
      codec: t.type({
        id: t.number,
        name: t.string
      }),
      key: 'id'
    }
  }
};

const dbErrorTe = TE.left('Error loading db');

describe('IndexedDb - Tests', () => {
  it('Crud - Functions', async () => {
    let db: DatabaseInfo | undefined;
    // Set Database
    await pipe(
      open('my-db31', schema),
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (res) => T.fromIO(() => {
          db = res;
        }),
      )
    )();

    // Insert
    await pipe(
      db ? insert(db, 'users')({ id: 1, name: 'James' }) : dbErrorTe,
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (v) => T.fromIO(() => expect(v).toBeTruthy()),
      )
    )();

    // Update
    await pipe(
      db ? update(db, 'users')({ id: 1, name: 'Jimmy' }) : dbErrorTe,
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (v) => T.fromIO(() => expect(v).toBeTruthy()),
      )
    )();

    // Get
    await pipe(
      db ? get(db, 'users') : dbErrorTe,
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (rows) => T.fromIO(() => {
          expect(rows.length).toBeGreaterThanOrEqual(1);
          pipe(
            O.fromNullable(schema.stores.users?.codec),
            O.map((c) => {
              expect(t.array(c).is(rows)).toBeTruthy();
            })
          );
        }),
      )
    )();

    // Remove
    await pipe(
      db ? remove(db, 'users')(1) : dbErrorTe,
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (v) => T.fromIO(() => expect(v).toBeTruthy()),
      )
    )();

    // Get List Empty
    await pipe(
      db ? get(db, 'users') : dbErrorTe,
      TE.fold(
        (e) => T.fromIO(() => fail(e)),
        (rows) => T.fromIO(() => {
          expect(rows.length).toBeLessThanOrEqual(0);
        }),
      )
    )();
  });
});