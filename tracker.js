// ==UserScript==
// This script works on the PR page. Uses Parse to store data.
// @match https://github.com/*
// ==/UserScript==

var Parse;
var findAllThreads = function () {
  var threads = [];

  $('#discussion_bucket .line-comments .comment-holder').each(function () {
    var childComments = $(this).children('.comment');
    if (childComments.length > 0) {
      var firstCommentChild = childComments.first()[0];
      threads.push({
        id: firstCommentChild.id,
        comments: childComments,
        lastCommentId: childComments.last().id,
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

var main = function () {
  Parse.initialize("af7O3YCdgoc17ZhLj7uGFypfEvzSYMphi7XbeQCK", "giDSblA98q6dM6aCY0WTJZWBeWGoUDcPMbaVw31H");
  CommentTracker = Parse.Object.extend('CommentTracker');

  var allThreads = findAllThreads();

  annotateWithParseInfo(allThreads).then(function () {
    _.each(allThreads, updateThread);
  });
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
        info.resolved = result.get('resolved');
        info.lastCommentSeen = result.get('lastCommentSeen');
        info.tracker = result;
      }
    });
  });
};

var CommentTracker;

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

      updateThread(threadInfo);
    });
  }
};

var updateThread = function (info) {
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
};

main();
