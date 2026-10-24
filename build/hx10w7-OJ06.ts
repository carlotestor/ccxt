// hx10w7 OJ06 — WsClient's futures / subscriptions / rejections are owner-thread LinkedHashMaps
// behind OwnerMap hand-off views. A Helpers.GetValue read on one of them is the plain map get, and a
// null receiver or key answers null in both spellings, so the guarded native read stays exact.
// Only an identifier or a string-literal key qualifies; every other shape keeps the helper call.
const OJ06_FIELDS = [ 'futures', 'subscriptions', 'rejections' ];
const OJ06_CALL = 'Helpers.GetValue(';
const OJ06_LITERAL = /^"(?:[^"\\]|\\.)*"$/;
const OJ06_IDENT = /^[A-Za-z_]\w*$/;

// same-length copy with string / char literals and // comments blanked, so structure scans never read them
function oj06Mask (text: string): string {
    const out = text.split ('');
    const blank = (from: number, to: number) => {
        for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === '\\') { j += 2; continue; }
                if (text[j] === c) break;
                j++;
            }
            blank (i + 1, j);
            i = j;
            continue;
        }
        if (c === '/' && text[i + 1] === '/') {
            let j = i;
            while (j < text.length && text[j] !== '\n') j++;
            blank (i, j);
            i = j;
        }
    }
    return out.join ('');
}

function oj06CloseOf (masked: string, open: number): number {
    let depth = 0;
    for (let k = open; k < masked.length; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            if (--depth === 0) return k;
        }
    }
    return -1;
}

function oj06Args (content: string, masked: string, open: number, close: number): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = open + 1;
    for (let k = open + 1; k < close; k++) {
        const c = masked[k];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) {
            parts.push (content.slice (start, k));
            start = k + 1;
        }
    }
    parts.push (content.slice (start, close));
    return parts;
}

export function oj06WsMapReads (content: string): string {
    if (!content.includes (OJ06_CALL)) return content;
    const masked = oj06Mask (content);
    const edits: [ number, number, string ][] = [];
    for (let i = masked.indexOf (OJ06_CALL); i !== -1; i = masked.indexOf (OJ06_CALL, i + 1)) {
        const open = i + OJ06_CALL.length - 1;
        const close = oj06CloseOf (masked, open);
        if (close === -1) continue;
        const parts = oj06Args (content, masked, open, close);
        if (parts.length !== 2) continue;
        const receiver = /^client\.([A-Za-z_]\w*)$/.exec (parts[0].trim ());
        if (receiver === null || !OJ06_FIELDS.includes (receiver[1])) continue;
        const key = parts[1].trim ();
        const literal = OJ06_LITERAL.test (key);
        if (!literal && !OJ06_IDENT.test (key)) continue; // a computed or cast key keeps the helper
        const get = 'client.' + receiver[1] + '.get(' + key + ')';
        const text = literal
            ? '(client.' + receiver[1] + ' == null ? null : ' + get + ')'
            : '(client.' + receiver[1] + ' == null || ' + key + ' == null ? null : ' + get + ')';
        edits.push ([ i, close + 1, text ]);
    }
    let out = content;
    for (const [ from, to, text ] of edits.reverse ()) out = out.slice (0, from) + text + out.slice (to);
    return out;
}

export function oj06SelfTest (): string[] {
    const problems: string[] = [];
    const cases: [ string, string, string | undefined ][] = [
        [ 'ident key', '        Object subscription = Helpers.GetValue(client.subscriptions, key);',
            '(client.subscriptions == null || key == null ? null : client.subscriptions.get(key))' ],
        [ 'literal key', '        Object v = Helpers.GetValue(client.subscriptions, "authenticated");',
            '(client.subscriptions == null ? null : client.subscriptions.get("authenticated"))' ],
        [ 'rejections field', '        Object r = Helpers.GetValue(client.rejections, messageHash);',
            '(client.rejections == null || messageHash == null ? null : client.rejections.get(messageHash))' ],
        [ 'cast prefix', '        io.github.ccxt.ws.Future f = (io.github.ccxt.ws.Future)Helpers.GetValue(client.futures, s);',
            '(io.github.ccxt.ws.Future)(client.futures == null || s == null ? null : client.futures.get(s))' ],
        [ 'other field', '        Object v = Helpers.GetValue(client.other, key);', undefined ],
        [ 'computed key', '        Object v = Helpers.GetValue(client.subscriptions, this.hash(x));', undefined ],
        [ 'three args', '        Object v = Helpers.GetValue(client.subscriptions, key, extra);', undefined ],
        [ 'not a client receiver', '        Object v = Helpers.GetValue(subs, key);', undefined ],
    ];
    for (const [ name, body, expect ] of cases) {
        const out = oj06WsMapReads (body);
        if (expect === undefined) {
            if (out !== body) problems.push ('hx10w7 OJ06: ' + name + ' should keep the helper: ' + out);
            continue;
        }
        if (!out.includes (expect)) problems.push ('hx10w7 OJ06: ' + name + ' not native: ' + out);
        if (oj06WsMapReads (out) !== out) problems.push ('hx10w7 OJ06: ' + name + ' not idempotent');
    }
    return problems;
}
