/* global chrome */

function setBadge(text) {
  chrome.browserAction.setBadgeText({
    text: text
  });
}

function getFile(url) {
  return xhr('GET', url, '', 'blob');
}

function badgeProgress(promise) {
  return Promise.resolve().then(function() {
    return setBadge('Загрузка...');
  }).then(function() {
    return promise;
  }).then(function(res) {
    console.log(res);
    return setBadge('OK');
  }).catch(function(e) {
    var error_description = e.error ? e.error.error_description : JSON.stringify(e.error);
    console.error(error_description, e);
    return setBadge('Ошибка: ' + error_description);
  })
}

var APP = {
  save: function() {
    chrome.storage.local.set(APP.data);
  },
  data: {
    collections: {},
    history: [],
    text: false,
    collect: false
  },
  toHistory: function(name) {
    var isExist = APP.data.history.find(function(item) {
      return item[0] === name;
    });

    if (isExist) return;

    APP.data.history.unshift(Array.from(arguments));
    if (APP.data.history.length > 10) {
      APP.data.history.pop();
    }

    update_context();
    APP.save();
  },
  onCheck: function(name, event) {
    APP.data[name] = event.checked;
    APP.save();
  },
  collectionPush: function(name, photo) {
    var collections = APP.data.collections;
    if (!collections[name]) {
      collections[name] = [];
    }
    var photo_id = APP.toId(photo);

    return collections[name].push(photo_id);
  },
  collectionClear: function(name) {
    delete APP.data.collections[name];
  },
  collectionGet: function(name) {
    return APP.data.collections[name].join(',');
  },
  toId: function(photo) {
    return 'photo' + photo.owner_id + "_" + photo.id;
  },
  getMessage: function(message) {
    if (!APP.data.text) {
      return '';
    }
    return prompt(message || 'Введите текст');
  },
  confirmSend(collectionName, photo) {
    APP.collectionPush(collectionName, photo);
    return APP.data.collect && !confirm("В буфере " + index + " фото.\nОтправить фото?");
  },
  toDial: function(peer_id, img) {
    badgeProgress(getFile(img.srcUrl).then(function(blob) {
      return ApiUpload({
        get: {
          method: 'photos.getMessagesUploadServer',
          data: { peer_id: peer_id },
        },
        file: {
          field_name: 'photo',
          blob: blob,
          name: 'photo.png',
        },
        save: {
          method: 'photos.saveMessagesPhoto',
        }
      });
    }).then(function(res) {
      var photo = res.response[0];
      var collectionName = 'dial' + peer_id;

      if (APP.confirmSend(collectionName, photo)) return res;

      return API('messages.send', {
        peer_id: peer_id,
        message: APP.getMessage('Введите текст сообщения'),
        attachment: APP.collectionGet(collectionName)
      }).then(function(res) {
        APP.collectionClear(collectionName);
        return res;
      });
    }));
  },
  toWall: function(owner_id, img) {
    return badgeProgress(getFile(img.srcUrl).then(function(blob) {
      return ApiUpload({
        get: {
          method: 'photos.getWallUploadServer',
          data: owner_id < 0 ? { group_id: -owner_id } : {}
        },
        file: {
          field_name: 'photo',
          blob: blob,
          name: 'photo.png',
        },
        save: {
          method: 'photos.saveWallPhoto',
        }
      });
    }).then(function(res) {
      var photo = res.response[0];
      var collectionName = 'wall' + owner_id;

      if (APP.confirmSend(collectionName, photo)) return res;

      return API("wall.post", {
        owner_id: owner_id,
        message: APP.getMessage('Введите текст записи'),
        attachment: APP.collectionGet(collectionName)
      }).then(function(res) {
        APP.collectionClear(collectionName);
        return res;
      });
    }));
  },
  toAlbum: function(album_id, img) {
    return badgeProgress(getFile(img.srcUrl).then(function(blob) {
      return ApiUpload({
        get: {
          method: 'photos.getUploadServer',
          data: { album_id: album_id }
        },
        file: {
          field_name: 'photo',
          blob: blob,
          name: 'photo.png',
        },
        save: {
          method: 'photos.save',
          data: {
            caption: APP.getMessage('Введите описание фото')
          }
        }
      });
    }));
  }
};


function execute() {
  var res = {};
  res.dialogs = API.messages.getDialogs({ count: 20 }).items.map.message;
  res.users = API.users.get({
    user_ids: res.dialogs.map.user_id,
    name_case: "dat"
  });

  var ids = res.dialogs.map.user_id;
  var ids_length = ids.length + 1;
  var group_ids = [];

  while(ids_length = ids_length - 1) {
    group_ids.push(-ids[ids_length - 1]);
  }

  res.groups = API.groups.getById({ group_ids: group_ids });
  res.albums = API.photos.getAlbums({ count: 20 });
  res.admin_groups = API.groups.get({ extended: 1, filter: "admin" });
  res.friends = API.friends.get({ count:20, name_case: "dat", fields: "last_name", order: "hints" });
  res.user = API.users.get()[0];

  return res;
}

function update_context() {
  return API("execute", {
    code: execute.toString()
      .replace(/.+?{([^]+)}/g, "$1")
      .replace(/\.map/g, '@')
  }).then(function(res) { // Диалоги
    var data = res.response;
    var names = {};

    // fill names
    names = data.users.reduce(function(prev, user) {
      prev[user.id] = user.first_name + ' ' + user.last_name;
      return prev;
    }, names);

    names = data.groups.reduce(function(prev, group) {
      prev[-group.id] = group.name;
      return prev;
    }, names);

    // clear old menu
    chrome.contextMenus.removeAll();

    // fill user info
    chrome.contextMenus.create({
      "title": data.user.first_name + " " + data.user.last_name,
      "contexts": ['image'],
      onclick: function() {
        open("https://vk.com/id" + user.id);
      }
    });


    // fill history
    if (APP.data.history.length) {
      var history = chrome.contextMenus.create({
        "title": 'История',
        "contexts": ['image']
      });

      chrome.contextMenus.create({
        parentId: history,
        title: 'Очистить историю',
        contexts: ['image'],
        onclick: function() {
          chrome.storage.local.clear();
          update_context();
        }
      });

      APP.data.history.map(function(item) {
        var title = item[0];
        var method = item[1];
        var data = item[2];

        return chrome.contextMenus.create({
          parentId: history,
          title: title,
          contexts: ['image'],
          onclick: APP[method].bind(this, data)
        });
      });
    }


    // fill dials
    var dials = chrome.contextMenus.create({
      "title": "В диалог",
      "contexts": ["image"]
    });

    data.dialogs.map(function(dial) {
      dial.peer_id = dial.chat_id ? dial.chat_id + 2e9 : dial.user_id;
      dial.name = dial.chat_id ? dial.title : names[dial.user_id] || dial.user_id.toString();

      chrome.contextMenus.create({
        parentId: dials,
        title: dial.name,
        contexts: ["image"],
        onclick: function(img) {
          APP.toHistory("В диалог " + dial.name, "toDial", dial.peer_id);
          APP.toDial(dial.peer_id, img);
        }
      });
    });


    // fill albums
    var albums = chrome.contextMenus.create({
      "title": "В альбом",
      "contexts": ["image"]
    });
    data.albums.items.map(function(item) {
      return chrome.contextMenus.create({
        "title": item.title,
        "parentId": albums,
        "contexts": ["image"],
        "onclick": function(img) {
          APP.toHistory("В альбом " + item.title, "toAlbum", item.id);
          APP.toAlbum(item.id, img);
        }
      });
    });


    // fill friend dials
    var friends = chrome.contextMenus.create({
      "title": "Другу в сообщения",
      "contexts": ["image"]
    });
    data.friends.items.map(function(item) {
      return chrome.contextMenus.create({
        "title": item.first_name + " " + item.last_name,
        "parentId": friends,
        "contexts": ["image"],
        "onclick": function(img) {
          APP.toHistory("В диалог " + item.first_name + " " + item.last_name, "toDial", item.id);
          APP.toDial(item.id, img);
        }
      });
    });


    // fill wall
    var walls = chrome.contextMenus.create({
      "title": "На стену",
      "contexts": ["image"]
    });
    chrome.contextMenus.create({
      "title": "Свою",
      "parentId": walls,
      "contexts": ["image"],
      "onclick": function(img) {
        APP.toHistory("На свою стену", "toWall", data.user.id);
        APP.toWall(data.user.id, img);
      }
    });
    data.admin_groups.items.map(function(item) {
      return chrome.contextMenus.create({
        "title": item.name,
        "parentId": walls,
        "contexts": ["image"],
        "onclick": function(img) {
          APP.toHistory("На стену " + item.name, "toWall", -item.id);
          APP.toWall(-item.id, img);
        }
      });
    });

    // fill  options
    chrome.contextMenus.create({
      "type": "checkbox",
      "title": "Запрашивать текст",
      "contexts": ["image"],
      "checked": APP.data.text,
      "onclick": APP.onCheck.bind(this, "text")
    });
    chrome.contextMenus.create({
      "type": "checkbox",
      "title": "Запрашивать отправку (Режим сбора)",
      "checked": APP.data.collect,
      "contexts": ["image"],
      "onclick": APP.onCheck.bind(this, "collect")
    });
    chrome.contextMenus.create({
      "title": "Обновить меню",
      "contexts": ["image"],
      "onclick": update_context
    });
  }).catch(function(e) {
    console.error(e);
    chrome.contextMenus.create({
      "title": "Обновить меню",
      "contexts": ["image"],
      "onclick": update_context
    });
    chrome.contextMenus.create({
      "title": "Ошибка :C",
      "contexts": ["image"]
    });
  });
}

update_context();
setBadge("");

chrome.storage.local.get(function(data) {
  Object.assign(APP.data, data);
  console.log("settings restored", data);
});
