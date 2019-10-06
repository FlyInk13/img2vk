
function xhr(method, url, data, responseType) {
  return new Promise(function build(resolve, reject) {
    var xhr = new XMLHttpRequest();

    xhr.open(method, url, true);

    xhr.onreadystatechange = function onResponse() {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status !== 200) {
        return reject(xhr);
      }
      resolve(xhr.response);
    };

    if (responseType) {
      xhr.responseType = responseType;
    }

    xhr.send(data);
  });
}
