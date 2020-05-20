const Wreck = require('@hapi/wreck');

module.exports = function (options) {
  var config = options || {};
  config.stubs = [];

  function create () {
    return Wreck.post(`http://localhost:2525/imposters`, {
      json: true,
      payload: config,
    });
  }

  function destroy () {
    return Wreck.delete(`http://localhost:2525/imposters/${config.port}`);
  }

  function destroyAll () {
    return Wreck.delete(`http://localhost:2525/imposters`);
  }

  function withStub () {
    var stub = { responses: [], predicates: [] },
      builders = {
        matchingRequest: function (predicate) {
          stub.predicates.push(predicate);
          return builders;
        },
        respondingWith: function (response) {
          stub.responses.push({ is: response });
          return builders;
        },
        create: create,
        withStub: withStub
      };

    config.stubs.push(stub);
    return builders;
  }

  return {
    withStub: withStub,
    create: create,
    destroy: destroy,
    destroyAll: destroyAll
  };
};