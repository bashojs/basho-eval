# Basho Eval

This is the parser and evaluator used in the basho project. For documentation
see https://www.github.com/jeswin/basho.

It exports the PipelineError class and the evaluate() function.

Usage looks like this:

```javascript
it(`Passes an object to a shell command`, async () => {
  const output = await evaluate(["{ name: 'kai' }", "-e", "echo ${x.name}"]);
  (await toResult(output)).should.deepEqual({
    mustPrint: true,
    result: ["kai"]
  });
});
```

See the
[tests](https://github.com/jeswin/basho-eval/blob/master/src/test/basic-tests.js)
for more examples.
