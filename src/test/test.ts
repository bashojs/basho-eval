import "./preload";
import "mocha";
import "should";
import child_process from "child_process";
import path from "path";
import promisify from "nodefunc-promisify";
import { evaluate, BashoEvaluationResult, PipelineValue } from "../basho-eval";

function execute(cmd: string): any {
  return new Promise((resolve, reject) => {
    const child = child_process.exec(cmd, (err: any, result: any) => {
      resolve(result);
    });
    child.stdin.end();
  });
}

let logMessages: Array<string>;
function resetLogMessages() {
  logMessages = [];
}

function onLog(msg: string): void {
  logMessages.push(msg);
}

let writeMessages: Array<string>;
function resetWriteMessages(): void {
  writeMessages = [];
}

function onWrite(msg: string): void {
  writeMessages.push(msg);
}

async function toResult(
  output: BashoEvaluationResult
): Promise<{ mustPrint: boolean; result: Array<any> }> {
  const result = (await output.result.toArray()).map(
    x => (x instanceof PipelineValue ? x.value : x)
  );
  return { mustPrint: output.mustPrint, result };
}

describe("basho", () => {
  it(`Evals a number`, async () => {
    const output = await evaluate(["1"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1]
    });
  });

  it(`Evals a bool`, async () => {
    const output = await evaluate(["true"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [true]
    });
  });

  it(`Evals a string`, async () => {
    const output = await evaluate(['"hello, world"']);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["hello, world"]
    });
  });

  it(`Evals a template string`, async () => {
    const output = await evaluate(["666", "-j", "`That number is ${x}`"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["That number is 666"]
    });
  });

  it(`Quotes a string`, async () => {
    const output = await evaluate(["-q", "hello, world"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["hello, world"]
    });
  });

  it(`Quotes an array of strings`, async () => {
    const output = await evaluate(["-q", "hello,", "world"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["hello, world"]
    });
  });

  it(`Evals a promise`, async () => {
    const output = await evaluate(["Promise.resolve(1)"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1]
    });
  });

  it(`Evals an array`, async () => {
    const output = await evaluate(["[1,2,3,4]"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1, 2, 3, 4]
    });
  });

  it(`Evals an object`, async () => {
    const output = await evaluate(["{ name: 'kai' }"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [{ name: "kai" }]
    });
  });

  it(`Evals an array of objects`, async () => {
    const output = await evaluate(["[{ name: 'kai' }, { name: 'niki' }]"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [{ name: "kai" }, { name: "niki" }]
    });
  });

  it(`Unset the mustPrint flag`, async () => {
    const output = await evaluate(["-p", "[1,2,3,4]"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: false,
      result: [1, 2, 3, 4]
    });
  });

  it(`Pipes a result into the next expression`, async () => {
    const output = await evaluate(["[1,2,3,4]", "-j", "x**2"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1, 4, 9, 16]
    });
  });

  it(`Evals and logs an expression`, async () => {
    resetLogMessages();
    const output = await evaluate(
      ["[1,2,3,4]", "-l", "x+10", "-j", "x**2"],
      true,
      onLog
    );
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1, 4, 9, 16]
    });
    logMessages.should.deepEqual([11, 12, 13, 14]);
  });

  it(`Evals and writes an expression`, async () => {
    resetWriteMessages();
    const output = await evaluate(
      ["[1,2,3,4]", "-w", "x+10", "-j", "x**2"],
      true,
      onLog,
      onWrite
    );
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [1, 4, 9, 16]
    });
    writeMessages.should.deepEqual([11, 12, 13, 14]);
  });

  it(`Pipes an array of arrays`, async () => {
    const output = await evaluate(["[[1,2,3], [2,3,4]]", "-j", "x[0]+10"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [11, 12]
    });
  });

  it(`Receives an array at once`, async () => {
    const output = await evaluate(["[1,2,3,4]", "-a", "x.length"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [4]
    });
  });

  it(`Handles expressions with quotes`, async () => {
    const output = await evaluate([`["a,b", "c,d"]`, "-j", `x.split(",")`]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [["a", "b"], ["c", "d"]]
    });
  });

  it(`Filters an array`, async () => {
    const output = await evaluate(["[1,2,3,4]", "-f", "x > 2"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [3, 4]
    });
  });

  it(`Reduces an array`, async () => {
    const output = await evaluate(["[1,2,3,4]", "-r", "acc + x", "0"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [10]
    });
  });

  it(`Flatmaps`, async () => {
    const output = await evaluate(["[1,2,3]", "-m", "[x+10, x+20]"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [11, 21, 12, 22, 13, 23]
    });
  });

  it(`Terminates based on a predicate`, async () => {
    const output = await evaluate(["[1,2,3,4]", "-t", "x > 2", "-j", "x*10"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [10, 20]
    });
  });

  it(`Terminates based on a predicate with Promises in the pipeline`, async () => {
    const output = await evaluate([
      "[Promise.resolve(1),2,3,4]",
      "-t",
      "x > 2",
      "-j",
      "x*10"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [10, 20]
    });
  });

  it(`Calls a function in an external file`, async () => {
    const output = await evaluate([
      "10",
      "-i",
      "./dist/test/square.js",
      "sqr",
      "-j",
      "sqr(x)"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [100]
    });
  });

  it(`Calls a node module`, async () => {
    const output = await evaluate([
      `["/a", "b", "c"]`,
      "-a",
      "-i",
      "path",
      "path",
      "-j",
      "path.join.apply(path, x)"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["/a/b/c"]
    });
  });

  it(`Calls a shell command`, async () => {
    const output = await evaluate(["10", "-e", "echo ${x}"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["10"]
    });
  });

  it(`Escapes shell templates`, async () => {
    const output = await evaluate(['"la la.txt"', "-e", "echo ${x}"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["la la.txt"]
    });
  });

  it(`Passes an object to a shell command`, async () => {
    const output = await evaluate(["{ name: 'kai' }", "-e", "echo ${x.name}"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["kai"]
    });
  });

  it(`Calls a shell command which outputs multiple lines`, async () => {
    const output = await evaluate(["10", "-e", "echo ${x};echo ${x};"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [["10", "10"]]
    });
  });

  it(`Calls a shell command which outputs newlines`, async () => {
    const output = await evaluate(["10", "-e", 'echo "${x}\n${x}"']);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [["10", "10"]]
    });
  });

  it(`Passes an array to a shell command`, async () => {
    const output = await evaluate(["[10, 11, 12]", "-e", "echo N${x}"]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["N10", "N11", "N12"]
    });
  });

  it(`Passes the output of the shell command output to the next expression`, async () => {
    const output = await evaluate([
      "-e",
      "echo 10",
      "-j",
      "`The answer is ${x}`"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["The answer is 10"]
    });
  });

  it(`Passes multiline output of the shell command output to the next expression`, async () => {
    const output = await evaluate([
      "-e",
      'echo "10\n10"',
      "-j",
      "`The answer is ${x}`"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: ["The answer is 10", "The answer is 10"]
    });
  });

  it(`Creates a named result`, async () => {
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

  it(`Combines named results`, async () => {
    const output = await evaluate([
      "[10,20,30,40]",
      "-j",
      "x+1",
      "-n",
      "add1",
      "-j",
      "x+2",
      "-n",
      "add2",
      "-c",
      "add1,add2"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [[11, 13], [21, 23], [31, 33], [41, 43]]
    });
  });

  it(`Captures an error`, async () => {
    const output = await evaluate([
      "['a,b', 10, 'c,d']",
      "-j",
      "x.split(',')",
      "--error",
      "'skipped'"
    ]);
    (await toResult(output)).should.deepEqual({
      mustPrint: true,
      result: [["a", "b"], "skipped", ["c", "d"]]
    });
  });
});