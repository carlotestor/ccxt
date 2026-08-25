#!/usr/bin/env python3
"""
Type the generated Java cores in place, per the closed allowlist in
build/javaTypedCores.ts.

Java analogue of the `typeCores` post-transpile pass in build/csharpTranspiler.ts
(ccxt/ccxt#30066). Runs over the emitted java/lib tree after transpilation.

Two independent tiers, exactly like C#:
  * crypto     -- base io/github/ccxt/Exchange.java + exchanges/**Core.java
                  (excluding exchanges/prediction/), table TYPED_CORES
  * prediction -- base io/github/ccxt/PredictionExchange.java +
                  exchanges/prediction/**Core.java, table PREDICTION_TYPED_CORES

Java generics are invariant, so `CompletableFuture<Ticker>` does NOT override
`CompletableFuture<Object>`: a name must be typed on the base declaration AND on
every venue override, or javac rejects it. That makes the transform
all-or-nothing per (tier, name) -- the exact analogue of C# CS0508.

The transform is:
    public CompletableFuture<Object> fetchTicker(Object symbol, Object... a)
    {
        return CompletableFuture.supplyAsync(() -> {   ...   });
    }
becomes
    public CompletableFuture<Ticker> fetchTicker(Object symbol, Object... a)
    {
        return CompletableFuture.supplyAsync(() -> { ... }).thenApply(TypedCores::toTicker);
    }

Appending `.thenApply(to<T>)` at the single tail is what makes this tractable:
the body has dozens of `return` statements and rewriting each one would be both
fragile and unnecessary. `to<T>` is null-safe and idempotent, so it is correct
for every path including the ones that already produce a typed value.
"""
import re, sys, os, glob, json

ROOT = 'java/lib/src/main/java/io/github/ccxt'
TABLE = 'build/javaTypedCores.ts'


def load_tables():
    s = open(TABLE).read()

    def tbl(name):
        i = s.index('export const ' + name)
        j = s.index('};', i)
        return dict(re.findall(r"'(\w+)':\s*'([^']+)'", s[i:j]))
    return tbl('TYPED_CORES'), tbl('PREDICTION_TYPED_CORES')


def java_type(fam):
    if fam.startswith('List<'):
        return 'java.util.List<io.github.ccxt.types.%s>' % fam[5:-1]
    return 'io.github.ccxt.types.%s' % fam


def helper(fam):
    if fam.startswith('List<'):
        return 'io.github.ccxt.TypedCores::to%sList' % fam[5:-1]
    return 'io.github.ccxt.TypedCores::to%s' % fam


def find_body_end(lines, start):
    """The body ends at the first line indented like the signature that is a bare
    '}'. Brace counting is unusable here: generated bodies carry '{' and '}'
    inside URL and JSON string literals.

    The first transpiled method in Exchange.java is emitted at column 0 (it is
    spliced in right after the marker comment) while its body still closes at the
    normal 4-space member indent, so clamp to the member indent."""
    ind = len(lines[start]) - len(lines[start].lstrip())
    ind = max(ind, 4)
    for i in range(start + 1, len(lines)):
        if not lines[i].strip():
            continue
        cur = len(lines[i]) - len(lines[i].lstrip())
        if cur == ind and lines[i].strip() == '}':
            return i
    return -1


def type_file(path, table, report):
    src = open(path).read()
    if 'CompletableFuture<Object> ' not in src:
        return 0
    lines = src.split('\n')
    out = list(lines)
    hits = 0
    for i, l in enumerate(lines):
        m = re.match(r'^(\s*)public java\.util\.concurrent\.CompletableFuture<Object> (\w+)\((.*)\)\s*$', l)
        if not m:
            continue
        indent, name, params = m.groups()
        fam = table.get(name)
        if not fam:
            continue
        end = find_body_end(lines, i)
        if end < 0:
            report.setdefault('no-body-end', []).append((path, name))
            continue
        j = end - 1
        while j > i and not lines[j].strip():
            j -= 1
        if lines[j].strip() != '});':
            # Not a single supplyAsync tail (e.g. a hand-written delegator).
            # Skipped rather than guessed -- a wrong rewrite here is silent.
            report.setdefault('tail-not-supplyAsync', []).append((path, name))
            continue
        out[i] = '%spublic java.util.concurrent.CompletableFuture<%s> %s(%s)' % (
            indent, java_type(fam), name, params)
        out[j] = lines[j].replace('});', '}).thenApply(%s);' % helper(fam))
        hits += 1
    if hits:
        open(path, 'w').write('\n'.join(out))
    return hits


def type_async_aliases(path, table):
    """Exchange.java carries hand-written one-line async aliases:

        public CompletableFuture<Object> fetchPositionsAsync(Object... args) {
            return fetchPositions(args); }

    They forward straight into the core, so once the core is typed the alias no
    longer compiles. Retype the alias to match its target."""
    src = open(path).read()
    n = 0

    def repl(m):
        nonlocal n
        indent, name, args = m.group(1), m.group(2), m.group(3)
        fam = table.get(name)
        if not fam:
            return m.group(0)
        n += 1
        return ('%spublic java.util.concurrent.CompletableFuture<%s> %sAsync(Object... %s) '
                '{ return %s(%s); }' % (indent, java_type(fam), name, args, name, args))

    out = re.sub(
        r'^(\s*)public java\.util\.concurrent\.CompletableFuture<Object> (\w+)Async\(Object\.\.\. (\w+)\) '
        r'\{ return \2\(\3\); \}$',
        repl, src, flags=re.M)
    if n:
        open(path, 'w').write(out)
    return n


def wrap_typed_core_consumers(path, table):
    """Second pass: wrap non-tail calls to typed cores in the reverse helper.

    Java analogue of `wrapTypedCoreConsumers` in build/csharpTranspiler.ts.

    Once a core is typed, a call site that does NOT immediately return the value
    puts a typed object into an `Object` local:

        orders = (this.fetchOrders(symbol, since, null, parameters)).join();
        return this.filterBy(orders, "status", "closed");

    `filterBy` then casts each element to Map and throws ClassCastException. The
    generated `from*` helpers are exact inverses and are pass-through for anything
    that is not a unified type, so wrapping the joined value restores the raw shape
    the surrounding untyped code expects.

    Only `.join()`ed call sites are rewritten: a bare `return this.X(...)` is a tail
    call whose type is already the method's declared type."""
    lines = open(path).read().split('\n')
    names = sorted(table)
    n = 0
    for idx, line in enumerate(lines):
        if '(this.' not in line or ')).join()' not in line:
            continue                      # cheap reject: most lines cannot match
        for name in names:
            fam = table[name]
            helper_name = (('from%sList' % fam[5:-1]) if fam.startswith('List<')
                           else ('from%s' % fam))
            needle = '(this.' + name + '('
            start = 0
            while True:
                i = line.find(needle, start)
                if i < 0:
                    break
                if line[max(0, i - 7):i] == 'return ':
                    start = i + len(needle)
                    continue
                # already wrapped by a previous run -- the pass must be idempotent
                # because the transpile pipeline may be re-run over an emitted tree.
                if line[:i].endswith('io.github.ccxt.TypedCores.%s(' % helper_name):
                    start = i + len(needle)
                    continue
                # balance the argument parens within THIS line, skipping string
                # literals, so a sibling call in the same expression is never
                # swallowed (a lazy `[^;]*?` matcher corrupted
                # promiseAll(a(...), b(...)) here).
                j = i + len(needle)
                depth = 1
                in_str = False
                while j < len(line) and depth:
                    c = line[j]
                    if in_str:
                        if c == '\\':
                            j += 1
                        elif c == '"':
                            in_str = False
                    elif c == '"':
                        in_str = True
                    elif c == '(':
                        depth += 1
                    elif c == ')':
                        depth -= 1
                    j += 1
                if depth or not line.startswith(')).join()', j - 1):
                    start = i + len(needle)
                    continue
                end = j - 1 + len(')).join()')
                prefix = 'io.github.ccxt.TypedCores.%s(' % helper_name
                line = line[:i] + prefix + line[i:end] + ')' + line[end:]
                n += 1
                start = i + len(prefix) + (end - i) + 1
        lines[idx] = line
    if n:
        open(path, 'w').write('\n'.join(lines))
    return n


def main():
    tc, pc = load_tables()
    report = {}

    crypto = [os.path.join(ROOT, 'Exchange.java'),
              # BaseExchange.java carries the transpiled `NotSupported` stub
              # declarations (fetchStatus, withdraw, transfer, ...). They are in
              # the same supplyAsync shape, and because every venue override must
              # match the base declaration exactly (Java generics are invariant),
              # missing this file makes ~100 overrides fail to compile.
              os.path.join(ROOT, 'BaseExchange.java')] + [
        p for p in glob.glob(ROOT + '/exchanges/**/*Core.java', recursive=True)
        if '/prediction/' not in p]
    pred = [os.path.join(ROOT, 'PredictionExchange.java')] + glob.glob(
        ROOT + '/exchanges/prediction/*Core.java')

    n_c = sum(type_file(p, tc, report) for p in crypto)
    n_p = sum(type_file(p, pc, report) for p in pred)
    n_a = (type_async_aliases(os.path.join(ROOT, 'Exchange.java'), tc)
           + type_async_aliases(os.path.join(ROOT, 'BaseExchange.java'), tc)
           + type_async_aliases(os.path.join(ROOT, 'PredictionExchange.java'), pc))
    print('async aliases retyped: %d' % n_a)
    n_w = (sum(wrap_typed_core_consumers(p, tc) for p in crypto)
           + sum(wrap_typed_core_consumers(p, pc) for p in pred))
    print('consuming call sites wrapped in from*: %d' % n_w)

    print('crypto tier    : %d methods typed across %d files (%d names in table)'
          % (n_c, len(crypto), len(tc)))
    print('prediction tier: %d methods typed across %d files (%d names in table)'
          % (n_p, len(pred), len(pc)))
    for k, v in sorted(report.items()):
        print('  %-22s %d  e.g. %s' % (k, len(v), v[:3]))


if __name__ == '__main__':
    main()
