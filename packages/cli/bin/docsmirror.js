#!/usr/bin/env node
'use strict';

// process.exitCode, never process.exit(): exiting hard truncates stdout still
// buffered behind a pipe (`docsmirror manifest --stdout | jq`), while setting
// the code lets the process drain and end on its own.
require('../dist/main.js')
  .main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`docsmirror: ${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
