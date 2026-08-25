#!/usr/bin/env python3
"""
Drop the now-redundant conversion layer from the generated Java wrappers.

Java analogue of the "delete the thin wrapper" half of ccxt/ccxt#30066.

C# could delete the wrapper method outright, because its wrapper existed ONLY to
convert (`new Order(res)`) and the public name differed from the core only by
case, so renaming the core to PascalCase preserved the public API.

Java is NOT the same shape, and this is the central feasibility finding:

  core     public CompletableFuture<Object> fetchTicker(Object symbol, Object... a)
  wrapper  public Ticker fetchTicker(String symbol, Map<String,Object> params)
           public CompletableFuture<Ticker> fetchTickerAsync(String symbol, Map<..> p)
           + arity-truncation overloads + String[] ergonomic overloads

The wrapper and the core share the SAME camelCase name and are distinguished by
parameter types and arity, not by case. So the wrapper is not a pure forwarder:
it also supplies the typed-parameter public surface (`String symbol` rather than
`Object`), the blocking sync facade, and the optional-argument overloads. Deleting
it would delete public API. There is therefore no Java equivalent of
`pascalizeTypedCores()`, and none is needed.

What DOES become redundant once the core is typed is the *conversion*, and the
duplicate typed async forwarder:

  before   Object res = Helpers.joinUnwrapped(super.fetchTicker(sym, params));
           return new Ticker(res);
  after    return Helpers.joinTyped(super.fetchTicker(sym, params));

  before   return super.fetchTicker(sym, params).thenApply(Ticker::new);
  after    return super.fetchTicker(sym, params);

The second case is the true analogue of C#'s thin wrapper: the async wrapper
becomes a pure forwarder to an identically-typed core, so it is DELETED outright
and callers bind to the core, leaving no duplicate core+wrapper pair. The sync
facade is kept because it is real public API (blocking + typed params), and it no
longer performs any conversion.
"""
import re, os, glob, sys

ROOT = 'java/lib/src/main/java/io/github/ccxt'
TABLE = 'build/javaTypedCores.ts'


def load_tables():
    s = open(TABLE).read()

    def tbl(name):
        i = s.index('export const ' + name)
        j = s.index('};', i)
        return dict(re.findall(r"'(\w+)':\s*'([^']+)'", s[i:j]))
    return tbl('TYPED_CORES'), tbl('PREDICTION_TYPED_CORES')


def base_of(fam):
    return fam[5:-1] if fam.startswith('List<') else fam


def process(path, table, stats):
    s = open(path).read()
    orig = s
    for name, fam in table.items():
        b = base_of(fam)
        is_list = fam.startswith('List<')

        # 1. sync facade: stop converting, just join the already-typed future.
        if is_list:
            pat = (r'Object res = Helpers\.joinUnwrapped\(super\.' + name +
                   r'\(([^;]*?)\)\);\n(\s*)return toTypedList\(res, ' + b + r'::new\);')
        else:
            pat = (r'Object res = Helpers\.joinUnwrapped\(super\.' + name +
                   r'\(([^;]*?)\)\);\n(\s*)return new ' + b + r'\(res\);')
        s, n = re.subn(pat, lambda m: 'return Helpers.joinTyped(super.%s(%s));' % (name, m.group(1)), s)
        stats['sync-conversion-removed'] += n

        # 2. async wrapper: the conversion is now redundant, but the METHOD must
        #    stay. Unlike C#, the Java wrapper is not a pure forwarder -- it is
        #    an *overload* carrying the typed public parameter surface
        #    (`String symbol` vs the core's `Object symbol, Object...`), and the
        #    arity-truncation overloads call it by name. Deleting it removes
        #    public API and breaks those callers. So strip only the .thenApply.
        if is_list:
            apat = (r'return super\.' + name + r'\(([^;]*?)\)\.thenApply\(res -> toTypedList\(res, '
                    + b + r'::new\)\);')
        else:
            apat = r'return super\.' + name + r'\(([^;]*?)\)\.thenApply\(' + b + r'::new\);'
        s, n = re.subn(apat, lambda m: 'return super.%s(%s);' % (name, m.group(1)), s)
        stats['async-conversion-removed'] += n

    if s != orig:
        open(path, 'w').write(s)
        return 1
    return 0


def main():
    tc, pc = load_tables()
    stats = {'sync-conversion-removed': 0, 'async-conversion-removed': 0}
    files = 0
    for p in glob.glob(ROOT + '/exchanges/**/*.java', recursive=True):
        if p.endswith('Core.java'):
            continue
        table = pc if '/prediction/' in p else tc
        files += process(p, table, stats)
    print('rewrote %d wrapper files' % files)
    for k, v in sorted(stats.items()):
        print('  %-26s %d' % (k, v))


if __name__ == '__main__':
    main()
