require('make-promises-safe');
const server = require('./');

async function main() {
  await server.start();
  console.log(`Server listening in: ${server.info.uri}`);
}

main();