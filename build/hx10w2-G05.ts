// ===== hx10w2 G05 (trimmed): DerefScalar of a literal-default Safe* accessor =====
// Census at the hx10 live head 8f5573e2 (go-only farm gate with this pass on vs off, whole tree):
// Add/Subtract/Multiply/Mod and the value-kind / `&x` / proven-local DerefScalar arms convert 0
// sites (the ast printer's goNativeArithmetic already owns them), so they are gone. What stays is
// `DerefScalar(this.Safe*(.., <literal default>))` -> `(*this.Safe*(..))` in an `any`-or-same-kind
// slot: 9 sites (apex, gate, hyperliquid x2, mexc x2, poloniex, prediction hyperliquid/polymarket)
// plus 2 declaration retypes it unlocks (apex nonce, hyperliquid grouping -> string).
// Printer gap: the DerefScalar wrap is added by the build pass in goTranspiler.ts and only the text
// scan goDerefWrapRedundantLocals decides which locals keep it; a printer emission cannot know
// that, and emitting `(*x)` for every literal-default local would also change the redundant ones.

type G05Kind = string;

const G05_CALL = /(?<![\w.])(?:ccxt\.)?DerefScalar\(/g;
// pointer element types derefScalar unwraps (go/v4/exchange_helpers.go)
const G05_PTR_ELEMENT: { [t: string]: string } = { '*string': 'string', '*int64': 'int64', '*float64': 'float64', '*bool': 'bool', '*int': 'int' };

// base-method Go return types (go/v4/exchange_*.go); a method the file defines itself is not trusted
const G05_METHOD_TYPES: { [name: string]: string } = {
    'Json': 'string',
    'Ymd': 'string',
    'Ymdhms': 'string',
    'Uuid': 'string',
    'Uuid16': 'string',
    'Uuid22': 'string',
    'DecimalToPrecision': 'string',
    'ParseToInt': 'int64',
    'Milliseconds': 'int64',
    'Seconds': 'int64',
    'Microseconds': 'int64',
    'GetArrayLength': 'int',
    'SafeString': '*string',
    'SafeString2': '*string',
    'SafeStringN': '*string',
    'SafeStringLower': '*string',
    'SafeStringLower2': '*string',
    'SafeStringLowerN': '*string',
    'SafeStringUpper': '*string',
    'SafeStringUpper2': '*string',
    'SafeStringUpperN': '*string',
    'SafeInteger': '*int64',
    'SafeInteger2': '*int64',
    'SafeIntegerN': '*int64',
    'SafeNumber': '*float64',
    'SafeNumber2': '*float64',
    'SafeNumberN': '*float64',
    'SafeBool': '*bool',
    'SafeBool2': '*bool',
    'SafeBoolN': '*bool',
    'SafeCurrencyCode': '*string',
    'SafeSymbol': '*string',
    'NumberToString': '*string',
    'PriceToPrecision': '*string',
    'AmountToPrecision': '*string',
};

// package-level constructor Go return types (go/v4/exchange_safe.go, exchange_types.go)
const G05_FUNC_TYPES: { [name: string]: string } = {
    'SafeStringPtr': '*string',
    'SafeBoolPtr': '*bool',
    'SafeMapTyped': 'map[string]any',
    'SafeListTyped': '[]any',
    'SafeListTypedDefault': '[]any',
    'GetArgString': 'string',
    'GetArgStringPtr': '*string',
    'GetArgInt64Ptr': '*int64',
    'GetArgFloat64Ptr': '*float64',
};

// literals and comments blanked out, columns kept: structure matches never see a "..." string
function g05Mask (content: string): string {
    const out = content.split ('');
    let state = 'code';
    let escaped = false;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (state === 'code') {
            if ((c === '/') && (content[i + 1] === '/')) { state = 'line'; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
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

function g05Close (masked: string, open: number): number {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        const c = masked[i];
        if ((c === '(') || (c === '[') || (c === '{')) { depth++; }
        else if ((c === ')') || (c === ']') || (c === '}')) { depth--; if (depth === 0) { return i; } }
    }
    return -1;
}

// top-level comma split of masked[open+1 .. close-1]; returns [start, end) spans
function g05Args (masked: string, open: number, close: number): number[][] {
    const spans: number[][] = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open + 1; i < close; i++) {
        const c = masked[i];
        if ((c === '(') || (c === '[') || (c === '{')) { depth++; }
        else if ((c === ')') || (c === ']') || (c === '}')) { depth--; }
        else if ((c === ',') && (depth === 0)) { spans.push ([ start, i ]); start = i + 1; }
    }
    spans.push ([ start, close ]);
    return spans;
}

function g05Strip (text: string): string {
    let t = text.trim ();
    while (t.startsWith ('(') && (g05Close (t, 0) === t.length - 1)) {
        t = t.slice (1, -1).trim ();
    }
    return t;
}

// top-level '+' (or one of `ops`) split positions in a masked expression
function g05SplitOps (masked: string, ops: string): number[] {
    const cuts: number[] = [];
    let depth = 0;
    for (let i = 0; i < masked.length; i++) {
        const c = masked[i];
        if ((c === '(') || (c === '[') || (c === '{')) { depth++; continue; }
        if ((c === ')') || (c === ']') || (c === '}')) { depth--; continue; }
        if ((depth === 0) && ops.includes (c)) { cuts.push (i); }
    }
    return cuts;
}

interface G05Scope { scope: Map<string, string>; own: Set<string> }

function g05Infer (text: string, masked: string, ctx: G05Scope): G05Kind | undefined {
    const t = g05Strip (text);
    const m = g05Strip (masked);
    if (t === '') { return undefined; }
    if (/^"(?:[^"\\\n]|\\.)*"$/.test (t) || t.startsWith ('`')) { return 'string'; }
    if (/^\d+$/.test (t)) { return 'ilit'; }
    if (/^\d+\.\d+$/.test (t)) { return 'flit'; }
    if (/^[A-Za-z_]\w*$/.test (t)) { return ctx.scope.get (t); }
    // a deref an earlier pass proved: `*p` is the pointer's element
    if (/^\*[A-Za-z_]\w*$/.test (t)) {
        const p = ctx.scope.get (t.slice (1));
        return (p === undefined) ? undefined : G05_PTR_ELEMENT[p];
    }
    // `*this.M(..)` / `*F(..)`: the earlier pass proved the call non-nil, so the value is the element
    const derefCall = /^\*(this\.\w+|[\w.]+)\(/.exec (m);
    if (derefCall && (g05Close (m, derefCall[0].length - 1) === m.length - 1)) {
        const inner = g05Infer (t.slice (1), m.slice (1), ctx);
        return (inner === undefined) ? undefined : G05_PTR_ELEMENT[inner];
    }
    const idx = /^([A-Za-z_]\w*)\s*\[/.exec (m);
    if (idx && (g05Close (m, idx[0].length - 1) === m.length - 1)) {
        const c = ctx.scope.get (idx[1]);
        if (c === undefined) { return undefined; }
        if (c.startsWith ('[]')) { return c.slice (2); }
        const mm = /^map\[[^\]]+\](.+)$/.exec (c);
        return (mm === null) ? undefined : mm[1];
    }
    const conv = /^(int64|float64|int|string|bool)\(/.exec (m);
    if (conv && (g05Close (m, conv[0].length - 1) === m.length - 1)) { return conv[1]; }
    const call = /^this\.(\w+)\(/.exec (m);
    if (call && (g05Close (m, call[0].length - 1) === m.length - 1)) {
        return ctx.own.has (call[1]) ? undefined : G05_METHOD_TYPES[call[1]];
    }
    const fn = /^([A-Za-z_]\w*)\(/.exec (m);
    if (fn && (g05Close (m, fn[0].length - 1) === m.length - 1)) {
        if (fn[1] === 'len') { return 'int'; }
        return G05_FUNC_TYPES[fn[1]];
    }
    // a native operator tree an earlier pass emitted (or this pass just emitted)
    const plus = g05SplitOps (m, '+');
    if (plus.length > 0) {
        const parts = g05SplitBy (text, masked, plus);
        const kinds = parts.map (([ s0, e0 ]) => g05Infer (text.slice (s0, e0), masked.slice (s0, e0), ctx));
        if (kinds.every ((k) => k === 'string')) { return 'string'; }
        if (kinds.every ((k) => (k === 'int64') || (k === 'ilit'))) { return kinds.includes ('int64') ? 'int64' : 'int'; }
        return undefined;
    }
    const arith = g05SplitOps (m, '-*');
    if (arith.length > 0) {
        const parts = g05SplitBy (text, masked, arith);
        const kinds = parts.map (([ s0, e0 ]) => g05Infer (text.slice (s0, e0), masked.slice (s0, e0), ctx));
        if (kinds.every ((k) => (k === 'int64') || (k === 'ilit'))) { return kinds.includes ('int64') ? 'int64' : 'int'; }
    }
    return undefined;
}

// [start,end) spans of a masked expression split at the given top-level operator columns
function g05SplitBy (text: string, masked: string, cuts: number[]): number[][] {
    const spans: number[][] = [];
    let start = 0;
    for (const cut of cuts) { spans.push ([ start, cut ]); start = cut + 1; }
    spans.push ([ start, masked.length ]);
    return spans;
}

// top-level comma split of an argument list body
function g05SplitText (body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if ((c === '(') || (c === '[') || (c === '{')) { depth++; }
        else if ((c === ')') || (c === ']') || (c === '}')) { depth--; }
        else if ((c === ',') && (depth === 0)) { parts.push (body.slice (start, i)); start = i + 1; }
    }
    parts.push (body.slice (start));
    return parts;
}

// argument index (1-based) that holds the optional default, per accessor arity
const G05_DEFAULT_ARG: { [name: string]: number } = {
    'SafeString': 3, 'SafeInteger': 3, 'SafeNumber': 3, 'SafeBool': 3,
    'SafeStringLower': 3, 'SafeStringUpper': 3, 'SafeStringN': 3, 'SafeIntegerN': 3, 'SafeNumberN': 3, 'SafeBoolN': 3,
    'SafeString2': 4, 'SafeInteger2': 4, 'SafeNumber2': 4, 'SafeBool2': 4,
    'SafeStringLower2': 4, 'SafeStringUpper2': 4,
};

// `*T` value the text holds with no nil branch: a `Safe*` call with a literal default (its
// wrapper answers a pointer to that value)
function g05NonNilPointer (text: string, masked: string, ctx: G05Scope): string | undefined {
    const t = g05Strip (text);
    const m = g05Strip (masked);
    const call = /^this\.(\w+)\(/.exec (m);
    if ((call !== null) && (g05Close (m, call[0].length - 1) === m.length - 1) && !ctx.own.has (call[1])) {
        const kind = G05_METHOD_TYPES[call[1]];
        const min = G05_DEFAULT_ARG[call[1]];
        if ((kind !== undefined) && kind.startsWith ('*') && (min !== undefined)) {
            const args = g05SplitText (t.slice (t.indexOf ('(') + 1, -1));
            if (args.length >= min) {
                const def = args[args.length - 1].trim ();
                if (/^-?\d+(?:\.\d+)?$/.test (def) || /^"(?:[^"\\\n]|\\.)*"$/.test (def) || (def === 'true') || (def === 'false')) { return kind; }
            }
        }
    }
    return undefined;
}

// derefScalar unwraps a pointer the text proves non-nil to its element
function g05Native (text: string, ptr: G05Kind | undefined): { text: string, kind: G05Kind } | undefined {
    const element = (ptr === undefined) ? undefined : G05_PTR_ELEMENT[ptr];
    return (element === undefined) ? undefined : { 'text': '(*' + text + ')', 'kind': element };
}

// the helper answers `any`; the native value only goes where an `any` was accepted
function g05ContextOk (before: string, after: string, kind: G05Kind, scope: Map<string, string>): boolean {
    if (/^\s*\.\(/.test (after)) { return false; }
    if (/^\s*(==|!=)/.test (after)) { return false; }
    const b = before.replace (/[ \t]+$/, '');
    if (b === '') { return false; }
    if (/(\(|,|\{)$/.test (b)) { return true; }
    if (/(?<![\w.])return$/.test (b)) { return true; }
    if (/(?<![\w.])var\s+\w+\s+any\s*=$/.test (b)) { return true; }
    if (/:$/.test (b)) { return true; }
    const assign = /(?<![\w.])(\w+)\s*=\s*$/.exec (b);
    if (assign !== null) {
        const lhs = scope.get (assign[1]);
        if (lhs === 'any') { return true; }
        return (lhs === kind) || ((kind === 'int') && (lhs === 'int64')) || ((kind === 'int64') && (lhs === 'int'));
    }
    return false;
}

interface G05Decl { line: number; depth: number; name: string; type?: string; rhs?: string; rhsMasked?: string; assign: boolean }

const G05_VAR_TYPE = /^\s*var\s+(\w+)\s+(\*?\[\][\w.*\[\]]+|map\[[^\]]+\][\w.*\[\]]+|\*?[\w.]+)\s*(=\s*(.*))?$/;
const G05_VAR_INFER = /^\s*var\s+(\w+)\s*=\s*(.*)$/;
const G05_SHORT = /^([ \t]*)(\w+(?:\s*,\s*\w+)*)\s*:=\s*(.*)$/;
const G05_RANGE = /^\s*for\s+(\w+(?:\s*,\s*\w+)?)\s*:=\s*range\s+(.*)$/;
const G05_ASSIGN = /^\s*(\w+)\s*=(?!=)\s*(.*)$/;

function g05DeclaredKind (type: string): string {
    const t = type.trim ();
    if (t === 'any') { return 'any'; }
    if (t === 'interface{}') { return 'any'; }
    return t;
}

// declarations and assignments of one line, in source order
function g05LineDecls (src: string, mask: string, line: number, depth: number): G05Decl[] {
    const out: G05Decl[] = [];
    const stmt = src.replace (/^\s+/, '');
    const mstmt = mask.replace (/^\s+/, '');
    const range = G05_RANGE.exec (mstmt);
    if (range !== null) {
        const names = range[1].split (',').map ((n) => n.trim ());
        if (names.length === 2) {
            out.push ({ 'line': line, 'depth': depth, 'name': names[0], 'type': 'int', 'assign': false });
            const span = range[0].length - range[2].length;
            out.push ({ 'line': line, 'depth': depth, 'name': names[1], 'rhs': stmt.slice (span), 'rhsMasked': range[2], 'assign': false });
        }
        return out;
    }
    const v = G05_VAR_TYPE.exec (mstmt);
    if (v !== null) {
        const type = g05DeclaredKind (v[2]);
        const value = (v[4] === undefined) ? undefined : stmt.slice (mstmt.indexOf ('=', mstmt.indexOf (v[2]) + v[2].length) + 1);
        out.push ({ 'line': line, 'depth': depth, 'name': v[1], 'type': type, 'rhs': value, 'rhsMasked': v[4], 'assign': false });
        return out;
    }
    const vi = G05_VAR_INFER.exec (mstmt);
    if (vi !== null) {
        const at = mstmt.indexOf ('=', vi[1].length);
        out.push ({ 'line': line, 'depth': depth, 'name': vi[1], 'rhs': stmt.slice (at + 1), 'rhsMasked': vi[2], 'assign': false });
        return out;
    }
    const sh = G05_SHORT.exec (mstmt);
    if (sh !== null) {
        const names = sh[2].split (',').map ((n) => n.trim ());
        const at = mstmt.indexOf (':=');
        const rhs = stmt.slice (at + 2);
        if (names.length === 1) {
            out.push ({ 'line': line, 'depth': depth, 'name': names[0], 'rhs': rhs, 'rhsMasked': mstmt.slice (at + 2), 'assign': false });
        } else {
            for (const name of names) { out.push ({ 'line': line, 'depth': depth, 'name': name, 'type': '?', 'assign': false }); }
        }
        return out;
    }
    const as = G05_ASSIGN.exec (mstmt);
    if (as !== null) {
        const at = mstmt.indexOf ('=', as[1].length);
        out.push ({ 'line': line, 'depth': depth, 'name': as[1], 'rhs': stmt.slice (at + 1), 'rhsMasked': as[2], 'assign': true });
    }
    return out;
}

// the scope in force at `line`: every declaration before it, in block order
function g05ScopeAt (lines: { decls: G05Decl[], depth: number }[], line: number, own: Set<string>): G05Scope {
    const stack: Map<string, string>[] = [ new Map () ];
    const ctx: G05Scope = { 'scope': stack[0], 'own': own };
    for (let k = 0; (k < line) && (k < lines.length); k++) {
        const depth = lines[k].depth;
        while (stack.length > depth + 1) { stack.pop (); }
        while (stack.length < depth + 1) { stack.push (new Map ()); }
        ctx.scope = stack[stack.length - 1];
        for (const decl of lines[k].decls) {
            if (decl.assign) {
                let found: string | undefined;
                for (let s = stack.length - 1; s >= 0; s--) {
                    const seen = stack[s].get (decl.name);
                    if (seen !== undefined) { found = seen; break; }
                }
                if (found !== undefined) {
                    const kind = (decl.type !== undefined) ? decl.type : (g05Infer (decl.rhs ?? '', decl.rhsMasked ?? '', ctx) ?? '?');
                    const typed = ((kind === 'ilit') || (kind === 'flit')) ? ((kind === 'ilit') ? 'int' : 'float64') : kind;
                    if (typed !== found) {
                        for (let s = stack.length - 1; s >= 0; s--) {
                            if (stack[s].has (decl.name)) { stack[s].set (decl.name, '?'); break; }
                        }
                    }
                }
                continue;
            }
            let kind = decl.type;
            if (kind === undefined) {
                kind = g05Infer (decl.rhs ?? '', decl.rhsMasked ?? '', ctx);
                if ((kind === 'ilit') || (kind === 'flit')) { kind = (kind === 'ilit') ? 'int' : 'float64'; }
                if (kind === undefined) { kind = '?'; }
            }
            stack[stack.length - 1].set (decl.name, kind);
        }
    }
    // the query line sits at its own brace depth: deeper scopes are already closed
    const here = (line < lines.length) ? lines[line].depth : 0;
    while (stack.length > here + 1) { stack.pop (); }
    const flat = new Map<string, string> ();
    for (let s = 0; s < stack.length; s++) {
        for (const [ name, kind ] of stack[s]) { flat.set (name, kind); }
    }
    return { 'scope': flat, 'own': own };
}

function g05RewriteFunc (text: string, own: Set<string>): string {
    let masked = g05Mask (text);
    const srcLines = text.split ('\n');
    const maskLines = masked.split ('\n');
    const lines: { decls: G05Decl[], depth: number }[] = [];
    let depth = 0;
    for (let k = 0; k < maskLines.length; k++) {
        const maskLine = maskLines[k];
        lines.push ({ 'decls': g05LineDecls (srcLines[k], maskLine, k, depth), 'depth': depth });
        depth += (maskLine.split ('{').length - 1) - (maskLine.split ('}').length - 1);
        if (depth < 0) { depth = 0; }
    }
    // parameters are in scope for the whole body
    const sig = maskLines[0] ?? '';
    for (const m of sig.matchAll (/[(,]\s*([A-Za-z_]\w*)\s+(\.\.\.[\w.*\[\]]+|\*?\[\][\w.*\[\]]+|map\[[^\]]+\][\w.*\[\]]+|\*?[\w.]+)\s*[,)]/g)) {
        const type = g05DeclaredKind (m[2].startsWith ('...') ? 'any' : m[2]);
        if (m[1] !== 'this') { lines[0].decls.unshift ({ 'line': 0, 'depth': 0, 'name': m[1], 'type': type, 'assign': false }); }
    }
    const lineStarts: number[] = [];
    let at = 0;
    for (const line of srcLines) { lineStarts.push (at); at += line.length + 1; }
    const lineOf = (pos: number): number => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = Math.ceil ((lo + hi) / 2);
            if (lineStarts[mid] <= pos) { lo = mid; } else { hi = mid - 1; }
        }
        return lo;
    };
    const calls = [ ...masked.matchAll (G05_CALL) ].map ((m) => ({ 'start': m.index as number }));
    calls.sort ((x, y) => y.start - x.start);
    for (const call of calls) {
        const open = masked.slice (call.start).indexOf ('(') + call.start;
        const close = g05Close (masked, open);
        if (close < 0) { continue; }
        const args = g05Args (masked, open, close);
        if (args.length !== 1) { continue; }
        const ctx = g05ScopeAt (lines, lineOf (call.start), own);
        const scope = ctx.scope;
        const [ s0, e0 ] = args[0];
        // a pointer the text proves non-nil reads as its element (`derefScalar` would unwrap it)
        const ptr = g05NonNilPointer (text.slice (s0, e0).trim (), masked.slice (s0, e0), ctx);
        const native = g05Native (text.slice (s0, e0).trim (), ptr);
        if (native === undefined) { continue; }
        const before = masked.slice (0, call.start);
        const after = masked.slice (close + 1);
        if (!g05ContextOk (before, after, native.kind, scope)) { continue; }
        // drop the operator's own parens where the value fills a whole argument or return slot
        let out = native.text;
        if (out.startsWith ('(') && (g05Close (out, 0) === out.length - 1) && /[(:,]$/.test (before.replace (/[ \t]+$/, '')) && /^\s*[,)\n}]/.test (after)) {
            out = out.slice (1, -1);
        }
        text = text.slice (0, call.start) + out + text.slice (close + 1);
        masked = masked.slice (0, call.start) + g05Mask (out) + masked.slice (close + 1);
    }
    return text;
}

export function hx10w2G05 (content: string): string {
    if ((content.indexOf ('IT IS GENERATED AND WILL BE OVERWRITTEN') < 0) || !/(?<![\w.])(?:ccxt\.)?DerefScalar\(/.test (content)) {
        return content;
    }
    // a definition in this file wins over the base table unless it repeats the table's type
    const own = new Set<string> ();
    const mask = g05Mask (content);
    for (const m of mask.matchAll (/^func\s*\(\w+\s+\*?\w+\)\s+(\w+)\s*\([^)]*\)\s*([\w.*\[\]]+)\s*\{/gm)) {
        if (G05_METHOD_TYPES[m[1]] !== m[2]) { own.add (m[1]); }
    }
    for (const m of mask.matchAll (/^func\s+(\w+)\s*\([^)]*\)\s*([\w.*\[\]]+)\s*\{/gm)) {
        if (G05_FUNC_TYPES[m[1]] !== m[2]) { own.add (m[1]); }
    }
    let out = '';
    let cursor = 0;
    let start = -1;
    const lines = content.split ('\n');
    const maskedLines = g05Mask (content).split ('\n');
    let depth = 0;
    const lineStart: number[] = [];
    let off = 0;
    for (const line of lines) { lineStart.push (off); off += line.length + 1; }
    for (let k = 0; k < lines.length; k++) {
        if ((start < 0) && (depth === 0) && lines[k].startsWith ('func ')) { start = k; }
        depth += (maskedLines[k].split ('{').length - 1) - (maskedLines[k].split ('}').length - 1);
        if ((start >= 0) && (depth === 0)) {
            const from = lineStart[start];
            const to = lineStart[k] + lines[k].length;
            out += content.slice (cursor, from) + g05RewriteFunc (content.slice (from, to), own);
            cursor = to;
            start = -1;
        }
    }
    out += content.slice (cursor);
    return out;
}

export function hx10w2G05Check (): string[] {
    const problems: string[] = [];
    const ok = (cond: boolean, msg: string) => {
        if (!cond) { problems.push ('hx10w2 G05: ' + msg); }
    };
    const wrap = (body: string, sig = '') => 'package ccxt\n\n// PLEASE DO NOT EDIT THIS FILE, IT IS GENERATED AND WILL BE OVERWRITTEN\n\nfunc (this *X) f(' + sig + ') any {\n' + body + '\n}\n';
    const run = (body: string, sig = '') => hx10w2G05 (wrap (body, sig));
    ok (run ('\tvar s []string = nil\n\treturn DerefScalar(s[0])').includes ('DerefScalar(s[0])'), 'a value slice element keeps the helper (printer owns it)');
    ok (run ('\tvar s []any = nil\n\treturn DerefScalar(s[0])').includes ('DerefScalar(s[0])'), 'an any element keeps the helper');
    ok (run ('\treturn DerefScalar(this.SafeInteger(o, "k", 1))').includes ('return (*this.SafeInteger(o, "k", 1))'), 'a literal-default accessor derefs natively');
    ok (run ('\treturn DerefScalar(this.SafeInteger(o, "k"))').includes ('DerefScalar('), 'an accessor with no default keeps the helper');
    ok (run ('\treturn DerefScalar(this.SafeString2(o, "a", "b"))').includes ('DerefScalar('), 'a two-key accessor without a default keeps the helper');
    ok (run ('\tvar n any = 0\n\tn = DerefScalar(this.SafeInteger(o, "k", 0))\n\treturn n').includes ('n = (*this.SafeInteger(o, "k", 0))'), 'an any local takes the defaulted deref natively');
    ok (run ('\tvar n int64 = 0\n\tn = DerefScalar(this.SafeString(o, "k", "a"))\n\treturn n').includes ('DerefScalar('), 'a mismatched typed local keeps the helper');
    ok (run ('\tvar a int64 = 1\n\treturn Add(a, 2)').includes ('Add(a, 2)'), 'Add is the printer\'s now, the pass leaves it');
    return problems;
}
