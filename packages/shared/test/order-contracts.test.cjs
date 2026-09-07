const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTIVE_ORDER_STATUSES, OrderStatus } = require('../dist/index.js');

test('served is terminal for the active meal-slot constraint', () => {
  assert.equal(ACTIVE_ORDER_STATUSES.includes(OrderStatus.PENDING), true);
  assert.equal(ACTIVE_ORDER_STATUSES.includes(OrderStatus.ACCEPTED), true);
  assert.equal(ACTIVE_ORDER_STATUSES.includes(OrderStatus.COOKING), true);
  assert.equal(ACTIVE_ORDER_STATUSES.includes(OrderStatus.SERVED), false);
});
