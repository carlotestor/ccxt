// HX11 w9: a venue's order book handler (TS: `orderbook: WsOrderBook`) prints `OrderBookInterface` when every
// call in its file hands it a typed book local. With the book nil-guarded at each call, the side reads and the
// meta writes on the parameter print the book's own accessors and setters.
const HANDLERS: { [receiver: string]: string[] } = {
    'Bitvavo': [ 'HandleOrderBookMessage' ],
    'Bittrade': [ 'HandleOrderBookMessage' ],
    'Deepcoin': [ 'HandleOrderBookMessage' ],
    'Coinbase': [ 'HandleOrderBookHelper' ],
};
const SIDE = { 'asks': 'GetAsks', 'bids': 'GetBids' };
const SETTERS = { 'nonce': [ 'SetNonce', '*int64' ], 'timestamp': [ 'SetTimestamp', '*int64' ], 'datetime': [ 'SetDatetime', '*string' ] };

const esc = (name: string): string => name.replace (/[.*+?^${}()|[\]\\]/g, '\\$&');

function funcRanges (lines: string[]): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let start = -1;
    for (let k = 0; k < lines.length; k++) {
        if (lines[k].startsWith ('func ')) {
            start = k;
        } else if ((start >= 0) && (lines[k] === '}')) {
            ranges.push ([ start, k + 1 ]);
            start = -1;
        }
    }
    return ranges;
}

function splitArgs (text: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let s = 0;
    let quote = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote !== '') {
            quote = (c === quote) ? '' : quote;
        } else if ((c === '"') || (c === '`')) {
            quote = c;
        } else if ('([{'.includes (c)) {
            depth++;
        } else if (')]}'.includes (c)) {
            depth--;
        } else if ((c === ',') && (depth === 0)) {
            args.push (text.substring (s, i).trim ());
            s = i + 1;
        }
    }
    args.push (text.substring (s).trim ());
    return args;
}

// the call's argument text after `this.name(` up to the closing paren at the line's end
function callArgs (line: string, method: string): string[] | undefined {
    const at = line.indexOf ('this.' + method + '(');
    if ((at < 0) || !line.endsWith (')')) {
        return undefined;
    }
    return splitArgs (line.substring (at + ('this.' + method + '(').length, line.length - 1));
}

function bookLocal (lines: string[], range: [number, number], name: string, type: string): boolean {
    const text = lines.slice (range[0], range[1]).join ('\n');
    const kinds = Array.from (text.matchAll (new RegExp ('(?<![\\w.])var ' + esc (name) + ' (\\S+)', 'g'))).map ((m) => m[1]);
    return (kinds.length === 1) && (kinds[0] === type);
}

function nilGuarded (lines: string[], range: [number, number], name: string): boolean {
    const text = lines.slice (range[0], range[1]).join ('\n');
    return new RegExp ('\\n\\s*if ' + esc (name) + ' == nil \\{\\n(?:\\s*//[^\\n]*\\n)*\\s*return\\n').test (text);
}

export function hx11w9OrderBookHandlerParams (content: string): string {
    const lines = content.split ('\n');
    let ranges = funcRanges (lines);
    const pkg = /^package ccxt$/m.test (content) ? '' : 'ccxt.';
    const type = pkg + 'OrderBookInterface';
    for (const range of ranges) {
        const own = /^func \(this \*(\w+)\) (\w+)\(([^)]*)\)/.exec (lines[range[0]]);
        if ((own === null) || !(HANDLERS[own[1]] ?? []).includes (own[2])) {
            continue;
        }
        const method = own[2];
        const params = own[3].split (',').map ((p) => p.trim ());
        const at = params.findIndex ((p) => /^orderbook any$/.test (p));
        if (at < 0) {
            continue;
        }
        const body = lines.slice (range[0] + 1, range[1]).join ('\n');
        if (/(?:^|\n)\s*orderbook = |&orderbook\b/.test (body)) {
            continue;
        }
        // every call in the file hands the handler a typed book local
        let calls = 0;
        let guarded = true;
        let ok = true;
        for (const other of ranges) {
            for (let k = other[0] + 1; k < other[1]; k++) {
                if (!lines[k].includes ('this.' + method + '(') || lines[k].trimStart ().startsWith ('//')) {
                    continue;
                }
                const args = callArgs (lines[k], method);
                const arg = (args === undefined) ? undefined : args[at];
                calls++;
                if ((arg === undefined) || !/^\w+$/.test (arg) || !bookLocal (lines, other, arg, type)) {
                    ok = false;
                } else if (!nilGuarded (lines, other, arg)) {
                    guarded = false;
                }
            }
        }
        if (!ok || (calls === 0) || new RegExp ('\\b' + method + '\\b').test (lines.filter ((l, k) => (k < range[0]) || (k >= range[1])).join ('\n').replace (new RegExp ('this\\.' + method + '\\(', 'g'), ''))) {
            continue;
        }
        lines[range[0]] = lines[range[0]].replace ('orderbook any', 'orderbook ' + type);
        if (!guarded) {
            continue;
        }
        const read = /(?<![\w.])(?:ccxt\.)?GetValue\(orderbook, "(asks|bids)"\)/g;
        const write = /^(\s*)(?:ccxt\.)?AddElementToObject\(orderbook, "(nonce|timestamp|datetime)", (\w+|this\.Iso8601\(\w+\))\)$/;
        for (let k = range[0] + 1; k < range[1]; k++) {
            if (lines[k].trimStart ().startsWith ('//')) {
                continue;
            }
            lines[k] = lines[k].replace (read, (all: string, side: string) => 'orderbook.' + SIDE[side] + '()');
            const w = write.exec (lines[k]);
            if (w !== null) {
                const [ setter, kind ] = SETTERS[w[2]];
                const typed = new RegExp ('(?<![\\w.])var ' + esc (w[3]) + ' ' + esc (kind) + ' = ').test (body);
                if (typed || ((w[2] === 'datetime') && /^this\.Iso8601\(\w+\)$/.test (w[3]))) {
                    lines[k] = w[1] + 'orderbook.' + setter + '(' + w[3] + ')';
                }
            }
        }
    }
    return lines.join ('\n');
}

export function hx11w9OrderBookHandlerParamsCheck (): string[] {
    const problems: string[] = [];
    const ok = (cond: boolean, what: string) => { if (!cond) { problems.push ('hx11w9 handler param: ' + what); } };
    const handler = 'func (this *Bitvavo) HandleOrderBookMessage(client any, message any, orderbook any) any {\n\tvar nonce *int64 = this.SafeInteger(message, "nonce")\n\tvar ts *int64 = this.SafeInteger(message, "ts")\n\tthis.HandleDeltas(ccxt.GetValue(orderbook, "asks"), nil)\n\t// ccxt.GetValue(orderbook, "bids") stays prose\n\tccxt.AddElementToObject(orderbook, "nonce", nonce)\n\tccxt.AddElementToObject(orderbook, "timestamp", ts)\n\tccxt.AddElementToObject(orderbook, "datetime", this.Iso8601(ts))\n\tccxt.AddElementToObject(orderbook, "symbol", nonce)\n\treturn orderbook\n}\n';
    const caller = (guard: boolean, decl: string, arg: string) => 'func (this *Bitvavo) HandleOrderBook(client any, message any) {\n\t' + decl + '\n' + (guard ? '\tif orderbook == nil {\n\t\treturn\n\t}\n' : '') + '\tthis.HandleOrderBookMessage(client, message, ' + arg + ')\n}\n';
    const typedDecl = 'var orderbook ccxt.OrderBookInterface = this.Orderbooks.Get(symbol)';
    let out = hx11w9OrderBookHandlerParams (handler + caller (true, typedDecl, 'orderbook'));
    ok (out.includes ('orderbook ccxt.OrderBookInterface) any {'), 'param retyped: ' + out);
    ok (out.includes ('this.HandleDeltas(orderbook.GetAsks(), nil)') && out.includes ('// ccxt.GetValue(orderbook, "bids") stays prose'), 'side read, comment kept: ' + out);
    ok (out.includes ('orderbook.SetNonce(nonce)') && out.includes ('orderbook.SetTimestamp(ts)') && out.includes ('orderbook.SetDatetime(this.Iso8601(ts))'), 'setters: ' + out);
    ok (out.includes ('AddElementToObject(orderbook, "symbol", nonce)'), 'untyped value keeps the helper: ' + out);
    out = hx11w9OrderBookHandlerParams (handler + caller (false, typedDecl, 'orderbook'));
    ok (out.includes ('orderbook ccxt.OrderBookInterface) any {') && out.includes ('ccxt.GetValue(orderbook, "asks")') && !out.includes ('.SetNonce('), 'unguarded caller: retype only: ' + out);
    out = hx11w9OrderBookHandlerParams (handler + caller (true, 'var orderbook any = this.Orderbooks.Get(symbol)', 'orderbook'));
    ok (out === handler + caller (true, 'var orderbook any = this.Orderbooks.Get(symbol)', 'orderbook'), 'untyped caller keeps any: ' + out);
    out = hx11w9OrderBookHandlerParams (handler + caller (true, typedDecl, 'other'));
    ok (out.includes ('orderbook any) any {'), 'unproven argument keeps any: ' + out);
    out = hx11w9OrderBookHandlerParams (handler.replace ('\treturn orderbook', '\torderbook = nil\n\treturn orderbook') + caller (true, typedDecl, 'orderbook'));
    ok (out.includes ('orderbook any) any {'), 'reassigned param keeps any: ' + out);
    out = hx11w9OrderBookHandlerParams (handler.replace ('*Bitvavo', '*Okx') + caller (true, typedDecl, 'orderbook'));
    ok (out.includes ('orderbook any) any {'), 'other venues untouched: ' + out);
    return problems;
}
