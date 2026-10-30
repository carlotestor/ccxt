import Transpiler from 'ast-transpiler';
import { setupCsharpPrinter } from './../csharp-worker.js';
const cfg = { verbose: false, csharp: { parser: { ELEMENT_ACCESS_WRAPPER_OPEN: 'getValue(', ELEMENT_ACCESS_WRAPPER_CLOSE: ')' } } };
const t = new Transpiler (cfg); setupCsharpPrinter (t);
const out = (t as any).transpileCSharpByPath (process.argv[2]).content as string;
for (const l of out.split ('\n')) if (new RegExp (process.argv[3]).test (l)) console.log (l);
