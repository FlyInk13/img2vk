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
  getVersion() {
    return chrome.app.getDetails().version;
  },
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
    return 'photo' + photo.owner_id + '_' + photo.id;
  },
  getMessage: function(message) {
    if (!APP.data.text) {
      return '';
    }
    return prompt(message || 'Введите текст');
  },
  confirmSend(collectionName, photo) {
    var index = APP.collectionPush(collectionName, photo);
    return APP.data.collect && !confirm('В буфере ' + index + ' фото.\nОтправить фото?');
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
        random_id: 0,
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

      return API('wall.post', {
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
  var conversations = API.messages.getConversations({
    count: 40,
    extended: 1,
    fields: "first_name_dat,last_name_dat"
  });

  res.dialogs = conversations.items.map.conversation;
  res.users = conversations.profiles;
  res.groups = conversations.groups;

  res.albums = API.photos.getAlbums({ count: 20 }).items;
  res.admin_groups = API.groups.get({ extended: 1, filter: "admin" }).items;
  res.friends = API.friends.get({ count:20, fields: "last_name,last_name_dat,first_name_dat", order: "hints" }).items;
  res.user = API.users.get()[0];

  return res;
}

function createContextMenu(items) {
  // clear old menu
  chrome.contextMenus.removeAll();

  items.forEach(function(item) {
    var items_action = item.items_action;
    var items = item.items;

    delete item.items_action;
    delete item.items;

    var contextMenuItem = chrome.contextMenus.create(Object.assign({
      enabled: !items || items.length > 0,
      contexts: ['image'],
    }, item));

    if (items && items.length) {
      if (items_action) {
        items = [items_action].concat(items);
      }

      items.forEach(function attachMenu(item) {
        chrome.contextMenus.create(Object.assign({
          parentId: contextMenuItem,
          contexts: ['image'],
        }, item));
      });
    }
  })
}

function update_context() {
  return API('execute', {
    code: execute.toString()
      .replace(/.+?{([^]+)}/g, "$1")
      .replace(/\.map/g, '@')
  }).then(function(res) { // Диалоги
    var data = res.response;

    // add default data
    data.users = data.users || [];
    data.groups = data.groups || [];
    data.dialogs = data.dialogs || [];
    data.friends = data.friends || [];
    data.albums = data.albums || [];
    data.admin_groups = data.admin_groups || [];

    // fill names
    var names = {};

    names = data.users.reduce(function(prev, user) {
      prev[user.id] = user.first_name_dat + ' ' + user.last_name_dat;
      return prev;
    }, names);

    names = data.groups.reduce(function(prev, group) {
      prev[-group.id] = group.name;
      return prev;
    }, names);


    createContextMenu([
      {
        title: data.user.first_name + ' ' + data.user.last_name,
        onclick: function onClick() {
          open('https://vk.com/id' + data.user.id);
        }
      },
      {
        title: 'История',
        items_action: {
          title: 'Очистить историю',
          contexts: ['image'],
          onclick: function() {
            APP.data.history = [];
            APP.save();
            update_context();
          }
        },
        items: APP.data.history.map(function createHistoryItem(item) {
          var title = item[0];
          var method = item[1];
          var data = item[2];

          return {
            title: title,
            onclick: APP[method].bind(this, data)
          };
        })
      },
      {
        title: 'В диалог',
        items: data.dialogs.map(function createDialogItem(dial) {
          dial.peer_id = dial.peer.id;
          dial.name = (dial.peer_id > 2e9 ? dial.chat_settings.title : names[dial.peer_id]) || dial.peer_id.toString();

          return {
            title: dial.name,
            onclick: function onClick(img) {
              APP.toHistory('В диалог ' + dial.name, 'toDial', dial.peer_id);
              APP.toDial(dial.peer_id, img);
            }
          };
        })
      },
      {
        title: 'В альбом',
        items: data.albums.map(function createAlbumItem(item) {
          return {
            title: item.title,
            onclick: function onClick(img) {
              APP.toHistory('В альбом ' + item.title, 'toAlbum', item.id);
              APP.toAlbum(item.id, img);
            }
          };
        })
      },
      {
        title: 'Другу в сообщения',
        items: data.friends.map(function createFriendItem(item) {
          item.name = item.first_name_dat + ' ' + item.last_name_dat;
          return {
            title: item.name,
            onclick: function onClick(img) {
              APP.toHistory('В диалог ' + item.name, 'toDial', item.id);
              APP.toDial(item.id, img);
            }
          };
        })
      },
      {
        title: 'На стену',
        items_action: {
          title: 'Свою',
          onclick: function(img) {
            APP.toHistory('На свою стену', 'toWall', data.user.id);
            APP.toWall(data.user.id, img);
          }
        },
        items: data.admin_groups.map(function createWallItem(item) {
          return {
            title: item.name,
            onclick: function(img) {
              APP.toHistory('На стену ' + item.name, 'toWall', -item.id);
              APP.toWall(-item.id, img);
            }
          };
        })
      },
      {
        title: 'Запрашивать текст',
        type: 'checkbox',
        checked: APP.data.text,
        onclick: APP.onCheck.bind(this, 'text')
      },
      {
        title: 'Запрашивать отправку (Режим сбора)',
        type: 'checkbox',
        checked: APP.data.collect,
        onclick: APP.onCheck.bind(this, 'collect')
      },
      {
        title: 'Обновить меню',
        contexts: ['image'],
        onclick: update_context
      },
      {
        enabled: !!document.elementsFromPoint,
        contexts: ['page', 'frame', 'link'],
        title: 'Найти здесь изображение',
        onclick: function onClick(event, tab) {
          chrome.tabs.sendMessage(tab.id, "searchImages", function(response) {
            if (response.responseText) {
              alert(response.responseText);
            }
          });
        }
      },
      {
        title: 'Версия: ' + APP.getVersion(),
        enabled: false,
      },
      {
        title: 'С любовью и багами, @FlyInk <3',
        onclick: function onClick() {
          open('https://vk.com/flyink');
        }
      }
    ]);
  }).catch(function(e) {
    console.error(e);
    createContextMenu([
      {
        title: 'Ошибка загрузки :C',
        enabled: false,
      },
      {
        title: 'Обновить меню',
        onclick: update_context
      },
      {
        title: 'Версия: ' + APP.getVersion(),
        enabled: false,
      },
      {
        title: 'С любовью и багами, @FlyInk <3',
        onclick: function onClick() {
          open('https://vk.com/flyink');
        }
      }
    ]);
  });
}

update_context();
setBadge('');

chrome.storage.local.get(function(data) {
  Object.assign(APP.data, data);
  console.log('settings restored', data);
});
