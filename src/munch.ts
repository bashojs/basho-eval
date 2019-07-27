export type MunchResult = {
  cursor: number;
  expression: string;
  otherExpressions?: string[];
};

// prettier-ignore
/* Options: */
const options = [
  "-a",         //            treat array as a whole
  "-c",         // n1,n2,n3   combine a named stages
  "-d",         //            define an reusable expression
  "-e",         //            shell command
  "--endsub",    //           end of --sub subroutine
  "-f",         //            filter
  "-g",         // n, exp     recurse 
  "--import",   //            import a file or module
  "-j",         //            JS expression
  "-l",         //            evaluate and log a value to console
  "-m",         //            flatMap
  "-n",         //            Named result
  "-q",         //            quote expression as string
  "-p",         //            print
  "-r",         //            reduce
  "-s",         //            seek/recall a named result
  "--sub",       //           define a subroutine
  "-t",         //            terminate evaluation
  "-w",         //            Same as log, but without the newline
  "--error",    //            Error handling
];

/* Consume parameters until we reach an option flag (-p, -e etc) */
export function munch(
  parts: string[],
  numOtherExpressions: number = 0
): MunchResult {
  function doMunch(
    parts: string[],
    args: string[],
    cursor: number
  ): { cursor: number; args: string[] } {
    return !parts.length || options.includes(parts[0])
      ? { cursor, args }
      : doMunch(parts.slice(1), args.concat(parts[0]), cursor + 1);
  }

  const isQuoted = parts[0] === "-q";

  const { cursor, args } = doMunch(
    parts.slice(isQuoted ? 1 : 0),
    [],
    isQuoted ? 1 : 0
  );
  const result =
    numOtherExpressions > 0
      ? {
          cursor,
          expression: `${args.slice(0, -numOtherExpressions).join(" ")}`,
          otherExpressions: args.slice(-numOtherExpressions)
        }
      : { cursor, expression: `${args.join(" ")}` };

  return {
    ...result,
    expression: isQuoted ? `"${result.expression}"` : result.expression
  };
}
