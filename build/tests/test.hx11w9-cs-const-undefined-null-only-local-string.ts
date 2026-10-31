// Run: npx tsx --test build/tests/test.hx11w9-cs-const-undefined-null-only-local-string.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';

const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };

test('mercado: const type = undefined prints string?', () => {
    const transpiler = new Transpiler (cfg);
    setupCsharpPrinter (transpiler);
    const out = (transpiler as any).transpileCSharpByPath ('./ts/src/mercado.ts').content as string;
    assert.match (out, /\n\s+string\? type = null;/);
    assert.doesNotMatch (out, /object type = null;/);
});
