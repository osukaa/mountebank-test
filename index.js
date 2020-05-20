const Hapi = require('@hapi/hapi');
const Wreck = require('@hapi/wreck');

const upstream = Wreck.defaults({
  baseUrl: 'http://localhost:3003',
});

const server = Hapi.server();

server.route({
  method: 'GET',
  path: '/testing',
  async handler(request, h) {
    const { res, payload } = await upstream.get('/under-pressure', { json: true });

    return { data: payload, headers: res.headers };
  }
})

module.exports = server;