/**
 * UserController
 *
 * @description :: Server-side logic for managing users
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var crypto = require('crypto');

module.exports = {

  register: function (req, res) {
    if (req.method == 'POST') {
      var model = req.allParams();
      model.password = crypto.createHash('sha256').update(model.password).digest('hex');
      delete model.id;
      User.create(model, function (error, data) {
        if (error) {
          res.view('user/error', {message: 'При регистрации пользователя произошла ошибка: ' + error.message});
        }
        else {
          // if there are no errors, send verification email
          sendActEmail(req, res, data)
        }
      });
    }
    else if (req.method == 'GET') {
      if (req.param('id') && req.param('t')) {
        var id = parseInt(req.param('id')),
          token = req.param('t');
        User.findOne(id).exec(function (error, user) {
          if (error) {
            res.view('user/error', {message: 'При активации пользователя произошла ошибка: ' + error.message});
          }
          else {
            if (user != null) {
              if (user.password == token) {
                User.update(id, {active: true}).exec(function (error) {
                  if (error) {
                    res.view('user/error', {message: 'При активации пользователя произошла ошибка: ' + error.message});
                  }
                  else {
                    res.redirect('/login');
                  }
                });
              }
            }
            else {
              res.view('user/error', {message: 'При активации пользователя произошла ошибка: неверный ключ активации'});
            }
          }
        });
      }
      else {
        res.view();
      }
    }
  },

  login: function (req, res) {
    if (req.method == 'POST') {
      User.findOne({username: req.param('username')}).exec(function (error, user) {
        if (error) {
          res.view('user/error', {message: 'При проверке логина и пароля произошла ошибка: ' + error.message});
        }
        else {
          if (user != null) {
            if (user.password == crypto.createHash('sha256').update(req.param('password')).digest('hex')) {
              req.session.user = user;
              // setting online status
              User.update(user.id, {online: true}).exec(function (error) {
                if (error) {
                  res.view('user/error', {message: 'При входе произошла ошибка: ' + error.message});
                }
                else {
                  req.session.user.online = true;
                  sails.sockets.blast('friend_online', {
                    id_friend: user.id
                  });
                }
              });
              return res.redirect('/user/' + user.username);
            }
            else {
              res.view('user/error', {message: 'Неверный логин или пароль'});
            }

          }
          else {
            res.view('user/error', {message: 'Пользователь не найден'});
          }
        }
      });
    }
    else {
      if (typeof req.session.user == 'undefined') {
        return res.view();
      }
      else {
        return res.redirect('/user/' + req.session.user.username);
      }
    }
  },

  profile: function (req, res) {
    // making a list of friends ids to check if viewed profile is own of one of friends
    // (others are not allowed to be viewed)
    var friends_ids = [];
    Friend.find({id_user: req.session.user.id}).exec(function (error, friends) {
      if (error) {
        return res.negotiate(error);
      }
      else {
        friends_ids = _.map(friends, function (friend) {
          return friend.id_friend;
        });
      }
    });

    User.findOne({username: req.param('username')}).exec(function (error, user) {
      if (error) {
        res.view('user/error', {message: 'Ошибка: ' + error.message});
      }
      else {
        //showing profile only of self or one of the friends.
        if (user.id == req.session.user.id || friends_ids.indexOf(user.id)>-1) {
          var params = {};
          params.user = _.omit(user, 'password');
          params.current_user = _.omit(req.session.user, 'password');
          if (user.id != req.session.user.id) {
            params.latitude = user.latitude?user.latitude:0;
            params.longitude = user.longitude?user.longitude:0;
          }
          res.view(params);
        }
        // If requested profile of a non-friend user, showing error
        else {
          res.view('user/error', {
            message: 'Вы не можете просматривать профили пользователей, ' +
            'которые не являются вашими друзьями.'
          })
        }
      }
    });
  },

  friends: function (req, res) {
    if (req.xhr) {
      switch (req.method) {
        case 'GET':
          //building friends_ids list
          var friends_ids = [];
          Friend.find({id_user: req.session.user.id}).exec(function (error, friends) {
            if (error) {
              return res.negotiate(error);
            }
            else {
              friends_ids = _.map(friends, function (friend) {
                return friend.id_friend;
              });
            }
          });

          User.findOne(parseInt(req.param('id', 0))).populate('friends').exec(function (error, user) {
            if (error)
              return res.negotiate(error);
            else {
              var friend_ids = _.map(user.friends, function (friend) {
                return friend.id_friend;
              });
              User.find(friend_ids).exec(function (error, friends) {
                if (error)
                  return res.negotiate(error);
                else {
                  var data = {};
                  res.render('user/friends', {friends: friends}, function (error, html){
                    if (error)
                      return res.negotiate(error);
                    else {
                      data.html_update = html;
                    }
                  });
                  data.friends_ids = friends_ids;
                  return res.json(data);
                }
              });
            }
          });
          break;
        case 'DELETE':
          var id = parseInt(req.param('id'));
          Friend.destroy({
            id_user: [id, req.session.user.id],
            id_friend: [id, req.session.user.id]
          }).exec(function (error) {
            if (error) {
              return res.negotiate(error);
            }
            else {
              sails.sockets.blast('delete_friend', {
                id_user: req.session.user.id,
                id_friend: id
              });
              return res.ok();
            }
          });
          break;
        default:
          return res.badRequest();
      }
    }
    else {
      return res.badRequest();
    }
  },

  requests: function (req, res) {
    if (req.xhr) {
      switch (req.method) {
        case 'GET':
          var requests_ids = [];
          Request.find({
            id_requested: parseInt(req.param('id', 0))
          }).populate('id_requesting').exec(function (error, requests) {
            if (error) {
              return res.negotiate(error);
            }
            else {
              var data = {};
              res.render('user/requests',
              {
                requests: _.map(requests, function (request) {
                  return request.id_requesting;
                })
              },
              function (error, html){
                if (error)
                  return res.negotiate(error);
                else {
                  data.html_update = html;
                }
                });
              data.requests_ids = _.map(requests, function (request) {
                return request.id_requesting.id;
              });
              return res.json(data);
            }
          });
          break;
        case 'PUT':
          Friend.create([{
            id_user: req.session.user.id,
            id_friend: parseInt(req.param('id'))
          }, {
            id_friend: req.session.user.id,
            id_user: parseInt(req.param('id'))
          }]).exec(function (error, data) {
            if (error)
              return res.negotiate(error);
            else {
              Friend.publishCreate(data[0], req);
              Request.destroy({
                id_requesting: parseInt(req.param('id')),
                id_requested: req.session.user.id
              }).exec(function (error) {
                if (error)
                  return res.negotiate(error);
                else {
                  return res.ok();
                }
              });
            }
          });
          break;
        case 'DELETE':
          Request.destroy({
            id_requesting: parseInt(req.param('id')),
            id_requested: req.session.user.id
          }).exec(function (error) {
            if (error)
              return res.negotiate(error);
            else {
              return res.ok();
            }
          });
          break;
        default:
          return res.badRequest();
      }
    }
    else {
      return res.badRequest();
    }
  },

  avatar: function (req, res) {
    var fs = require('fs');
    var avatar_dir = sails.config.rootPath + '/avatars/';
    if (req.method == 'GET') {
      var avatar = avatar_dir + req.param('id') + '.jpg';
      fs.stat(avatar, function (error, stats) {
        if (error) {
          return res.sendfile(avatar_dir + 'default-avatar.jpg');
        }
        else if (stats.isFile()) {
          return res.sendfile(avatar);
        }
        else {
          return res.notFound();
        }
      });
    }
    else if (req.method == 'POST') {
      req.file('file').upload({}, function (error, files) {
        if (error)
          return res.negotiate(error);
        else {
          fs.rename(files[0].fd, avatar_dir + req.session.user.id + '.jpg', function (error) {
            if (error)
              return res.negotiate(error);
            else
              return res.ok();
          });
        }

      });
    }
  },

  logout: function (req, res) {
    //setting offline status
    User.update(req.session.user.id, {online: false}).exec(function (error) {
      if (error) {
        res.view('user/error', {message: 'При выходе из системы произошла ошибка: ' + error.message});
      }
      else {
        sails.sockets.blast('friend_offline', {
          id_friend: req.session.user.id
        });
        delete req.session.user;
        return res.redirect('/');
      }
    });
  },

  list: function (req, res) {
    if (req.xhr) {
      Friend.find({id_user: req.session.user.id}).exec(function (error, friends) {
        if (error)
          return res.negotiate(error);
        else {
          var exclude = _.map(friends, function (friend) {
            return friend.id_friend;
          });
          Request.find({id_requesting: req.session.user.id}).exec(function (error, requests) {
            if (error)
              return res.negotiate(error);
            else {
              exclude = exclude.concat(_.map(requests, function (request) {
                return request.id_requested;
              }));
              exclude.push(req.session.user.id);
              User.find({id: {'!': exclude}}).exec(function (error, list) {
                if (error)
                  return res.negotiate(error);
                else {
                  return res.view({list: list});
                }
              });
            }
          });
        }
      });
    }
    else {
      return res.badRequest();
    }
  },

  subscribe: function (req, res) {
    if (req.isSocket && req.session.user) {
      Request.watch(req);
      Friend.watch(req);
    }
    return res.ok();
  },

  request: function (req, res) {
    if (req.xhr) {
      var id_requested = req.param('id_requested');
      Request.count({
        id_requesting: req.session.user.id,
        id_requested: id_requested
      }).exec(function (error, count) {
        if (error)
          return res.negotiate(error);
        else {
          if (!count) {
            Request.create({
              id_requesting: req.session.user.id,
              id_requested: id_requested
            }).exec(function (error, request) {
              if (error) {
                return res.send({
                  success: false,
                  error: error
                });
              }
              else {
                Request.findOne(request.id).populateAll().exec(function (error, request) {
                  request.id_requesting = _.omit(request.id_requesting, 'password');
                  Request.publishCreate(request, req);
                  return res.send({
                    success: true,
                    message: "Заявка успешно отправлена"
                  });
                });
              }
            });
          }
          else {
            return res.send({
              success: true,
              message: "Заявка уже существует"
            });
          }
        }
      });
    }
    else {
      return res.badRequest();
    }
  },

  //this view send activation email
  sendActivationEmail: function (req, res) {
    // checking if a user logged in before getting here. If so, req.session.user contains user object
    if (typeof req.session.user != 'undefined') {
      model = req.session.user;
    }
    // we are here only in case of direct request of the controller without previous login as a non-active user
    // or registration process. If so, the funtion just doesn't know what user should it send email to.
    else {
      res.view('user/error', {message: 'При отправке письма произошла ошибка: невозможно определить пользователя.'});
    }
    sendActEmail(req, res, model)
  },

  location: function (req, res) {
    if (req.method == 'PUT') {
      var latitude = parseFloat(req.param('latitude'));
      var longitude = parseFloat(req.param('longitude'));
      if (req.session.user != 'undefined' && latitude && longitude) {
        User.update(req.session.user.id, {latitude: latitude, longitude: longitude}).exec(function (error) {
          if (error) {
            res.negotiate(error);
          }
          else {
            res.ok();
          }
        });

      }
    }
  }
};

// this function just sends verification email.
// has to be separate function for the code to be DRY, as it could be called
// 1) when a user is created,
// 2) or when a  user requests to send a verification letter one more time
function sendActEmail(req, res, model) {
  var nodemailer = require('nodemailer');
  var smtpTransport = require('nodemailer-smtp-transport');
  var transporter = nodemailer.createTransport(smtpTransport({
      host: 'localhost',
      port: 25,
      ignoreTLS: true
    })
  );
  var mailOptions = {
    from: 'test@cloudmaps.ru',
    to: model.email,
    subject: 'User Activation Email',
    // TODO: generate verification tocken, not to use password (even encrypted)
    text: 'http://localhost:1337/user/register/?id=' + model.id + '&t=' + model.password
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      res.view('user/error', {message: 'При отправке письма произошла ошибка: ' + error.message});
    }
    //TODO: create different views for successful email sent after 1) registration, 2) repeated activation email request
    else {
      // clearing authorization
      delete req.session.user;
      res.view('user/after_register');
    }
  });
}
