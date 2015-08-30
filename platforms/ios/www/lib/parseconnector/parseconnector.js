angular.module("parseconnector", [])
        .service('ParseConnector', function($q) {

        var apply_helper_functions = function(target) {

                target = target || object

                target.apply_defaults = function (defaults) {   
                        object = this
                        defaults = defaults || {}        
                        for(key in defaults) { object[key] = object[key]!=null ? object[key] : defaults[key] }      
                }

                target.enforce_requirements = function (fields) {
                        fields = fields || {}
                        for(key in fields) {
                                if(!this[key]) {
                                        return key+" is a required field";
                                }
                        }
                        return null;
                }

                target.forEach = function(function_to_run) {
                        object=this
                        for (key in object) {
                                if(object.hasOwnProperty(key)){
                                        function_to_run(key, object[key])                                        
                                }
                        }
                }


        }

        var __localcopy = {}

        var initialise = function(options) {                        //CONNECTS TO PARSE AND RETURNS A SHARED MODEL OBJECT

                var deferred = $q.defer()

                apply_helper_functions(options)

                options.apply_defaults({})
                if ( e = options.enforce_requirements({ app_id: true, javascript_key: true }) ) { console.log(e); return; } 

                Parse.initialize(options.app_id, options.javascript_key);    

                var create_user = function () {

                        Parse.User.logOut();

                        if(!(id=window.localStorage.getItem("key"))) {                
                                id = typeof device !== 'undefined' ? device.uuid : "x" + (Math.random()*9999);
                                window.localStorage.setItem("key", id);                
                        }

                        Parse.User.logIn(id, id, {
                                success: function(user) {
                                        console.info("signed in")
                                        __localcopy.user = user
                                        deferred.resolve(__localcopy)                                                                
                                },
                                error: function(user, error) {

                                        var user = new Parse.User();
                                        user.set("username", id);
                                        user.set("password", id);                                

                                        acl = new Parse.ACL()
                                        acl.setRoleReadAccess("Superadministrator", true)
                                        acl.setRoleReadAccess("Administrator", true)
                                        //acl.setPublicReadAccess(true);
                                        user.setACL(acl);                                

                                        user.signUp(null, {
                                                success: function(user) {
                                                        console.info("registered");
                                                        __localcopy.user = user
                                                        deferred.resolve(__localcopy)      
                                                },
                                                error: function(user, error) {
                                                        alert("A weird user error occurred!");  
                                                        alert(error.message)
                                                }
                                        });
                                }
                        });

                }()




                return deferred.promise
        }



        //MODEL DEFINITIONS
        var Model = function (options) {                            // CREATES A NEW MODEL

                // Set up options and enforce any enforced parameters
                apply_helper_functions(options)

                //var __update_deferred = $q.defer()
                //var __relationship

                options.apply_defaults({
                        //REQUIRED VALUES                
                        table: null,                            // parse table to draw data from
                        attributes: {},                         // definition of fields within the table
                        //OPTIONAL VALUES
                        class_methods: {},
                        methods: {},
                        constraints: [],                        // query constraints
                        parse_update_delay: 60,                 // how long to wait between each check for parse updates (mins) 
                        time_offset: 30,                        // used to accomodate time differences between local and parse (mainly just for unit testing)
                        delay_relationship_load: false,        // set to true when a model is being created before its relationships 
                        acl: {
                                public: {read:true, write:false},
                                read_roles: ['Superadministrator', 'Administrator'],
                                write_roles: ['Superadministrator', 'Administrator']
                        },
                        //BUILT-IN VALUES      
                        parent: __localcopy,
                        last_retrieved: null,                   // timestamp indicating when data was last recached from parse     
                        update_deferral: null,
                        update_promise: null,                   // this is filled with a promise when updating
                        relationship_update_deferral: null,
                        relationship_update_promise: null,     //
                        relationship_promises: []               //
                });
                options.attributes.id = {}
                options.attributes.last_retrieved = {}
                if ( e = options.enforce_requirements({ table: true, attributes: true }) ) { console.log(e + " when initialising model"); return }

                // Basic setup  
                var _model = this
                __localcopy[options.table]=this


                for (key in options) { _model[key] = options[key] }
                _model.data = new Array();

                for(key in _model.class_methods) {
                        _model[key]=_model.class_methods[key]
                }

                console.info("Created model which wraps table: " + _model.table)

                _model.recache = function () {

                        _model.update_deferral = $q.defer()
                        _model.update_promise = _model.update_deferral.promise

                        _model.relationship_update_deferral = $q.defer()
                        _model.relationship_update_promise = _model.relationship_update_deferral.promise

                        _model.cache_deferral = $q.defer()
                        _model.cache_promise=_model.cache_deferral.promise

                        var retrieve_cached_data = function () {                // retrieves cached data, and checks for an update
                                _model.data=[]

                                var cached_data = JSON.parse(window.localStorage.getItem(_model.table)) || { last_retrieved: null, data: [] }
                                cached_data.data.forEach(function(cached_record) {
                                        _model.new(cached_record)
                                })

                                _model.last_retrieved = cached_data.last_retrieved

                                console.info("- Retrieved "+cached_data.data.length+" cached records for "+_model.table)

                                retrieve_parse_data(cached_data.last_retrieved) 

                        }

                        var retrieve_parse_data = function (last_retrieved) {                 // retrieves parse data since the last update

                                last_retrieved = last_retrieved || (new Date("1/1/01")).toISOString()
                                var next_retrieval = (new Date(last_retrieved)).getTime() + (_model.parse_update_delay * 60 * 1000)

                                if(new Date(next_retrieval).getTime() > new Date().getTime()) {
                                        console.info("- Parse updated skipped for " + _model.table)
                                        do_final_bits();
                                        return;
                                }

                                var query = new Parse.Query(_model.table);
                                _model.constraints.forEach(function(constraint) {
                                        query=eval("query" + constraint)   
                                })                             

                                //APPLY TIME OFFSET
                                last_retrieved = new Date(last_retrieved)
                                last_retrieved=new Date(last_retrieved.setTime(last_retrieved.getTime()+(1000 * _model.time_offset)))
                                last_retrieved = last_retrieved.toISOString()

                                query.greaterThan('updatedAt', last_retrieved)                               
                                query.limit(9999)        
                                query.find().then(function(parse_recordset) {

                                        var fetch_promises=[]

                                        parse_recordset.forEach(function(parse_record) {

                                                var existing_record = _model.filterBy({id:parse_record.id})

                                                if(existing_record.length>0) {
                                                        existing_record=existing_record[0]
                                                        existing_record.parseObject=parse_record
                                                        fetch_promises.push(existing_record.fetch())
                                                } else {
                                                        fetch_promises.push(_model.new(parse_record).fetch());                                                        
                                                }

                                        })

                                        $q.all(fetch_promises).then(function () {
                                                console.info("- Retrieved "+parse_recordset.length+" Parse records for "+_model.table)
                                                _model.last_retrieved = new Date().toISOString();                                                
                                                retrieve_parse_deleted(last_retrieved)
                                        })

                                })

                        }

                        var retrieve_parse_deleted = function (last_retrieved) {

                                var query = new Parse.Query("pc_system");
                                query.greaterThan('updatedAt', last_retrieved)                             
                                query.equalTo('table', _model.table)
                                query.equalTo('action', 'deleted')
                                query.limit(9999)               
                                query.find().then(function(parse_recordset) {
                                        parse_recordset.forEach(function (parseRecord) {
                                                _model.data = _model.data.filter(function(r){
                                                        return !(r.id==parseRecord.get('target_id'))
                                                })                                                
                                        })
                                        console.info("- Removed " + parse_recordset.length + " records from " +_model.table)      
                                        do_final_bits();
                                })
                        }

                        var do_final_bits = function() {
                                _model.cache();
                        }

                        retrieve_cached_data();

                        return _model.update_promise

                }

                _model.cache = function () {

                        if(_model.cache_promise.$$state.status==1) {
                                _model.cache_deferral = $q.defer()
                                _model.cache_promise=_model.cache_deferral.promise
                        }

                        _model.update_deferral.resolve()                                               

                        $q.all(_model.relationship_promises).then(function() {

                                var data_to_cache = []
                                _model.data.forEach(function(record) {
                                        var record_to_cache = {}

                                        for(attribute in _model.attributes) {

                                                if(typeof record[attribute]==="object" && record[attribute]) {

                                                        if(!(record_to_cache[attribute] = record[attribute].id) ) {
                                                                if(!_model.attributes[attribute].link_to) {
                                                                        record_to_cache[attribute]=record[attribute]
                                                                } else if(record[attribute].data) {                                                                        
                                                                        record_to_cache[attribute]=record[attribute].data.map(function(r) { return r ? r.id : undefined })
                                                                } 
                                                        }

                                                } else {
                                                        record_to_cache[attribute] = record[attribute]
                                                }

                                        }                                

                                        data_to_cache.push(record_to_cache)
                                })


                                data_to_cache = {
                                        last_retrieved: _model.last_retrieved,
                                        data: data_to_cache
                                }

                                window.localStorage.setItem(_model.table, JSON.stringify(data_to_cache))
                                console.info("- Saved to local cache ("+ _model.table +")")
                                _model.relationship_update_deferral.resolve();             
                                _model.cache_deferral.resolve()
                        })                      

                        return _model.cache_promise

                }

                _model.new = function(preset) {

                        preset = preset || {}

                        var _newRecord = {}
                        _newRecord.parent=_model
                        _model.data.push(_newRecord)

                        _newRecord.construct = function() {

                                if (preset.cid) {                               //A PARSE OBJECT HAS BEEN PASSED
                                        _newRecord.parseObject = preset                                        
                                }

                                for(attribute in _model.attributes) {

                                        if(!preset.cid) _newRecord[attribute]=preset[attribute];

                                        if(_model.attributes[attribute].link_to) _newRecord.populateAttribute(attribute);
                                }

                                for(key in _model.methods) {
                                        _newRecord[key]=_model.methods[key]
                                }


                        }

                        _newRecord.populateAttribute = function(attribute) {            //FUNCTION WHICH PULLS IN RELATIONSHIP DATA

                                var get_target_record = function() {

                                        if(typeof _model.attributes[attribute].link_to=="string"  && _newRecord[attribute]) {

                                                _newRecord[attribute] = _newRecord[attribute].id || _newRecord[attribute]

                                                _newRecord[attribute] = _model.parent[foreign_table].filterBy({id:_newRecord[attribute]})[0] || _newRecord[attribute]

                                                field_specific_promise.resolve()                                        

                                        } else if(typeof _model.attributes[attribute].link_to=="object") {        

                                                _newRecord[attribute] = {
                                                        data: _newRecord[attribute] || [],    
                                                        add: function(subrecord) {
                                                                if(subrecord.id) {

                                                                        exists = false
                                                                        _newRecord[attribute].data.forEach(function(r) { if(r.id==subrecord.id) exists=true; })                                                                        
                                                                        if(!exists) _newRecord[attribute].data.push(subrecord);

                                                                }                                                                
                                                        },
                                                        remove: function(subrecord) {

                                                                var target
                                                                var target_index
                                                                _newRecord[attribute].data.forEach(function(existing_subrecord,index) {
                                                                        if (existing_subrecord.id==subrecord.id) {
                                                                                target=existing_subrecord
                                                                                target_index=index
                                                                        }
                                                                })

                                                                if(target_index>-1) {

                                                                        _newRecord[attribute].data.splice(target_index,1)

                                                                        var relation = _newRecord.parseObject.relation(attribute)
                                                                        var faux_object = new Parse.Object(_model.attributes[attribute].link_to[0])
                                                                        faux_object.id = subrecord.id
                                                                        relation.remove(faux_object);
                                                                }

                                                        }
                                                }

                                                if(_newRecord[attribute].data.length>0) {
                                                        _newRecord[attribute].data.forEach(function(id,index) {
                                                                _newRecord[attribute].data[index]=_model.parent[foreign_table].filterBy({id:id})[0] || _newRecord[attribute]
                                                        })

                                                        field_specific_promise.resolve()                                        


                                                } else if (_newRecord[attribute].data.key) {

                                                        _newRecord.parseObject.relation(attribute).query().find().then(function(results){
                                                                _newRecord[attribute].data = []
                                                                results.forEach(function(result) {                                                                        
                                                                        _newRecord[attribute].data.push(
                                                                                _model.parent[foreign_table].filterBy({id:result.id})[0] || results.id
                                                                        )
                                                                })
                                                                field_specific_promise.resolve()                                                                                                        
                                                        })
                                                } else {
                                                        field_specific_promise.resolve()  
                                                }

                                        } else {
                                                field_specific_promise.resolve()
                                        }

                                }

                                var field_specific_promise = $q.defer()
                                _model.relationship_promises.push(field_specific_promise.promise)

                                var foreign_table = typeof _model.attributes[attribute].link_to == "object" ? _model.attributes[attribute].link_to[0] :  _model.attributes[attribute].link_to 

                                var find_foreign_table = function(lastattempt) { 
                                        if(_model.parent[foreign_table]) {
                                                $q.all([_model.parent[foreign_table].update_promise]).then(get_target_record)           
                                        } else {
                                                if(lastattempt || !_model.delay_relationship_load) {
                                                        console.warn("- "+_model.table+".attribute has a relationship with "+foreign_table+", but this model didn't exist. You may want to add an 'delay_relationship_load' attribute to your model")
                                                        field_specific_promise.resolve()          
                                                } else {
                                                        window.setTimeout(function() { find_foreign_table(true) }, 500)           //JUST TO CATCH TABLES WHICH HAVEN'T BEEN CREATED YET.
                                                }
                                        }
                                }        
                                find_foreign_table()

                        }

                        _newRecord.save = function () {
                                var deferred = $q.defer()

                                var processValidations = function() {

                                        var error_messages = ""

                                        promises =[]

                                        for(attribute in _model.attributes) {

                                                //VALDATIONS - REQUIRED FIELD
                                                if(_model.attributes[attribute].required && !_newRecord[attribute]) error_messages=error_messages+"- a value must be provided for "+attribute+"\n";                                                        

                                                //VALIDATIONS - UNIQUE FIELD
                                                if(_model.attributes[attribute].unique) {

                                                        var query = new Parse.Query(_model.table)
                                                        query.equalTo(attribute, _newRecord[attribute])                                                       
                                                        if(_newRecord.id) query.notEqualTo("objectId", _newRecord.id);
                                                        var unique_promise = $q.defer()
                                                        unique_promise.attribute=attribute
                                                        promises.push(unique_promise.promise)
                                                        query.count().then(function(record_count) {
                                                                if(record_count>0)  error_messages+="- " + unique_promise.attribute + " must be a unique value";
                                                                unique_promise.resolve();
                                                        })

                                                }                                

                                        }

                                        $q.all(promises).then(function() {

                                                if (error_messages) {

                                                        _model.data.pop()                                                        
                                                        deferred.reject(error_messages)      

                                                } else { findParseObject (); }
                                        })
                                }

                                var findParseObject = function () {       
                                        if(_newRecord.id) {                     //IF IT'S AN EXISTING RECORD     
                                                if(_newRecord.parseObject) {            //and it has a parse record attached
                                                        generateACL()
                                                } else {                                //otherwise fetch the existing one
                                                        _newRecord.fetch(true).then(performSave)
                                                }
                                        } else {                                //OTHERWISE CREATE A RECORD
                                                _newRecord.parseObject = new (Parse.Object.extend(_model.table))
                                                generateACL();
                                        }
                                }

                                var generateACL = function() {

                                        var acl = new Parse.ACL();

                                        acl.setWriteAccess(__localcopy.user, true)
                                        acl.setReadAccess(__localcopy.user, true)

                                        acl.setPublicReadAccess(_model.acl.public.read)
                                        acl.setPublicWriteAccess(_model.acl.public.write)                                        

                                        _model.acl.read_roles.forEach(function(role) { acl.setRoleReadAccess(role,true) })
                                        _model.acl.write_roles.forEach(function(role) { acl.setRoleWriteAccess(role,true) })

                                        if(_model.table!="User") _newRecord.parseObject.setACL(acl);

                                        performSave()
                                }

                                var performSave = function() {    

                                        for (attribute in _model.attributes) {

                                                if(_model.attributes[attribute].type==="image" && _newRecord[attribute] ){

                                                        if(_newRecord[attribute].substr(0,4)!="http") {
                                                                _newRecord[attribute] = new Parse.File("myfile.jpg", { base64: _newRecord[attribute] });
                                                                _newRecord.parseObject.set(attribute, _newRecord[attribute] || null)
                                                        }

                                                } else if(typeof _model.attributes[attribute].link_to=="string" && _newRecord[attribute]) {
                                                        var refObj = new Parse.Object(_model.attributes[attribute].link_to)
                                                        refObj.id=_newRecord[attribute].id
                                                        _newRecord.parseObject.set(attribute, refObj)
                                                } else if(_newRecord[attribute] && typeof _model.attributes[attribute].link_to=="object") {

                                                        if(_newRecord[attribute].data) {

                                                                var relation_field = _newRecord.parseObject.relation(attribute)

                                                                _newRecord[attribute].data.forEach(function(subrecord) {

                                                                        var refObj =  new (Parse.Object.extend(_model.attributes[attribute].link_to[0]))
                                                                        refObj.id = subrecord.id

                                                                        relation_field.add(refObj)

                                                                })

                                                        }


                                                } else {                                                                                                                                               
                                                        _newRecord.parseObject.set(attribute, _newRecord[attribute])
                                                }
                                        }

                                        _newRecord.parseObject.save().then(function(saved_record) {

                                                _newRecord.id = saved_record.id                                                
                                                _newRecord.parseObject=saved_record

                                                for (attribute in _model.attributes) {
                                                        if(_model.attributes[attribute].type==="image" && saved_record.get(attribute)){
                                                                _newRecord[attribute]=saved_record.get(attribute).url()
                                                        }

                                                }

                                                if(_model.cache_promise.$$state.status==1) {
                                                        _model.cache_deferral = $q.defer()
                                                        _model.cache_promise=_model.cache_deferral.promise
                                                }

                                                _newRecord.last_retrieved=new Date().toISOString()
                                                _model.cache()

                                                deferred.resolve()

                                        } )

                                }

                                processValidations()

                                return deferred.promise
                        }

                        _newRecord.fetch = function(onlyParseObject) {

                                var deferred = $q.defer();

                                getObject = function() {
                                        if(!_newRecord.parseObject) {

                                                (new Parse.Query(_model.table))
                                                        .get(_newRecord.id).then(function(parseobject) {        

                                                        _newRecord.parseObject=parseobject
                                                        if(!onlyParseObject)  {
                                                                getValues();
                                                        } else {
                                                                deferred.resolve();                                                        
                                                        }

                                                })
                                        } else {
                                                if(!onlyParseObject) { 
                                                        getValues();
                                                } else {                                                        
                                                        deferred.resolve();
                                                }
                                        }
                                }

                                getValues = function() {

                                        for(attribute in _model.attributes) {   

                                                if(_model.attributes.hasOwnProperty(attribute)) {

                                                        if(_model.attributes[attribute].type=="image" && _newRecord.parseObject.get(attribute)) {
                                                                _newRecord[attribute]=_newRecord.parseObject.get(attribute).url();   
                                                        } else if(_model.attributes[attribute].link_to && _newRecord.parseObject.get(attribute) ) {
                                                                _newRecord[attribute] = _newRecord.parseObject.get(attribute) 
                                                                _newRecord.populateAttribute(attribute);                                                                
                                                        } else {
                                                                _newRecord[attribute] = _newRecord.parseObject.get(attribute)                                                                
                                                        }

                                                }
                                        }

                                        _newRecord.id = _newRecord.parseObject.id
                                        _newRecord.last_retrieved = new Date().toISOString()

                                        deferred.resolve();                                        
                                }

                                getObject();

                                return deferred.promise

                        }

                        _newRecord.delete = function () {

                                var deferred = $q.defer();

                                getObject = function () {
                                        if(!_newRecord.parseObject) {                                                               
                                                _newRecord.fetch(true).then(function() {
                                                        doDelete()
                                                })
                                        } else {
                                                doDelete()
                                        }                                                          

                                }

                                doDelete=function() {

                                        (new (Parse.Object.extend("pc_system"))).save({
                                                target_id: _newRecord.id,
                                                table: _model.table,
                                                action: 'deleted'
                                        }).then(function() {                                                          
                                                _newRecord.parseObject.destroy().then(function() { 
                                                        _model.data = _model.data.filter(function(r) {                                                                
                                                                return !(r.id==_newRecord.id) 
                                                        })         

                                                        _model.cache();
                                                        $q.when(_model.update_promise).then(deferred.resolve)
                                                })                                                                                                
                                        })                                                                                                                   
                                }

                                getObject();

                                return deferred.promise

                        }


                        _newRecord.construct();
                        return _newRecord
                }

                _model.all = function() {
                        return _model.data;
                }

                _model.filterBy = function (filter) {
                        filter=filter || {}

                        if (_model.data) {
                                return _model.data.filter(function(record) {     

                                        for(key in filter) {
                                                if(record[key]!=filter[key]) return false
                                                        }

                                        return true

                                })
                        }

                }

                _model.recache();
        }



        return {
                initialise: initialise,
                Model: Model,
        }


});