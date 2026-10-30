// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-coinbase-deribit-numbertostring-string-locals.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('pro deribit authenticate: numberToString of an Int64 prints string locals', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const deribit = (transpiler as any).transpileCSharpByPath ('./ts/src/pro/deribit.ts').content as string;
    assert.match (deribit, /\n\s+string timeString = this\.numberToString\(time\);/);
    assert.match (deribit, /\n\s+string nonce = timeString;/);
    assert.doesNotMatch (deribit, /object timeString = /);
});
