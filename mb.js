const Q = require('q');
const fs = require('fs');
const ejs = require('ejs');
const http = require('http');
const path = require('path');
const mountebank = require('mountebank');

function processExists (pid) {
  try {
      // "As a special case, signal 0 can be used to test existence of process"
      // https://nodejs.org/api/process.html#process_process_kill_pid_signal
      process.kill(pid, 0);
      return true;
  }
  catch (e) {
      return false;
  }
}

// usage: stringify(includeFile)
// note: Trying to make this backwards compatible. However, the intent is to change
// the signature to just require `includeFile`.
function stringify (filename, includeFile) {
  const resolvedPath = makePathInABackwardsCompatibleWay(filename, includeFile);
  const contents = fs.readFileSync(resolvedPath, 'utf8'),
      rendered = ejs.render(contents, {
          filename: CONFIG_FILE_PATH,
          stringify: stringify,
          inject: stringify // backwards compatibility
      }),
      jsonString = JSON.stringify(rendered.trim());

  // get rid of the surrounding quotes because it makes the templates more natural to quote them there
  return jsonString.substring(1, jsonString.length - 1);
}

function makePathInABackwardsCompatibleWay (filename, includeFile) {
  var resolvedPath = null;
  if (!includeFile) {
      includeFile = filename;
  }
  resolvedPath = path.join(path.dirname(CONFIG_FILE_PATH), includeFile);
  return resolvedPath;
}

function getContentsOrExit (file, server) {
  try {
      return fs.readFileSync(file, 'utf8');
  }
  catch (e) {
      const message = e.code !== 'ENOENT' ? e : `No such file: ${file}`;
      server.close(() => { });
      console.error(message);
      process.exit(1);
      return '';
  }
}

function getConfig (options) {
  const deferred = Q.defer(),
      requestOptions = {
          method: 'GET',
          path: '/imposters?replayable=true',
          port: options.port,
          hostname: options.host || 'localhost',
          headers: {
              'Content-Type': 'application/json',
              Connection: 'close'
          }
      };

  if (options.removeProxies) {
      requestOptions.path += '&removeProxies=true';
  }

  const request = http.request(requestOptions, response => {
      response.body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { response.body += chunk; });
      response.on('end', () => {
          deferred.resolve(response);
      });
  });

  request.on('error', deferred.reject);

  request.end();
  return deferred.promise;
}

function shouldLoadConfigFile (options) {
  return typeof options.configfile !== 'undefined';
}

var CONFIG_FILE_PATH = null;
function loadConfig (options, server) {
  if (!shouldLoadConfigFile(options)) {
      return Q(true);
  }
  CONFIG_FILE_PATH = options.configfile;
  const configContents = getContentsOrExit(options.configfile, server),
      parsedContents = options.noParse ? configContents : ejs.render(configContents, {
          filename: options.configfile,
          stringify: stringify,
          inject: stringify // backwards compatibility
      }),
      json = JSON.parse(parsedContents),
      // [json] Assume they left off the outer imposters array
      imposters = json.imposters || [json];

  return putConfig(options, JSON.stringify({ imposters: imposters }));
}

function putConfig (options, body) {
  const deferred = Q.defer(),
      requestOptions = {
          method: 'PUT',
          path: '/imposters',
          port: options.port,
          hostname: options.host || 'localhost',
          headers: {
              'Content-Type': 'application/json',
              Connection: 'close'
          }
      },

      request = http.request(requestOptions, response => {
          response.body = '';
          response.setEncoding('utf8');
          response.on('data', chunk => { response.body += chunk; });
          response.on('end', () => {
              response.body = JSON.parse(response.body);
              deferred.resolve(response);
          });
      });

  request.on('error', deferred.reject);

  request.write(body);
  request.end();
  return deferred.promise;
}

function serverAt (options) {
  function start () {
      mountebank.create(options).then(server => {
          function shutdown () {
              server.close(() => {
                  try {
                      if (fs.existsSync(options.pidfile)) {
                          fs.unlinkSync(options.pidfile);
                      }
                  }
                  finally {
                      process.exit();
                  }
              });
          }

          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);

          return loadConfig(options, server);
      }).then(() => {
          // Useful for build plugins that need to wait for mb to be fully initialized
          // They can wait for the pidfile to be written
          fs.writeFileSync(options.pidfile, process.pid.toString());
      }).done();
  }

  function stop () {
      if (!fs.existsSync(options.pidfile)) {
          return Q(true);
      }

      const pid = fs.readFileSync(options.pidfile);
      if (!processExists(pid)) {
          fs.unlinkSync(options.pidfile);
          return Q(true);
      }

      const deferred = Q.defer(),
          startTime = new Date(),
          timeout = 1000,
          waitForClose = () => {
              const elapsedTime = new Date() - startTime;
              if (!fs.existsSync(options.pidfile)) {
                  deferred.resolve();
              }
              else if (elapsedTime > timeout) {
                  try {
                      // For Windows, which doesn't register signal handlers
                      fs.unlinkSync(options.pidfile);
                  }
                  catch (err) { /* ignore */ }
                  finally {
                      deferred.resolve();
                  }
              }
              else {
                  setTimeout(waitForClose, 100);
              }
          };

      process.kill(pid);
      waitForClose();
      return deferred.promise;
  }

  function restart () {
      return stop().then(start).done();
  }

  function logConnectionErrorAndExit (err) {
      const host = options.host || 'localhost';
      if (err.code === 'ECONNREFUSED') {
          console.error(`No mb process running on http://${host}:${options.port}`);
      }
      else {
          console.error(err);
      }
      process.exit(1);
  }

  function save () {
      getConfig(options).then(response => {
          fs.writeFileSync(options.savefile, response.body);
      }).catch(logConnectionErrorAndExit).done();
  }

  function replay () {
      options.removeProxies = true;

      getConfig(options).then(response => {
          if (response.statusCode !== 200) {
              console.error('Received status code ' + response.statusCode);
              console.error(response.body);
              process.exit(1);
          }
          else {
              putConfig(options, response.body);
          }
      }).catch(logConnectionErrorAndExit).done();
  }

  return {
      start: start,
      stop: () => { stop().done(() => { process.exit(); }); },
      restart: restart,
      save: save,
      replay: replay
  };
}

module.exports = serverAt({
  port: 2525,
  host: undefined,
  configfile: undefined,
  datadir: undefined,
  noParse: false,
  pidfile: 'mb.pid',
  nologfile: false,
  logfile: 'mb.log',
  loglevel: 'info',
  allowInjection: false,
  localOnly: false,
  ipWhitelist: [ '*' ],
  mock: false,
  debug: false,
  heroku: false,
  protofile: 'protocols.json'
});