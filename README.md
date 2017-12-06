# Basho Eval

This is the parser and evaluator used in the basho project. For documentation
see https://www.github.com/jeswin/basho.

It exports the PipelineError class and the evaluate() function.

Usage looks like this:

```javascript
it(`Creates a named result but does not seek`, async () => {
  const output = await evaluate([
    "[10,20,30,40]",
    "-j",
    "x+1",
    "-j",
    "x+2",
    "-n",
    "add2",
    "-j",
    "x+10"
  ]);
  (await toResult(output)).should.deepEqual({
    mustPrint: true,
    result: [23, 33, 43, 53]
  });
});
```

See the
[tests](https://github.com/jeswin/basho-eval/blob/master/src/test/basic-tests.js)
for more examples.
