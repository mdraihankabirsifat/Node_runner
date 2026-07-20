'use strict';

module.exports = {
  appId: 'com.nodeRunner.game',
  productName: 'Node Runner',
  executableName: 'Node Runner',
  electronVersion: '43.1.1',
  asar: true,
  npmRebuild: false,
  directories: {
    output: '../dist',
  },
  files: [
    'main.cjs',
    'offline.html',
    'offline.css',
    'offline.js',
    'package.json',
    '!validate.cjs',
    '!node_modules/**/*',
  ],
  win: {
    target: [
      {
        target: 'portable',
        arch: ['x64'],
      },
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
    artifactName: 'Node-Runner-${version}-Windows-${arch}.${ext}',
  },
};
