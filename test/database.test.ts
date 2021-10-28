import * as O from 'fp-ts/lib/Option';
import * as TE from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';

import {
  DBSchema,
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

type User = t.TypeOf<typeof userC>;
const schema: DBSchema = {
  version: 1,
  stores: {
    'users': {
      key: 'id',
      codec: userC,
    }
  }
};

const dbErrorTe = TE.left(new DOMException('Error loading database'));

describe('IndexedDb - Tests', () => {
  it('Crud - Functions', async () => {
    // Set Database
    await pipe(
      open('my-db31', schema),
      TE.match(
        fail,
        async (db) => {
          // Insert
          const iUser: User = { id: 1, name: 'James' };
          await pipe(
            db ? insert<User>(db, 'users')(iUser) : dbErrorTe,
            TE.match(
              fail,
              (v) => expect(v.name).toEqual(iUser.name),
            )
          )();

          // Update
          const uUser: User = { id: 1, name: 'Jimmy' };
          await pipe(
            db ? put<User>(db, 'users')(uUser) : dbErrorTe,
            TE.match(
              fail,
              (v: User) => expect(v.name).toEqual(uUser.name),
            )
          )();

          // Get All
          await pipe(
            db ? getAll<User>(db, 'users') : dbErrorTe,
            TE.match(
              fail,
              (rows) => {
                expect(rows.length).toBeGreaterThanOrEqual(1);
                pipe(
                  O.fromNullable(schema.stores.users?.codec),
                  O.map((c) => {
                    expect(t.array(c).is(rows)).toBeTruthy();
                  })
                );
              },
            )
          )();

          // Get
          await pipe(
            db ? get<User>(db, 'users')(1) : dbErrorTe,
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
        },
      )
    )();
  });
});