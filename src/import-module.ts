import * as util from "util";
import * as path from "path";
import * as fs from "fs";

const stat = util.promisify(fs.stat);

async function exists(somePath: string) {
  try {
    const _ = await stat(somePath);
    return true;
  } catch {
    return false;
  }
}

export default async function(
  filePath: string,
  alias: string,
  isRelative: boolean
) {
  if (isRelative) {
    (global as any)[alias] = require(filePath);
  } else {
    if (await exists(path.join(process.cwd(), "node_modules", filePath))) {
      (global as any)[alias] = require(path.join(
        process.cwd(),
        "node_modules",
        filePath
      ));
    } else {
      (global as any)[alias] = require(filePath);
    }
  }
}
