
function ApiUpload(data) {
  return API(
    data.get.method,
    data.get.data
  ).then(function(res) {
    var formData = new FormData();

    formData.set(
      data.file.field_name,
      data.file.blob,
      data.file.name
    );

    return xhr("POST", res.response.upload_url, formData);
  }).then(function(res) {
    var saveData = Object.assign(
      JSON.parse(res),
      data.get.data,
      data.save.data
    );

    return API(
      data.save.method,
      saveData
    );
  });
}
