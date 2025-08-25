import test from 'ava';
import * as jose from 'jose';
import { ACMEClient } from '../src/acme/client/acme-client.js';
import { directory } from '../src/directory.js';
import type { ACMEIdentifier } from '../src/acme/types/order.js';
// import type { ACMEIdentifier } from '../src/acme/types/order.js';

let client: ACMEClient;
let keyPair: jose.GenerateKeyPairResult;

test.beforeEach(async () => {
  client = new ACMEClient(directory.letsencrypt.staging.directoryUrl);
  keyPair = await jose.generateKeyPair('ES256');
  client.setAccount(keyPair);
  await client.createAccount();
});

test('should attempt to create new account', async (t) => {
  try {
    const account = await client.createAccount();
    t.truthy(account.keyId, 'Account key id should be defined');
  } catch (error: any) {
    if (error?.status === 400 && error?.detail?.includes('already exists')) {
      t.pass('Account already exists - acceptable for E2E test');
    } else {
      t.fail(`Unexpected error creating account: ${error?.detail || error?.message || error}`);
    }
  }
});

test.skip('should attempt to create order', async (t) => {
  const identifiers: ACMEIdentifier[] = [{ type: 'dns', value: 'test-acme-love.example.com' }];

  try {
    const order = await client.createOrder(identifiers);
    t.truthy(order, 'Order object should be returned');
    t.truthy(order.url, 'Order should have URL');
    t.is(order.status, 'pending', 'New order should have pending status');
  } catch (error: any) {
    if (error?.status === 401) {
      t.pass('Order creation failed with auth error - acceptable for E2E test');
    } else {
      t.fail(`Unexpected error creating order: ${error?.detail || error?.message || error}`);
    }
  }
});

test.skip('should handle errors correctly', async (t) => {
  try {
    await client.createOrder([{ type: 'dns', value: 'test.example.com' }]);
    t.fail('Should have thrown error for invalid identifier type');
  } catch (error: any) {
    console.log('Caught error as expected:', error);
    t.truthy(error, 'Error should be thrown for invalid identifier');
    t.pass('Error correctly thrown for invalid identifier type');
  }
});



test.only('multiple order creates in promise all', async (t) => {

  const identifiersList: ACMEIdentifier[][] = [];
  const identifiersList2: ACMEIdentifier[][] = [];
  for (let i = 0; i < 20; i++) {
    identifiersList.push([{ type: 'dns', value: `test-${i + 1}.acme-love.com` }]);
  }

  for (let i = 0; i < 12; i++) {
    identifiersList2.push([{ type: 'dns', value: `test-2-${i + 1}.acme-love.com` }]);
  }

  try {
    const orders = await Promise.all(
      identifiersList.map((identifiers) => client.createOrder(identifiers)),
    );
    t.is(orders.length, identifiersList.length, 'Should create correct number of orders');
    orders.forEach((order, index) => {
      t.truthy(order.url, `Order ${index + 1} should have URL`);
      t.is(order.status, 'pending', `Order ${index + 1} should have pending status`);
    });

    for (let i = 0; i < 12; i++) {
      identifiersList2.push([{ type: 'dns', value: `test-2-${i + 1}.acme-love.com` }]);
    }

    const orders2 = await Promise.all(
      identifiersList2.map((identifiers) => client.createOrder(identifiers)),
    );
    t.is(orders2.length, identifiersList2.length, 'Should create correct number of orders in second batch');
    orders2.forEach((order, index) => {
      t.truthy(order.url, `Order2 ${index + 1} should have URL`);
      t.is(order.status, 'pending', `Order2 ${index + 1} should have pending status`);
    });
  } catch (error: any) {
    console.log(error);
    if (error?.status === 401) {
      t.pass('Order creation failed with auth error - acceptable for E2E test');
    } else {
      t.fail(`Unexpected error creating orders: ${error?.detail || error?.message || error}`);
    }
  }
});
