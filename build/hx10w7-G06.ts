// hx10w7 G06 (temporary probe): why one `AddElementToObject` write stayed a helper call.
// Prints one line per rejected site to stdout so the farm job log carries the census.
let sweep = 1;

export function g06SetSweep (n: number): void {
    sweep = n;
}

export function g06Trace (message: string): void {
    process.stdout.write ('G06TRACE ' + sweep + '|' + message + '\n');
}
