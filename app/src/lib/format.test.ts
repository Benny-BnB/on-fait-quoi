import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMontant, formatNombre } from './format.ts';

test('montants : euro 1.234,56€, monnaie locale avec son code', () => {
  assert.equal(formatMontant(1234.56, 'EUR'), '1.234,56€');
  assert.equal(formatMontant(39, 'AED'), '39 AED');
  assert.equal(formatMontant(0.5, 'THB'), '0,50 THB');
  assert.equal(formatMontant(1000000, 'THB'), '1.000.000 THB');
  assert.equal(formatMontant(12, 'EUR'), '12€');
  assert.equal(formatNombre(999), '999');
  assert.equal(formatNombre(1000), '1.000');
  assert.equal(formatNombre(-1234.5), '-1.234,50');
});
