// Run: npx tsx --test build/tests/test.hx11w9-cs-extended-fetchextendedaccount-createorderrequest-dict-awaited-local.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('extended: awaited fetchExtendedAccount / createExtendedOrderRequest locals print Dictionary<string, object>', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/extended.ts').content as string;
    assert.match (out, /Dictionary<string, object> account = await this\.fetchExtendedAccount\(\);/);
    assert.match (out, /Dictionary<string, object> extendedOrderRequest = await this\.createExtendedOrderRequest\(/);
    assert.doesNotMatch (out, /object account = await this\.fetchExtendedAccount\(\);/);
    assert.doesNotMatch (out, /object extendedOrderRequest = await this\.createExtendedOrderRequest\(/);
});
