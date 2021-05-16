const path = require('path');

const appPath = (...names) => path.join(process.cwd(), ...names);

//This will be merged with the config from the flavor
module.exports = {
    entry: {
        main: [appPath('src', 'index.ts')]
    },
    output: {
        filename: 'bundle.[hash].js',
        path: appPath('build'),
        publicPath: '/'
    },
    module: {
      rules: [
        {
          test: /\.worker\.(ts|js)$/,
          use: [
            { loader: 'worker-loader', options: { inline: true } }
          ]
        },
        {
          test: /\.tsx?$/,
          use: [
            { loader: 'ts-loader', options: { transpileOnly: true, silent: true } }
          ]
        }
      ]
    }
};
