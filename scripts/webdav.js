const fs = require('fs');
const path = require('path');
const glob = require('glob');
const request = require('request');
const logSymbols = require('log-symbols');
const inquirer = require('inquirer');
const Listr = require('listr');
const errorHandler = require('../helpers/errorHandler');

module.exports = function deploy(cli) {
  const [input, remote] = cli.input;

  if (!input) {
    errorHandler('You must specify a local directory. Use --help flag for more information.');
    return;
  }

  if (!remote) {
    errorHandler('You must specify a remote directory. Use --help flag for more information.');
    return;
  }

  const localDir = path.join(process.cwd(), input);

  if (!fs.existsSync(localDir)) {
    errorHandler(`Local directory ${localDir} does not exist.`);
    return;
  }

  const valid = ['USERNAME', 'PASSWORD'].every((prop) => {
    if (!process.env[prop]) {
      errorHandler(`Please add "${prop}" variable to your .env config.`);
      return false;
    }

    return true;
  });

  if (!valid) {
    return;
  }

  const files = glob.sync(`${localDir}/**/*`).filter(file => fs.statSync(file).isFile());

  const reqOptions = {
    auth: {
      user: process.env.USERNAME,
      pass: process.env.PASSWORD,
    },
  };

  const uploadingTasks = files.map((file) => {
    const title = file.replace(`${localDir}/`, '');

    return {
      title,
      task: () => new Promise((resolve, reject) => {
        fs.createReadStream(path.resolve(file))
          .pipe(request.put(`${remote}/${title}`, reqOptions))
          .on('error', (err) => {
            reject(new Error(err));
          })
          .on('response', (res) => {
            if (res.statusCode === 403) {
              reject(new Error(`Authentication error: ${res.statusCode}`));
            }
            if (res.statusCode > 400) {
              reject(new Error(`Connection error: ${res.statusCode}`));
            }
            resolve();
          });
      }),
    };
  });

  const tasks = new Listr([
    {
      title: 'Uploading files',
      task: () => new Listr(uploadingTasks, { concurrent: true }),
    },
  ]);

  if (cli.flags.skipVerify) {
    tasks.run().catch(errorHandler);
    return;
  }

  inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'confirmation',
        message: 'Are you sure you want to deploy?',
      },
    ])
    .then((answers) => {
      if (!answers.confirmation) return false;
      return tasks.run().catch(errorHandler);
    })
    .then((success) => {
      if (!success) return;
      console.log(` ${logSymbols.success} Done`);
    });
};
