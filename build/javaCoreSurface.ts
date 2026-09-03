#!/usr/bin/env tsx
/**
 * Java Core Surface Generator for CCXT
 *
 * Emits the typed public surface (typed parameter lists, blocking sync facade,
 * arity-truncation overloads, String[] ergonomics) DIRECTLY INTO each generated
 * Core class, so the separate `<X>.java extends <X>Core` wrapper layer can go.
 *
 * Bodies delegate to the transpiled varargs core method with every argument cast
 * to `(Object)`: `this.name((Object) a, (Object) b, ...)`. Internal transpiled
 * call sites pass `Object` locals, which are NOT assignable to String/Long/Map,
 * so they keep binding to the varargs implementation.
 *
 * WORK IN PROGRESS — stub committed first, see git history.
 *
 * Usage: tsx build/javaCoreSurface.ts [--rest|--ws|--prediction] [exchangeId ...]
 */

export {};
