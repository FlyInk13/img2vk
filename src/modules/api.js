
// https://ifx.su/~va
(function api(self) {
  var req = xhr;

  function callApi(method, data) {
    var isExecute = method === 'execute';
    var endpoint = 'https://vk.com/dev';
    data = data || {};

    return req('GET', endpoint + '/execute', {}).then(function parseHash(res) {
      var hash = res.match(/Dev\.methodRun\('([a-z0-9:]+)/im);
      if (!hash) {
        throw new Error({
          error: 'invalid hash',
          error_description: res,
        });
      }
      return hash[1];
    }).then(function sendRequest(hash) {
      var _data = new FormData();
      _data.append('act', 'a_run_method');
      _data.append('al', 1);
      _data.append('hash', hash);
      _data.append('method', 'execute');
      _data.append('param_code', isExecute ? data.code : 'return API.' + method + '(' + JSON.stringify(data) + ');');
      _data.append('param_v', '5.103');

      if (isExecute) {
        Object.keys(data).forEach(function addData(name) {
          _data.append('param_' + name, data[name]);
        });
      }

      return req('POST', endpoint, _data);
    }).then(function parseResponse(res) {
      try {
        res = JSON.parse(res.replace(/^.+?\{/, '{'));
        if (res && res.payload && res.payload[1] && res.payload[1][0]) {
          res = JSON.parse(res.payload[1][0]);
        }
      } catch (e) {
      }

      if (!res.response) {
        throw res;
      }

      return res;
    });
  }

  // ****** timeApi ****** //
  var lastCallTime = Date.now();

  function timeApi(method, data) {
    var time = Date.now();

    lastCallTime = Math.max(time, lastCallTime) + 334;
    var timeout = Math.max(lastCallTime - time, 1);
    return new Promise(function build(resolve) {
      setTimeout(resolve, timeout);
    }).then(function callMethod() {
      return callApi(method, data);
    }).catch(function parseError(res) {
      if (res.error && res.error.error_code === 6) {
        return timeApi(method, data);
      }
      throw res;
    });
  }

  if (typeof self.API !== 'function') {
    self.API = timeApi;
  }
})(window);
