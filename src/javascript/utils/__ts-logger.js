/*
 * originally written for when we supported older versions of IE that wouldn't
 * deal with console.log.
 *
 * Now allows for saving log.
 */
Ext.define('CArABU.technicalservices.Logger',{

    saveForLater: false,
    saveLines: 100,
    logArray: [],

    constructor: function(config){
        Ext.apply(this,config);
    },

    setSaveForLater: function(saveme){
        this.saveForLater = saveme;
    },

    log: function(args){
        var timestamp = "[ " + Ext.util.Format.date(new Date(), "Y-m-d H:i:s.u") + " ]";

        var output_args = [];
        output_args = Ext.Array.push(output_args,[timestamp]);
        output_args = Ext.Array.push(output_args, Ext.Array.slice(arguments,0));

        if ( this.saveForLater ) {
            if ( !this.logArray) {
                this.logArray = [];
            }
            this.logArray.push(output_args.join(' '));

            if ( this.logArray.length > this.saveLines ) {
                this.logArray.shift();
            }
        }

        window.console && console.log.apply(console,output_args);
    },

    getLogText: function() {
        if ( ! this.logArray || this.logArray.length === 0 ) { return "-- no log --"; }
        return this.logArray.join('<br/>');
    } ,

    displayLog: function() {
        var text = this.getLogText();

        this.popup = Ext.create('Rally.ui.dialog.Dialog', {
            width      : Ext.getBody().getWidth() - 20,
            height     : Ext.getBody().getHeight() - 20,
            closable   : true,
            title      : 'Log',
            autoShow   : true,
            layout     : 'border',
            defaults   : {
                layout : 'fit',
                width  : '50%',
                border : false
            },
            items: [{
                region : 'center',
                xtype: 'container',
                html: text,
                autoScroll: true
            }]
        });
    }
});
