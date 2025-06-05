import * as O from 'fp-ts/lib/Option';
import * as TE from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';

import {
  DBSchema,
  close,
  get,
  getAll,
  insert,
  open,
  put,
  remove,
} from '../src/database';
import { pipe } from 'fp-ts/lib/function';

const userC = t.type({
  id: t.number,
  name: t.string
});
type UserC = typeof userC;
type User = t.TypeOf<UserC>;

const schema1: DBSchema<UserC> = {
  version: 1,
  stores: {
    'users': {
      key: 'id',
      codec: userC,
    }
  }
};
const schema2: DBSchema<UserC> = { ...schema1, version: 2 };

const dbErrorTe = TE.left(new DOMException('Error loading database'));

describe('IndexedDb - Tests', () => {
  it('Crud - Functions', async () => {
    // Set Database
    await pipe(
      open('my-db31', schema1),
      TE.match(
        fail,
        async (db) => {
          // Insert
          const iUser: User = { id: 1, name: 'James' };
          await pipe(
            db ? insert<UserC>(db, 'users')(iUser) : dbErrorTe,
            TE.match(
              fail,
              (v) => expect(v.name).toEqual(iUser.name),
            )
          )();

          // Update
          const uUser: User = { id: 1, name: 'Jimmy' };
          await pipe(
            db ? put<UserC>(db, 'users')(uUser) : dbErrorTe,
            TE.match(
              fail,
              (v: User) => expect(v.name).toEqual(uUser.name),
            )
          )();

          // Get All
          await pipe(
            db ? getAll<UserC>(db, 'users') : dbErrorTe,
            TE.match(
              fail,
              (rows) => {
                expect(rows.length).toBeGreaterThanOrEqual(1);
                pipe(
                  O.fromNullable(schema1.stores.users?.codec),
                  O.map((c) => {
                    expect(t.array(c).is(rows)).toBeTruthy();
                  })
                );
              },
            )
          )();

          // Get
          await pipe(
            db ? get<UserC>(db, 'users')(1) : dbErrorTe,
            TE.match(
              fail,
              (record) => {
                expect(record.name).toEqual('Jimmy');
              },
            )
          )();

          // Remove
          await pipe(
            db ? remove(db, 'users')(1) : dbErrorTe,
            TE.match(
              fail,
              (v) => expect(v).toBeTruthy(),
            )
          )();

          // Get List Empty
          await pipe(
            db ? getAll(db, 'users') : dbErrorTe,
            TE.match(
              fail,
              (rows) => {
                expect(rows.length).toBeLessThanOrEqual(0);
              },
            )
          )();

          close(db);
        },
      ),
    )();

    // Upgrade schema
    await pipe(
      open('my-db31', schema2),
      TE.match(
        fail,
        (db) => {
          expect(db.schema.version).toEqual(schema2.version);
        }
      )
    )();
  });
});