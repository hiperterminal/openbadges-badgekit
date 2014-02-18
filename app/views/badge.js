const fs = require('fs');
const path = require('path');
const Badge = require('../models/badge')("DATABASE");
const Image = require('../models/image')("DATABASE");
const async = require('async');

const openbadger = require('../lib/openbadger');
const middleware = require('../middleware');

const studioPath = 'images/studio/';

function getBadgeById(badgeId, category, callback) {
  if (category === 'draft' || category === 'template') {
    Badge.getOne({ id: badgeId }, { relationships: true }, function(err, row) {
     callback(err, { badge: row } );
   });
  }
  else {
    openbadger.getBadge({ slug: badgeId }, function(err, data) {
      if (err)
        return callback(err);

      data = openbadger.toBadgekitBadge(data);

      callback(err, { badge: data });
    });
  }
}

exports.home = function home (req, res, next) {
  const badgeId = req.params.badgeId;
  const category = req.query.category || 'draft';

  getBadgeById(badgeId, category, function(err, data) {
    if (err)
      return res.send(500, err);

    data.category = category;

    res.render('badge/home.html', data);
  });
};

exports.edit = function edit (req, res, next) {
  const badgeId = req.params.badgeId;
  const section = req.query.section || 'description';
  const category = req.query.category || 'draft';

  async.parallel([
    function(callback) {
      getBadgeById(badgeId, category, function(err, data) {
        if (err)
          return callback(err);

        data.section = section;
        data.category = category;

        callback(null, data);
      });
    },
    function(callback) {
      fs.readdir(path.join(__dirname, '../static', studioPath, 'shapes'), function(err, files) {
        if (err)
          callback(err);

        var shapes = files.map(function(file) {
          return { id: file,
                   image: res.locals.static(path.join(studioPath, 'shapes', file)) };
        });

        callback(null, shapes);
      });
    }],
    function(err, results) {
      if (err)
        res.send(500, err);

      var data = results[0];
      data.shapes = results[1];

      res.render('badge/edit.html', data);
    }
  );
};

exports.getBackgrounds = function getBackgrounds(req, res, next) {
  fs.readdir(path.join(__dirname, '../static', studioPath, 'backgrounds'), function(err, files) {
    if (err)
      res.send(500, err);

    var backgrounds = files.map(function(file) {
      return { id: file,
               image: res.locals.static(path.join(studioPath, 'backgrounds', file)) };
    });

    res.send(200, { backgrounds: backgrounds });
  });
};

exports.getTexts = function getTexts(req, res, next) {
  fs.readdir(path.join(__dirname, '../static', studioPath, 'texts'), function(err, files) {
    if (err)
      res.send(500, err);

    var texts = files.map(function(file) {
      return { id: file, 
               image: res.locals.static(path.join(studioPath, 'texts', file)) };
    });

    res.send(200, { texts: texts });
  });
};

exports.getIcons = function getIcons(req, res, next) {
  fs.readdir(path.join(__dirname, '../static', studioPath, 'icons'), function(err, files) {
    if (err)
      res.send(500, err);

    var icons = files.map(function(file) {
      return { id: file, 
               image: res.locals.static(path.join(studioPath, 'icons', file)) };
    });

    res.send(200, { icons: icons });
  });
};

exports.getColors = function getColors(req, res, next) {
  fs.readdir(path.join(__dirname, '../static', studioPath, 'colors'), function(err, files) {
    if (err)
      res.send(500, err);

    var colors = files.map(function(file) {
      return { id: file,
               image: res.locals.static(path.join(studioPath, 'colors', file)) };
    });

    res.send(200, { colors: colors });
  });
};

function saveBadge(req, callback) {
  const timeValue = parseInt(req.body.timeValue, 10);
  const limitNumber = parseInt(req.body.limitNumber, 10);
  const numCriteria = parseInt(req.body.numCriteria, 10);

  const query = { 
    id: req.body.badgeId, 
    name: req.body.name,
    description: req.body.description, 
    tags: req.body.tags,
    issuerUrl: req.body.issuerUrl,
    earnerDescription: req.body.earnerDescription,
    consumerDescription: req.body.consumerDescription,
    rubricUrl: req.body.rubricUrl,
    timeValue: timeValue > 0 ? timeValue : 0,
    timeUnits: req.body.timeUnits,
    limit: req.body.limit == 'limit' ? (limitNumber > 0 ? limitNumber : 0) : 0,
    unique: req.body.unique == 'unique' ? 1 : 0,
    multiClaimCode: req.body.multiClaimCode,
  };

  Badge.put(query, function (err, result) {
    if (err)
      return callback(err);

    Badge.getOne({ id: result.row.id }, function(err, badgeRow) {
      if (err)
        return callback(err);

      async.parallel([
        function(innerCallback) {
          const criteria = req.body.criteria.slice(0,numCriteria).map(function(criterion) {
            return {
              id: criterion.id || null,
              description: criterion.description,
              required: criterion.required == 'on' ? 1 : 0,
              note: criterion.note
            };
          });

          badgeRow.setCriteria(criteria, function(err) {
            return innerCallback(err);
          });
        },
        function(innerCallback) {
          if (req.files) {
            var path = req.files.uploadImage.path;
            var type = req.files.uploadImage.type;

            if (req.files.studioImage) {
              path = req.files.studioImage.path;
              type = req.files.studioImage.type;
            }

            // Need to determine acceptable mime types... this is just accepting everything right now.
            fs.readFile(path, function(err, data) {
              if (err)
                return innerCallback(err);

              const imageQuery = {
                id: badgeRow.imageId,
                mimetype: type,
                data: data
              };

              Image.put(imageQuery, function(err, imageResult) {
                if (err)
                  return innerCallback(err);

                if (badgeRow.imageId === null) {
                  Badge.update({ id: badgeRow.id, imageId: imageResult.insertId }, function(err, result) {
                    return innerCallback(err);
                  });
                }
                else {
                  return innerCallback(null);
                }
              });
            });
          }
          else {
            return innerCallback(null);
          }
        }],
        function(err) {
          callback(err, badgeRow);
        }
      );
    });
  });
};

exports.save = function save (req, res, next) {
  saveBadge(req, function(err, row) {
    if (err)
      return res.send(500, err);

    return middleware.redirect('badge.edit', { badgeId: req.body.badgeId }, 302)(req, res, next);
  });
};

exports.archive = function archive (req, res, next) {
  const badgeId = req.params.badgeId;
  openbadger.getBadge({ slug: badgeId }, function(err, badge) {
    if (err)
      return res.send(500, err);

    badge.archived = true;

    openbadger.updateBadge(badge, function(err) {
      if (err) 
        return res.send(500, err);

      return res.send(200);
    });
  });
};

exports.publish = function publish (req, res, next) {
  const badgeId = req.params.badgeId;

  saveBadge(req, function(err, row) {
    if (err)
      return res.send(500, err);

    Badge.getOne({ id: badgeId }, { relationships: true }, function(err, row) {
      if (err)
        return res.send(500, err);

      var badge = openbadger.toOpenbadgerBadge(row);
      openbadger.createBadge(badge, function(err) {
        if (err)
          return res.send(500, err);

        Badge.update({ id: badgeId, published: true }, function(err, result) {
          if (err)
            return res.send(500, err);

          return res.send(200, { location: res.locals.url('directory') + '?category=published' });
        });
      });
    });
  });
};

exports.copy = function copy (req, res, next) {
  const badgeId = req.params.badgeId;
  openbadger.getBadge({ slug: badgeId }, function(err, badge) {
    if (err)
      return res.send(500, err);

    badge = openbadger.toBadgekitBadge(badge);
    delete badge.id;
    Badge.put(badge, function (err, result) {
      if (err)
        return res.send(500, err);

      return res.send(200, { location: res.locals.url('directory') + '?category=draft' })
    });
  });
};

exports.image = function image (req, res, next) {
  const badgeId = req.params.badgeId;

  Badge.getOne({ id: badgeId }, { relationships: true }, function(err, row) {
    if (err)
      return res.send(500, err);

    if (row) {
      if (row.image.id !== null) {
        res.type(row.image.mimetype);
        return res.send(row.image.data);
      }
      else {
        res.sendfile(path.join(__dirname, '../static/images/default-badge.png'));
      }
    }
    else {
      res.send(404);
    }
  });
};

exports.renderIssueByEmail = function renderIssueByEmail (req, res, next) {
  const badgeId = req.params.badgeId;

  openbadger.getBadge({ slug: badgeId }, function(err, data) {
    if (err)
      return res.send(500, err);

    data = openbadger.toBadgekitBadge(data);
    res.render('badge/issue-by-email.html', { badge: data });
  });
};

exports.issueByEmail = function issueByEmail (req, res, next) {
  const query = { 
    learner: {
      email: req.body.email
    },
    badge: req.body.badgeId
  };

  // This API endpoint isn't yet implemented, and likely "query" will have to be changed when it is
  openbadger.grantBadgeAward(req.body.badgeId, query, function(err, data) {
    //suppressing errors for now, as this will always result in an error at the moment
    //if (err)
    //  return res.send(500, err);

    return middleware.redirect('directory', 302)(req, res, next);
  });

};

exports.renderIssueByClaimCode = function renderIssueByClaimCode (req, res, next) {
  const badgeId = req.params.badgeId;

  openbadger.getBadge({ slug: badgeId }, function(err, data) {
    if (err)
      return res.send(500, err);

    data = openbadger.toBadgekitBadge(data);
    res.render('badge/issue-by-claim-code.html', { badge: data });
  });
};

exports.issueByClaimCode = function issueByClaimCode (req, res, next) {
  // openbadger does not yet support generation of claim codes via its API
  return middleware.redirect('directory', 302)(req, res, next);
};
