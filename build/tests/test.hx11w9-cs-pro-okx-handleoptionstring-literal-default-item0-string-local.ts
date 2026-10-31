// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-okx-handleoptionstring-literal-default-item0-string-local.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('pro okx watchTradesForSymbols: literal-default handleOptionStringAndParams()[0] local prints string', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/pro/okx.ts').content as string;
    assert.match (out, /\n\s+string channel = \(\(string\)getValue\(this\.handleOptionStringAndParams\(parameters, "watchTrades", "channel", "trades"\), 0\)\);/);
    assert.doesNotMatch (out, /object channel = [^\n]*handleOptionStringAndParams\(parameters, "watchTrades"/);
});
