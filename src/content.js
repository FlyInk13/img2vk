var backgroundImageRegexp = /^url\(["']?(.+?)["']?\)/;
var currentPosition = null;
var currentElement  = null;

document.addEventListener("contextmenu", function onContextMenu(event) {
  currentPosition = [event.clientX, event.clientY];
  currentElement  = event.target;
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if(request !== "searchImages") {
    return;
  }

  if (!currentPosition || !currentElement || !document.elementsFromPoint) {
    sendResponse({
      responseText: 'Что-то пошло не так',
    });
    return;
  }

  var responseText = 'Я ничего не нашел :(';
  var firstImage  = null;
  var elements    = document.elementsFromPoint(currentPosition[0], currentPosition[1]);

  elements.forEach(function(element) {
    if (firstImage) {
      return;
    }

    // <img>
    if (element.tagName === 'IMG') {
      firstImage = element.cloneNode();
    }

    // <div style="background-image: url('http://...')"/>
    var backgroundImageValue  = window.getComputedStyle(element).getPropertyValue('background-image');
    if (backgroundImageRegexp.test(backgroundImageValue)) {
      var backgroundImageUrl = backgroundImageValue.match(backgroundImageRegexp)[1];

      try {
        backgroundImageUrl = decodeURI(backgroundImageUrl);
      } catch (e) {}

      firstImage = document.createElement('img');
      firstImage.src = backgroundImageUrl;
    }
  });

  if (firstImage) {
    insertImageBlock(firstImage);
    responseText = null;
  }

  sendResponse({
    responseText: responseText,
  });
});

function insertImageBlock(image) {
  var frame = document.createElement('iframe');
  var helpText = document.createElement('div');

  frame.style.display = 'block';
  frame.style.position = 'fixed';
  frame.style.top = '10px';
  frame.style.left = '10px';
  frame.style.border = '1px solid #333';
  frame.style.boxShadow = '1px 2px 5px 0px rgba(0, 0, 0, .2)';
  frame.style.width = '300px';
  frame.style.height = '337px';
  frame.style.zIndex = '10000';
  frame.style.background = '#000';
  document.body.appendChild(frame);

  helpText.style.color = '#fff';
  helpText.style.whiteSpace = 'pre-line';
  helpText.style.fontFamily = 'sans-serif';
  helpText.style.fontSize = '13px';
  helpText.style.marginBottom = '8px';
  helpText.style.cursor = 'pointer';
  helpText.textContent = 'Вы искали это изображение?\nНажми сюда для закрытия.\n';
  helpText.onclick = function removeImage() {
    frame.outerHTML = '';
  };
  frame.contentDocument.body.appendChild(helpText);

  image.removeAttribute("style");
  image.style.maxWidth = '100%';
  frame.contentDocument.body.appendChild(image);
}
