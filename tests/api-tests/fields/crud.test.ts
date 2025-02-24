import path from 'path';
import globby from 'globby';
import {
  multiAdapterRunners,
  setupServer,
  testConfig,
  setupFromConfig,
} from '@keystone-next/test-utils-legacy';
import {
  createItem,
  deleteItem,
  getItems,
  getItem,
  updateItem,
  // @ts-ignore
} from '@keystone-next/server-side-graphql-client-legacy';
import { createSchema, list } from '@keystone-next/keystone/schema';
import { KeystoneContext } from '@keystone-next/types';

const testModules = globby.sync(`{packages,packages-next}/**/src/**/test-fixtures.{js,ts}`, {
  absolute: true,
});
testModules.push(path.resolve('packages/fields/tests/test-fixtures.js'));

multiAdapterRunners().map(({ runner, adapterName }) =>
  describe(`${adapterName} adapter`, () => {
    testModules
      .map(require)
      .filter(
        ({ skipCrudTest, unSupportedAdapterList = [] }) =>
          !skipCrudTest && !unSupportedAdapterList.includes(adapterName)
      )
      .forEach(mod => {
        (mod.testMatrix || ['default']).forEach((matrixValue: string) => {
          const listKey = 'Test';
          const keystoneTestWrapper = (testFn: (args: any) => void = () => {}) =>
            runner(
              () => {
                if (mod.newInterfaces) {
                  return setupFromConfig({
                    adapterName,
                    config: testConfig({
                      lists: createSchema({
                        [listKey]: list({ fields: mod.getTestFields(matrixValue) }),
                      }),
                    }),
                  });
                } else {
                  return setupServer({
                    adapterName,
                    createLists: (keystone: any) => {
                      // Create a list with all the fields required for testing
                      keystone.createList(listKey, { fields: mod.getTestFields(matrixValue) });
                    },
                  });
                }
              },
              async ({ context, keystone, ...rest }) => {
                // Populate the database before running the tests
                for (const item of mod.initItems(matrixValue)) {
                  await createItem({ keystone, context, listKey, item });
                }
                return testFn({ context, keystone, listKey, adapterName, ...rest });
              }
            );

          if (mod.crudTests) {
            describe(`${mod.name} - ${matrixValue} - Custom CRUD operations`, () => {
              beforeAll(() => {
                if (mod.beforeAll) {
                  mod.beforeAll();
                }
              });
              afterAll(async () => {
                if (mod.afterAll) {
                  await mod.afterAll();
                }
              });
              mod.crudTests(keystoneTestWrapper);
            });
          }

          if (!mod.skipCommonCrudTest) {
            describe(`${mod.name} - ${matrixValue} - CRUD operations`, () => {
              beforeAll(() => {
                if (mod.beforeAll) {
                  mod.beforeAll();
                }
              });
              afterAll(async () => {
                if (mod.afterAll) {
                  await mod.afterAll();
                }
              });
              const {
                fieldName,
                exampleValue,
                exampleValue2,
                subfieldName,
                createReturnedValue,
                updateReturnedValue,
                readFieldName,
              } = mod;

              // Some  field types can have subfields
              const returnFields = subfieldName
                ? `id name ${readFieldName || fieldName} { ${subfieldName} }`
                : `id name ${readFieldName || fieldName}`;

              const withHelpers = (wrappedFn: (args: any) => void | Promise<void>) => {
                return async ({
                  keystone,
                  context,
                  listKey,
                }: {
                  keystone: any;
                  context: KeystoneContext;
                  listKey: string;
                }) => {
                  const items = await getItems({
                    keystone,
                    context,
                    listKey,
                    returnFields,
                    sortBy: 'name_ASC',
                  });
                  return wrappedFn({ context, keystone, listKey, items });
                };
              };

              // Individual field types can have CRUD constraints.
              // For example, password field can only be written but not read.
              if (!mod.skipCreateTest) {
                test(
                  'Create',
                  keystoneTestWrapper(
                    withHelpers(async ({ context, keystone, listKey }) => {
                      const data = await createItem({
                        keystone,
                        context,
                        listKey,
                        item: { name: 'Newly created', [fieldName]: exampleValue(matrixValue) },
                        returnFields,
                      });
                      expect(data).not.toBe(null);
                      expect(
                        subfieldName ? data[fieldName][subfieldName] : data[fieldName]
                      ).toEqual(
                        createReturnedValue ? createReturnedValue : exampleValue(matrixValue)
                      );
                    })
                  )
                );
              }

              if (!mod.skipReadTest) {
                test(
                  'Read',
                  keystoneTestWrapper(
                    withHelpers(async ({ keystone, context, listKey, items }) => {
                      const data = await getItem({
                        keystone,
                        context,
                        listKey,
                        itemId: items[0].id,
                        returnFields,
                      });
                      expect(data).not.toBe(null);
                      expect(
                        subfieldName ? data[fieldName][subfieldName] : data[fieldName]
                      ).toEqual(
                        subfieldName ? items[0][fieldName][subfieldName] : items[0][fieldName]
                      );
                    })
                  )
                );
              }

              if (!mod.skipUpdateTest) {
                describe('Update', () => {
                  test(
                    'Updating the value',
                    keystoneTestWrapper(
                      withHelpers(async ({ keystone, context, items, listKey }) => {
                        const data = await updateItem({
                          keystone,
                          context,
                          listKey,
                          item: {
                            id: items[0].id,
                            data: { [fieldName]: exampleValue2(matrixValue) },
                          },
                          returnFields,
                        });
                        expect(data).not.toBe(null);
                        expect(
                          subfieldName ? data[fieldName][subfieldName] : data[fieldName]
                        ).toEqual(
                          updateReturnedValue ? updateReturnedValue : exampleValue2(matrixValue)
                        );
                      })
                    )
                  );

                  test(
                    'Updating the value to null',
                    keystoneTestWrapper(
                      withHelpers(async ({ keystone, context, items, listKey }) => {
                        const data = await updateItem({
                          keystone,
                          context,
                          listKey,
                          item: {
                            id: items[0].id,
                            data: { [fieldName]: null },
                          },
                          returnFields,
                        });
                        expect(data).not.toBe(null);
                        expect(data[fieldName]).toBe(null);
                      })
                    )
                  );

                  test(
                    'Updating without this field',
                    keystoneTestWrapper(
                      withHelpers(async ({ keystone, context, items, listKey }) => {
                        const data = await updateItem({
                          keystone,
                          context,
                          listKey,
                          item: {
                            id: items[0].id,
                            data: { name: 'Updated value' },
                          },
                          returnFields,
                        });
                        expect(data).not.toBe(null);
                        expect(data.name).toBe('Updated value');
                        expect(
                          subfieldName ? data[fieldName][subfieldName] : data[fieldName]
                        ).toEqual(
                          subfieldName ? items[0][fieldName][subfieldName] : items[0][fieldName]
                        );
                      })
                    )
                  );
                });
              }

              if (!mod.skipDeleteTest) {
                test(
                  'Delete',
                  keystoneTestWrapper(
                    withHelpers(async ({ keystone, context, items, listKey }) => {
                      const data = await deleteItem({
                        keystone,
                        context,
                        listKey,
                        itemId: items[0].id,
                        returnFields,
                      });
                      expect(data).not.toBe(null);
                      expect(data.name).toBe(items[0].name);
                      expect(
                        subfieldName ? data[fieldName][subfieldName] : data[fieldName]
                      ).toEqual(
                        subfieldName ? items[0][fieldName][subfieldName] : items[0][fieldName]
                      );

                      const allItems = await getItems({
                        keystone,
                        context,
                        listKey,
                        returnFields,
                      });
                      expect(allItems).toEqual(expect.not.arrayContaining([data]));
                    })
                  )
                );
              }
            });
          }
        });
      });
  })
);
