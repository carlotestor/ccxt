// hx10 wave-7 OG06 (Go printer): the `resolved` map coercion the ws path prints -
//   var v map[string]any
//   switch vBox := <producer>.(type) { case map[string]any: v = vBox; case *sync.Map: v = SafeMapToMap(vBox); case nil:; default: panic(...) }
// - carries a `case *sync.Map:` arm calling SafeMapToMap on every site, because the boxed value
// is an `any`. A *sync.Map only reaches such a box from a base field or a market table, so the
// arm is dead whenever the producer's Go body can only yield a map, a slice or nil. Proven
// producers (evidence in the runtime at this commit):
//   this.CreateOHLCVObject(...)   exchange_generated.go: `var res map[string]any = map[string]any{}` ... `return res`
//   this.FilterByArray(...)       exchange_generated.go: returns this.ToArray(...) ([]any), a []any, or this.IndexBy(...)
//   this.FilterOutByArray(...)    same body as FilterByArray
//   any(this.WsCacheSnapshot(..)) exchange_ws_cache.go: `func (...) WsCacheSnapshot(field string) map[string]any`
// this.IndexBy returns map[string]any (exchange_generic.go), so FilterByArray tops out at
// map[string]any / []any / nil. Every other producer (rN.Value off an AsyncResult[any],
// GetValue, SafeValue, SafeBalance, SafeDict, an unproven local) keeps its arm byte for byte.
// A file that loses its last `sync.` reference also loses the standalone `import "sync"` line
// the go-chan3 emitter added for the arm, so the generated file still compiles.
// No helper body is pasted and no other helper family is called: the arm and its call are gone.

const SWITCH_HEAD = /^(\s*)switch (\w+) := (.+)\.\(type\) \{$/;
const VAR_HEAD = /^(\s*)var (\w+) map\[string\]any$/;
// a producer whose Go body cannot yield a *sync.Map
const PROVEN_CALL = /^(?:ccxt\.)?this\.(?:CreateOHLCVObject|FilterByArray|FilterOutByArray)\(/;
// WsCacheSnapshot is declared to return map[string]any, so this box holds a map
const PROVEN_SNAPSHOT = /^any\((?:ccxt\.)?this\.WsCacheSnapshot\([^\n]*\)\)$/;

// index of the emitted `case *sync.Map:` arm for the resolved local `v`, or -1
function og06ArmAt (lines: string[], i: number, ind: string, box: string, v: string): number {
    if (lines[i] !== ind + 'case *sync.Map:') {
        return -1;
    }
    const call = lines[i + 1] ?? '';
    if ((call !== ind + '\t' + v + ' = SafeMapToMap(' + box + ')') && (call !== ind + '\t' + v + ' = ccxt.SafeMapToMap(' + box + ')')) {
        return -1;
    }
    if (lines[i - 2] !== ind + 'case map[string]any:' || lines[i - 1] !== ind + '\t' + v + ' = ' + box) {
        return -1;
    }
    if (lines[i + 2] !== ind + 'case nil:' || lines[i + 3] !== ind + 'default:') {
        return -1;
    }
    const panicLine = lines[i + 4] ?? '';
    if (!/^\s+panic\((?:ccxt\.)?ExchangeError\("resolved value is not map\[string\]any"\)\)$/.test (panicLine)) {
        return -1;
    }
    return i;
}

// drop the `case *sync.Map:` arm of every resolved map coercion whose producer is proven
export function og06SyncMapArmsPass (content: string): string {
    const lines = content.split ('\n');
    const out: string[] = [];
    let dropped = 0;
    let i = 0;
    while (i < lines.length) {
        const head = SWITCH_HEAD.exec (lines[i]);
        const decl = (head !== null && i > 0) ? VAR_HEAD.exec (lines[i - 1]) : null;
        if ((head !== null) && (decl !== null)) {
            const ind = head[1];
            const box = head[2];
            const expr = head[3];
            const v = decl[2];
            const proven = PROVEN_CALL.test (expr) || PROVEN_SNAPSHOT.test (expr);
            if ((decl[1] === ind) && (box === v + 'Box') && proven) {
                let end = i + 1;
                while ((end < lines.length) && (lines[end] !== ind + '}')) {
                    end++;
                }
                for (let k = i + 1; (k < end) && (k < lines.length); k++) {
                    if (og06ArmAt (lines, k, ind, box, v) >= 0) {
                        out.push (lines[i - 1]);
                        out.push (...lines.slice (i, k));
                        out.push (...lines.slice (k + 2, end + 1));
                        i = end + 1;
                        dropped++;
                        break;
                    }
                }
                if ((i === end + 1) && (dropped > 0)) {
                    continue;
                }
            }
        }
        out.push (lines[i]);
        i++;
    }
    if (dropped === 0) {
        return content;
    }
    let text = out.join ('\n');
    if (!/\bsync\./.test (text)) {
        text = text.replace (/^import "sync"\n/m, '');
    }
    return text;
}

function og06Block (q: string, expr: string, want: string, arm: string): string {
    return 'package ccxt\n\nimport ccxt "x"\nimport "sync"\n\n'
        + 'func (this *X) F() any {\n'
        + '\tvar resolved ' + want + '\n'
        + '\tswitch resolvedBox := ' + expr + '.(type) {\n'
        + '\tcase ' + want + ':\n'
        + '\t\tresolved = resolvedBox\n'
        + arm
        + '\tcase nil:\n'
        + '\tdefault:\n'
        + '\t\tpanic(' + q + 'ExchangeError("resolved value is not ' + want + '"))\n'
        + '\t}\n'
        + '\treturn resolved\n'
        + '}\n';
}

const GO06_MAP_ARM = '\tcase *sync.Map:\n\t\tresolved = ';

function og06MapBlock (q: string, expr: string, tail: string, extra = ''): string {
    return og06Block (q, expr, 'map[string]any', extra + GO06_MAP_ARM + q + 'SafeMapToMap(resolvedBox)\n' + tail);
}

export function og06SyncMapArmsCheck (): string[] {
    const problems: string[] = [];
    const ok = (cond: boolean, message: string): void => {
        if (!cond) {
            problems.push ('hx10 wave-7 OG06: ' + message);
        }
    };
    const run = (s: string): string => {
        try {
            return og06SyncMapArmsPass (s);
        } catch (e: any) {
            problems.push ('hx10 wave-7 OG06 threw: ' + e.message);
            return s;
        }
    };
    ok (typeof og06SyncMapArmsPass ('') === 'string', 'the pass is total');
    const keptOrder = '\tcase map[string]any:\n\t\tresolved = resolvedBox\n\tcase nil:\n\tdefault:\n';
    for (const q of [ 'ccxt.', '' ]) {
        const filter = run (og06MapBlock (q, 'this.FilterByArray(this.WsCacheSnapshot("Tickers"), "symbol", symbolsNormalized)', ''));
        ok (filter.indexOf ('sync.Map') < 0, 'a FilterByArray producer drops the arm (q=' + q + ')');
        ok (filter.indexOf ('SafeMapToMap') < 0, 'the dropped arm leaves no SafeMapToMap call (q=' + q + ')');
        ok (filter.indexOf (keptOrder) >= 0, 'the map/nil/default cases stay in order (q=' + q + ')');
        ok (filter.indexOf ('import "sync"') < 0, 'the arm was the only sync reference: the import goes too (q=' + q + ')');
        ok (run (filter) === filter, 'the rewrite is idempotent (q=' + q + ')');
        const ohlcv = run (og06MapBlock (q, 'this.CreateOHLCVObject(symbol, timeframe, filtered)', ''));
        ok (ohlcv.indexOf ('sync.Map') < 0, 'a CreateOHLCVObject producer drops the arm (q=' + q + ')');
        const snapshot = run (og06MapBlock (q, 'any(this.WsCacheSnapshot("Tickers"))', ''));
        ok (snapshot.indexOf ('sync.Map') < 0, 'a bare WsCacheSnapshot map box drops the arm (q=' + q + ')');
    }
    const keep = [
        'ccxt.GetValue(tickers, symbolValue)',
        'r1.Value',
        'this.SafeValue(ticker, symbolValue)',
        'this.SafeBalance(balance)',
        'this.SafeDict(response, "data", map[string]any{})',
        'this.Sub.FilterByArray(tickers, "symbol", symbols)',
        'this.FilterByArrayLater(tickers, "symbol", symbols)',
    ];
    for (const expr of keep) {
        const body = og06MapBlock ('ccxt.', expr, '');
        ok (run (body) === body, 'an unproven producer keeps the arm: ' + expr);
    }
    const mutex = og06MapBlock ('ccxt.', 'this.FilterByArray(tickers, "symbol", symbols)', '').replace ('\treturn resolved\n', '\tvar mu sync.Mutex\n\t_ = mu\n\treturn resolved\n');
    ok (run (mutex).indexOf ('import "sync"') >= 0, 'another sync reference keeps the import');
    ok (run (mutex).indexOf ('case *sync.Map:') < 0, 'the arm still goes in a file that reads sync elsewhere');
    const foreign = og06MapBlock ('ccxt.', 'this.FilterByArray(tickers, "symbol", symbols)', '').replace ('ccxt.SafeMapToMap(resolvedBox)', 'ccxt.SafeMapToMap(otherBox)');
    ok (run (foreign) === foreign, 'a foreign arm body is untouched');
    const list = og06Block ('ccxt.', 'this.FilterByArray(tickers, "symbol", symbols)', '[]any', '\tcase ccxt.IArrayCache:\n\t\tresolved = resolvedBox.ToArray()\n');
    ok (run (list) === list, 'the []any coercion keeps its IArrayCache arm');
    const otherBox = og06MapBlock ('ccxt.', 'this.FilterByArray(tickers, "symbol", symbols)', '').replace ('switch resolvedBox :=', 'switch foreignBox :=');
    ok (run (otherBox) === otherBox, 'a switch over a foreign box is untouched');
    return problems;
}

if (process.argv[1]?.endsWith ('hx10w7-OG06.ts') === true) {
    const problems = og06SyncMapArmsCheck ();
    if (problems.length > 0) {
        console.log (problems.join ('\n'));
        process.exit (1);
    }
    console.log ('hx10 wave-7 OG06: self-test ok');
}
