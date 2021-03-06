// In case we leave a console.*** in the code without native support
(function(b){function c(){}for(var d="assert,count,debug,dir,dirxml,error,exception,group,groupCollapsed,groupEnd,info, log,markTimeline,profile,profileEnd,time,timeEnd,trace,warn".split(","),a;a=d.pop();)b[a]=b[a]||c;})(window.console=window.console||{});

(function ($) {

	// Shorthand jQuery selector cache. Only use on selectors for the DOM that won't change.
	var $$ = (function() {
		var cache = {};
		return function(selector) {
			if (!cache[selector]) {
				cache[selector] = $(selector);
			}
			return cache[selector];
		};
	})();

	App.socketIoClient = io.connect(null, {
		'port': '#socketIoPort#'
		, 'rememberTransport': true
		, 'transports': ['xhr-polling']
	});
	App.socketIoClient.on('connect', function () {
        $$('#connected').addClass('on').find('strong').text('Online');
	});

    App.socketIoClient.on('message', function(json) {
        var doc = JSON.parse(json);
        if (doc) {
           App.streamView.collection.addOrInsertChild(new Activity(doc));
        }
   	});

   App.socketIoClient.on('disconnect', function() {
        $$('#connected').removeClass('on').find('strong').text('Offline');
    });

    App.map = null;

    App.streamView = new ActivityStreamView();
    App.filterView = new ActivityFilterView();
    App.filterView.streamView = App.streamView;

    var defaultSync = Backbone.sync;

    Backbone.sync = function(method, model, options) {
        console.dir(model);
        if (model.url === "/activities") {
            if (method === "create") {
                var act = model.toJSON();
                    console.dir(act);
                    delete(act.likes);
                    delete(act.comments);
                    App.socketIoClient.emit("create-activity", act);
                    return true;
            } else if (method === "update") {
                var act = model.toJSON();
                delete(act.likes);
                delete(act.comments);
                App.socketIoClient.emit("save-activity", act);
                return true;
            }

        } else if (model.urlRoot === "/streams") {
            if (method == "read") {
               console.log("Attempting to read the stream");
                defaultSync(method, model, options);
                return true;
           }
        }
        return defaultSync(method, model, options);
    }

    var newActView = null;

    if (App.userLoggedIn)
        newActView = new ActivityCreateView();

    // set up the router here - remember the router is like a controller in Rails
    //var dashboardRouter = new DashboardRouter({filterView: filterView, colorView: colorView, carView: carListView});

    // the required Backbone way to start up the router
    //Backbone.history.start({pushState: true});



})(jQuery);


