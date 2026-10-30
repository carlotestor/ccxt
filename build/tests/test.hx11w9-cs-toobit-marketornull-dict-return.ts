// Run: npx tsx --test build/tests/test.hx11w9-cs-toobit-marketornull-dict-return.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('pro toobit: marketOrNull result locals print Dictionary<string, object>', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/pro/toobit.ts').content as string;
    assert.match (out, /Dictionary<string, object> market = this\.marketOrNull\(symbol\);/);
    assert.doesNotMatch (out, /object market = this\.marketOrNull/);
});
