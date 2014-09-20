var setupStatus = function () {
  var span = document.getElementById('poll_status');

  while (span.firstChild) {
    span.removeChild(span.firstChild);
  }

  var enabled = chrome.storage.sync.get({
    polling: true,
  }, function (item) {
    pollingStatus = item.polling;
    span.appendChild(document.createTextNode(item.polling ? "Enabled" : "Disabled"));
  });
};

var pollingStatus;

setupStatus();

document.getElementById('toggle_poll').addEventListener('click', function () {
  chrome.storage.sync.set({
    polling: !pollingStatus
  }, function (items) {
    setupStatus();
  });
}, false)
