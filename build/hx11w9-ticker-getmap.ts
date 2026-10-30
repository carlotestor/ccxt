// HX11 w9: MapTyped(this.Tickers.Get(k)) is the cache's own GetMap(k): same nil/absent answer,
// no package helper at the site.

const GET_MAP = /(?<![\w.])(?:ccxt\.)?MapTyped\(this\.(Tickers|Bidsasks)\.Get\(([^()]*)\)\)/g;
const ANY_LOCAL = /^(\s*)var (\w+) any = this\.(Tickers|Bidsasks)\.Get\(([^()]*)\)$/;
const esc = (name: string): string => name.replace (/[.*+?^${}()|[\]\\]/g, '\\$&');

// `var x any = this.Tickers.Get(k)` is a map when x is only read: never written again, asserted,
// rebound or handed to AddElementToObject (a nil map would panic there).
function typeLocals (content: string): string {
    const lines = content.split ('\n');
    let start = -1;
    for (let k = 0; k < lines.length; k++) {
        if (lines[k].startsWith ('func ')) {
            start = k;
        }
        const decl = ANY_LOCAL.exec (lines[k]);
        if ((decl === null) || (start < 0)) {
            continue;
        }
        let end = k;
        while ((end < lines.length) && (lines[end] !== '}')) {
            end++;
        }
        const body = lines.slice (start, end).join ('\n');
        const n = esc (decl[2]);
        const bad = new RegExp ('(?<![\\w.])var ' + n + '\\b(?![^\\n]*= this\\.(?:Tickers|Bidsasks)\\.Get)|(?<![\\w.])' + n + '\\s*(?:,\\s*\\w+\\s*)*:?=(?!=)|(?<![\\w.])' + n + '\\.\\(|AddElementToObject\\(' + n + '\\b|&' + n + '\\b|func\\([^)]*\\b' + n + '\\b');
        const declared = body.match (new RegExp ('(?<![\\w.])var ' + n + '\\b', 'g')) || [];
        if ((declared.length !== 1) || bad.test (body.replace (lines[k], ''))) {
            continue;
        }
        lines[k] = decl[1] + 'var ' + decl[2] + ' map[string]any = this.' + decl[3] + '.GetMap(' + decl[4] + ')';
    }
    return lines.join ('\n');
}

export function hx11w9TickerGetMapPass (content: string): string {
    if (content.indexOf ('.Get(') < 0) {
        return content;
    }
    return typeLocals (content.replace (GET_MAP, 'this.$1.GetMap($2)'));
}

export function hx11w9TickerGetMapCheck (): string[] {
    const problems: string[] = [];
    const ok = (condition: boolean, message: string) => { if (!condition) { problems.push ('hx11w9-ticker-getmap: ' + message); } };
    const out = hx11w9TickerGetMapPass ('\tvar ticker map[string]any = ccxt.MapTyped(this.Tickers.Get(symbol))\n\tvar b map[string]any = ccxt.MapTyped(this.Bidsasks.Get(*symbol))\n');
    ok (out.indexOf ('var ticker map[string]any = this.Tickers.GetMap(symbol)\n') >= 0, 'tickers: ' + out);
    ok (out.indexOf ('var b map[string]any = this.Bidsasks.GetMap(*symbol)\n') >= 0, 'bidsasks: ' + out);
    const keep = '\tvar t map[string]any = ccxt.MapTyped(this.Orders.Get(symbol))\n\tvar u map[string]any = ccxt.MapTyped(this.Tickers.Get(f(x)))\n';
    ok (hx11w9TickerGetMapPass (keep) === keep, 'other receivers or nested calls are left alone');
    const fn = (body: string) => 'func (this *X) F() {\n' + body + '}\n';
    const loc = hx11w9TickerGetMapPass (fn ('\tvar last any = this.Tickers.Get(symbol)\n\tt = this.P(m, last, x)\n'));
    ok (loc.indexOf ('var last map[string]any = this.Tickers.GetMap(symbol)\n') >= 0, 'read-only local typed: ' + loc);
    const wr = fn ('\tvar cur any = this.Bidsasks.Get(symbol)\n\tccxt.AddElementToObject(cur, \"bid\", p)\n');
    ok (hx11w9TickerGetMapPass (wr) === wr, 'a written local stays any');
    const re = fn ('\tvar cur any = this.Bidsasks.Get(symbol)\n\tcur = x\n');
    ok (hx11w9TickerGetMapPass (re) === re, 'a reassigned local stays any');
    const asr = fn ('\tvar cur any = this.Bidsasks.Get(symbol)\n\tm := cur.(map[string]any)\n');
    ok (hx11w9TickerGetMapPass (asr) === asr, 'an asserted local stays any');
    ok (hx11w9TickerGetMapPass (out) === out, 'not idempotent');
    return problems;
}
