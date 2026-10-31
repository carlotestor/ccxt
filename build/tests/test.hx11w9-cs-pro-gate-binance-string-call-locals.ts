// Run: npx tsx --test build/tests/test.hx11w9-cs-pro-gate-binance-string-call-locals.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };
const out = (path: string) => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    return (transpiler as any).transpileCSharpByPath (path).content as string;
};

test('gate getMarketTypeByUrl caller local is a string, `+` is native', () => {
    const cs = out ('./ts/src/pro/gate.ts');
    assert.match (cs, /string type = \(\(string\)this\.getMarketTypeByUrl\(client\.url\)\);/);
    assert.doesNotMatch (cs, /findMessageHashes\(client, add\(type, ":positions::"\)\)/);
});

test('binance getAccountTypeFromSubscriptions caller locals are strings, `+` is native', () => {
    const cs = out ('./ts/src/pro/binance.ts');
    assert.doesNotMatch (cs, /object accountType = this\.getAccountTypeFromSubscriptions/);
    assert.doesNotMatch (cs, /add\(accountType, ":(positions|balance)/);
});
