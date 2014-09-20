// ==UserScript==
// This script works on the PR page. Uses Parse to store data.
// @match https://github.com/*
// ==/UserScript==

// Other file forwarders
var Parse;
var waitForKeyElements;

var findAllThreads = function () {
  var threads = [];

  $('#discussion_bucket .line-comments .comment-holder').each(function () {
    var childComments = $(this).children('.comment');
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
    _.each(allThreads, function (info) { updateThread(info, {suppressMergeUpdate: true}) });
  }).then(function () {
    expandUnresolvedThreads();
    updateMergeButton();
  });
}

var CommentTracker;
var Settings;
var appSettings;

var main = function () {
  chrome.storage.sync.get({
    polling: true
  }, function (items) {
    Parse.initialize("af7O3YCdgoc17ZhLj7uGFypfEvzSYMphi7XbeQCK", "giDSblA98q6dM6aCY0WTJZWBeWGoUDcPMbaVw31H");
    CommentTracker = Parse.Object.extend('CommentTracker');
    Settings = Parse.Object.extend('Settings');

    resetManipulations();

    waitForKeyElements('.comment', checkThreads);

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
      var container = elem.parents('.outdated-diff-comment-container');
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
    initalCanBeMerged = $('.merge-branch-action').hasClass('primary');
  }
  $('.comment-track-status').remove();

  if (initalCanBeMerged) {
    if (allThreadsResolved()) {
      // Make button green
      $('.merge-branch-action').addClass('primary');
      $('.branch-action').addClass('branch-action-state-clean').removeClass('branch-action-state-unstable');
      $('.merge-branch-heading').text('This pull request can be automatically merged.');
      $('.branch-status').remove();
    } else {
      // Make button grey
      $('.merge-branch-action').removeClass('primary');
      $('.branch-action').removeClass('branch-action-state-clean').addClass('branch-action-state-unstable');
      $('.merge-branch-heading').text('Merge with caution!');
      $('.branch-action-body').prepend(
        '<div class="branch-status comment-track-status edit-comment-hide status-failure">' +
        '  <span class="build-status-description">' +
        '    <span class="octicon octicon-x"></span>' +
        '    <strong>Warning</strong>' +
        '      — You have unresolved comments!' +
        '  </span>' +
        '</div>'
      );
    }
  } else {
    if (!allThreadsResolved()) {
      $('.branch-status').append(
        '  <span class="build-status-description comment-track-status">' +
        '    <span class="octicon octicon-x"></span>' +
        '    <strong>Warning</strong>' +
        '      — You have unresolved comments!' +
        '  </span>'
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
  $(elem).find('.comment-track-action').remove();

  var string;
  if (threadInfo.resolved) {
    string = '<a class="octicon octicon-x comment-track-action comment-track-unresolve">&nbsp;Mark Unresolved</a>';
    $(elem).find('.timeline-comment-actions').prepend(string);

    $(elem).find('.comment-track-unresolve').on('click', function () {
      event.preventDefault();
      var tracker = threadInfo.tracker;
      tracker.set('resolved', false);
      tracker.set('lastCommentSeen', null);
      tracker.save();

      threadInfo.resolved = false;

      updateThread(threadInfo);
    });
  } else {
    string = '<a class="octicon octicon-check comment-track-action comment-track-resolve">&nbsp;Resolve Thread</a>';
    $(elem).find('.timeline-comment-actions').prepend(string)
    $(elem).find('.comment-track-resolve').on('click', function (event) {
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

  if (id.match(/^discussion_/)) {
    var threadComments = $(elem).parents('.comment-holder').children('.comment');
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
