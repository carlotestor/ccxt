// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-derive-handlepositiondelta-idict-return.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION } from './../csharp-local-types.js';

test('handlePositionDelta (derive pro) is a per-declaration IDictionary return', () => {
    assert.equal (CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION['handlePositionDelta'], 'IDictionary<string, object>');
});
