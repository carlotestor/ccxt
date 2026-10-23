// ===== hx10w2-G09: BaseExchange.Options is a plain map[string]any =====
// go/v4/exchange.go declares `Options map[string]any` — a single owner (the exchange), no
// sync.Map. The printer still emits the sync.Map method set and GetValue for it (its field
// table is hard-coded in ast-transpiler), so every generated site is rewritten here:
//   this.Options.Store("k", v)  ->  this.Options["k"] = v
//   this.Options.Delete("k")    ->  delete(this.Options, "k")
//   GetValue(this.Options, "k") ->  this.Options["k"]
// A key only prints natively when it is a Go `string` (a literal, or a local declared once as
// `string`); any other key keeps AddElementToObject/GetValue, both of which take `any` and read
// and write a plain map. A value the file proves to be a `*T` is stored through DerefScalar, so
// the field holds plain values and the native read answers exactly what GetValue derefed.

const G09_FIELD = 'this.Options';
const G09_TYPES = '(?:string|int64|float64|bool|int|\\[\\]string|\\[\\]any|map\\[string\\]any)';
const G09_PTR_HELPER = '^this\\.Safe(?:Bool|String|Integer|Int|Float)2?N?\\(';
const G09_IDENT = '^[A-Za-z_]\\w*$';
const G09_LITERAL = '^"(?:[^"\\\\\\n]|\\\\.)*"$';

// comments and string/rune/raw literals blanked to spaces, offsets and newlines preserved
function g09Mask (content: string): string {
    const out = content.split ('');
    let state = 'code';
    let escaped = false;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (state === 'code') {
            if ((c === '/') && (content[i + 1] === '/')) { state = 'line'; out[i] = ' '; continue; }
            if ((c === '/') && (content[i + 1] === '*')) { state = 'block'; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
            if (c === '"') { state = 'dq'; out[i] = ' '; continue; }
            if (c === '`') { state = 'raw'; out[i] = ' '; continue; }
            if (c === '\'') { state = 'rune'; out[i] = ' '; continue; }
            continue;
        }
        out[i] = (c === '\n') ? '\n' : ' ';
        if (state === 'line') { if (c === '\n') { state = 'code'; } continue; }
        if (state === 'block') { if ((c === '*') && (content[i + 1] === '/')) { out[i + 1] = ' '; i++; state = 'code'; } continue; }
        if (state === 'dq') { if (escaped) { escaped = false; } else if (c === '\\') { escaped = true; } else if (c === '"') { state = 'code'; } continue; }
        if (state === 'rune') { if (escaped) { escaped = false; } else if (c === '\\') { escaped = true; } else if (c === '\'') { state = 'code'; } continue; }
        if (state === 'raw') { if (c === '`') { state = 'code'; } continue; }
    }
    return out.join ('');
}

// index just past the bracket matching masked[open]
function g09Close (masked: string, open: number): number {
    const openers = '([{';
    const closers = ')]}';
    const slot = openers.indexOf (masked[open]);
    if (slot < 0) {
        return -1;
    }
    const opener = openers[slot];
    const closer = closers[slot];
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        if (masked[i] === opener) { depth++; }
        else if (masked[i] === closer) { depth--; if (depth === 0) { return i + 1; } }
    }
    return -1;
}

// offset of the first top-level comma in masked[open..close), or -1
function g09Comma (masked: string, open: number, close: number): number {
    let depth = 0;
    for (let i = open; i < close; i++) {
        const c = masked[i];
        if ((c === '(') || (c === '[') || (c === '{')) { depth++; }
        else if ((c === ')') || (c === ']') || (c === '}')) { depth--; }
        else if ((c === ',') && (depth === 0)) { return i; }
    }
    return -1;
}

function g09Prefix (content: string): string {
    return new RegExp ('^package\\s+ccxt\\s*$', 'm').test (content) ? '' : 'ccxt.';
}

// the Go text of a key a map index accepts: a string literal, or an identifier declared once as
// `string` (GetValue answers nil for a nil key, which `m[k]` cannot express)
function g09Key (key: string, masked: string): string | undefined {
    if (new RegExp (G09_LITERAL).test (key)) {
        return key;
    }
    if (!new RegExp (G09_IDENT).test (key)) {
        return undefined;
    }
    const decls = [ ...masked.matchAll (new RegExp ('\\bvar ' + key + ' (\\S+) =', 'g')) ];
    if ((decls.length === 0) || decls.some ((d: any) => d[1] !== 'string')) {
        return undefined;
    }
    if (new RegExp ('\\bvar ' + key + ' (?:any|interface\\{\\}|map\\[|\\[\\])', 'm').test (masked)) {
        return undefined;
    }
    if (new RegExp ('(?:^|[^\\w.])' + key + '\\s*:', 'm').test (masked)) {
        return undefined;
    }
    return key;
}

// a value the file proves to be a `*T` (GetValue derefed it on read, so a pointer must not land
// in the map un-derefed or the native read would answer a different value than the helper did)
function g09Ptr (value: string, masked: string): boolean {
    if (new RegExp (G09_PTR_HELPER).test (value)) {
        return true;
    }
    if (!new RegExp (G09_IDENT).test (value)) {
        return false;
    }
    return new RegExp ('\\bvar ' + value + ' \\*' + G09_TYPES + ' =', 'm').test (masked);
}

// literal-key GetValue reads -> native map index (runs after the store rewrite, so no span overlaps it)
function g09Reads (content: string): string {
    const read = /(?:ccxt\.)?GetValue\(\s*(?:ccxt\.)?this\.Options\s*,\s*("(?:[^"\\\n]|\\.)*")\s*\)/g;
    if (!read.test (content)) {
        return content;
    }
    const masked = g09Mask (content);
    read.lastIndex = 0;
    return content.replace (read, (all: string, key: string, off: number) => {
        return (masked.slice (off, off + all.length).indexOf ('GetValue') < 0) ? all : (G09_FIELD + '[' + key + ']');
    });
}

export function g09Pass (content: string): string {
    const probe = /this\.Options\.(?:Store|Delete)\(|GetValue\(\s*(?:ccxt\.)?this\.Options\s*,/;
    if (!probe.test (content)) {
        return content;
    }
    const masked = g09Mask (content);
    if (masked.length !== content.length) {
        return content;
    }
    const prefix = g09Prefix (content);
    const edits: { start: number, end: number, text: string }[] = [];
    const call = /this\.Options\.(Store|Delete)\(/g;
    let m: any;
    while ((m = call.exec (masked)) !== null) {
        const open = m.index + m[0].length - 1;
        const close = g09Close (masked, open);
        if (close < 0) {
            continue;
        }
        const inner = content.slice (open + 1, close - 1);
        const shape = masked.slice (open + 1, close - 1);
        if (m[1] === 'Delete') {
            const keyText = g09Key (inner.trim (), masked);
            if (keyText !== undefined) {
                edits.push ({ 'start': m.index, 'end': close, 'text': 'delete(' + G09_FIELD + ', ' + keyText + ')' });
            }
            continue;
        }
        const comma = g09Comma (shape, 0, shape.length);
        if (comma < 0) {
            continue;
        }
        const key = inner.slice (0, comma).trim ();
        const value = g09Reads (inner.slice (comma + 1).trim ());
        if (value === '') {
            continue;
        }
        const keyText = g09Key (key, masked);
        let text: string;
        if (keyText === undefined) {
            text = prefix + 'AddElementToObject(' + G09_FIELD + ', ' + key + ', ' + value + ')';
        } else {
            const stored = g09Ptr (value, masked) ? (prefix + 'DerefScalar(' + value + ')') : value;
            text = G09_FIELD + '[' + keyText + '] = ' + stored;
        }
        edits.push ({ 'start': m.index, 'end': close, 'text': text });
    }
    let out = content;
    for (const edit of edits.sort ((a, b) => b.start - a.start)) {
        out = out.slice (0, edit.start) + edit.text + out.slice (edit.end);
    }
    return g09Reads (out);
}

export function g09Check (): string[] {
    const problems: string[] = [];
    const ok = (condition: boolean, message: string) => { if (!condition) { problems.push ('hx10w2 G09: ' + message); } };
    const head = 'package ccxt\n\n';
    const fn = (body: string, sig = '') => head + 'func (this *X) F(' + sig + ') any {\n' + body + '\treturn nil\n}\n';
    try {
        ok (g09Pass (fn ('\treturn GetValue(this.Options, "k")\n')).includes ('\treturn this.Options["k"]\n'), 'literal read');
        ok (g09Pass ('package ccxtpro\n\nfunc F() any {\n\treturn ccxt.GetValue(this.Options, "k")\n}\n').includes ('\treturn this.Options["k"]\n'), 'ccxt-prefixed read');
        ok (g09Pass (fn ('\tthis.Options.Store("k", 1)\n')).includes ('\tthis.Options["k"] = 1\n'), 'literal write');
        ok (g09Pass (fn ('\tthis.Options.Delete("k")\n')).includes ('\tdelete(this.Options, "k")\n'), 'delete');
        ok (g09Pass (fn ('\tvar k string = "a"\n\tthis.Options.Store(k, 1)\n')).includes ('\tthis.Options[k] = 1\n'), 'string local key');
        ok (g09Pass (fn ('\tthis.Options.Store(k, 1)\n', 'k any')).includes ('\tAddElementToObject(this.Options, k, 1)\n'), 'any key keeps the helper');
        ok (g09Pass (fn ('\tthis.Options.Store("k", this.SafeBool(o, "d"))\n')).includes ('\tthis.Options["k"] = DerefScalar(this.SafeBool(o, "d"))\n'), 'pointer value derefs');
        ok (g09Pass (fn ('\tvar s *string = this.SafeString(o, "d")\n\tthis.Options.Store("k", s)\n')).includes ('\tthis.Options["k"] = DerefScalar(s)\n'), 'pointer local derefs');
        ok (g09Pass (fn ('\treturn GetValue(GetValue(this.Options, "a"), "b")\n')).includes ('\treturn GetValue(this.Options["a"], "b")\n'), 'nested read keeps the outer helper');
        ok (g09Pass (head + 'func (this *X) F() {\n\tthis.Options.Store("k", map[string]any{\n\t\t"a": 1,\n\t})\n}\n').includes ('this.Options["k"] = map[string]any{\n\t\t"a": 1,\n\t}'), 'multi-line value');
        ok (g09Pass ('package ccxtpro\n\nfunc F() {\n\tthis.Options.Store("k", this.SafeBool(o, "d"))\n}\n').includes ('ccxt.DerefScalar('), 'subpackage deref prefix');
        for (const keep of [
            fn ('\treturn GetValue(this.MarketsById, "k")\n'),
            fn ('\treturn GetValue(this.Options, k)\n', 'k any'),
            head + 'func (this *X) F() {\n\t// this.Options.Store("k", 1)\n}\n',
            head + 'func (this *X) F() string {\n\treturn "this.Options.Store(\\"k\\", 1)"\n}\n',
        ]) {
            ok (g09Pass (keep) === keep, 'keeps its text: ' + keep);
        }
        const once = g09Pass (fn ('\tthis.Options.Store("k", 1)\n\tvar r any = GetValue(this.Options, "r")\n'));
        ok (g09Pass (once) === once, 'idempotent');
    } catch (e: any) {
        problems.push ('hx10w2 G09 threw: ' + e.message);
    }
    return problems;
}
