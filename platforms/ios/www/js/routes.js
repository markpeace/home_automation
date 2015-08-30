app.config(function($stateProvider, $urlRouterProvider, $ionicConfigProvider) {

        $ionicConfigProvider.views.maxCache(0);

        $stateProvider.state('ui', {
                url: "/ui",
                abstract: true,
                templateUrl: "pages/ui.html"
        })


        //GENERIC STUBBS
        var stubbs=['Home']
        stubbs.forEach(function(resource){

                $stateProvider.state('ui.'+resource+"s", {
                        url: "/"+resource.toLowerCase()+"s",
                        views: {
                                'mainContent' :{
                                        templateUrl: "pages/"+resource.toLowerCase()+"/list"+ resource +"s.html",
                                        controller: 'List'+ resource +"s"
                                }
                        }
                })

                $stateProvider.state('add'+resource, {
                        url: "/"+resource.toLowerCase()+"/add",
                        templateUrl: "pages/"+resource.toLowerCase()+"/edit"+ resource +".html",
                        controller: 'Edit'+ resource
                })

                $stateProvider.state('edit'+resource, {
                        url: "/"+resource.toLowerCase()+"/:id/edit",
                        templateUrl: "pages/"+resource.toLowerCase()+"/edit"+ resource +".html",
                        controller: 'Edit'+ resource
                })

                $stateProvider.state('show'+resource, {
                        url: "/"+resource.toLowerCase()+"/:id",
                        templateUrl: "pages/"+resource.toLowerCase()+"/show"+ resource +".html",
                        controller: 'Show'+ resource
                })


        })   

        $urlRouterProvider.otherwise("/homes");
})
