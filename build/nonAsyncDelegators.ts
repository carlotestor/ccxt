// PR #29122 / pro-sync-delegators: pure WS delegator methods in ts/src/pro/*.ts are
// declared WITHOUT `async` (returning the inner Promise directly) to avoid the cost of
// an extra async wrapper + await hop per call in JS/Python(async)/PHP(async).
//
// The AST transpilers (C#/Java/Go) key the emitted return type on the `async` modifier:
// `printFunctionType` falls back to `Task<object>` / `CompletableFuture<Object>` /
// `<- chan any` for async methods, but to the bare default type (`object` / `Object` /
// `any`) for non-async ones — which breaks delegators that return a Promise without
// being async (C#: CS0029/CS4032/CS1061; Java/Go: override/interface signature
// mismatches).
//
// All three target languages can natively express non-async delegation — in C# it is
// the idiomatic "async elision" (`Task<T> M() { return this.X(); }`), in Java returning
// the callee's `CompletableFuture` is the natural form, and in Go the channel is just
// handed back — so instead of rewriting the source into the async form before
// transpiling (the old reAsyncDelegators.ts shim), we teach the transpiler instances to
// emit the async-style *return type* for non-async Promise-returning methods, while the
// body printers already emit the plain (non-wrapped) body for non-async methods.
//
// The overrides are installed on the ast-transpiler sub-transpiler instances, the same
// way the build wrappers already override `transformLeadingComment`.

// A method that returns a Promise must carry an explicit `Promise<...>` annotation for
// this to kick in (the pro delegators all do). `Promise` / `Promise<void>` methods are
// left to the original printer, which already maps them correctly via the type checker.
function hasNonVoidPromiseAnnotation (node: any): boolean {
    if (!node || !node.type || typeof node.type.getText !== 'function') {
        return false;
    }
    const text = String (node.type.getText ());
    return /^Promise\s*</.test (text) && !/^Promise\s*<\s*void\s*>/.test (text);
}

// Wraps `printFunctionType` on a single language transpiler instance so that a
// non-async method annotated `Promise<T>` gets the same return type the async form
// would get (`asyncStyleType`), keeping the emitted signature override/interface
// compatible with the async methods it delegates to.
function installOnInstance (langTranspiler: any, asyncStyleType: (t: any) => string): void {
    if (langTranspiler.__nonAsyncDelegatorsInstalled) {
        return;
    }
    langTranspiler.__nonAsyncDelegatorsInstalled = true;
    const original = langTranspiler.printFunctionType.bind (langTranspiler);
    langTranspiler.printFunctionType = function printFunctionTypeWithNonAsyncDelegators (node: any) {
        if (hasNonVoidPromiseAnnotation (node) && !langTranspiler.isAsyncFunction (node)) {
            return asyncStyleType (langTranspiler);
        }
        return original (node);
    };
}

// Installs support for non-async Promise-returning delegators on every AST language
// transpiler hanging off an ast-transpiler `Transpiler` facade. Call it right after
// `new Transpiler (config)` in the build wrappers.
function installNonAsyncDelegatorSupport (transpiler: any): void {
    if (transpiler.csharpTranspiler) {
        installOnInstance (transpiler.csharpTranspiler, (t) => `${t.PROMISE_TYPE_KEYWORD}<${t.DEFAULT_RETURN_TYPE}>`);
    }
    if (transpiler.javaTranspiler) {
        installOnInstance (transpiler.javaTranspiler, (t) => `${t.PROMISE_TYPE_KEYWORD}<${t.DEFAULT_RETURN_TYPE}>`);
    }
    if (transpiler.goTranspiler) {
        installOnInstance (transpiler.goTranspiler, (t) => `<- chan ${t.DEFAULT_RETURN_TYPE}`);
    }
}

export {
    installNonAsyncDelegatorSupport,
    hasNonVoidPromiseAnnotation,
};
