Ext.define("CArABU.app.PDBApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),
    defaults: { margin: 10 },
    //layout: 'border',

    integrationHeaders : {
        name : "CArABU.app.TSApp"
    },

    defultSettings:{
        timeBox:'Iteration',
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

        if(me.getSetting('timeBox') == 'Release'){
            selector_box.add({
                xtype:'rallyreleasecombobox',
                fieldLabel: 'Release:',
                width:500,
                margin:10,
                showArrows : false,
                context : this.getContext(),
                growToLongestValue : true,
                defaultToCurrentTimebox : true,
                listeners: {
                    scope: me,
                    change: function(rcb) {
                        me.release = rcb;
                        me._queryAndDisplayGrid();
                    }
                }
            });            
        }else{
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
        }


        selector_box.add({
            xtype:'rallybutton',
            itemId:'export_button',
            text: 'Download CSV',
            margin:10,

            disabled: false,
            iconAlign: 'right',
            listeners: {
                scope: me,
                click: function() {
                    me._export();
                }
            },
            margin: '10',
            scope: me
        });


    }, 

    _export: function(){
        var grid = this.down('rallygrid');
        var me = this;

        if ( !grid ) { return; }
        
        this.logger.log('_export',grid);

        var filename = Ext.String.format('program_dependency_board.csv');

        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return CArABU.technicalservices.FileUtilities._getCSVFromCustomBackedGrid(grid) } 
        ]).then({
            scope: this,
            success: function(csv){
                if (csv && csv.length > 0){
                    CArABU.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
                } else {
                    CArABU.ui.notify.Notifier.showWarning({message: 'No data to export'});
                }
                
            }
        }).always(function() { me.setLoading(false); });
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

                if(me.getSetting('timeBox') == 'Release'){
                    var release_name = me.release.rawValue;
                    filters = [{property:'Release.Name',value: release_name}];                      
                }else{
                    var iteration_name = me.iteration.rawValue;
                    filters = [{property:'Iteration.Name',value: iteration_name}];                    
                }


                me._queryUserStoryAndDependencies(model_name, field_names,filters).then({
                    scope: me,
                    success: function(us_deps) {
                        console.log('us_deps:',us_deps);
                        // _.each(us_deps,function(dep){
                        //     console.log('Feature Project S:',dep.Successor.get('Feature') && dep.Successor.get('Feature').Project.Name);
                        //         console.log('Feature Project P:',dep.Predecessor.get('Feature') && dep.Predecessor.get('Feature').Project.Name);

                        // })

                        _.each(records,function(prow){
                            columns.push({
                                dataIndex:prow.get('Name'),
                                text:prow.get('Name'),
                                align:'center',
                                renderer: function(value){
                                    return me._getLink(value);
                                },
                                exportRenderer: function(value){
                                    return me._getLink(value,true);
                                }
                            });                            
                            var row = {Name :prow.get('Name')};
                            _.each(records,function(pcol){
                                row[pcol.get('Name')] = [];
                                _.each(us_deps,function(dep){
                                    if(dep.Predecessor.get('Project').Name == row.Name && dep.Successor.get('Project').Name == pcol.get('Name') && pcol.get('Name') != row.Name){ //
                                        row[dep.Successor.get('Project').Name].push(dep.Successor.data);
                                    }
                                    if(dep.Successor.get('Feature') && dep.Successor.get('Feature').Project.Name == pcol.get('Name') && dep.Successor.get('Feature').Project.Name == row.Name){
                                        //console.log('Feature Project:',dep.Successor.get('Feature').Project.Name);
                                        row[dep.Successor.get('Feature').Project.Name] = [dep.Successor.get('Feature')];
                                    }        
                                })
                            })
                            project_matrix.push(row);
                        })

                        console.log(columns,project_matrix);


                        var store = Ext.create( 'Rally.data.custom.Store', { 
                            data: project_matrix,
                            pageSize:200
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

    _getLink: function(successors, csv){
        var link = "";
        if(csv){
            _.each(successors, function(successor){
                link += successor.FormattedID;
                if(successor.Feature) {
                    link += ' (' + successor.Feature.FormattedID +')';
                }
                link += '\n';
            });
        }else{
            _.each(successors, function(successor){
                link += Ext.create('Rally.ui.renderer.template.FormattedIDTemplate',{}).apply(successor);
                if(successor.Feature) {
                    link += ' (' + Ext.create('Rally.ui.renderer.template.FormattedIDTemplate',{}).apply(successor.Feature) +')';
                }
                link += '<BR>';
            });
        }
        return  link; 
    },

    _displayGrid: function(store,columns){
        console.log('Store >>',store);
        var me = this;
        me.down('#display_box').removeAll();

        var grid = {
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            showPagingToolbar:false,
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
                    var leaf_projects = [];
                    _.each(records, function(record){
                        if(record.get('Children').Count === 0){
                            leaf_projects.push(record);
                        }
                    })
                    deferred.resolve(leaf_projects);
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
                                        // console.log('pre,suc',pre,suc);
                                        
                                        //remove duplicates

                                        if(me.getSetting('timeBox') == 'Release'){
                                            
                                            var storyRelName = records[i] && records[i].get('Release') && records[i].get('Release').Name ? records[i].get('Release').Name : null;
                                            var preRelOName = pre && pre.get('Release') && pre.get('Release').ObjectID ? pre.get('Release').Name : null;
                                            if(storyRelName == preRelOName){
                                                pre = null;
                                            }                                            
                                        }else{

                                            var storyItrName = records[i] && records[i].get('Iteration') && records[i].get('Iteration').Name ? records[i].get('Iteration').Name : null;
                                            var preItrOName = pre && pre.get('Iteration') && pre.get('Iteration').ObjectID ? pre.get('Iteration').Name : null;
                                            if(storyItrName == preItrOName){
                                                pre = null;
                                            }
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
                fetch: ['ObjectID','FormattedID','Name','Project','ScheduleState','Release','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate', 'Successors','Owner','Blocked','BlockedReason','Notes','Feature'],
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
                fetch: ['ObjectID','FormattedID','Name','Project','ScheduleState','Release','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate', 'Successors','Owner','Blocked','BlockedReason','Notes','Feature'],
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
        var check_box_margins = '5 5 5 5';
        var timebox_value = this.getSetting('timeBox') == 'Release';

        return [{
            xtype      : 'fieldcontainer',
            fieldLabel : 'Timebox',
            defaultType: 'radiofield',
            layout: 'hbox',
            margin: check_box_margins,
            items: [
                {
                    boxLabel  : 'Iteration',
                    name      : 'timeBox',
                    inputValue: 'Iteration',
                    id        : 'radio1',
                    checked   : !timebox_value
                }, {
                    boxLabel  : 'Release',
                    name      : 'timeBox',
                    inputValue: 'Release',
                    id        : 'radio2',
                    checked   : timebox_value
                }
            ]
        },
        {
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
