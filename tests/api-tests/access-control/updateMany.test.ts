import { text, checkbox } from '@keystone-next/fields';
import { createSchema, list } from '@keystone-next/keystone/schema';
import { multiAdapterRunners, setupFromConfig, testConfig } from '@keystone-next/test-utils-legacy';
import type { AdapterName } from '@keystone-next/test-utils-legacy';
// @ts-ignore
import { createItems } from '@keystone-next/server-side-graphql-client-legacy';

const setupKeystone = (adapterName: AdapterName) =>
  setupFromConfig({
    adapterName,
    config: testConfig({
      lists: createSchema({
        User: list({
          fields: {
            name: text(),
            isUpdatable: checkbox(),
          },
          access: {
            create: true,
            read: true,
            update: { isUpdatable: true },
            delete: true,
          },
        }),
      }),
    }),
  });

multiAdapterRunners().map(({ runner, adapterName }) =>
  describe(`Adapter: ${adapterName}`, () => {
    test(
      'updateMany with declarative access control',
      runner(setupKeystone, async ({ context }) => {
        // Create some items, half of which have `isUpdatable: true`
        const users: { id: any }[] = await createItems({
          context,
          listKey: 'User',
          items: [
            { data: { name: 'Jess', isUpdatable: true } },
            { data: { name: 'Johanna', isUpdatable: false } },
            { data: { name: 'Sam', isUpdatable: true } },
            { data: { name: 'Theo', isUpdatable: false } },
          ],
        });
        // Attempt to update all four items
        const { data, errors } = await context.exitSudo().executeGraphQL({
          query: `mutation ($data: [UsersUpdateInput]){
              updateUsers(data: $data) { id name isUpdatable }
            }`,
          variables: { data: users.map(({ id }) => ({ id, data: { name: 'new name' } })) },
        });
        // We don't expect an error
        expect(errors).toBe(undefined);
        // But only two of the items should get updated and returned
        expect(data.updateUsers).toHaveLength(2);
        expect(data.updateUsers[0].name).toEqual('new name');
        expect(data.updateUsers[1].name).toEqual('new name');
      })
    );
  })
);
