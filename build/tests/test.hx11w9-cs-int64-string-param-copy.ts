// Run: npx tsx --test build/tests/test.hx11w9-cs-int64-string-param-copy.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('binance fetchOHLCV: `: Int` copy of an Int param prints Int64?', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/binance.ts').content as string;
    assert.match (out, /\n\s+Int64\? limitRequested = limit;/);
    assert.doesNotMatch (out, /object limitRequested = limit;/);
});

test('foxbit parseOrder: `: Market` copy of a Dict param prints IDictionary', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/foxbit.ts').content as string;
    assert.match (out, /\n\s+IDictionary<string, object> marketResolved = market;/);
});
