import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeJavaLongLimitLocals } from '../java-local-types.js';

const member = (body: string) => [
    '    public Object f(String symbol, Long since, Long limit)',
    '    {',
    ...body.split ('\n'),
    '    }',
].join ('\n');

test ('Object copy of an own Long parameter prints Long', () => {
    const src = member ('        Long now = this.milliseconds();\n        Object startTime = since;\n        startTime = (now - 1000L);\n        request.put("startTime", startTime);\n        request.put("t", this.iso8601(startTime));');
    const out = nativeJavaLongLimitLocals (src);
    assert.match (out, /Long startTime = since;/);
});

test ('copy stays Object when another write is not a Long', () => {
    const src = member ('        Object startTime = since;\n        startTime = this.safeValue(x, "y");\n        request.put("startTime", startTime);');
    assert.equal (nativeJavaLongLimitLocals (src), src);
});
