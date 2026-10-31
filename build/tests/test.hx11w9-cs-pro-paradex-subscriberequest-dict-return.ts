// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-paradex-subscriberequest-dict-return.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION } from './../csharp-local-types.js';

test('subscribeRequest (paradex pro dict literal) is a per-declaration Dictionary return', () => {
    assert.equal (CSHARP_COLLECTION_RETURN_METHODS_BY_DECLARATION['subscribeRequest'], 'Dictionary<string, object>');
});
