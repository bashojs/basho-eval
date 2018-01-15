const path = require("path");

module.exports = function(filePath, alias, isRelative) {
  if (isRelative) {
    global[alias] = require(filePath);
  } else {
    try {
      global[alias] = require(path.join(process.cwd(), "node_modules", filePath));
    } 
    catch (ex) {
      global[alias] = require(filePath);      
    }
  }
};
