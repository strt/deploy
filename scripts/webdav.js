const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const globby = require('globby');
const got = require('got');
const ms = require('ms');
const filesize = require('filesize');
const ProgressBar = require('progress');
const inquirer = require('inquirer');

function isValid({ input, remote, localDir }) {
  function logError(message) {
    console.log(`${chalk.red('Error!')} ${message}`);
  }

  if (!input) {
    logError(
      'You must specify a local directory. Use --help flag for more information.'
    );
    return false;
  }

  if (!remote) {
    logError(
      'You must specify a remote directory. Use --help flag for more information.'
    );
    return false;
  }

  if (!fs.existsSync(localDir)) {
    logError(`Local directory ${localDir} does not exist.`);
    return false;
  }

  const hasEnvVars = ['USERNAME', 'PASSWORD'].every((prop) => {
    if (!process.env[prop]) {
      logError(`Please add "${prop}" variable to your .env config.`);
      return false;
    }

    return true;
  });

  if (!hasEnvVars) {
    return false;
  }

  return true;
}

module.exports = async function webdav(cli) {
  const [input, remote] = cli.input;
  const cwd = process.cwd();
  const localDir = path.resolve(cwd, input);

  if (!isValid({ input, remote, localDir })) {
    return;
  }

  console.log(`Deploying ${chalk.bold(input)} to ${chalk.bold(remote)}`);

  async function deploy() {
    const paths = await globby(localDir);
    const files = paths.filter(file => fs.statSync(file).isFile());
    const totalFileSizeBytes = files.reduce(
      (acc, file) => acc + fs.statSync(file).size,
      0
    );
    const totalFileSize = filesize(totalFileSizeBytes);
    const reqOptions = {
      auth: `${process.env.USERNAME}:${process.env.PASSWORD}`,
    };
    let shouldProgressTick = true;

    const bar = new ProgressBar(
      '> Uploading [:bar] :displayName :current/:total :percent',
      {
        total: files.length,
        complete: '#',
        width: files.length * 2,
        clear: true,
      }
    );

    const uploads = files.map((file) => {
      const displayName = path.relative(cwd, file);
      const fileName = path.relative(input, file);
      const remoteFileName = `${remote}/${fileName}`;

      return new Promise((resolve, reject) => {
        fs.createReadStream(file).pipe(
          got.stream
            .put(remoteFileName, reqOptions)
            .on('response', () => {
              if (shouldProgressTick) {
                bar.tick({ displayName });
              }
              resolve();
            })
            .on('error', (err, body) => {
              reject(err, body);
            })
        );
      });
    });

    Promise.all(uploads)
      .then(() => {
        const elapsedTime = ms(new Date() - bar.start);

        console.log(
          `> Synced ${files.length} files (${totalFileSize}) [${elapsedTime}]`
        );
        console.log(`> ${chalk.green('Success!')} Deployment completed`);
      })
      .catch((e) => {
        shouldProgressTick = false;
        bar.terminate();
        console.log(`> ${chalk.red('Error!')} \n${e}`);
      });
  }

  if (cli.flags.skipVerify) {
    deploy();
    return;
  }

  inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'confirmation',
        message: 'Are you sure you want to continue?',
      },
    ])
    .then((answers) => {
      if (answers.confirmation) {
        deploy();
      }
    });
};
