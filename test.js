const mb = require('./mb');
const test = require('ava');

const imposter = require('./imposter');

const subject = require('./');

function addSuffixToObjects (suffixes, fields) {
  return suffixes.map(function (suffix) {
    var result = {};
    fields.forEach(function (field) {
      result[field] = field.toUpperCase() + '-' + suffix;
    });
    return result;
  });
}

const setup = async () => {
  const products = addSuffixToObjects(['1', '2'], ['id', 'name', 'description']);

  await imposter({
    port: 3003, // Should match upstream port
    protocol: 'http',
    name: "Upstream Service",
  })
    .withStub()
    .matchingRequest({ equals: { path: '/under-pressure' }})
    .respondingWith({
      statusCode: 200,
      headers: {"Content-Type": "application/json"},
      body: { products }
    })
    .create();
};

test.before(t => {
  mb.start();
});

test.after(t => {
  mb.stop();
});

test('requests upstream dependency', async t => {
  await setup();

  const server = subject;
  
  const result = await server.inject('/testing');

  console.log({result });
  t.pass();
});