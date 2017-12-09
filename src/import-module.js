module.exports = function(filePath, alias) {
  global[alias] = require(filePath);
};
