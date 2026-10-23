// ===== hx10w3 G05: generated base method return types (Go) =====
// A generated base method whose Go signature is already concrete still boxes its caller's
// local (`var x any = this.ParseBalance (r)`) because the printer's return-type table only
// knows the hand-written helpers. Naming the generated signature lets that local hold the
// map/slice the callee really returns, so the reads on it print native (m[k], len(xs), xs[i])
// and the `=== undefined` tests print `x == nil`. Three callees still print `any` in the base
// (ParseOrderBookBidAsk, ReduceFeesByCurrency, EventsList): they are added to the proven list
// pass, which retypes base + every override fail-closed on an unproven return path.
//
// Nothing else changes: a value that is not one of these types keeps the plain helper call,
// and the printer's own reject filters (rebinding, `x.push`, a later write of another type)
// still run on the type this table answers.

import { CCXT_GO_HELPER_RETURN_TYPES } from './go-local-types.js';

// Every entry: the generated method's return type at this commit, uniform across the base and
// the venue overrides (the proven-list passes retype those families, so the caller and the
// callee spelling can never disagree) and a container on every return path, so a local that
// holds it can never gain a nil the box did not have.
export const G05_GENERATED_RETURN_TYPES: { [callee: string]: string } = {
    // dict producers (goProvenMapCollectionMethods)
    'this.ParseBalance': 'map[string]any',
    'this.ParseTickers': 'map[string]any',
    'this.ParseCurrencies': 'map[string]any',
    'this.ParseFundingRates': 'map[string]any',
    'this.ParseOpenInterests': 'map[string]any',
    'this.ParseAccount': 'map[string]any',
    // hand-written base: extends a fresh map from the arguments' own dicts
    'this.Extend': 'map[string]any',
    // list producers (goProvenListMethods)
    'this.ParseOrders': '[]any',
    'this.ParseTrades': '[]any',
    'this.ParsePredictionOrders': '[]any',
    'this.ParsePredictionTrades': '[]any',
    'this.FilterBySinceLimit': '[]any',
    // retyped by G05_PROVEN_LIST_METHODS below
    'this.ParseOrderBookBidAsk': '[]any',
    'this.ReduceFeesByCurrency': '[]any',
    'this.EventsList': '[]any',
};

// go/tests call the same methods on a `*ccxt.Exchange` local spelled `exchange`
const g05ReceiverTwin = (entries: { [callee: string]: string }) => {
    const twins: { [callee: string]: string } = {};
    for (const [ callee, type ] of Object.entries (entries)) {
        twins[callee.replace (/^this\./, 'exchange.')] = type;
    }
    return twins;
};

export const G05_HELPER_RETURN_TYPES: { [callee: string]: string } = {
    ...G05_GENERATED_RETURN_TYPES,
    ...g05ReceiverTwin (G05_GENERATED_RETURN_TYPES),
};

Object.assign (CCXT_GO_HELPER_RETURN_TYPES, G05_HELPER_RETURN_TYPES);

// `any` in the base today; every return path of the base and of each override prints a `[]any`
// literal or a `[]any`-declared local (`retypeGoProvenFamily`).
export const G05_PROVEN_LIST_METHODS = [ 'ParseOrderBookBidAsk', 'ReduceFeesByCurrency', 'EventsList' ];

// fails on the base generator: the three callees still print `any` there and the table lacks
// every entry above
export function g05Check (retypeProven: (content: string) => string): string[] {
    const problems: string[] = [];
    const ok = (c: boolean, msg: string) => { if (!c) { problems.push ('hx10w3-G05: ' + msg); } };
    for (const [ callee, type ] of Object.entries (G05_HELPER_RETURN_TYPES)) {
        ok (CCXT_GO_HELPER_RETURN_TYPES[callee] === type, 'return-type table entry ' + callee + ' = ' + type);
    }
    const fn = (name: string, body: string) => '\nfunc (this *X) ' + name + '(a any) any {\n' + body + '}\n';
    const retyped = retypeProven (fn ('ReduceFeesByCurrency', '\tvar result []any = []any{}\n\treturn result\n'));
    ok (retyped.includes (') ReduceFeesByCurrency(a any) []any {'), 'ReduceFeesByCurrency retyped to []any');
    const bidAsk = retypeProven (fn ('ParseOrderBookBidAsk', '\treturn []any{1, 2}\n'));
    ok (bidAsk.includes (') ParseOrderBookBidAsk(a any) []any {'), 'ParseOrderBookBidAsk retyped to []any');
    let threw = false;
    try {
        retypeProven (fn ('EventsList', '\treturn 0\n'));
    } catch (e) {
        threw = true;
    }
    ok (threw, 'EventsList with an unproven return path still throws');
    return problems;
}
