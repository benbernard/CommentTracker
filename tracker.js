// ==UserScript==
// This script works on the PR page. Uses Parse to store data.
// @match https://github.com/*
// ==/UserScript==

// Other file forwarders
var Parse;
var waitForKeyElements;

var findAllThreads = function () {
  var threads = [];

  $('#discussion_bucket .js-line-comments .js-comments-holder').each(function () {
    var childComments = $(this).children('.js-comment');
    if (childComments.length > 0) {
      var firstCommentChild = childComments.first()[0];
      threads.push({
        id: firstCommentChild.id,
        comments: childComments,
        lastCommentId: childComments.last()[0].id,
      });
    }
  });

  $('#discussion_bucket .timeline-comment-wrapper .timeline-comment.js-comment').each(function () {
    if (this.id && this.id.match(/^issuecomment/)) {
      threads.push({
        id: this.id,
        comments: $(this),
        lastCommentId: this.id,
      });
    }
  });

  return threads;
};

var checkThreads = function () {
  var newThreads = findAllThreads();
  if (_.isEqual(_.pluck(newThreads, 'id'), _.pluck(allThreads, 'id'))) {
    if (_.isEqual(_.pluck(newThreads, 'lastCommentId'), _.pluck(allThreads, 'lastCommentId'))) {
      return;
    }
  }
  resetManipulations();
};

var resetManipulations = function () {
  allThreads = findAllThreads();

  annotateWithParseInfo(allThreads).then(function () {
    _.each(allThreads, function (info) { updateThread(info, {suppressMergeUpdate: true}); });
  }).then(function () {
    expandUnresolvedThreads();
    updateMergeButton();
  });
};

var CommentTracker;
var Settings;
var appSettings;

var main = function () {
  /* global chrome */
  chrome.storage.sync.get({
    polling: true
  }, function (items) {
    Parse.initialize("ghct");
    Parse.serverURL = 'https://ghct.herokuapp.com/1';
    CommentTracker = Parse.Object.extend('CommentTracker');
    Settings = Parse.Object.extend('Settings');

    resetManipulations();

    // waitForKeyElements will trigger for *each* changed/added element.
    // Debounce both to only call checkThreads once, and to call with a slight
    // delay for better compatiblity with the WideGithub extension:
    // https://chrome.google.com/webstore/detail/wide-github/kaalofacklcidaampbokdplbklpeldpj
    var debouncedCheckThreads = _.debounce(checkThreads, 100);
    waitForKeyElements('.comment', debouncedCheckThreads);

    if (items.polling) {
      new Parse.Query(Settings).get("bdWmF0aC6c").then(function (settings) {
        appSettings = settings;
        setInterval(resetManipulations, appSettings.get('pollInterval'));
      });
    }
  });
};

var expandUnresolvedThreads =  function () {
  _.each(allThreads, function (info) {
    if (!info.resolved) {
      var id = info.id;
      var elem = $('#' + id).first();
      var container = elem.parents('.outdated-comment');
      if (container.length > 0) {
        container.removeClass('closed').addClass('open');
      }
    }
  });
};

var allThreads;
var initalCanBeMerged = false;

var allThreadsResolved = function () {
  return _.all(allThreads, function (info) {
    return info.resolved;
  });
};

var updateMergeButton = function () {
  if (!initalCanBeMerged) {
    initalCanBeMerged = $('.js-merge-branch-action').hasClass('btn-primary');
  }
  $('.comment-track-status').remove();

  if (initalCanBeMerged) {
    if (allThreadsResolved()) {
      // Make button green
      $('.js-merge-branch-action').addClass('btn-primary');
      $('.branch-action').addClass('branch-action-state-clean').removeClass('branch-action-state-dirty');
      $('.status-heading').text('This pull request can be automatically merged.');
      $('.status-meta').text('Merging can be performed automatically.');
      $('.branch-action-item-icon').removeClass('completeness-indicator-problem').addClass('completeness-indicator-success').html('<svg aria-hidden="true" class="octicon octicon-alert" height="16" role="img" version="1.1" viewBox="0 0 12 16" width="12"><path d="M12 5L4 13 0 9l1.5-1.5 2.5 2.5 6.5-6.5 1.5 1.5z"></path></svg>');
    } else {
      // Make button grey
      $('.js-merge-branch-action').removeClass('btn-primary');
      $('.branch-action').removeClass('branch-action-state-clean').addClass('branch-action-state-dirty');
      $('.status-heading').text('Merge with caution!');
      $('.status-meta').text('You have unresolved comments!');
      $('.branch-action-item-icon').removeClass('completeness-indicator-success').addClass('completeness-indicator-problem').html('<svg aria-hidden="true" class="octicon octicon-alert" height="16" role="img" version="1.1" viewBox="0 0 16 16" width="16"><path d="M15.72 12.5l-6.85-11.98C8.69 0.21 8.36 0.02 8 0.02s-0.69 0.19-0.87 0.5l-6.85 11.98c-0.18 0.31-0.18 0.69 0 1C0.47 13.81 0.8 14 1.15 14h13.7c0.36 0 0.69-0.19 0.86-0.5S15.89 12.81 15.72 12.5zM9 12H7V10h2V12zM9 9H7V5h2V9z"></path></svg>');
    }
  } else {
    if (!allThreadsResolved()) {
      $('.merge-message').before(
        '<div class="branch-action-item comment-track-status">' +
        '    <div class="branch-action-item-icon completeness-indicator completeness-indicator-problem">' +
        '      <svg aria-hidden="true" class="octicon octicon-alert" height="16" role="img" version="1.1" viewBox="0 0 16 16" width="16"><path d="M15.72 12.5l-6.85-11.98C8.69 0.21 8.36 0.02 8 0.02s-0.69 0.19-0.87 0.5l-6.85 11.98c-0.18 0.31-0.18 0.69 0 1C0.47 13.81 0.8 14 1.15 14h13.7c0.36 0 0.69-0.19 0.86-0.5S15.89 12.81 15.72 12.5zM9 12H7V10h2V12zM9 9H7V5h2V9z"></path></svg>' +
        '    </div>' +
        '    <h4 class="status-heading">This branch has unresolved comments</h4>' +
        '      <span class="status-meta">' +
        '        See above for red unresolved comments' +
        '      </span>' +
        '  </div>'
      );
    }
  }
};

var annotateWithParseInfo = function (allThreads) {
  var ids = _.pluck(allThreads, 'id');
  var query = new Parse.Query(CommentTracker);
  query.containedIn('commentId', ids);

  return query.find().then(function (results) {
    _.each(results, function (result) {
      var id = result.get('commentId');
      var info = _.findWhere(allThreads, {id: id});
      if (info) {
        info.resolved = result.get('resolved') && result.get('lastCommentSeen') === info.lastCommentId;
        info.lastCommentSeen = result.get('lastCommentSeen');
        info.tracker = result;
      }
    });
  });
};

var makeButton = function (elem, threadInfo) {
  var $elem = $(elem);
  $elem.find('.comment-track-action').remove();

  var actionSelector = '.review-comment-contents';
  if ($elem.find(actionSelector).length === 0) {
    actionSelector = '.timeline-comment-actions';
  }

  var string;
  if (threadInfo.resolved) {
    string = '<span class="octicon comment-track-action comment-track-unresolve"></span>';
    $elem.find(actionSelector).prepend(string);

    $elem.find('.comment-track-unresolve').on('click', function (event) {
      event.preventDefault();
      var tracker = threadInfo.tracker;
      tracker.set('resolved', false);
      tracker.set('lastCommentSeen', null);
      tracker.save();

      threadInfo.resolved = false;

      updateThread(threadInfo);
    });
  } else {
    string = '<span class="octicon comment-track-action comment-track-resolve"></span>';
    $elem.find(actionSelector).prepend(string);

    $elem.find('.comment-track-resolve').on('click', function (event) {
      event.preventDefault();
      var tracker = threadInfo.tracker || new CommentTracker();

      tracker.set('commentId', threadInfo.id);
      tracker.set('resolved', true);
      tracker.set('lastCommentSeen', threadInfo.lastCommentId);

      tracker.save();

      threadInfo.resolved = true;
      threadInfo.tracker = tracker;

      updateThread(threadInfo);
    });
  }
};

var updateThread = function (info, options) {
  options = options || {};
  var id = info.id;
  var elem = $('#' + id).first();

  if (!id.match(/^issuecomment/)) {
    var threadComments = $(elem).parents('.js-comments-holder').children('.js-comment');
    threadComments.each(function () {
      makeButton(this, info);
    });
  } else {
    makeButton(elem, info);
  }

  if (!options.suppressMergeUpdate) {
    updateMergeButton();
  }
};

main();
