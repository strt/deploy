const fs = require('fs');
const path = require('path');
const glob = require('glob');
const request = require('request');
const logSymbols = require('log-symbols');
const inquirer = require('inquirer');
const Listr = require('listr');
const errorHandler = require('./errorHandler');

module.exports = function deploy(cli) {
  if (!cli.input[0]) {
    errorHandler('You must supply a local directory. Use --help flag for more information.');
    return;
  }

  const dir = path.join(process.cwd(), cli.input[0]);

  if (!fs.existsSync(dir)) {
    errorHandler(`Local directory ${dir} does not exist.`);
    return;
  }

  const valid = ['USERNAME', 'PASSWORD', 'URL'].every((prop) => {
    if (!process.env[prop]) {
      errorHandler(`Please add "${prop}" variable to your .env config`);
      return false;
    }

    return true;
  });

  if (!valid) {
    return;
  }

  const files = glob.sync(`${dir}/**/*`).filter(file => fs.statSync(file).isFile());

  const reqOptions = {
    auth: {
      user: process.env.USERNAME,
      pass: process.env.PASSWORD,
    },
  };

  const uploadingTasks = files.map((file) => {
    const title = file.replace(`${dir}/`, '');
    return {
      title,
      task: () =>
        new Promise((resolve, reject) => {
          fs
            .createReadStream(path.resolve(file))
            .pipe(request.put(`${process.env.URL}/${title}`, reqOptions))
            .on('response', (res) => {
              if (res.statusCode === 403) reject(new Error('Authentication error'));
              if (res.statusCode > 400) reject(new Error('Connection error'));
              resolve();
            })
            .on('error', (err) => {
              reject(new Error(err));
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
