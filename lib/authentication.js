module.exports = function Server(streamLib, siteConf) {
    var everyauth = require('everyauth');
    var types = streamLib.types;

    var short = {
        'facebook' : 'fb',
        'twitter' : 'twit',
        'github' : 'github'
    }

    // Needed for Mongoose-Auth Compat with EveryAuth
    everyauth.github.fetchOAuthUser(function (accessToken) {
        var p = this.Promise();
        this.oauth.get(this.apiHost() + '/user', accessToken, function (err, data) {
          if (err) {
            return p.fail(err);
          }
          var oauthUser = JSON.parse(data);
          oauthUser.plan = {name : accessToken};
          	// temp holder because I dont feel like forking the mongoose-auth repo right now
            console.dir(oauthUser);
          p.fulfill(oauthUser);
        })
        return p;
      });

    var mongoose = require("mongoose")
        , Schema = mongoose.Schema
        , mongooseAuth = require('mongoose-auth')
      , User;

    types.UserSchema.plugin(mongooseAuth, {
            facebook: {
                everyauth: {
                    myHostname: siteConf.uri
                  , appId: siteConf.external.facebook.appId
                  , appSecret: siteConf.external.facebook.appSecret
                  , redirectPath: '/'
                  , scope: 'user_location, email, user_about_me'
                }
            },
            twitter: {
                everyauth: {
                    myHostname: siteConf.uri
                  , consumerKey: siteConf.external.twitter.consumerKey
                  , consumerSecret: siteConf.external.twitter.consumerSecret
                  , redirectPath: '/'
                }
            },
            github: {
                everyauth: {
                    myHostname: siteConf.uri
                  , appId: siteConf.external.github.appId
                  , appSecret: siteConf.external.github.appSecret
                  , redirectPath: '/'
                }
            },
            // Here, we attach your User model to every module
            everymodule: {
              everyauth: {
                  User: function () {
                    return streamLib.asmsDB.User;
                  },
                  handleLogout: function (req, res) {
                    delete req.session.user;
                    req.logout();
                    res.writeHead(303, { 'Location': this.logoutRedirectPath() });
                    res.end();
                  }
              }
            }
        }
    );

    var extendedProperties = ['github', 'fb', 'twit', 'photos', 'streams_followed', 'roles'];

    types.UserSchema.methods.toSafeObject = function() {
        var obj = this.toObject();
        _.each(extendedProperties, function(item){
            delete obj[item];
        });
        return obj;
    };

    var credsParser = function(req) {
        var creds = null;
        if (req.headers.authorization) {
            // This is the recommended way of passing the credentials
            var header=req.headers.authorization,        // get the header
                  token=header.split(/\s+/).pop()||'',            // and the encoded auth token
                  auth=new Buffer(token, 'base64').toString(),    // convert from base64
                  parts=auth.split(/:/);
            creds = {provider: parts[0], accessToken:parts[1]};
        } else if (req.query.token && req.query.provider) {
            creds = {provider: req.query.provider, accessToken: req.query.token};
        }
        if (creds) {
            creds.providerShortName = short[creds.provider];
            creds.propName = creds.providerShortName + ((creds.provider === 'github') ? '.plan.name' : '.accessToken');
        }

        return creds;
    };

	// Fetch and format data so we have an easy object with user data to work with.
	function normalizeUserData() {
		function handler(req, res, next) {
      var creds = null;
			if (req.session && !req.session.user && req.session.auth && req.session.auth.loggedIn) {
				var id = null;
                var provider = null;

                if (req.session.auth.github && req.session.auth.github.user) {
                    provider = 'github';
                    id = req.session.auth.github.user.id;
                } else if (req.session.auth.twitter && req.session.auth.twitter.user) {
                    provider = 'twit';
                    id = req.session.auth.twitter.user.id_str;
                } else if (req.session.auth.facebook && req.session.auth.facebook.user) {
                    provider = 'fb';
                    id = req.session.auth.facebook.user.id;
                }
                if (provider && id) {
                    console.log("Looking for user with id" + id);
                    streamLib.asmsDB.User.findOne().where(provider + '.id', id).exec(function(err, user){
                        if (err) {
                            // Should we create the user here if we can't find it ?
                            throw(new Error("Did you delete the DB ? I couldn't find the current user in the db"));
                        }

                        console.log("Found user with id " + id)
                        req.session.user = user.toSafeObject();
                        next();
                    })
                } else {
                    throw(new Error("Bad session data - Couldn't read the ID for the current user"));
                }
            } else if (!req.session.user && (creds = credsParser(req))){
                console.log("Setting session from query string or basic auth")
                streamLib.asmsDB.User.findOne().where(creds.propName, creds.accessToken).exec(function(err, user){
                    if (err) throw(err);

                    console.log("Found user with " + creds.propName + " = " + creds.accessToken);
                    req.session.auth = {
                        loggedIn : true,
                        provider : {
                            impersonated: true,
                            user: user[creds.providerShortName],
                            accessToken: creds.accessToken}
                    };
                    req.session.user = user.toSafeObject();
                    next();
                });
            } else {
                next();
            }
		}

		return handler;
	}

	return {
		'middleware': {
			'mongooseAuth': mongooseAuth.middleware
			, 'normalizeUserData': normalizeUserData
		}
	};
};