if (typeof cordova === 'object') {
        document.addEventListener("deviceready", function() {

                angular.bootstrap(document, ["homeautomation"]);  

        },false);

} else {        
        angular.element(document).ready(function() {
                angular.bootstrap(document, ["homeautomation"]);
        });
}

app = angular.module('homeautomation', ['ionic','ionic.service.core','ionic.service.deploy','ionic.service.push','ionic.service.analytics','ngCordova',   'parseconnector']);

app
        .config(['$ionicAppProvider', function($ionicAppProvider) {

                var c = {
                        app_id: '71346764',
                        api_key: '95463f9d457387fa2e56702a8b5ac05f6100df5597eb278e',  
                }

                if(typeof cordova != 'object') { c.dev_push = true; console.log("development push mode") };

                $ionicAppProvider.identify(c);
        }])
        .run(['$ionicAnalytics', '$ionicPush', function($ionicAnalytics, $ionicPush) {
                $ionicAnalytics.register();
        }])