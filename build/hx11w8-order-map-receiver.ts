// hx11 w8 printer-go-handleorder-addelement-typed: a map local filled by OrderToMap(<Order struct>) (or by a
// ParseWsOrder whose every return is OrderToMap(..)) is never nil (StructToMap of a struct value always
// builds a map), so AddElementToObject(local, "k", v) on it can print the native `local["k"] = v`.

const ORDER_TO_MAP = /^(?:ccxt\.)?OrderToMap\(/;
const PARSE_WS_ORDER = /^this\.ParseWsOrder\(/;

function balancedWhole (text: string): boolean {
    let depth = 0;
    for (let i = text.indexOf ('('); (i >= 0) && (i < text.length); i++) {
        depth += (text[i] === '(') ? 1 : ((text[i] === ')') ? -1 : 0);
        if ((depth === 0) && (i < text.length - 1)) {
            return false;
        }
    }
    return (depth === 0) && text.endsWith (')');
}

// every top-level return of the single `func (this *T) name(` in the file is OrderToMap(..)
function calleeAlwaysOrderMap (lines: string[], callee: string): boolean {
    const def = new RegExp ('^func \\(this \\*\\w+\\) ' + callee + '\\(');
    const defs = lines.map ((l, i) => (def.test (l) ? i : -1)).filter ((i) => i >= 0);
    if (defs.length !== 1) {
        return false;
    }
    let returns = 0;
    let closure = 0;
    for (let j = defs[0] + 1; (j < lines.length) && (lines[j] !== '}'); j++) {
        const line = lines[j];
        if (/\bfunc\s*\(/.test (line) || (closure > 0)) {
            for (const c of line) {
                closure += (c === '{') ? 1 : ((c === '}') ? -1 : 0);
            }
            continue;
        }
        const ret = /^\s*return\b\s*(.*)$/.exec (line);
        if (ret !== null) {
            returns++;
            if (!ORDER_TO_MAP.test (ret[1].trim ())) {  // the call may continue on later lines
                return false;
            }
        }
    }
    return returns > 0;
}

export function hx11w8OrderMapReceiver (lines: string[], maskedFunc: string, decl: any, name: string, rebound: (n: string) => boolean): boolean {
    if ((decl === undefined) || (decl.index === undefined) || (decl.type !== 'map[string]any') || !/^\w+$/.test (name)) {
        return false;
    }
    const init = decl.line.replace (/^\s*var\s+\w+\s+\S+\s*=\s*/, '').trim ();
    const direct = ORDER_TO_MAP.test (init) && balancedWhole (init);
    const viaWs = PARSE_WS_ORDER.test (init) && balancedWhole (init) && calleeAlwaysOrderMap (lines, 'ParseWsOrder');
    if (!direct && !viaWs) {
        return false;
    }
    // no rebinding at all, no address taken
    return !rebound (name) && !new RegExp ('(?:^|[^\\w.&*])' + name + '\\s*=(?!=)').test (maskedFunc);
}

export function hx11w8OrderMapReceiverCheck (): string[] {
    const problems: string[] = [];
    const ok = (condition: boolean, label: string) => {
        if (!condition) {
            problems.push ('hx11 w8 order map receiver: ' + label);
        }
    };
    const file = [ 'func (this *X) ParseWsOrder(o any) map[string]any {', '\treturn ccxt.OrderToMap(this.SafeOrder(o))', '}' ];
    const bad = [ 'func (this *X) ParseWsOrder(o any) map[string]any {', '\tif o == nil {', '\t\treturn nil', '\t}', '\treturn ccxt.OrderToMap(this.SafeOrder(o))', '}' ];
    const mk = (init: string) => ({ index: 0, type: 'map[string]any', line: '\tvar p map[string]any = ' + init });
    const never = () => false;
    ok (hx11w8OrderMapReceiver (file, '', mk ('ccxt.OrderToMap(this.ParseOrder(d))'), 'p', never), 'OrderToMap init');
    ok (hx11w8OrderMapReceiver (file, '', mk ('this.ParseWsOrder(m)'), 'p', never), 'ParseWsOrder with OrderToMap returns');
    ok (!hx11w8OrderMapReceiver (bad, '', mk ('this.ParseWsOrder(m)'), 'p', never), 'a nil return keeps the helper');
    ok (!hx11w8OrderMapReceiver (file, '\tp = other\n', mk ('this.ParseWsOrder(m)'), 'p', never), 'rebinding keeps the helper');
    ok (!hx11w8OrderMapReceiver (file, '', mk ('this.ParseWsOrder(m)'), 'p', () => true), 'address taken keeps the helper');
    ok (!hx11w8OrderMapReceiver (file, '', mk ('ccxt.OrderToMap(a).x'), 'p', never), 'not the bare call');
    ok (!hx11w8OrderMapReceiver (file, '', { index: 0, type: 'any', line: '\tvar p any = ccxt.OrderToMap(a)' }, 'p', never), 'any local is not a typed map');
    return problems;
}
