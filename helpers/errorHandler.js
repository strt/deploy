const chalk = require('chalk');

module.exports = function errorHandler(message) {
  console.error(`${chalk.red`error`} ${message}`);
};
