Ext.define("CArABU.app.PDBApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),
    defaults: { margin: 10 },
    //layout: 'border',

    integrationHeaders : {
        name : "CArABU.app.TSApp"
    },

    items: [
        {xtype:'container',itemId:'selector_box',layout:{type:'hbox'}, margin: '10 10 50 10' },
        {xtype:'container',itemId:'display_box', margin: '50 10 10 10' }
    ],

    launch: function() {
        var me = this;
        //this.setLoading("Loading stuff...");

        this.logger.setSaveForLater(this.getSetting('saveLog'));

        me._addSelector();

    },


    _addSelector: function() {
        var me = this;
        var selector_box = this.down('#selector_box');
        selector_box.removeAll();
        selector_box.add({
            xtype:'rallyiterationcombobox',
            fieldLabel: 'Iteration:',
            width:500,
            margin:10,
            showArrows : false,
            context : this.getContext(),
            growToLongestValue : true,
            defaultToCurrentTimebox : true,
            listeners: {
                scope: me,
                change: function(icb) {
                    me.iteration = icb;
                    me._queryAndDisplayGrid();
                }
            }
        });

    }, 

    _queryAndDisplayGrid: function(){
        var me = this;
        var filters = [{
            property:'State',
            value:'Open'
        }];

        me._getProjects().then({
            success: function(records){
                //create an maxrix object array 
                //[{ Name : "Proj1" , "Proj1":[{"US1":{}}], "Proj2":[{"US2":{}},{"US3":{}}] },
                // { Name : "Proj2" , "Proj1":[{"US1":{}}], "Proj2":[{"US2":{}},{"US3":{}}] } ...]

                var project_matrix = [];
                var columns = [{
                    dataIndex: 'Name',
                    text: 'Name',
                    flex:1
                }];


                var model_name = 'HierarchicalRequirement',
                    field_names = ['ObjectID','FormattedID','Name','Project','ScheduleState','Release','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate','Predecessors','Successors','Owner','Blocked','BlockedReason','Notes','Feature'],
                    filters = [];
                var iteration_name = me.iteration.rawValue;

                filters = [{property:'Iteration.Name',value: iteration_name}];

                me._queryUserStoryAndDependencies(model_name, field_names,filters).then({
                    scope: me,
                    success: function(us_deps) {
                        console.log('us_deps:',us_deps);
                        _.each(records,function(prow){
                            columns.push({
                                            dataIndex:prow.get('Name'),
                                            text:prow.get('Name')
                                        });
                            var row = {Name :prow.get('Name')};
                            _.each(records,function(pcol){
                                _.each(us_deps,function(dep){
                                    if(dep.Predecessor.get('Project').Name == row.Name){
                                        row[dep.Successor.get('Project').Name ] = dep.Successor.get('FormattedID');
                                    }
                                })
                            })
                            project_matrix.push(row);
                        })

                        console.log(columns,project_matrix);


                        var store = Ext.create( 'Rally.data.custom.Store', { 
                            data: project_matrix 
                        });
                        me._displayGrid(store,columns);                        
                    },
                    failure: function(error_message){
                        alert(error_message);
                    }
                }).always(function() {
                    me.setLoading(false);
                });





            },
            scope:me
        });

    },

    _displayGrid: function(store,columns){
        var me = this;
        me.down('#display_box').removeAll();

        var grid = {
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            scroll: true,
            autoScroll:true,            
            columnCfgs:columns
        };

        me.down('#display_box').add(grid);

    },



    _getProjects:function(){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        var project_name = this.getContext().get('project').Name;


        filters = [
             {property:'Name',  value: project_name},
             {property:'Parent.Name',  value: project_name},
             {property:'Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Parent.Parent.Parent.Parent.Name', value: project_name},
             {property:'Parent.Parent.Parent.Parent.Parent.Parent.Parent.Parent.Parent.Name', value: project_name}
        ]
 
        filter = Rally.data.wsapi.Filter.or(filters);

       
        Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['ObjectID','Name','Parent','Children'],
            //enablePostGet: true,
            filters: filter
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });

        return deferred.promise;
    },

    _queryUserStoryAndDependencies: function(model_name, field_names, filters){
        var deferred = Ext.create('Deft.Deferred');

        var me = this;

        me._loadAStoreWithAPromise(model_name, field_names, filters).then({
            success: function(records){
                    if (records){
                        var promises = [];
                        Ext.Array.each(records,function(story){
                            promises.push(function(){
                                return me._getCollection(story); 
                            });
                        },me);

                        Deft.Chain.sequence(promises).then({
                            success: function(results){
                                me.logger.log('_after getCollection >',results);
                                var us_deps = [];

                                for (var i = 0; records && i < records.length; i++) {
                                    for (var j = 0; j < results[i][0].length || j < results[i][1].length; j++) {
                                        var pre = j < results[i][0].length ? results[i][0][j]:null;
                                        var suc = j < results[i][1].length ? results[i][1][j]:null;
                                        console.log('pre,suc',pre,suc);
                                        
                                        //remove duplicates
                                        var storyRelName = records[i] && records[i].get('Release') && records[i].get('Release').Name ? records[i].get('Release').Name : null;
                                        var preRelOName = pre && pre.get('Release') && pre.get('Release').ObjectID ? pre.get('Release').Name : null;
                                        //var sucRelOID = suc && suc.get('Release') && suc.get('Release').ObjectID ? suc.get('Release').ObjectID : null;
                                        if(storyRelName == preRelOName){
                                            pre = null;
                                        }
                                        // if(storyRelOID == sucRelOID){
                                        //     suc = null;
                                        // }
                                        if(pre != null || suc != null){


                                            if(pre != null){

                                                var us_dep = {
                                                    Predecessor: pre, 
                                                    Successor:records[i],
                                                };
                                                us_deps.push(us_dep);   
                                            }                                            
                                            if(suc != null){

                                                var us_dep = {
                                                    Predecessor:records[i],
                                                    Successor: suc,
                                                };   
                                                us_deps.push(us_dep);
                                            }
                                        }
                                    }
                                }

                                // // create custom store 
                                // var store = Ext.create('Rally.data.custom.Store', {
                                //     data: us_deps,
                                //     scope: me
                                // });
                                // deferred.resolve(store);                        
                                deferred.resolve(us_deps);                        
                            },
                            scope: me
                        });
                    } else {
                        deferred.reject('Problem loading: ');
                    }
                },
                failure: function(error_message){

                    deferred.reject(error_message);

                },
                scope: me
            }).always(function() {
                me.setLoading(false);
            });
            return deferred.promise;

    },

    _getCollection: function(record){
        me = this;
        var deferred = Ext.create('Deft.Deferred');

        var promises = [];

        promises.push(function(){
            return ; 
        });

        promises.push(function(){
            return ; 
        });                        
        
        Deft.Promise.all([me._getPredecessors(record), me._getSuccessors(record)],me).then({
            success: function(results){
                deferred.resolve(results);                      
            },
            scope: me
        });


        return deferred;
    },

    _getSuccessors: function(record){
        me = this;
        var deferred = Ext.create('Deft.Deferred');
        if(record.get('Successors').Count > 0){
            record.getCollection('Successors').load({
                fetch: ['ObjectID','FormattedID','Name','Project','ScheduleState','Release','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate', 'Successors','Owner','Blocked','BlockedReason','Notes'],
                scope: me,
                callback: function(records, operation, success) {
                    deferred.resolve(records);
                }
            });
        }else{
            deferred.resolve([]);                    
        }
        return deferred;
    },

    _getPredecessors: function(record){
        me = this;
        var deferred = Ext.create('Deft.Deferred');
        if(record.get('Predecessors').Count > 0){
            record.getCollection('Predecessors').load({
                fetch: ['ObjectID','FormattedID','Name','Project','ScheduleState','Release','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate', 'Successors','Owner','Blocked','BlockedReason','Notes'],
                scope: me,
                callback: function(records, operation, success) {
                    deferred.resolve(records);
                }
            });
        }else{
            deferred.resolve([]);                    
        }
        return deferred;
    },

    _loadAStoreWithAPromise: function(model_name, model_fields, model_filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields,
            filters: model_filters,
            limit: 'Infinity'
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },


    getSettingsFields: function() {
        var check_box_margins = '5 0 5 0';
        return [{
            name: 'saveLog',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: check_box_margins,
            boxLabel: 'Save Logging<br/><span style="color:#999999;"><i>Save last 100 lines of log for debugging.</i></span>'

        }];
    },

    getOptions: function() {
        var options = [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];

        return options;
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }

        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{
            showLog: this.getSetting('saveLog'),
            logger: this.logger
        });
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }

});
