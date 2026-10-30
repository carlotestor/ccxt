// HX11 w9: a trades-cache read local (`var x any = this.Trades.Get(k)`) whose name is declared again
// in a sibling block of the same func. The scope is the declaring block, so it is typed
// WsArrayCache when every write inside it is a cache read, a constructor or nil.
import { goChanMask } from './go-chan.js';

const DECL = /^(\s*)var (\w+) any = (?:this\.Trades\[[^\]]+\]|this\.Trades\.Get\([^()]*\))$/;
const CACHE_VALUE = /^(?:this\.Trades\[[^\]]+\]|this\.Trades\.Get\([^()]*\)|nil|(?:ccxt\.)?NewArrayCache(?:BySymbolById|ByOutcomeById)?\(.*\))$/;
const esc = (name: string): string => name.replace (/[.*+?^${}()|[\]\\]/g, '\\$&');
const indentOf = (line: string): number => line.length - line.replace (/^\t+/, '').length;

function blockEnd (masked: string[], k: number): number {
    const depth = indentOf (masked[k]);
    for (let j = k + 1; j < masked.length; j++) {
        if ((masked[j].trim () !== '') && (indentOf (masked[j]) < depth)) {
            return j;
        }
    }
    return masked.length;
}

export function hx11w9TradesSafeValueLocalsPass (content: string): string {
    if (content.indexOf ('this.Trades') < 0) {
        return content;
    }
    const q = /^package ccxt\s*$/m.test (content) ? '' : 'ccxt.';
    const lines = content.split ('\n');
    const masked = goChanMask (content).split ('\n');
    if (lines.length !== masked.length) {
        return content;
    }
    for (let k = 0; k < lines.length; k++) {
        const decl = DECL.exec (masked[k]);
        if (decl === null) {
            continue;
        }
        const end = blockEnd (masked, k);
        const n = esc (decl[2]);
        const text = masked.slice (k, end).join ('\n');
        const declared = text.match (new RegExp ('(?<![\\w.])var ' + n + '\\b', 'g')) || [];
        const rebinding = new RegExp ('(?<![\\w.])' + n + '\\s*(?:,\\s*\\w+\\s*)*:=|,\\s*' + n + '\\s*:?=(?!=)|&\\s*' + n + '\\b|func\\([^)]*\\b' + n + '\\b');
        const otherType = new RegExp ('(?<![\\w.])' + n + '\\.\\((?!(?:ccxt\\.)?Appender\\))');
        if ((declared.length !== 1) || rebinding.test (text) || otherType.test (text)) {
            continue;
        }
        const write = new RegExp ('^\\s*' + n + ' = (.*)$');
        let ok = true;
        for (let j = k + 1; ok && (j < end); j++) {
            const w = write.exec (masked[j]);
            ok = (w === null) || CACHE_VALUE.test (w[1].trim ());
        }
        if (!ok) {
            continue;
        }
        lines[k] = lines[k].replace (' any = ', ' ' + q + 'WsArrayCache = ');
        const append = new RegExp ('(?<![\\w.])(' + n + ')\\.\\((?:ccxt\\.)?Appender\\)\\.Append\\(', 'g');
        const nilEq = new RegExp ('(!?)(?:ccxt\\.)?IsEqual\\((' + n + '), nil\\)', 'g');
        for (let j = k; j < end; j++) {
            lines[j] = lines[j].replace (append, '$1.Append(').replace (nilEq, (_m, bang, id) => id + (bang === '!' ? ' != nil' : ' == nil'));
        }
    }
    return lines.join ('\n');
}

export function hx11w9TradesSafeValueLocalsCheck (): string[] {
    const problems: string[] = [];
    const ok = (condition: boolean, message: string) => { if (!condition) { problems.push ('hx11w9-trades-safevalue-locals: ' + message); } };
    const wrap = (body: string) => 'package ccxtpro\n\nfunc (this *X) HandleTrades(client any, message map[string]any) {\n' + body + '}\n';
    const out = hx11w9TradesSafeValueLocalsPass (wrap ([
        '\tfor i := 0; i < len(trades); i++ {',
        '\t\tvar stored any = this.Trades.Get(symbol)',
        '\t\tif stored == nil {',
        '\t\t\tstored = ccxt.NewArrayCache(limit)',
        '\t\t}',
        '\t\tstored.(ccxt.Appender).Append(trade)',
        '\t\tccxt.AddElementToObject(stores, symbol, stored)',
        '\t}',
        '\tfor i := 0; i < len(symbols); i++ {',
        '\t\tvar stored any = stores[symbol]',
        '\t\tclient.(ccxt.ClientInterface).Resolve(stored, messageHash)',
        '\t}',
        '',
    ].join ('\n')));
    for (const want of [ '\t\tvar stored ccxt.WsArrayCache = this.Trades.Get(symbol)', '\t\tstored.Append(trade)', 'var stored any = stores[symbol]', 'Resolve(stored, messageHash)' ]) {
        ok (out.indexOf (want) >= 0, 'missing ' + want + ' in ' + out);
    }
    ok (out.indexOf ('ccxt.Appender') < 0, 'an assertion is left: ' + out);
    const nested = hx11w9TradesSafeValueLocalsPass (wrap ('\t{\n\t\tvar o any = this.Trades.Get(s)\n\t\tfor {\n\t\t\tvar o any = message\n\t\t}\n\t}\n'));
    ok (nested.indexOf ('var o any = this.Trades.Get(s)') >= 0, 'a shadowed name stays any: ' + nested);
    const mixed = hx11w9TradesSafeValueLocalsPass (wrap ('\t{\n\t\tvar o any = this.Trades.Get(s)\n\t\to = message\n\t}\n'));
    ok (mixed.indexOf ('var o any = ') >= 0, 'a mixed local stays any: ' + mixed);
    const other = hx11w9TradesSafeValueLocalsPass (wrap ('\t{\n\t\tvar o any = this.Trades.Get(s)\n\t\tvar m map[string]any = o.(map[string]any)\n\t}\n'));
    ok (other.indexOf ('var o any = ') >= 0, 'a local asserted to a map stays any: ' + other);
    return problems;
}
