// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-coinbaseexchange-authenticate-dict-return.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION } from './../csharp-local-types.js';

test('authenticate (coinbaseexchange pro dict literal) is a per-declaration Dictionary return', () => {
    assert.equal (CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION['authenticate'], 'Dictionary<string, object>');
});
