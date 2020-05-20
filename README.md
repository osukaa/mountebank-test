# mountebank-test
Testing mountebank as local dependency and in process

Trying to run [`mountebank`](http://www.mbtest.org/) as an in-process mock library for node.js tests.

## Setup

1. `server.js` - starts a server
2. `index.js` - setups a hapi server
3. `test.js` - ava tests against mountebank
4. `imposter.js` - fluent api for creating an imposter in the mountebank server
5. `imposters.ejs` - mountebank config file loaded through a flag in the CLI

## running `npm test`

Running `npm test` will start a mountebank instance as default, building on the example from the [mountebank book](https://www.manning.com/books/testing-microservices-with-mountebank).

```
https://github.com/bbyars/mountebank-in-action/blob/master/ch09/webFacadeService/serviceTest/test.js
```

## running `npm run mb`

This will start a mountebank instance as per standard procedure, will use `imposters.ejs` through the flag `--configfile`.

> This will run mountebank in a separate process.

You can then open another terminal and run `npm start` and try doing a curl against `/testing` endpoint

```
$ curl <host_port>/testing
```

and will get a response back

```json
{
  "data": {
    "products": [
      {
        "id": "id-1",
        "name": "name-1",
        "description": "description-1"
      }
    ]
  },
  "headers": {
    "content-type": "application/json",
    "connection": "close",
    "date": "Wed, 20 May 2020 05:49:59 GMT",
    "transfer-encoding": "chunked"
  }
}
```