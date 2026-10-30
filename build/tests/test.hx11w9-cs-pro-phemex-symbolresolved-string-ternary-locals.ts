// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-phemex-symbolresolved-string-ternary-locals.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('pro phemex watchMyTrades/watchOrders: symbolResolved ternary of this.symbol(symbol) : symbol prints string?', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/pro/phemex.ts').content as string;
    assert.equal (out.match (/\n\s+string\? symbolResolved = /g)?.length, 2);
    assert.doesNotMatch (out, /object symbolResolved = /);
});
