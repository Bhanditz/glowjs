/*! Copyright (c) 2013 Brandon Aaron (http://brandon.aaron.sh)
 * Licensed under the MIT License (LICENSE.txt).
 *
 * Version: 3.1.11
 *
 * Requires: jQuery 1.2.2+
 */

(function (factory) {
    if ( typeof define === 'function' && define.amd ) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        // Node/CommonJS style for Browserify
        module.exports = factory;
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {

    var toFix  = ['wheel', 'mousewheel', 'DOMMouseScroll', 'MozMousePixelScroll'],
        toBind = ( 'onwheel' in document || document.documentMode >= 9 ) ?
                    ['wheel'] : ['mousewheel', 'DomMouseScroll', 'MozMousePixelScroll'],
        slice  = Array.prototype.slice,
        nullLowestDeltaTimeout, lowestDelta;

    if ( $.event.fixHooks ) {
        for ( var i = toFix.length; i; ) {
            $.event.fixHooks[ toFix[--i] ] = $.event.mouseHooks;
        }
    }

    var special = $.event.special.mousewheel = {
        version: '3.1.11',

        setup: function() {
            if ( this.addEventListener ) {
                for ( var i = toBind.length; i; ) {
                    this.addEventListener( toBind[--i], handler, false );
                }
            } else {
                this.onmousewheel = handler;
            }
            // Store the line height and page height for this particular element
            $.data(this, 'mousewheel-line-height', special.getLineHeight(this));
            $.data(this, 'mousewheel-page-height', special.getPageHeight(this));
        },

        teardown: function() {
            if ( this.removeEventListener ) {
                for ( var i = toBind.length; i; ) {
                    this.removeEventListener( toBind[--i], handler, false );
                }
            } else {
                this.onmousewheel = null;
            }
            // Clean up the data we added to the element
            $.removeData(this, 'mousewheel-line-height');
            $.removeData(this, 'mousewheel-page-height');
        },

        getLineHeight: function(elem) {
            var $parent = $(elem)['offsetParent' in $.fn ? 'offsetParent' : 'parent']();
            if (!$parent.length) {
                $parent = $('body');
            }
            return parseInt($parent.css('fontSize'), 10);
        },

        getPageHeight: function(elem) {
            return $(elem).height();
        },

        settings: {
            adjustOldDeltas: true, // see shouldAdjustOldDeltas() below
            normalizeOffset: true  // calls getBoundingClientRect for each event
        }
    };

    $.fn.extend({
        mousewheel: function(fn) {
            return fn ? this.bind('mousewheel', fn) : this.trigger('mousewheel');
        },

        unmousewheel: function(fn) {
            return this.unbind('mousewheel', fn);
        }
    });


    function handler(event) {
        var orgEvent   = event || window.event,
            args       = slice.call(arguments, 1),
            delta      = 0,
            deltaX     = 0,
            deltaY     = 0,
            absDelta   = 0,
            offsetX    = 0,
            offsetY    = 0;
        event = $.event.fix(orgEvent);
        event.type = 'mousewheel';

        // Old school scrollwheel delta
        if ( 'detail'      in orgEvent ) { deltaY = orgEvent.detail * -1;      }
        if ( 'wheelDelta'  in orgEvent ) { deltaY = orgEvent.wheelDelta;       }
        if ( 'wheelDeltaY' in orgEvent ) { deltaY = orgEvent.wheelDeltaY;      }
        if ( 'wheelDeltaX' in orgEvent ) { deltaX = orgEvent.wheelDeltaX * -1; }

        // Firefox < 17 horizontal scrolling related to DOMMouseScroll event
        if ( 'axis' in orgEvent && orgEvent.axis === orgEvent.HORIZONTAL_AXIS ) {
            deltaX = deltaY * -1;
            deltaY = 0;
        }

        // Set delta to be deltaY or deltaX if deltaY is 0 for backwards compatabilitiy
        delta = deltaY === 0 ? deltaX : deltaY;

        // New school wheel delta (wheel event)
        if ( 'deltaY' in orgEvent ) {
            deltaY = orgEvent.deltaY * -1;
            delta  = deltaY;
        }
        if ( 'deltaX' in orgEvent ) {
            deltaX = orgEvent.deltaX;
            if ( deltaY === 0 ) { delta  = deltaX * -1; }
        }

        // No change actually happened, no reason to go any further
        if ( deltaY === 0 && deltaX === 0 ) { return; }

        // Need to convert lines and pages to pixels if we aren't already in pixels
        // There are three delta modes:
        //   * deltaMode 0 is by pixels, nothing to do
        //   * deltaMode 1 is by lines
        //   * deltaMode 2 is by pages
        if ( orgEvent.deltaMode === 1 ) {
            var lineHeight = $.data(this, 'mousewheel-line-height');
            delta  *= lineHeight;
            deltaY *= lineHeight;
            deltaX *= lineHeight;
        } else if ( orgEvent.deltaMode === 2 ) {
            var pageHeight = $.data(this, 'mousewheel-page-height');
            delta  *= pageHeight;
            deltaY *= pageHeight;
            deltaX *= pageHeight;
        }

        // Store lowest absolute delta to normalize the delta values
        absDelta = Math.max( Math.abs(deltaY), Math.abs(deltaX) );

        if ( !lowestDelta || absDelta < lowestDelta ) {
            lowestDelta = absDelta;

            // Adjust older deltas if necessary
            if ( shouldAdjustOldDeltas(orgEvent, absDelta) ) {
                lowestDelta /= 40;
            }
        }

        // Adjust older deltas if necessary
        if ( shouldAdjustOldDeltas(orgEvent, absDelta) ) {
            // Divide all the things by 40!
            delta  /= 40;
            deltaX /= 40;
            deltaY /= 40;
        }

        // Get a whole, normalized value for the deltas
        delta  = Math[ delta  >= 1 ? 'floor' : 'ceil' ](delta  / lowestDelta);
        deltaX = Math[ deltaX >= 1 ? 'floor' : 'ceil' ](deltaX / lowestDelta);
        deltaY = Math[ deltaY >= 1 ? 'floor' : 'ceil' ](deltaY / lowestDelta);

        // Normalise offsetX and offsetY properties
        if ( special.settings.normalizeOffset && this.getBoundingClientRect ) {
            var boundingRect = this.getBoundingClientRect();
            offsetX = event.clientX - boundingRect.left;
            offsetY = event.clientY - boundingRect.top;
        }

        // Add information to the event object
        event.deltaX = deltaX;
        event.deltaY = deltaY;
        event.deltaFactor = lowestDelta;
        event.offsetX = offsetX;
        event.offsetY = offsetY;
        // Go ahead and set deltaMode to 0 since we converted to pixels
        // Although this is a little odd since we overwrite the deltaX/Y
        // properties with normalized deltas.
        event.deltaMode = 0;

        // Add event and delta to the front of the arguments
        args.unshift(event, delta, deltaX, deltaY);

        // Clearout lowestDelta after sometime to better
        // handle multiple device types that give different
        // a different lowestDelta
        // Ex: trackpad = 3 and mouse wheel = 120
        if (nullLowestDeltaTimeout) { clearTimeout(nullLowestDeltaTimeout); }
        nullLowestDeltaTimeout = setTimeout(nullLowestDelta, 200);

        return ($.event.dispatch || $.event.handle).apply(this, args);
    }

    function nullLowestDelta() {
        lowestDelta = null;
    }

    function shouldAdjustOldDeltas(orgEvent, absDelta) {
        // If this is an older event and the delta is divisable by 120,
        // then we are assuming that the browser is treating this as an
        // older mouse wheel event and that we should divide the deltas
        // by 40 to try and get a more usable deltaFactor.
        // Side note, this actually impacts the reported scroll distance
        // in older browsers and can cause scrolling to be slower than native.
        // Turn this off by setting $.event.special.mousewheel.settings.adjustOldDeltas to false.
        return special.settings.adjustOldDeltas && orgEvent.type === 'mousewheel' && absDelta % 120 === 0;
    }

}));;/* Javascript plotting library for jQuery, v. 0.7.
 *
 * Released under the MIT license by IOLA, December 2007.
 *
 */
(function(b){b.color={};b.color.make=function(d,e,g,f){var c={};c.r=d||0;c.g=e||0;c.b=g||0;c.a=f!=null?f:1;c.add=function(h,j){for(var k=0;k<h.length;++k){c[h.charAt(k)]+=j}return c.normalize()};c.scale=function(h,j){for(var k=0;k<h.length;++k){c[h.charAt(k)]*=j}return c.normalize()};c.toString=function(){if(c.a>=1){return"rgb("+[c.r,c.g,c.b].join(",")+")"}else{return"rgba("+[c.r,c.g,c.b,c.a].join(",")+")"}};c.normalize=function(){function h(k,j,l){return j<k?k:(j>l?l:j)}c.r=h(0,parseInt(c.r),255);c.g=h(0,parseInt(c.g),255);c.b=h(0,parseInt(c.b),255);c.a=h(0,c.a,1);return c};c.clone=function(){return b.color.make(c.r,c.b,c.g,c.a)};return c.normalize()};b.color.extract=function(d,e){var c;do{c=d.css(e).toLowerCase();if(c!=""&&c!="transparent"){break}d=d.parent()}while(!b.nodeName(d.get(0),"body"));if(c=="rgba(0, 0, 0, 0)"){c="transparent"}return b.color.parse(c)};b.color.parse=function(c){var d,f=b.color.make;if(d=/rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(c)){return f(parseInt(d[1],10),parseInt(d[2],10),parseInt(d[3],10))}if(d=/rgba\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(c)){return f(parseInt(d[1],10),parseInt(d[2],10),parseInt(d[3],10),parseFloat(d[4]))}if(d=/rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(c)){return f(parseFloat(d[1])*2.55,parseFloat(d[2])*2.55,parseFloat(d[3])*2.55)}if(d=/rgba\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(c)){return f(parseFloat(d[1])*2.55,parseFloat(d[2])*2.55,parseFloat(d[3])*2.55,parseFloat(d[4]))}if(d=/#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(c)){return f(parseInt(d[1],16),parseInt(d[2],16),parseInt(d[3],16))}if(d=/#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(c)){return f(parseInt(d[1]+d[1],16),parseInt(d[2]+d[2],16),parseInt(d[3]+d[3],16))}var e=b.trim(c).toLowerCase();if(e=="transparent"){return f(255,255,255,0)}else{d=a[e]||[0,0,0];return f(d[0],d[1],d[2])}};var a={aqua:[0,255,255],azure:[240,255,255],beige:[245,245,220],black:[0,0,0],blue:[0,0,255],brown:[165,42,42],cyan:[0,255,255],darkblue:[0,0,139],darkcyan:[0,139,139],darkgrey:[169,169,169],darkgreen:[0,100,0],darkkhaki:[189,183,107],darkmagenta:[139,0,139],darkolivegreen:[85,107,47],darkorange:[255,140,0],darkorchid:[153,50,204],darkred:[139,0,0],darksalmon:[233,150,122],darkviolet:[148,0,211],fuchsia:[255,0,255],gold:[255,215,0],green:[0,128,0],indigo:[75,0,130],khaki:[240,230,140],lightblue:[173,216,230],lightcyan:[224,255,255],lightgreen:[144,238,144],lightgrey:[211,211,211],lightpink:[255,182,193],lightyellow:[255,255,224],lime:[0,255,0],magenta:[255,0,255],maroon:[128,0,0],navy:[0,0,128],olive:[128,128,0],orange:[255,165,0],pink:[255,192,203],purple:[128,0,128],violet:[128,0,128],red:[255,0,0],silver:[192,192,192],white:[255,255,255],yellow:[255,255,0]}})(jQuery);(function(c){function b(av,ai,J,af){var Q=[],O={colors:["#edc240","#afd8f8","#cb4b4b","#4da74d","#9440ed"],legend:{show:true,noColumns:1,labelFormatter:null,labelBoxBorderColor:"#ccc",container:null,position:"ne",margin:5,backgroundColor:null,backgroundOpacity:0.85},xaxis:{show:null,position:"bottom",mode:null,color:null,tickColor:null,transform:null,inverseTransform:null,min:null,max:null,autoscaleMargin:null,ticks:null,tickFormatter:null,labelWidth:null,labelHeight:null,reserveSpace:null,tickLength:null,alignTicksWithAxis:null,tickDecimals:null,tickSize:null,minTickSize:null,monthNames:null,timeformat:null,twelveHourClock:false},yaxis:{autoscaleMargin:0.02,position:"left"},xaxes:[],yaxes:[],series:{points:{show:false,radius:3,lineWidth:2,fill:true,fillColor:"#ffffff",symbol:"circle"},lines:{lineWidth:2,fill:false,fillColor:null,steps:false},bars:{show:false,lineWidth:2,barWidth:1,fill:true,fillColor:null,align:"left",horizontal:false},shadowSize:3},grid:{show:true,aboveData:false,color:"#545454",backgroundColor:null,borderColor:null,tickColor:null,labelMargin:5,axisMargin:8,borderWidth:2,minBorderMargin:null,markings:null,markingsColor:"#f4f4f4",markingsLineWidth:2,clickable:false,hoverable:false,autoHighlight:true,mouseActiveRadius:10},hooks:{}},az=null,ad=null,y=null,H=null,A=null,p=[],aw=[],q={left:0,right:0,top:0,bottom:0},G=0,I=0,h=0,w=0,ak={processOptions:[],processRawData:[],processDatapoints:[],drawSeries:[],draw:[],bindEvents:[],drawOverlay:[],shutdown:[]},aq=this;aq.setData=aj;aq.setupGrid=t;aq.draw=W;aq.getPlaceholder=function(){return av};aq.getCanvas=function(){return az};aq.getPlotOffset=function(){return q};aq.width=function(){return h};aq.height=function(){return w};aq.offset=function(){var aB=y.offset();aB.left+=q.left;aB.top+=q.top;return aB};aq.getData=function(){return Q};aq.getAxes=function(){var aC={},aB;c.each(p.concat(aw),function(aD,aE){if(aE){aC[aE.direction+(aE.n!=1?aE.n:"")+"axis"]=aE}});return aC};aq.getXAxes=function(){return p};aq.getYAxes=function(){return aw};aq.c2p=C;aq.p2c=ar;aq.getOptions=function(){return O};aq.highlight=x;aq.unhighlight=T;aq.triggerRedrawOverlay=f;aq.pointOffset=function(aB){return{left:parseInt(p[aA(aB,"x")-1].p2c(+aB.x)+q.left),top:parseInt(aw[aA(aB,"y")-1].p2c(+aB.y)+q.top)}};aq.shutdown=ag;aq.resize=function(){B();g(az);g(ad)};aq.hooks=ak;F(aq);Z(J);X();aj(ai);t();W();ah();function an(aD,aB){aB=[aq].concat(aB);for(var aC=0;aC<aD.length;++aC){aD[aC].apply(this,aB)}}function F(){for(var aB=0;aB<af.length;++aB){var aC=af[aB];aC.init(aq);if(aC.options){c.extend(true,O,aC.options)}}}function Z(aC){var aB;c.extend(true,O,aC);if(O.xaxis.color==null){O.xaxis.color=O.grid.color}if(O.yaxis.color==null){O.yaxis.color=O.grid.color}if(O.xaxis.tickColor==null){O.xaxis.tickColor=O.grid.tickColor}if(O.yaxis.tickColor==null){O.yaxis.tickColor=O.grid.tickColor}if(O.grid.borderColor==null){O.grid.borderColor=O.grid.color}if(O.grid.tickColor==null){O.grid.tickColor=c.color.parse(O.grid.color).scale("a",0.22).toString()}for(aB=0;aB<Math.max(1,O.xaxes.length);++aB){O.xaxes[aB]=c.extend(true,{},O.xaxis,O.xaxes[aB])}for(aB=0;aB<Math.max(1,O.yaxes.length);++aB){O.yaxes[aB]=c.extend(true,{},O.yaxis,O.yaxes[aB])}if(O.xaxis.noTicks&&O.xaxis.ticks==null){O.xaxis.ticks=O.xaxis.noTicks}if(O.yaxis.noTicks&&O.yaxis.ticks==null){O.yaxis.ticks=O.yaxis.noTicks}if(O.x2axis){O.xaxes[1]=c.extend(true,{},O.xaxis,O.x2axis);O.xaxes[1].position="top"}if(O.y2axis){O.yaxes[1]=c.extend(true,{},O.yaxis,O.y2axis);O.yaxes[1].position="right"}if(O.grid.coloredAreas){O.grid.markings=O.grid.coloredAreas}if(O.grid.coloredAreasColor){O.grid.markingsColor=O.grid.coloredAreasColor}if(O.lines){c.extend(true,O.series.lines,O.lines)}if(O.points){c.extend(true,O.series.points,O.points)}if(O.bars){c.extend(true,O.series.bars,O.bars)}if(O.shadowSize!=null){O.series.shadowSize=O.shadowSize}for(aB=0;aB<O.xaxes.length;++aB){V(p,aB+1).options=O.xaxes[aB]}for(aB=0;aB<O.yaxes.length;++aB){V(aw,aB+1).options=O.yaxes[aB]}for(var aD in ak){if(O.hooks[aD]&&O.hooks[aD].length){ak[aD]=ak[aD].concat(O.hooks[aD])}}an(ak.processOptions,[O])}function aj(aB){Q=Y(aB);ax();z()}function Y(aE){var aC=[];for(var aB=0;aB<aE.length;++aB){var aD=c.extend(true,{},O.series);if(aE[aB].data!=null){aD.data=aE[aB].data;delete aE[aB].data;c.extend(true,aD,aE[aB]);aE[aB].data=aD.data}else{aD.data=aE[aB]}aC.push(aD)}return aC}function aA(aC,aD){var aB=aC[aD+"axis"];if(typeof aB=="object"){aB=aB.n}if(typeof aB!="number"){aB=1}return aB}function m(){return c.grep(p.concat(aw),function(aB){return aB})}function C(aE){var aC={},aB,aD;for(aB=0;aB<p.length;++aB){aD=p[aB];if(aD&&aD.used){aC["x"+aD.n]=aD.c2p(aE.left)}}for(aB=0;aB<aw.length;++aB){aD=aw[aB];if(aD&&aD.used){aC["y"+aD.n]=aD.c2p(aE.top)}}if(aC.x1!==undefined){aC.x=aC.x1}if(aC.y1!==undefined){aC.y=aC.y1}return aC}function ar(aF){var aD={},aC,aE,aB;for(aC=0;aC<p.length;++aC){aE=p[aC];if(aE&&aE.used){aB="x"+aE.n;if(aF[aB]==null&&aE.n==1){aB="x"}if(aF[aB]!=null){aD.left=aE.p2c(aF[aB]);break}}}for(aC=0;aC<aw.length;++aC){aE=aw[aC];if(aE&&aE.used){aB="y"+aE.n;if(aF[aB]==null&&aE.n==1){aB="y"}if(aF[aB]!=null){aD.top=aE.p2c(aF[aB]);break}}}return aD}function V(aC,aB){if(!aC[aB-1]){aC[aB-1]={n:aB,direction:aC==p?"x":"y",options:c.extend(true,{},aC==p?O.xaxis:O.yaxis)}}return aC[aB-1]}function ax(){var aG;var aM=Q.length,aB=[],aE=[];for(aG=0;aG<Q.length;++aG){var aJ=Q[aG].color;if(aJ!=null){--aM;if(typeof aJ=="number"){aE.push(aJ)}else{aB.push(c.color.parse(Q[aG].color))}}}for(aG=0;aG<aE.length;++aG){aM=Math.max(aM,aE[aG]+1)}var aC=[],aF=0;aG=0;while(aC.length<aM){var aI;if(O.colors.length==aG){aI=c.color.make(100,100,100)}else{aI=c.color.parse(O.colors[aG])}var aD=aF%2==1?-1:1;aI.scale("rgb",1+aD*Math.ceil(aF/2)*0.2);aC.push(aI);++aG;if(aG>=O.colors.length){aG=0;++aF}}var aH=0,aN;for(aG=0;aG<Q.length;++aG){aN=Q[aG];if(aN.color==null){aN.color=aC[aH].toString();++aH}else{if(typeof aN.color=="number"){aN.color=aC[aN.color].toString()}}if(aN.lines.show==null){var aL,aK=true;for(aL in aN){if(aN[aL]&&aN[aL].show){aK=false;break}}if(aK){aN.lines.show=true}}aN.xaxis=V(p,aA(aN,"x"));aN.yaxis=V(aw,aA(aN,"y"))}}function z(){var aO=Number.POSITIVE_INFINITY,aI=Number.NEGATIVE_INFINITY,aB=Number.MAX_VALUE,aU,aS,aR,aN,aD,aJ,aT,aP,aH,aG,aC,a0,aX,aL;function aF(a3,a2,a1){if(a2<a3.datamin&&a2!=-aB){a3.datamin=a2}if(a1>a3.datamax&&a1!=aB){a3.datamax=a1}}c.each(m(),function(a1,a2){a2.datamin=aO;a2.datamax=aI;a2.used=false});for(aU=0;aU<Q.length;++aU){aJ=Q[aU];aJ.datapoints={points:[]};an(ak.processRawData,[aJ,aJ.data,aJ.datapoints])}for(aU=0;aU<Q.length;++aU){aJ=Q[aU];var aZ=aJ.data,aW=aJ.datapoints.format;if(!aW){aW=[];aW.push({x:true,number:true,required:true});aW.push({y:true,number:true,required:true});if(aJ.bars.show||(aJ.lines.show&&aJ.lines.fill)){aW.push({y:true,number:true,required:false,defaultValue:0});if(aJ.bars.horizontal){delete aW[aW.length-1].y;aW[aW.length-1].x=true}}aJ.datapoints.format=aW}if(aJ.datapoints.pointsize!=null){continue}aJ.datapoints.pointsize=aW.length;aP=aJ.datapoints.pointsize;aT=aJ.datapoints.points;insertSteps=aJ.lines.show&&aJ.lines.steps;aJ.xaxis.used=aJ.yaxis.used=true;for(aS=aR=0;aS<aZ.length;++aS,aR+=aP){aL=aZ[aS];var aE=aL==null;if(!aE){for(aN=0;aN<aP;++aN){a0=aL[aN];aX=aW[aN];if(aX){if(aX.number&&a0!=null){a0=+a0;if(isNaN(a0)){a0=null}else{if(a0==Infinity){a0=aB}else{if(a0==-Infinity){a0=-aB}}}}if(a0==null){if(aX.required){aE=true}if(aX.defaultValue!=null){a0=aX.defaultValue}}}aT[aR+aN]=a0}}if(aE){for(aN=0;aN<aP;++aN){a0=aT[aR+aN];if(a0!=null){aX=aW[aN];if(aX.x){aF(aJ.xaxis,a0,a0)}if(aX.y){aF(aJ.yaxis,a0,a0)}}aT[aR+aN]=null}}else{if(insertSteps&&aR>0&&aT[aR-aP]!=null&&aT[aR-aP]!=aT[aR]&&aT[aR-aP+1]!=aT[aR+1]){for(aN=0;aN<aP;++aN){aT[aR+aP+aN]=aT[aR+aN]}aT[aR+1]=aT[aR-aP+1];aR+=aP}}}}for(aU=0;aU<Q.length;++aU){aJ=Q[aU];an(ak.processDatapoints,[aJ,aJ.datapoints])}for(aU=0;aU<Q.length;++aU){aJ=Q[aU];aT=aJ.datapoints.points,aP=aJ.datapoints.pointsize;var aK=aO,aQ=aO,aM=aI,aV=aI;for(aS=0;aS<aT.length;aS+=aP){if(aT[aS]==null){continue}for(aN=0;aN<aP;++aN){a0=aT[aS+aN];aX=aW[aN];if(!aX||a0==aB||a0==-aB){continue}if(aX.x){if(a0<aK){aK=a0}if(a0>aM){aM=a0}}if(aX.y){if(a0<aQ){aQ=a0}if(a0>aV){aV=a0}}}}if(aJ.bars.show){var aY=aJ.bars.align=="left"?0:-aJ.bars.barWidth/2;if(aJ.bars.horizontal){aQ+=aY;aV+=aY+aJ.bars.barWidth}else{aK+=aY;aM+=aY+aJ.bars.barWidth}}aF(aJ.xaxis,aK,aM);aF(aJ.yaxis,aQ,aV)}c.each(m(),function(a1,a2){if(a2.datamin==aO){a2.datamin=null}if(a2.datamax==aI){a2.datamax=null}})}function j(aB,aC){var aD=document.createElement("canvas");aD.className=aC;aD.width=G;aD.height=I;if(!aB){c(aD).css({position:"absolute",left:0,top:0})}c(aD).appendTo(av);if(!aD.getContext){aD=window.G_vmlCanvasManager.initElement(aD)}aD.getContext("2d").save();return aD}function B(){G=av.width();I=av.height();if(G<=0||I<=0){throw"Invalid dimensions for plot, width = "+G+", height = "+I}}function g(aC){if(aC.width!=G){aC.width=G}if(aC.height!=I){aC.height=I}var aB=aC.getContext("2d");aB.restore();aB.save()}function X(){var aC,aB=av.children("canvas.base"),aD=av.children("canvas.overlay");if(aB.length==0||aD==0){av.html("");av.css({padding:0});if(av.css("position")=="static"){av.css("position","relative")}B();az=j(true,"base");ad=j(false,"overlay");aC=false}else{az=aB.get(0);ad=aD.get(0);aC=true}H=az.getContext("2d");A=ad.getContext("2d");y=c([ad,az]);if(aC){av.data("plot").shutdown();aq.resize();A.clearRect(0,0,G,I);y.unbind();av.children().not([az,ad]).remove()}av.data("plot",aq)}function ah(){if(O.grid.hoverable){y.mousemove(aa);y.mouseleave(l)}if(O.grid.clickable){y.click(R)}an(ak.bindEvents,[y])}function ag(){if(M){clearTimeout(M)}y.unbind("mousemove",aa);y.unbind("mouseleave",l);y.unbind("click",R);an(ak.shutdown,[y])}function r(aG){function aC(aH){return aH}var aF,aB,aD=aG.options.transform||aC,aE=aG.options.inverseTransform;if(aG.direction=="x"){aF=aG.scale=h/Math.abs(aD(aG.max)-aD(aG.min));aB=Math.min(aD(aG.max),aD(aG.min))}else{aF=aG.scale=w/Math.abs(aD(aG.max)-aD(aG.min));aF=-aF;aB=Math.max(aD(aG.max),aD(aG.min))}if(aD==aC){aG.p2c=function(aH){return(aH-aB)*aF}}else{aG.p2c=function(aH){return(aD(aH)-aB)*aF}}if(!aE){aG.c2p=function(aH){return aB+aH/aF}}else{aG.c2p=function(aH){return aE(aB+aH/aF)}}}function L(aD){var aB=aD.options,aF,aJ=aD.ticks||[],aI=[],aE,aK=aB.labelWidth,aG=aB.labelHeight,aC;function aH(aM,aL){return c('<div style="position:absolute;top:-10000px;'+aL+'font-size:smaller"><div class="'+aD.direction+"Axis "+aD.direction+aD.n+'Axis">'+aM.join("")+"</div></div>").appendTo(av)}if(aD.direction=="x"){if(aK==null){aK=Math.floor(G/(aJ.length>0?aJ.length:1))}if(aG==null){aI=[];for(aF=0;aF<aJ.length;++aF){aE=aJ[aF].label;if(aE){aI.push('<div class="tickLabel" style="float:left;width:'+aK+'px">'+aE+"</div>")}}if(aI.length>0){aI.push('<div style="clear:left"></div>');aC=aH(aI,"width:10000px;");aG=aC.height();aC.remove()}}}else{if(aK==null||aG==null){for(aF=0;aF<aJ.length;++aF){aE=aJ[aF].label;if(aE){aI.push('<div class="tickLabel">'+aE+"</div>")}}if(aI.length>0){aC=aH(aI,"");if(aK==null){aK=aC.children().width()}if(aG==null){aG=aC.find("div.tickLabel").height()}aC.remove()}}}if(aK==null){aK=0}if(aG==null){aG=0}aD.labelWidth=aK;aD.labelHeight=aG}function au(aD){var aC=aD.labelWidth,aL=aD.labelHeight,aH=aD.options.position,aF=aD.options.tickLength,aG=O.grid.axisMargin,aJ=O.grid.labelMargin,aK=aD.direction=="x"?p:aw,aE;var aB=c.grep(aK,function(aN){return aN&&aN.options.position==aH&&aN.reserveSpace});if(c.inArray(aD,aB)==aB.length-1){aG=0}if(aF==null){aF="full"}var aI=c.grep(aK,function(aN){return aN&&aN.reserveSpace});var aM=c.inArray(aD,aI)==0;if(!aM&&aF=="full"){aF=5}if(!isNaN(+aF)){aJ+=+aF}if(aD.direction=="x"){aL+=aJ;if(aH=="bottom"){q.bottom+=aL+aG;aD.box={top:I-q.bottom,height:aL}}else{aD.box={top:q.top+aG,height:aL};q.top+=aL+aG}}else{aC+=aJ;if(aH=="left"){aD.box={left:q.left+aG,width:aC};q.left+=aC+aG}else{q.right+=aC+aG;aD.box={left:G-q.right,width:aC}}}aD.position=aH;aD.tickLength=aF;aD.box.padding=aJ;aD.innermost=aM}function U(aB){if(aB.direction=="x"){aB.box.left=q.left;aB.box.width=h}else{aB.box.top=q.top;aB.box.height=w}}function t(){var aC,aE=m();c.each(aE,function(aF,aG){aG.show=aG.options.show;if(aG.show==null){aG.show=aG.used}aG.reserveSpace=aG.show||aG.options.reserveSpace;n(aG)});allocatedAxes=c.grep(aE,function(aF){return aF.reserveSpace});q.left=q.right=q.top=q.bottom=0;if(O.grid.show){c.each(allocatedAxes,function(aF,aG){S(aG);P(aG);ap(aG,aG.ticks);L(aG)});for(aC=allocatedAxes.length-1;aC>=0;--aC){au(allocatedAxes[aC])}var aD=O.grid.minBorderMargin;if(aD==null){aD=0;for(aC=0;aC<Q.length;++aC){aD=Math.max(aD,Q[aC].points.radius+Q[aC].points.lineWidth/2)}}for(var aB in q){q[aB]+=O.grid.borderWidth;q[aB]=Math.max(aD,q[aB])}}h=G-q.left-q.right;w=I-q.bottom-q.top;c.each(aE,function(aF,aG){r(aG)});if(O.grid.show){c.each(allocatedAxes,function(aF,aG){U(aG)});k()}o()}function n(aE){var aF=aE.options,aD=+(aF.min!=null?aF.min:aE.datamin),aB=+(aF.max!=null?aF.max:aE.datamax),aH=aB-aD;if(aH==0){var aC=aB==0?1:0.01;if(aF.min==null){aD-=aC}if(aF.max==null||aF.min!=null){aB+=aC}}else{var aG=aF.autoscaleMargin;if(aG!=null){if(aF.min==null){aD-=aH*aG;if(aD<0&&aE.datamin!=null&&aE.datamin>=0){aD=0}}if(aF.max==null){aB+=aH*aG;if(aB>0&&aE.datamax!=null&&aE.datamax<=0){aB=0}}}}aE.min=aD;aE.max=aB}function S(aG){var aM=aG.options;var aH;if(typeof aM.ticks=="number"&&aM.ticks>0){aH=aM.ticks}else{aH=0.3*Math.sqrt(aG.direction=="x"?G:I)}var aT=(aG.max-aG.min)/aH,aO,aB,aN,aR,aS,aQ,aI;if(aM.mode=="time"){var aJ={second:1000,minute:60*1000,hour:60*60*1000,day:24*60*60*1000,month:30*24*60*60*1000,year:365.2425*24*60*60*1000};var aK=[[1,"second"],[2,"second"],[5,"second"],[10,"second"],[30,"second"],[1,"minute"],[2,"minute"],[5,"minute"],[10,"minute"],[30,"minute"],[1,"hour"],[2,"hour"],[4,"hour"],[8,"hour"],[12,"hour"],[1,"day"],[2,"day"],[3,"day"],[0.25,"month"],[0.5,"month"],[1,"month"],[2,"month"],[3,"month"],[6,"month"],[1,"year"]];var aC=0;if(aM.minTickSize!=null){if(typeof aM.tickSize=="number"){aC=aM.tickSize}else{aC=aM.minTickSize[0]*aJ[aM.minTickSize[1]]}}for(var aS=0;aS<aK.length-1;++aS){if(aT<(aK[aS][0]*aJ[aK[aS][1]]+aK[aS+1][0]*aJ[aK[aS+1][1]])/2&&aK[aS][0]*aJ[aK[aS][1]]>=aC){break}}aO=aK[aS][0];aN=aK[aS][1];if(aN=="year"){aQ=Math.pow(10,Math.floor(Math.log(aT/aJ.year)/Math.LN10));aI=(aT/aJ.year)/aQ;if(aI<1.5){aO=1}else{if(aI<3){aO=2}else{if(aI<7.5){aO=5}else{aO=10}}}aO*=aQ}aG.tickSize=aM.tickSize||[aO,aN];aB=function(aX){var a2=[],a0=aX.tickSize[0],a3=aX.tickSize[1],a1=new Date(aX.min);var aW=a0*aJ[a3];if(a3=="second"){a1.setUTCSeconds(a(a1.getUTCSeconds(),a0))}if(a3=="minute"){a1.setUTCMinutes(a(a1.getUTCMinutes(),a0))}if(a3=="hour"){a1.setUTCHours(a(a1.getUTCHours(),a0))}if(a3=="month"){a1.setUTCMonth(a(a1.getUTCMonth(),a0))}if(a3=="year"){a1.setUTCFullYear(a(a1.getUTCFullYear(),a0))}a1.setUTCMilliseconds(0);if(aW>=aJ.minute){a1.setUTCSeconds(0)}if(aW>=aJ.hour){a1.setUTCMinutes(0)}if(aW>=aJ.day){a1.setUTCHours(0)}if(aW>=aJ.day*4){a1.setUTCDate(1)}if(aW>=aJ.year){a1.setUTCMonth(0)}var a5=0,a4=Number.NaN,aY;do{aY=a4;a4=a1.getTime();a2.push(a4);if(a3=="month"){if(a0<1){a1.setUTCDate(1);var aV=a1.getTime();a1.setUTCMonth(a1.getUTCMonth()+1);var aZ=a1.getTime();a1.setTime(a4+a5*aJ.hour+(aZ-aV)*a0);a5=a1.getUTCHours();a1.setUTCHours(0)}else{a1.setUTCMonth(a1.getUTCMonth()+a0)}}else{if(a3=="year"){a1.setUTCFullYear(a1.getUTCFullYear()+a0)}else{a1.setTime(a4+aW)}}}while(a4<aX.max&&a4!=aY);return a2};aR=function(aV,aY){var a0=new Date(aV);if(aM.timeformat!=null){return c.plot.formatDate(a0,aM.timeformat,aM.monthNames)}var aW=aY.tickSize[0]*aJ[aY.tickSize[1]];var aX=aY.max-aY.min;var aZ=(aM.twelveHourClock)?" %p":"";if(aW<aJ.minute){fmt="%h:%M:%S"+aZ}else{if(aW<aJ.day){if(aX<2*aJ.day){fmt="%h:%M"+aZ}else{fmt="%b %d %h:%M"+aZ}}else{if(aW<aJ.month){fmt="%b %d"}else{if(aW<aJ.year){if(aX<aJ.year){fmt="%b"}else{fmt="%b %y"}}else{fmt="%y"}}}}return c.plot.formatDate(a0,fmt,aM.monthNames)}}else{var aU=aM.tickDecimals;var aP=-Math.floor(Math.log(aT)/Math.LN10);if(aU!=null&&aP>aU){aP=aU}aQ=Math.pow(10,-aP);aI=aT/aQ;if(aI<1.5){aO=1}else{if(aI<3){aO=2;if(aI>2.25&&(aU==null||aP+1<=aU)){aO=2.5;++aP}}else{if(aI<7.5){aO=5}else{aO=10}}}aO*=aQ;if(aM.minTickSize!=null&&aO<aM.minTickSize){aO=aM.minTickSize}aG.tickDecimals=Math.max(0,aU!=null?aU:aP);aG.tickSize=aM.tickSize||aO;aB=function(aX){var aZ=[];var a0=a(aX.min,aX.tickSize),aW=0,aV=Number.NaN,aY;do{aY=aV;aV=a0+aW*aX.tickSize;aZ.push(aV);++aW}while(aV<aX.max&&aV!=aY);return aZ};aR=function(aV,aW){return aV.toFixed(aW.tickDecimals)}}if(aM.alignTicksWithAxis!=null){var aF=(aG.direction=="x"?p:aw)[aM.alignTicksWithAxis-1];if(aF&&aF.used&&aF!=aG){var aL=aB(aG);if(aL.length>0){if(aM.min==null){aG.min=Math.min(aG.min,aL[0])}if(aM.max==null&&aL.length>1){aG.max=Math.max(aG.max,aL[aL.length-1])}}aB=function(aX){var aY=[],aV,aW;for(aW=0;aW<aF.ticks.length;++aW){aV=(aF.ticks[aW].v-aF.min)/(aF.max-aF.min);aV=aX.min+aV*(aX.max-aX.min);aY.push(aV)}return aY};if(aG.mode!="time"&&aM.tickDecimals==null){var aE=Math.max(0,-Math.floor(Math.log(aT)/Math.LN10)+1),aD=aB(aG);if(!(aD.length>1&&/\..*0$/.test((aD[1]-aD[0]).toFixed(aE)))){aG.tickDecimals=aE}}}}aG.tickGenerator=aB;if(c.isFunction(aM.tickFormatter)){aG.tickFormatter=function(aV,aW){return""+aM.tickFormatter(aV,aW)}}else{aG.tickFormatter=aR}}function P(aF){var aH=aF.options.ticks,aG=[];if(aH==null||(typeof aH=="number"&&aH>0)){aG=aF.tickGenerator(aF)}else{if(aH){if(c.isFunction(aH)){aG=aH({min:aF.min,max:aF.max})}else{aG=aH}}}var aE,aB;aF.ticks=[];for(aE=0;aE<aG.length;++aE){var aC=null;var aD=aG[aE];if(typeof aD=="object"){aB=+aD[0];if(aD.length>1){aC=aD[1]}}else{aB=+aD}if(aC==null){aC=aF.tickFormatter(aB,aF)}if(!isNaN(aB)){aF.ticks.push({v:aB,label:aC})}}}function ap(aB,aC){if(aB.options.autoscaleMargin&&aC.length>0){if(aB.options.min==null){aB.min=Math.min(aB.min,aC[0].v)}if(aB.options.max==null&&aC.length>1){aB.max=Math.max(aB.max,aC[aC.length-1].v)}}}function W(){H.clearRect(0,0,G,I);var aC=O.grid;if(aC.show&&aC.backgroundColor){N()}if(aC.show&&!aC.aboveData){ac()}for(var aB=0;aB<Q.length;++aB){an(ak.drawSeries,[H,Q[aB]]);d(Q[aB])}an(ak.draw,[H]);if(aC.show&&aC.aboveData){ac()}}function D(aB,aI){var aE,aH,aG,aD,aF=m();for(i=0;i<aF.length;++i){aE=aF[i];if(aE.direction==aI){aD=aI+aE.n+"axis";if(!aB[aD]&&aE.n==1){aD=aI+"axis"}if(aB[aD]){aH=aB[aD].from;aG=aB[aD].to;break}}}if(!aB[aD]){aE=aI=="x"?p[0]:aw[0];aH=aB[aI+"1"];aG=aB[aI+"2"]}if(aH!=null&&aG!=null&&aH>aG){var aC=aH;aH=aG;aG=aC}return{from:aH,to:aG,axis:aE}}function N(){H.save();H.translate(q.left,q.top);H.fillStyle=am(O.grid.backgroundColor,w,0,"rgba(255, 255, 255, 0)");H.fillRect(0,0,h,w);H.restore()}function ac(){var aF;H.save();H.translate(q.left,q.top);var aH=O.grid.markings;if(aH){if(c.isFunction(aH)){var aK=aq.getAxes();aK.xmin=aK.xaxis.min;aK.xmax=aK.xaxis.max;aK.ymin=aK.yaxis.min;aK.ymax=aK.yaxis.max;aH=aH(aK)}for(aF=0;aF<aH.length;++aF){var aD=aH[aF],aC=D(aD,"x"),aI=D(aD,"y");if(aC.from==null){aC.from=aC.axis.min}if(aC.to==null){aC.to=aC.axis.max}if(aI.from==null){aI.from=aI.axis.min}if(aI.to==null){aI.to=aI.axis.max}if(aC.to<aC.axis.min||aC.from>aC.axis.max||aI.to<aI.axis.min||aI.from>aI.axis.max){continue}aC.from=Math.max(aC.from,aC.axis.min);aC.to=Math.min(aC.to,aC.axis.max);aI.from=Math.max(aI.from,aI.axis.min);aI.to=Math.min(aI.to,aI.axis.max);if(aC.from==aC.to&&aI.from==aI.to){continue}aC.from=aC.axis.p2c(aC.from);aC.to=aC.axis.p2c(aC.to);aI.from=aI.axis.p2c(aI.from);aI.to=aI.axis.p2c(aI.to);if(aC.from==aC.to||aI.from==aI.to){H.beginPath();H.strokeStyle=aD.color||O.grid.markingsColor;H.lineWidth=aD.lineWidth||O.grid.markingsLineWidth;H.moveTo(aC.from,aI.from);H.lineTo(aC.to,aI.to);H.stroke()}else{H.fillStyle=aD.color||O.grid.markingsColor;H.fillRect(aC.from,aI.to,aC.to-aC.from,aI.from-aI.to)}}}var aK=m(),aM=O.grid.borderWidth;for(var aE=0;aE<aK.length;++aE){var aB=aK[aE],aG=aB.box,aQ=aB.tickLength,aN,aL,aP,aJ;if(!aB.show||aB.ticks.length==0){continue}H.strokeStyle=aB.options.tickColor||c.color.parse(aB.options.color).scale("a",0.22).toString();H.lineWidth=1;if(aB.direction=="x"){aN=0;if(aQ=="full"){aL=(aB.position=="top"?0:w)}else{aL=aG.top-q.top+(aB.position=="top"?aG.height:0)}}else{aL=0;if(aQ=="full"){aN=(aB.position=="left"?0:h)}else{aN=aG.left-q.left+(aB.position=="left"?aG.width:0)}}if(!aB.innermost){H.beginPath();aP=aJ=0;if(aB.direction=="x"){aP=h}else{aJ=w}if(H.lineWidth==1){aN=Math.floor(aN)+0.5;aL=Math.floor(aL)+0.5}H.moveTo(aN,aL);H.lineTo(aN+aP,aL+aJ);H.stroke()}H.beginPath();for(aF=0;aF<aB.ticks.length;++aF){var aO=aB.ticks[aF].v;aP=aJ=0;if(aO<aB.min||aO>aB.max||(aQ=="full"&&aM>0&&(aO==aB.min||aO==aB.max))){continue}if(aB.direction=="x"){aN=aB.p2c(aO);aJ=aQ=="full"?-w:aQ;if(aB.position=="top"){aJ=-aJ}}else{aL=aB.p2c(aO);aP=aQ=="full"?-h:aQ;if(aB.position=="left"){aP=-aP}}if(H.lineWidth==1){if(aB.direction=="x"){aN=Math.floor(aN)+0.5}else{aL=Math.floor(aL)+0.5}}H.moveTo(aN,aL);H.lineTo(aN+aP,aL+aJ)}H.stroke()}if(aM){H.lineWidth=aM;H.strokeStyle=O.grid.borderColor;H.strokeRect(-aM/2,-aM/2,h+aM,w+aM)}H.restore()}function k(){av.find(".tickLabels").remove();var aG=['<div class="tickLabels" style="font-size:smaller">'];var aJ=m();for(var aD=0;aD<aJ.length;++aD){var aC=aJ[aD],aF=aC.box;if(!aC.show){continue}aG.push('<div class="'+aC.direction+"Axis "+aC.direction+aC.n+'Axis" style="color:'+aC.options.color+'">');for(var aE=0;aE<aC.ticks.length;++aE){var aH=aC.ticks[aE];if(!aH.label||aH.v<aC.min||aH.v>aC.max){continue}var aK={},aI;if(aC.direction=="x"){aI="center";aK.left=Math.round(q.left+aC.p2c(aH.v)-aC.labelWidth/2);if(aC.position=="bottom"){aK.top=aF.top+aF.padding}else{aK.bottom=I-(aF.top+aF.height-aF.padding)}}else{aK.top=Math.round(q.top+aC.p2c(aH.v)-aC.labelHeight/2);if(aC.position=="left"){aK.right=G-(aF.left+aF.width-aF.padding);aI="right"}else{aK.left=aF.left+aF.padding;aI="left"}}aK.width=aC.labelWidth;var aB=["position:absolute","text-align:"+aI];for(var aL in aK){aB.push(aL+":"+aK[aL]+"px")}aG.push('<div class="tickLabel" style="'+aB.join(";")+'">'+aH.label+"</div>")}aG.push("</div>")}aG.push("</div>");av.append(aG.join(""))}function d(aB){if(aB.lines.show){at(aB)}if(aB.bars.show){e(aB)}if(aB.points.show){ao(aB)}}function at(aE){function aD(aP,aQ,aI,aU,aT){var aV=aP.points,aJ=aP.pointsize,aN=null,aM=null;H.beginPath();for(var aO=aJ;aO<aV.length;aO+=aJ){var aL=aV[aO-aJ],aS=aV[aO-aJ+1],aK=aV[aO],aR=aV[aO+1];if(aL==null||aK==null){continue}if(aS<=aR&&aS<aT.min){if(aR<aT.min){continue}aL=(aT.min-aS)/(aR-aS)*(aK-aL)+aL;aS=aT.min}else{if(aR<=aS&&aR<aT.min){if(aS<aT.min){continue}aK=(aT.min-aS)/(aR-aS)*(aK-aL)+aL;aR=aT.min}}if(aS>=aR&&aS>aT.max){if(aR>aT.max){continue}aL=(aT.max-aS)/(aR-aS)*(aK-aL)+aL;aS=aT.max}else{if(aR>=aS&&aR>aT.max){if(aS>aT.max){continue}aK=(aT.max-aS)/(aR-aS)*(aK-aL)+aL;aR=aT.max}}if(aL<=aK&&aL<aU.min){if(aK<aU.min){continue}aS=(aU.min-aL)/(aK-aL)*(aR-aS)+aS;aL=aU.min}else{if(aK<=aL&&aK<aU.min){if(aL<aU.min){continue}aR=(aU.min-aL)/(aK-aL)*(aR-aS)+aS;aK=aU.min}}if(aL>=aK&&aL>aU.max){if(aK>aU.max){continue}aS=(aU.max-aL)/(aK-aL)*(aR-aS)+aS;aL=aU.max}else{if(aK>=aL&&aK>aU.max){if(aL>aU.max){continue}aR=(aU.max-aL)/(aK-aL)*(aR-aS)+aS;aK=aU.max}}if(aL!=aN||aS!=aM){H.moveTo(aU.p2c(aL)+aQ,aT.p2c(aS)+aI)}aN=aK;aM=aR;H.lineTo(aU.p2c(aK)+aQ,aT.p2c(aR)+aI)}H.stroke()}function aF(aI,aQ,aP){var aW=aI.points,aV=aI.pointsize,aN=Math.min(Math.max(0,aP.min),aP.max),aX=0,aU,aT=false,aM=1,aL=0,aR=0;while(true){if(aV>0&&aX>aW.length+aV){break}aX+=aV;var aZ=aW[aX-aV],aK=aW[aX-aV+aM],aY=aW[aX],aJ=aW[aX+aM];if(aT){if(aV>0&&aZ!=null&&aY==null){aR=aX;aV=-aV;aM=2;continue}if(aV<0&&aX==aL+aV){H.fill();aT=false;aV=-aV;aM=1;aX=aL=aR+aV;continue}}if(aZ==null||aY==null){continue}if(aZ<=aY&&aZ<aQ.min){if(aY<aQ.min){continue}aK=(aQ.min-aZ)/(aY-aZ)*(aJ-aK)+aK;aZ=aQ.min}else{if(aY<=aZ&&aY<aQ.min){if(aZ<aQ.min){continue}aJ=(aQ.min-aZ)/(aY-aZ)*(aJ-aK)+aK;aY=aQ.min}}if(aZ>=aY&&aZ>aQ.max){if(aY>aQ.max){continue}aK=(aQ.max-aZ)/(aY-aZ)*(aJ-aK)+aK;aZ=aQ.max}else{if(aY>=aZ&&aY>aQ.max){if(aZ>aQ.max){continue}aJ=(aQ.max-aZ)/(aY-aZ)*(aJ-aK)+aK;aY=aQ.max}}if(!aT){H.beginPath();H.moveTo(aQ.p2c(aZ),aP.p2c(aN));aT=true}if(aK>=aP.max&&aJ>=aP.max){H.lineTo(aQ.p2c(aZ),aP.p2c(aP.max));H.lineTo(aQ.p2c(aY),aP.p2c(aP.max));continue}else{if(aK<=aP.min&&aJ<=aP.min){H.lineTo(aQ.p2c(aZ),aP.p2c(aP.min));H.lineTo(aQ.p2c(aY),aP.p2c(aP.min));continue}}var aO=aZ,aS=aY;if(aK<=aJ&&aK<aP.min&&aJ>=aP.min){aZ=(aP.min-aK)/(aJ-aK)*(aY-aZ)+aZ;aK=aP.min}else{if(aJ<=aK&&aJ<aP.min&&aK>=aP.min){aY=(aP.min-aK)/(aJ-aK)*(aY-aZ)+aZ;aJ=aP.min}}if(aK>=aJ&&aK>aP.max&&aJ<=aP.max){aZ=(aP.max-aK)/(aJ-aK)*(aY-aZ)+aZ;aK=aP.max}else{if(aJ>=aK&&aJ>aP.max&&aK<=aP.max){aY=(aP.max-aK)/(aJ-aK)*(aY-aZ)+aZ;aJ=aP.max}}if(aZ!=aO){H.lineTo(aQ.p2c(aO),aP.p2c(aK))}H.lineTo(aQ.p2c(aZ),aP.p2c(aK));H.lineTo(aQ.p2c(aY),aP.p2c(aJ));if(aY!=aS){H.lineTo(aQ.p2c(aY),aP.p2c(aJ));H.lineTo(aQ.p2c(aS),aP.p2c(aJ))}}}H.save();H.translate(q.left,q.top);H.lineJoin="round";var aG=aE.lines.lineWidth,aB=aE.shadowSize;if(aG>0&&aB>0){H.lineWidth=aB;H.strokeStyle="rgba(0,0,0,0.1)";var aH=Math.PI/18;aD(aE.datapoints,Math.sin(aH)*(aG/2+aB/2),Math.cos(aH)*(aG/2+aB/2),aE.xaxis,aE.yaxis);H.lineWidth=aB/2;aD(aE.datapoints,Math.sin(aH)*(aG/2+aB/4),Math.cos(aH)*(aG/2+aB/4),aE.xaxis,aE.yaxis)}H.lineWidth=aG;H.strokeStyle=aE.color;var aC=ae(aE.lines,aE.color,0,w);if(aC){H.fillStyle=aC;aF(aE.datapoints,aE.xaxis,aE.yaxis)}if(aG>0){aD(aE.datapoints,0,0,aE.xaxis,aE.yaxis)}H.restore()}function ao(aE){function aH(aN,aM,aU,aK,aS,aT,aQ,aJ){var aR=aN.points,aI=aN.pointsize;for(var aL=0;aL<aR.length;aL+=aI){var aP=aR[aL],aO=aR[aL+1];if(aP==null||aP<aT.min||aP>aT.max||aO<aQ.min||aO>aQ.max){continue}H.beginPath();aP=aT.p2c(aP);aO=aQ.p2c(aO)+aK;if(aJ=="circle"){H.arc(aP,aO,aM,0,aS?Math.PI:Math.PI*2,false)}else{aJ(H,aP,aO,aM,aS)}H.closePath();if(aU){H.fillStyle=aU;H.fill()}H.stroke()}}H.save();H.translate(q.left,q.top);var aG=aE.points.lineWidth,aC=aE.shadowSize,aB=aE.points.radius,aF=aE.points.symbol;if(aG>0&&aC>0){var aD=aC/2;H.lineWidth=aD;H.strokeStyle="rgba(0,0,0,0.1)";aH(aE.datapoints,aB,null,aD+aD/2,true,aE.xaxis,aE.yaxis,aF);H.strokeStyle="rgba(0,0,0,0.2)";aH(aE.datapoints,aB,null,aD/2,true,aE.xaxis,aE.yaxis,aF)}H.lineWidth=aG;H.strokeStyle=aE.color;aH(aE.datapoints,aB,ae(aE.points,aE.color),0,false,aE.xaxis,aE.yaxis,aF);H.restore()}function E(aN,aM,aV,aI,aQ,aF,aD,aL,aK,aU,aR,aC){var aE,aT,aJ,aP,aG,aB,aO,aH,aS;if(aR){aH=aB=aO=true;aG=false;aE=aV;aT=aN;aP=aM+aI;aJ=aM+aQ;if(aT<aE){aS=aT;aT=aE;aE=aS;aG=true;aB=false}}else{aG=aB=aO=true;aH=false;aE=aN+aI;aT=aN+aQ;aJ=aV;aP=aM;if(aP<aJ){aS=aP;aP=aJ;aJ=aS;aH=true;aO=false}}if(aT<aL.min||aE>aL.max||aP<aK.min||aJ>aK.max){return}if(aE<aL.min){aE=aL.min;aG=false}if(aT>aL.max){aT=aL.max;aB=false}if(aJ<aK.min){aJ=aK.min;aH=false}if(aP>aK.max){aP=aK.max;aO=false}aE=aL.p2c(aE);aJ=aK.p2c(aJ);aT=aL.p2c(aT);aP=aK.p2c(aP);if(aD){aU.beginPath();aU.moveTo(aE,aJ);aU.lineTo(aE,aP);aU.lineTo(aT,aP);aU.lineTo(aT,aJ);aU.fillStyle=aD(aJ,aP);aU.fill()}if(aC>0&&(aG||aB||aO||aH)){aU.beginPath();aU.moveTo(aE,aJ+aF);if(aG){aU.lineTo(aE,aP+aF)}else{aU.moveTo(aE,aP+aF)}if(aO){aU.lineTo(aT,aP+aF)}else{aU.moveTo(aT,aP+aF)}if(aB){aU.lineTo(aT,aJ+aF)}else{aU.moveTo(aT,aJ+aF)}if(aH){aU.lineTo(aE,aJ+aF)}else{aU.moveTo(aE,aJ+aF)}aU.stroke()}}function e(aD){function aC(aJ,aI,aL,aG,aK,aN,aM){var aO=aJ.points,aF=aJ.pointsize;for(var aH=0;aH<aO.length;aH+=aF){if(aO[aH]==null){continue}E(aO[aH],aO[aH+1],aO[aH+2],aI,aL,aG,aK,aN,aM,H,aD.bars.horizontal,aD.bars.lineWidth)}}H.save();H.translate(q.left,q.top);H.lineWidth=aD.bars.lineWidth;H.strokeStyle=aD.color;var aB=aD.bars.align=="left"?0:-aD.bars.barWidth/2;var aE=aD.bars.fill?function(aF,aG){return ae(aD.bars,aD.color,aF,aG)}:null;aC(aD.datapoints,aB,aB+aD.bars.barWidth,0,aE,aD.xaxis,aD.yaxis);H.restore()}function ae(aD,aB,aC,aF){var aE=aD.fill;if(!aE){return null}if(aD.fillColor){return am(aD.fillColor,aC,aF,aB)}var aG=c.color.parse(aB);aG.a=typeof aE=="number"?aE:0.4;aG.normalize();return aG.toString()}function o(){av.find(".legend").remove();if(!O.legend.show){return}var aH=[],aF=false,aN=O.legend.labelFormatter,aM,aJ;for(var aE=0;aE<Q.length;++aE){aM=Q[aE];aJ=aM.label;if(!aJ){continue}if(aE%O.legend.noColumns==0){if(aF){aH.push("</tr>")}aH.push("<tr>");aF=true}if(aN){aJ=aN(aJ,aM)}aH.push('<td class="legendColorBox"><div style="border:1px solid '+O.legend.labelBoxBorderColor+';padding:1px"><div style="width:4px;height:0;border:5px solid '+aM.color+';overflow:hidden"></div></div></td><td class="legendLabel">'+aJ+"</td>")}if(aF){aH.push("</tr>")}if(aH.length==0){return}var aL='<table style="font-size:smaller;color:'+O.grid.color+'">'+aH.join("")+"</table>";if(O.legend.container!=null){c(O.legend.container).html(aL)}else{var aI="",aC=O.legend.position,aD=O.legend.margin;if(aD[0]==null){aD=[aD,aD]}if(aC.charAt(0)=="n"){aI+="top:"+(aD[1]+q.top)+"px;"}else{if(aC.charAt(0)=="s"){aI+="bottom:"+(aD[1]+q.bottom)+"px;"}}if(aC.charAt(1)=="e"){aI+="right:"+(aD[0]+q.right)+"px;"}else{if(aC.charAt(1)=="w"){aI+="left:"+(aD[0]+q.left)+"px;"}}var aK=c('<div class="legend">'+aL.replace('style="','style="position:absolute;'+aI+";")+"</div>").appendTo(av);if(O.legend.backgroundOpacity!=0){var aG=O.legend.backgroundColor;if(aG==null){aG=O.grid.backgroundColor;if(aG&&typeof aG=="string"){aG=c.color.parse(aG)}else{aG=c.color.extract(aK,"background-color")}aG.a=1;aG=aG.toString()}var aB=aK.children();c('<div style="position:absolute;width:'+aB.width()+"px;height:"+aB.height()+"px;"+aI+"background-color:"+aG+';"> </div>').prependTo(aK).css("opacity",O.legend.backgroundOpacity)}}}var ab=[],M=null;function K(aI,aG,aD){var aO=O.grid.mouseActiveRadius,a0=aO*aO+1,aY=null,aR=false,aW,aU;for(aW=Q.length-1;aW>=0;--aW){if(!aD(Q[aW])){continue}var aP=Q[aW],aH=aP.xaxis,aF=aP.yaxis,aV=aP.datapoints.points,aT=aP.datapoints.pointsize,aQ=aH.c2p(aI),aN=aF.c2p(aG),aC=aO/aH.scale,aB=aO/aF.scale;if(aH.options.inverseTransform){aC=Number.MAX_VALUE}if(aF.options.inverseTransform){aB=Number.MAX_VALUE}if(aP.lines.show||aP.points.show){for(aU=0;aU<aV.length;aU+=aT){var aK=aV[aU],aJ=aV[aU+1];if(aK==null){continue}if(aK-aQ>aC||aK-aQ<-aC||aJ-aN>aB||aJ-aN<-aB){continue}var aM=Math.abs(aH.p2c(aK)-aI),aL=Math.abs(aF.p2c(aJ)-aG),aS=aM*aM+aL*aL;if(aS<a0){a0=aS;aY=[aW,aU/aT]}}}if(aP.bars.show&&!aY){var aE=aP.bars.align=="left"?0:-aP.bars.barWidth/2,aX=aE+aP.bars.barWidth;for(aU=0;aU<aV.length;aU+=aT){var aK=aV[aU],aJ=aV[aU+1],aZ=aV[aU+2];if(aK==null){continue}if(Q[aW].bars.horizontal?(aQ<=Math.max(aZ,aK)&&aQ>=Math.min(aZ,aK)&&aN>=aJ+aE&&aN<=aJ+aX):(aQ>=aK+aE&&aQ<=aK+aX&&aN>=Math.min(aZ,aJ)&&aN<=Math.max(aZ,aJ))){aY=[aW,aU/aT]}}}}if(aY){aW=aY[0];aU=aY[1];aT=Q[aW].datapoints.pointsize;return{datapoint:Q[aW].datapoints.points.slice(aU*aT,(aU+1)*aT),dataIndex:aU,series:Q[aW],seriesIndex:aW}}return null}function aa(aB){if(O.grid.hoverable){u("plothover",aB,function(aC){return aC.hoverable!=false})}}function l(aB){if(O.grid.hoverable){u("plothover",aB,function(aC){return false})}}function R(aB){u("plotclick",aB,function(aC){return aC.clickable!=false})}function u(aC,aB,aD){var aE=y.offset(),aH=aB.pageX-aE.left-q.left,aF=aB.pageY-aE.top-q.top,aJ=C({left:aH,top:aF});aJ.pageX=aB.pageX;aJ.pageY=aB.pageY;var aK=K(aH,aF,aD);if(aK){aK.pageX=parseInt(aK.series.xaxis.p2c(aK.datapoint[0])+aE.left+q.left);aK.pageY=parseInt(aK.series.yaxis.p2c(aK.datapoint[1])+aE.top+q.top)}if(O.grid.autoHighlight){for(var aG=0;aG<ab.length;++aG){var aI=ab[aG];if(aI.auto==aC&&!(aK&&aI.series==aK.series&&aI.point[0]==aK.datapoint[0]&&aI.point[1]==aK.datapoint[1])){T(aI.series,aI.point)}}if(aK){x(aK.series,aK.datapoint,aC)}}av.trigger(aC,[aJ,aK])}function f(){if(!M){M=setTimeout(s,30)}}function s(){M=null;A.save();A.clearRect(0,0,G,I);A.translate(q.left,q.top);var aC,aB;for(aC=0;aC<ab.length;++aC){aB=ab[aC];if(aB.series.bars.show){v(aB.series,aB.point)}else{ay(aB.series,aB.point)}}A.restore();an(ak.drawOverlay,[A])}function x(aD,aB,aF){if(typeof aD=="number"){aD=Q[aD]}if(typeof aB=="number"){var aE=aD.datapoints.pointsize;aB=aD.datapoints.points.slice(aE*aB,aE*(aB+1))}var aC=al(aD,aB);if(aC==-1){ab.push({series:aD,point:aB,auto:aF});f()}else{if(!aF){ab[aC].auto=false}}}function T(aD,aB){if(aD==null&&aB==null){ab=[];f()}if(typeof aD=="number"){aD=Q[aD]}if(typeof aB=="number"){aB=aD.data[aB]}var aC=al(aD,aB);if(aC!=-1){ab.splice(aC,1);f()}}function al(aD,aE){for(var aB=0;aB<ab.length;++aB){var aC=ab[aB];if(aC.series==aD&&aC.point[0]==aE[0]&&aC.point[1]==aE[1]){return aB}}return -1}function ay(aE,aD){var aC=aD[0],aI=aD[1],aH=aE.xaxis,aG=aE.yaxis;if(aC<aH.min||aC>aH.max||aI<aG.min||aI>aG.max){return}var aF=aE.points.radius+aE.points.lineWidth/2;A.lineWidth=aF;A.strokeStyle=c.color.parse(aE.color).scale("a",0.5).toString();var aB=1.5*aF,aC=aH.p2c(aC),aI=aG.p2c(aI);A.beginPath();if(aE.points.symbol=="circle"){A.arc(aC,aI,aB,0,2*Math.PI,false)}else{aE.points.symbol(A,aC,aI,aB,false)}A.closePath();A.stroke()}function v(aE,aB){A.lineWidth=aE.bars.lineWidth;A.strokeStyle=c.color.parse(aE.color).scale("a",0.5).toString();var aD=c.color.parse(aE.color).scale("a",0.5).toString();var aC=aE.bars.align=="left"?0:-aE.bars.barWidth/2;E(aB[0],aB[1],aB[2]||0,aC,aC+aE.bars.barWidth,0,function(){return aD},aE.xaxis,aE.yaxis,A,aE.bars.horizontal,aE.bars.lineWidth)}function am(aJ,aB,aH,aC){if(typeof aJ=="string"){return aJ}else{var aI=H.createLinearGradient(0,aH,0,aB);for(var aE=0,aD=aJ.colors.length;aE<aD;++aE){var aF=aJ.colors[aE];if(typeof aF!="string"){var aG=c.color.parse(aC);if(aF.brightness!=null){aG=aG.scale("rgb",aF.brightness)}if(aF.opacity!=null){aG.a*=aF.opacity}aF=aG.toString()}aI.addColorStop(aE/(aD-1),aF)}return aI}}}c.plot=function(g,e,d){var f=new b(c(g),e,d,c.plot.plugins);return f};c.plot.version="0.7";c.plot.plugins=[];c.plot.formatDate=function(l,f,h){var o=function(d){d=""+d;return d.length==1?"0"+d:d};var e=[];var p=false,j=false;var n=l.getUTCHours();var k=n<12;if(h==null){h=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]}if(f.search(/%p|%P/)!=-1){if(n>12){n=n-12}else{if(n==0){n=12}}}for(var g=0;g<f.length;++g){var m=f.charAt(g);if(p){switch(m){case"h":m=""+n;break;case"H":m=o(n);break;case"M":m=o(l.getUTCMinutes());break;case"S":m=o(l.getUTCSeconds());break;case"d":m=""+l.getUTCDate();break;case"m":m=""+(l.getUTCMonth()+1);break;case"y":m=""+l.getUTCFullYear();break;case"b":m=""+h[l.getUTCMonth()];break;case"p":m=(k)?("am"):("pm");break;case"P":m=(k)?("AM"):("PM");break;case"0":m="";j=true;break}if(m&&j){m=o(m);j=false}e.push(m);if(!j){p=false}}else{if(m=="%"){p=true}else{e.push(m)}}}return e.join("")};function a(e,d){return d*Math.floor(e/d)}})(jQuery);;/*
Flot plugin for showing crosshairs, thin lines, when the mouse hovers
over the plot.

  crosshair: {
    mode: null or "x" or "y" or "xy"
    color: color
    lineWidth: number
  }

Set the mode to one of "x", "y" or "xy". The "x" mode enables a
vertical crosshair that lets you trace the values on the x axis, "y"
enables a horizontal crosshair and "xy" enables them both. "color" is
the color of the crosshair (default is "rgba(170, 0, 0, 0.80)"),
"lineWidth" is the width of the drawn lines (default is 1).

The plugin also adds four public methods:

  - setCrosshair(pos)

    Set the position of the crosshair. Note that this is cleared if
    the user moves the mouse. "pos" is in coordinates of the plot and
    should be on the form { x: xpos, y: ypos } (you can use x2/x3/...
    if you're using multiple axes), which is coincidentally the same
    format as what you get from a "plothover" event. If "pos" is null,
    the crosshair is cleared.

  - clearCrosshair()

    Clear the crosshair.

  - lockCrosshair(pos)

    Cause the crosshair to lock to the current location, no longer
    updating if the user moves the mouse. Optionally supply a position
    (passed on to setCrosshair()) to move it to.

    Example usage:
      var myFlot = $.plot( $("#graph"), ..., { crosshair: { mode: "x" } } };
      $("#graph").bind("plothover", function (evt, position, item) {
        if (item) {
          // Lock the crosshair to the data point being hovered
          myFlot.lockCrosshair({ x: item.datapoint[0], y: item.datapoint[1] });
        }
        else {
          // Return normal crosshair operation
          myFlot.unlockCrosshair();
        }
      });

  - unlockCrosshair()

    Free the crosshair to move again after locking it.
*/

(function ($) {
    var options = {
        crosshair: {
            mode: null, // one of null, "x", "y" or "xy",
            color: "rgba(0, 0, 0, 0.5)",
            lineWidth: 1
        }
    };
    
    function log10(val) {
        return Math.log(val)/Math.LN10;
    }
    function format_number(val,n) { // n is number of digits to display (don't count . and -)
        if (n === undefined) n = 3;
        if (val === 0) return 0;
        if (n <= 0) throw new Error("Significant figures must be greater than zero.");
        n = Math.floor(n+0.5);
        var sign = (val >= 0) ? "" : "-";
        val = Math.abs(val);
        var before = Math.floor(log10(val))+1; // +3 for 100; -2 for 0.001
        if (before > n) {
            val = val.toPrecision(n);
            return sign+val.replace('+','');
        } else if (before < 0) {
             var mantissa = val*pow(10,abs(before)+1);
             before -= 1;
             return sign+mantissa.toFixed(n-1)+'e'+before;
        } else { // digits before . are > 0 and < n
            return sign+val.toFixed(n-before);
        }
    }
    
    function init(plot) {
        // position of crosshair in pixels
        var crosshair = { x: -1, y: -1, locked: false };

        plot.setCrosshair = function setCrosshair(pos) {
            if (!pos)
                crosshair.x = -1;
            else {
                var o = plot.p2c(pos);
                crosshair.x = Math.max(0, Math.min(o.left, plot.width()));
                crosshair.y = Math.max(0, Math.min(o.top, plot.height()));
            }
            
            plot.triggerRedrawOverlay();
        };
        
        plot.clearCrosshair = plot.setCrosshair; // passes null for pos
        
        plot.lockCrosshair = function lockCrosshair(pos) {
            if (pos)
                plot.setCrosshair(pos);
            crosshair.locked = true;
        }

        plot.unlockCrosshair = function unlockCrosshair() {
            crosshair.locked = false;
        }

        function onMouseOut(e) {
            if (crosshair.locked)
                return;

            if (crosshair.x != -1) {
                crosshair.x = -1;
                plot.triggerRedrawOverlay();
            }
        }

        function onMouseMove(e) {
            if (crosshair.locked)
                return;
                
            if (plot.getSelection && plot.getSelection()) {
                crosshair.x = -1; // hide the crosshair while selecting
                return;
            }
                
            var offset = plot.offset();
            crosshair.x = Math.max(0, Math.min(e.pageX - offset.left, plot.width()));
            crosshair.y = Math.max(0, Math.min(e.pageY - offset.top, plot.height()));
            plot.triggerRedrawOverlay();
        }
        
        plot.hooks.bindEvents.push(function (plot, eventHolder) {
            if (!plot.getOptions().crosshair.mode)
                return;

            eventHolder.mouseout(onMouseOut);
            eventHolder.mousemove(onMouseMove);
        });

        plot.hooks.drawOverlay.push(function (plot, ctx) {
            var c = plot.getOptions().crosshair;
            if (!c.mode)
                return;

            var plotOffset = plot.getPlotOffset();
            
            ctx.save();
            ctx.translate(plotOffset.left, plotOffset.top);

            if (crosshair.x != -1) {
                var pos = plot.c2p({left:crosshair.x, top:crosshair.y});
                text = format_number(pos.x,3)+','+format_number(pos.y,3);
                var fontheight = 13;
                ctx.fillStyle = c.color;
                ctx.font = fontheight+'px Verdana';
                var twidth = ctx.measureText(text).width;
                var dx = 0, dy = 0;
                if (crosshair.y < (fontheight+3)) {
                    twidth += 14;
                    dy = fontheight; // move below the horizontal crosshair
                    if (crosshair.x <= plot.width() - (twidth+5)) dx += 14; // move out of the way of the cursor
                } else {
                    dy = -5;
                }
                if (crosshair.x > plot.width() - (twidth+5)) {
                    ctx.textAlign = 'right';
                    dx += -3;
                } else {
                    ctx.textAlign = 'left';
                    dx += 3;
                }
                ctx.fillText(text, crosshair.x+dx, crosshair.y+dy)
            
                ctx.strokeStyle = c.color;
                ctx.lineWidth = c.lineWidth;
                ctx.lineJoin = "round";

                ctx.beginPath();
                if (c.mode.indexOf("x") != -1) {
                    ctx.moveTo(crosshair.x, 0);
                    ctx.lineTo(crosshair.x, plot.height());
                }
                if (c.mode.indexOf("y") != -1) {
                    ctx.moveTo(0, crosshair.y);
                    ctx.lineTo(plot.width(), crosshair.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        });

        plot.hooks.shutdown.push(function (plot, eventHolder) {
            eventHolder.unbind("mouseout", onMouseOut);
            eventHolder.unbind("mousemove", onMouseMove);
        });
    }
    
    $.plot.plugins.push({
        init: init,
        options: options,
        name: 'crosshair_GS',
        version: '1.0'
    });
})(jQuery);
;/* 
* glMatrix.js - High performance matrix and vector operations for WebGL
* version 0.9.6
*/

/*
* Copyright (c) 2011 Brandon Jones
*
* This software is provided 'as-is', without any express or implied
* warranty. In no event will the authors be held liable for any damages
* arising from the use of this software.
*
* Permission is granted to anyone to use this software for any purpose,
* including commercial applications, and to alter it and redistribute it
* freely, subject to the following restrictions:
*
*    1. The origin of this software must not be misrepresented; you must not
*    claim that you wrote the original software. If you use this software
*    in a product, an acknowledgment in the product documentation would be
*    appreciated but is not required.
*
*    2. Altered source versions must be plainly marked as such, and must not
*    be misrepresented as being the original software.
*
*    3. This notice may not be removed or altered from any source
*    distribution.
*/

// Fallback for systems that don't support WebGL
if (typeof Float32Array != 'undefined') {
    glMatrixArrayType = Float32Array;
} else if (typeof WebGLFloatArray != 'undefined') {
    glMatrixArrayType = WebGLFloatArray; // This is officially deprecated and should dissapear in future revisions.
} else {
    glMatrixArrayType = Array;
}

/*
* vec3 - 3 Dimensional Vector
*/
var vec3 = {};

/*
* vec3.create
* Creates a new instance of a vec3 using the default array type
* Any javascript array containing at least 3 numeric elements can serve as a vec3
*
* Params:
* vec - Optional, vec3 containing values to initialize with
*
* Returns:
* New vec3
*/
vec3.create = function (vec) {
    var dest = new glMatrixArrayType(3);

    if (vec) {
        dest[0] = vec[0];
        dest[1] = vec[1];
        dest[2] = vec[2];
    }

    return dest;
};

/*
* vec3.set
* Copies the values of one vec3 to another
*
* Params:
* vec - vec3 containing values to copy
* dest - vec3 receiving copied values
*
* Returns:
* dest
*/
vec3.set = function (vec, dest) {
    dest[0] = vec[0];
    dest[1] = vec[1];
    dest[2] = vec[2];

    return dest;
};

/*
* vec3.add
* Performs a vector addition
*
* Params:
* vec - vec3, first operand
* vec2 - vec3, second operand
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.add = function (vec, vec2, dest) {
    if (!dest || vec == dest) {
        vec[0] += vec2[0];
        vec[1] += vec2[1];
        vec[2] += vec2[2];
        return vec;
    }

    dest[0] = vec[0] + vec2[0];
    dest[1] = vec[1] + vec2[1];
    dest[2] = vec[2] + vec2[2];
    return dest;
};

/*
* vec3.subtract
* Performs a vector subtraction
*
* Params:
* vec - vec3, first operand
* vec2 - vec3, second operand
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.subtract = function (vec, vec2, dest) {
    if (!dest || vec == dest) {
        vec[0] -= vec2[0];
        vec[1] -= vec2[1];
        vec[2] -= vec2[2];
        return vec;
    }

    dest[0] = vec[0] - vec2[0];
    dest[1] = vec[1] - vec2[1];
    dest[2] = vec[2] - vec2[2];
    return dest;
};

/*
* vec3.negate
* Negates the components of a vec3
*
* Params:
* vec - vec3 to negate
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.negate = function (vec, dest) {
    if (!dest) { dest = vec; }

    dest[0] = -vec[0];
    dest[1] = -vec[1];
    dest[2] = -vec[2];
    return dest;
};

/*
* vec3.scale
* Multiplies the components of a vec3 by a scalar value
*
* Params:
* vec - vec3 to scale
* val - Numeric value to scale by
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.scale = function (vec, val, dest) {
    if (!dest || vec == dest) {
        vec[0] *= val;
        vec[1] *= val;
        vec[2] *= val;
        return vec;
    }

    dest[0] = vec[0] * val;
    dest[1] = vec[1] * val;
    dest[2] = vec[2] * val;
    return dest;
};

/*
* vec3.normalize
* Generates a unit vector of the same direction as the provided vec3
* If vector length is 0, returns [0, 0, 0]
*
* Params:
* vec - vec3 to normalize
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.normalize = function (vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2];
    var len = Math.sqrt(x * x + y * y + z * z);

    if (!len) {
        dest[0] = 0;
        dest[1] = 0;
        dest[2] = 0;
        return dest;
    } else if (len == 1) {
        dest[0] = x;
        dest[1] = y;
        dest[2] = z;
        return dest;
    }

    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    return dest;
};

/*
* vec3.cross
* Generates the cross product of two vec3s
*
* Params:
* vec - vec3, first operand
* vec2 - vec3, second operand
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.cross = function (vec, vec2, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2];
    var x2 = vec2[0], y2 = vec2[1], z2 = vec2[2];

    dest[0] = y * z2 - z * y2;
    dest[1] = z * x2 - x * z2;
    dest[2] = x * y2 - y * x2;
    return dest;
};

/*
* vec3.length
* Caclulates the length of a vec3
*
* Params:
* vec - vec3 to calculate length of
*
* Returns:
* Length of vec
*/
vec3.length = function (vec) {
    var x = vec[0], y = vec[1], z = vec[2];
    return Math.sqrt(x * x + y * y + z * z);
};

/*
* vec3.dot
* Caclulates the dot product of two vec3s
*
* Params:
* vec - vec3, first operand
* vec2 - vec3, second operand
*
* Returns:
* Dot product of vec and vec2
*/
vec3.dot = function (vec, vec2) {
    return vec[0] * vec2[0] + vec[1] * vec2[1] + vec[2] * vec2[2];
};

/*
* vec3.direction
* Generates a unit vector pointing from one vector to another
*
* Params:
* vec - origin vec3
* vec2 - vec3 to point to
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.direction = function (vec, vec2, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0] - vec2[0];
    var y = vec[1] - vec2[1];
    var z = vec[2] - vec2[2];

    var len = Math.sqrt(x * x + y * y + z * z);
    if (!len) {
        dest[0] = 0;
        dest[1] = 0;
        dest[2] = 0;
        return dest;
    }

    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    return dest;
};

/*
* vec3.lerp
* Performs a linear interpolation between two vec3
*
* Params:
* vec - vec3, first vector
* vec2 - vec3, second vector
* lerp - interpolation amount between the two inputs
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
vec3.lerp = function (vec, vec2, lerp, dest) {
    if (!dest) { dest = vec; }

    dest[0] = vec[0] + lerp * (vec2[0] - vec[0]);
    dest[1] = vec[1] + lerp * (vec2[1] - vec[1]);
    dest[2] = vec[2] + lerp * (vec2[2] - vec[2]);

    return dest;
}

/*
* vec3.str
* Returns a string representation of a vector
*
* Params:
* vec - vec3 to represent as a string
*
* Returns:
* string representation of vec
*/
vec3.str = function (vec) {
    return '[' + vec[0] + ', ' + vec[1] + ', ' + vec[2] + ']';
};

/*
* mat3 - 3x3 Matrix
*/
var mat3 = {};

/*
* mat3.create
* Creates a new instance of a mat3 using the default array type
* Any javascript array containing at least 9 numeric elements can serve as a mat3
*
* Params:
* mat - Optional, mat3 containing values to initialize with
*
* Returns:
* New mat3
*/
mat3.create = function (mat) {
    var dest = new glMatrixArrayType(9);

    if (mat) {
        dest[0] = mat[0];
        dest[1] = mat[1];
        dest[2] = mat[2];
        dest[3] = mat[3];
        dest[4] = mat[4];
        dest[5] = mat[5];
        dest[6] = mat[6];
        dest[7] = mat[7];
        dest[8] = mat[8];
    }

    return dest;
};

/*
* mat3.set
* Copies the values of one mat3 to another
*
* Params:
* mat - mat3 containing values to copy
* dest - mat3 receiving copied values
*
* Returns:
* dest
*/
mat3.set = function (mat, dest) {
    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    return dest;
};

/*
* mat3.identity
* Sets a mat3 to an identity matrix
*
* Params:
* dest - mat3 to set
*
* Returns:
* dest
*/
mat3.identity = function (dest) {
    dest[0] = 1;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 1;
    dest[5] = 0;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 1;
    return dest;
};

/*
* mat4.transpose
* Transposes a mat3 (flips the values over the diagonal)
*
* Params:
* mat - mat3 to transpose
* dest - Optional, mat3 receiving transposed values. If not specified result is written to mat
*
* Returns:
* dest is specified, mat otherwise
*/
mat3.transpose = function (mat, dest) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (!dest || mat == dest) {
        var a01 = mat[1], a02 = mat[2];
        var a12 = mat[5];

        mat[1] = mat[3];
        mat[2] = mat[6];
        mat[3] = a01;
        mat[5] = mat[7];
        mat[6] = a02;
        mat[7] = a12;
        return mat;
    }

    dest[0] = mat[0];
    dest[1] = mat[3];
    dest[2] = mat[6];
    dest[3] = mat[1];
    dest[4] = mat[4];
    dest[5] = mat[7];
    dest[6] = mat[2];
    dest[7] = mat[5];
    dest[8] = mat[8];
    return dest;
};

/*
* mat3.toMat4
* Copies the elements of a mat3 into the upper 3x3 elements of a mat4
*
* Params:
* mat - mat3 containing values to copy
* dest - Optional, mat4 receiving copied values
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
mat3.toMat4 = function (mat, dest) {
    if (!dest) { dest = mat4.create(); }

    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = 0;

    dest[4] = mat[3];
    dest[5] = mat[4];
    dest[6] = mat[5];
    dest[7] = 0;

    dest[8] = mat[6];
    dest[9] = mat[7];
    dest[10] = mat[8];
    dest[11] = 0;

    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;

    return dest;
}

/*
* mat3.str
* Returns a string representation of a mat3
*
* Params:
* mat - mat3 to represent as a string
*
* Returns:
* string representation of mat
*/
mat3.str = function (mat) {
    return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] +
                ', ' + mat[3] + ', ' + mat[4] + ', ' + mat[5] +
                ', ' + mat[6] + ', ' + mat[7] + ', ' + mat[8] + ']';
};

/*
* mat4 - 4x4 Matrix
*/
var mat4 = {};

/*
* mat4.create
* Creates a new instance of a mat4 using the default array type
* Any javascript array containing at least 16 numeric elements can serve as a mat4
*
* Params:
* mat - Optional, mat4 containing values to initialize with
*
* Returns:
* New mat4
*/
mat4.create = function (mat) {
    var dest = new glMatrixArrayType(16);

    if (mat) {
        dest[0] = mat[0];
        dest[1] = mat[1];
        dest[2] = mat[2];
        dest[3] = mat[3];
        dest[4] = mat[4];
        dest[5] = mat[5];
        dest[6] = mat[6];
        dest[7] = mat[7];
        dest[8] = mat[8];
        dest[9] = mat[9];
        dest[10] = mat[10];
        dest[11] = mat[11];
        dest[12] = mat[12];
        dest[13] = mat[13];
        dest[14] = mat[14];
        dest[15] = mat[15];
    }

    return dest;
};

/*
* mat4.set
* Copies the values of one mat4 to another
*
* Params:
* mat - mat4 containing values to copy
* dest - mat4 receiving copied values
*
* Returns:
* dest
*/
mat4.set = function (mat, dest) {
    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    dest[9] = mat[9];
    dest[10] = mat[10];
    dest[11] = mat[11];
    dest[12] = mat[12];
    dest[13] = mat[13];
    dest[14] = mat[14];
    dest[15] = mat[15];
    return dest;
};

/*
* mat4.identity
* Sets a mat4 to an identity matrix
*
* Params:
* dest - mat4 to set
*
* Returns:
* dest
*/
mat4.identity = function (dest) {
    dest[0] = 1;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = 1;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 0;
    dest[9] = 0;
    dest[10] = 1;
    dest[11] = 0;
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;
    return dest;
};

/*
* mat4.transpose
* Transposes a mat4 (flips the values over the diagonal)
*
* Params:
* mat - mat4 to transpose
* dest - Optional, mat4 receiving transposed values. If not specified result is written to mat
*
* Returns:
* dest is specified, mat otherwise
*/
mat4.transpose = function (mat, dest) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (!dest || mat == dest) {
        var a01 = mat[1], a02 = mat[2], a03 = mat[3];
        var a12 = mat[6], a13 = mat[7];
        var a23 = mat[11];

        mat[1] = mat[4];
        mat[2] = mat[8];
        mat[3] = mat[12];
        mat[4] = a01;
        mat[6] = mat[9];
        mat[7] = mat[13];
        mat[8] = a02;
        mat[9] = a12;
        mat[11] = mat[14];
        mat[12] = a03;
        mat[13] = a13;
        mat[14] = a23;
        return mat;
    }

    dest[0] = mat[0];
    dest[1] = mat[4];
    dest[2] = mat[8];
    dest[3] = mat[12];
    dest[4] = mat[1];
    dest[5] = mat[5];
    dest[6] = mat[9];
    dest[7] = mat[13];
    dest[8] = mat[2];
    dest[9] = mat[6];
    dest[10] = mat[10];
    dest[11] = mat[14];
    dest[12] = mat[3];
    dest[13] = mat[7];
    dest[14] = mat[11];
    dest[15] = mat[15];
    return dest;
};

/*
* mat4.determinant
* Calculates the determinant of a mat4
*
* Params:
* mat - mat4 to calculate determinant of
*
* Returns:
* determinant of mat
*/
mat4.determinant = function (mat) {
    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];
    var a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15];

    return a30 * a21 * a12 * a03 - a20 * a31 * a12 * a03 - a30 * a11 * a22 * a03 + a10 * a31 * a22 * a03 +
                        a20 * a11 * a32 * a03 - a10 * a21 * a32 * a03 - a30 * a21 * a02 * a13 + a20 * a31 * a02 * a13 +
                        a30 * a01 * a22 * a13 - a00 * a31 * a22 * a13 - a20 * a01 * a32 * a13 + a00 * a21 * a32 * a13 +
                        a30 * a11 * a02 * a23 - a10 * a31 * a02 * a23 - a30 * a01 * a12 * a23 + a00 * a31 * a12 * a23 +
                        a10 * a01 * a32 * a23 - a00 * a11 * a32 * a23 - a20 * a11 * a02 * a33 + a10 * a21 * a02 * a33 +
                        a20 * a01 * a12 * a33 - a00 * a21 * a12 * a33 - a10 * a01 * a22 * a33 + a00 * a11 * a22 * a33;
};

/*
* mat4.inverse
* Calculates the inverse matrix of a mat4
*
* Params:
* mat - mat4 to calculate inverse of
* dest - Optional, mat4 receiving inverse matrix. If not specified result is written to mat
*
* Returns:
* dest is specified, mat otherwise
*/
mat4.inverse = function (mat, dest) {
    if (!dest) { dest = mat; }

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];
    var a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15];

    var b00 = a00 * a11 - a01 * a10;
    var b01 = a00 * a12 - a02 * a10;
    var b02 = a00 * a13 - a03 * a10;
    var b03 = a01 * a12 - a02 * a11;
    var b04 = a01 * a13 - a03 * a11;
    var b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30;
    var b07 = a20 * a32 - a22 * a30;
    var b08 = a20 * a33 - a23 * a30;
    var b09 = a21 * a32 - a22 * a31;
    var b10 = a21 * a33 - a23 * a31;
    var b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant (inlined to avoid double-caching)
    var invDet = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);

    dest[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
    dest[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
    dest[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
    dest[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
    dest[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
    dest[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
    dest[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
    dest[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
    dest[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
    dest[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
    dest[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
    dest[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
    dest[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
    dest[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
    dest[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
    dest[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

    return dest;
};

/*
* mat4.toRotationMat
* Copies the upper 3x3 elements of a mat4 into another mat4
*
* Params:
* mat - mat4 containing values to copy
* dest - Optional, mat4 receiving copied values
*
* Returns:
* dest is specified, a new mat4 otherwise
*/
mat4.toRotationMat = function (mat, dest) {
    if (!dest) { dest = mat4.create(); }

    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[3];
    dest[4] = mat[4];
    dest[5] = mat[5];
    dest[6] = mat[6];
    dest[7] = mat[7];
    dest[8] = mat[8];
    dest[9] = mat[9];
    dest[10] = mat[10];
    dest[11] = mat[11];
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;

    return dest;
};

/*
* mat4.toMat3
* Copies the upper 3x3 elements of a mat4 into a mat3
*
* Params:
* mat - mat4 containing values to copy
* dest - Optional, mat3 receiving copied values
*
* Returns:
* dest is specified, a new mat3 otherwise
*/
mat4.toMat3 = function (mat, dest) {
    if (!dest) { dest = mat3.create(); }

    dest[0] = mat[0];
    dest[1] = mat[1];
    dest[2] = mat[2];
    dest[3] = mat[4];
    dest[4] = mat[5];
    dest[5] = mat[6];
    dest[6] = mat[8];
    dest[7] = mat[9];
    dest[8] = mat[10];

    return dest;
};

/*
* mat4.toInverseMat3
* Calculates the inverse of the upper 3x3 elements of a mat4 and copies the result into a mat3
* The resulting matrix is useful for calculating transformed normals
*
* Params:
* mat - mat4 containing values to invert and copy
* dest - Optional, mat3 receiving values
*
* Returns:
* dest is specified, a new mat3 otherwise
*/
mat4.toInverseMat3 = function (mat, dest) {
    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10];

    var b01 = a22 * a11 - a12 * a21;
    var b11 = -a22 * a10 + a12 * a20;
    var b21 = a21 * a10 - a11 * a20;

    var d = a00 * b01 + a01 * b11 + a02 * b21;
    if (!d) { return null; }
    var id = 1 / d;

    if (!dest) { dest = mat3.create(); }

    dest[0] = b01 * id;
    dest[1] = (-a22 * a01 + a02 * a21) * id;
    dest[2] = (a12 * a01 - a02 * a11) * id;
    dest[3] = b11 * id;
    dest[4] = (a22 * a00 - a02 * a20) * id;
    dest[5] = (-a12 * a00 + a02 * a10) * id;
    dest[6] = b21 * id;
    dest[7] = (-a21 * a00 + a01 * a20) * id;
    dest[8] = (a11 * a00 - a01 * a10) * id;

    return dest;
};

/*
* mat4.multiply
* Performs a matrix multiplication
*
* Params:
* mat - mat4, first operand
* mat2 - mat4, second operand
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.multiply = function (mat, mat2, dest) {
    if (!dest) { dest = mat }

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];
    var a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15];

    var b00 = mat2[0], b01 = mat2[1], b02 = mat2[2], b03 = mat2[3];
    var b10 = mat2[4], b11 = mat2[5], b12 = mat2[6], b13 = mat2[7];
    var b20 = mat2[8], b21 = mat2[9], b22 = mat2[10], b23 = mat2[11];
    var b30 = mat2[12], b31 = mat2[13], b32 = mat2[14], b33 = mat2[15];

    dest[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
    dest[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
    dest[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
    dest[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
    dest[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
    dest[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
    dest[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
    dest[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
    dest[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
    dest[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
    dest[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
    dest[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
    dest[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
    dest[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
    dest[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
    dest[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;

    return dest;
};

/*
* mat4.multiplyVec3
* Transforms a vec3 with the given matrix
* 4th vector component is implicitly '1'
*
* Params:
* mat - mat4 to transform the vector with
* vec - vec3 to transform
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
mat4.multiplyVec3 = function (mat, vec, dest) {
    if (!dest) { dest = vec }

    var x = vec[0], y = vec[1], z = vec[2];

    dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
    dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
    dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

    return dest;
};

/*
* mat4.multiplyVec4
* Transforms a vec4 with the given matrix
*
* Params:
* mat - mat4 to transform the vector with
* vec - vec4 to transform
* dest - Optional, vec4 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
mat4.multiplyVec4 = function (mat, vec, dest) {
    if (!dest) { dest = vec }

    var x = vec[0], y = vec[1], z = vec[2], w = vec[3];

    dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12] * w;
    dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13] * w;
    dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14] * w;
    dest[3] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15] * w;

    return dest;
};

/*
* mat4.translate
* Translates a matrix by the given vector
*
* Params:
* mat - mat4 to translate
* vec - vec3 specifying the translation
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.translate = function (mat, vec, dest) {
    var x = vec[0], y = vec[1], z = vec[2];

    if (!dest || mat == dest) {
        mat[12] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
        mat[13] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
        mat[14] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
        mat[15] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15];
        return mat;
    }

    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];

    dest[0] = a00;
    dest[1] = a01;
    dest[2] = a02;
    dest[3] = a03;
    dest[4] = a10;
    dest[5] = a11;
    dest[6] = a12;
    dest[7] = a13;
    dest[8] = a20;
    dest[9] = a21;
    dest[10] = a22;
    dest[11] = a23;

    dest[12] = a00 * x + a10 * y + a20 * z + mat[12];
    dest[13] = a01 * x + a11 * y + a21 * z + mat[13];
    dest[14] = a02 * x + a12 * y + a22 * z + mat[14];
    dest[15] = a03 * x + a13 * y + a23 * z + mat[15];
    return dest;
};

/*
* mat4.scale
* Scales a matrix by the given vector
*
* Params:
* mat - mat4 to scale
* vec - vec3 specifying the scale for each axis
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.scale = function (mat, vec, dest) {
    var x = vec[0], y = vec[1], z = vec[2];

    if (!dest || mat == dest) {
        mat[0] *= x;
        mat[1] *= x;
        mat[2] *= x;
        mat[3] *= x;
        mat[4] *= y;
        mat[5] *= y;
        mat[6] *= y;
        mat[7] *= y;
        mat[8] *= z;
        mat[9] *= z;
        mat[10] *= z;
        mat[11] *= z;
        return mat;
    }

    dest[0] = mat[0] * x;
    dest[1] = mat[1] * x;
    dest[2] = mat[2] * x;
    dest[3] = mat[3] * x;
    dest[4] = mat[4] * y;
    dest[5] = mat[5] * y;
    dest[6] = mat[6] * y;
    dest[7] = mat[7] * y;
    dest[8] = mat[8] * z;
    dest[9] = mat[9] * z;
    dest[10] = mat[10] * z;
    dest[11] = mat[11] * z;
    dest[12] = mat[12];
    dest[13] = mat[13];
    dest[14] = mat[14];
    dest[15] = mat[15];
    return dest;
};

/*
* mat4.rotate
* Rotates a matrix by the given angle around the specified axis
* If rotating around a primary axis (X,Y,Z) one of the specialized rotation functions should be used instead for performance
*
* Params:
* mat - mat4 to rotate
* angle - angle (in radians) to rotate
* axis - vec3 representing the axis to rotate around 
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.rotate = function (mat, angle, axis, dest) {
    var x = axis[0], y = axis[1], z = axis[2];
    var len = Math.sqrt(x * x + y * y + z * z);
    if (!len) { return null; }
    if (len != 1) {
        len = 1 / len;
        x *= len;
        y *= len;
        z *= len;
    }

    var s = Math.sin(angle);
    var c = Math.cos(angle);
    var t = 1 - c;

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];

    // Construct the elements of the rotation matrix
    var b00 = x * x * t + c, b01 = y * x * t + z * s, b02 = z * x * t - y * s;
    var b10 = x * y * t - z * s, b11 = y * y * t + c, b12 = z * y * t + x * s;
    var b20 = x * z * t + y * s, b21 = y * z * t - x * s, b22 = z * z * t + c;

    if (!dest) {
        dest = mat
    } else if (mat != dest) { // If the source and destination differ, copy the unchanged last row
        dest[12] = mat[12];
        dest[13] = mat[13];
        dest[14] = mat[14];
        dest[15] = mat[15];
    }

    // Perform rotation-specific matrix multiplication
    dest[0] = a00 * b00 + a10 * b01 + a20 * b02;
    dest[1] = a01 * b00 + a11 * b01 + a21 * b02;
    dest[2] = a02 * b00 + a12 * b01 + a22 * b02;
    dest[3] = a03 * b00 + a13 * b01 + a23 * b02;

    dest[4] = a00 * b10 + a10 * b11 + a20 * b12;
    dest[5] = a01 * b10 + a11 * b11 + a21 * b12;
    dest[6] = a02 * b10 + a12 * b11 + a22 * b12;
    dest[7] = a03 * b10 + a13 * b11 + a23 * b12;

    dest[8] = a00 * b20 + a10 * b21 + a20 * b22;
    dest[9] = a01 * b20 + a11 * b21 + a21 * b22;
    dest[10] = a02 * b20 + a12 * b21 + a22 * b22;
    dest[11] = a03 * b20 + a13 * b21 + a23 * b22;
    return dest;
};

/*
* mat4.rotateX
* Rotates a matrix by the given angle around the X axis
*
* Params:
* mat - mat4 to rotate
* angle - angle (in radians) to rotate
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.rotateX = function (mat, angle, dest) {
    var s = Math.sin(angle);
    var c = Math.cos(angle);

    // Cache the matrix values (makes for huge speed increases!)
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];

    if (!dest) {
        dest = mat
    } else if (mat != dest) { // If the source and destination differ, copy the unchanged rows
        dest[0] = mat[0];
        dest[1] = mat[1];
        dest[2] = mat[2];
        dest[3] = mat[3];

        dest[12] = mat[12];
        dest[13] = mat[13];
        dest[14] = mat[14];
        dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[4] = a10 * c + a20 * s;
    dest[5] = a11 * c + a21 * s;
    dest[6] = a12 * c + a22 * s;
    dest[7] = a13 * c + a23 * s;

    dest[8] = a10 * -s + a20 * c;
    dest[9] = a11 * -s + a21 * c;
    dest[10] = a12 * -s + a22 * c;
    dest[11] = a13 * -s + a23 * c;
    return dest;
};

/*
* mat4.rotateY
* Rotates a matrix by the given angle around the Y axis
*
* Params:
* mat - mat4 to rotate
* angle - angle (in radians) to rotate
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.rotateY = function (mat, angle, dest) {
    var s = Math.sin(angle);
    var c = Math.cos(angle);

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11];

    if (!dest) {
        dest = mat
    } else if (mat != dest) { // If the source and destination differ, copy the unchanged rows
        dest[4] = mat[4];
        dest[5] = mat[5];
        dest[6] = mat[6];
        dest[7] = mat[7];

        dest[12] = mat[12];
        dest[13] = mat[13];
        dest[14] = mat[14];
        dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[0] = a00 * c + a20 * -s;
    dest[1] = a01 * c + a21 * -s;
    dest[2] = a02 * c + a22 * -s;
    dest[3] = a03 * c + a23 * -s;

    dest[8] = a00 * s + a20 * c;
    dest[9] = a01 * s + a21 * c;
    dest[10] = a02 * s + a22 * c;
    dest[11] = a03 * s + a23 * c;
    return dest;
};

/*
* mat4.rotateZ
* Rotates a matrix by the given angle around the Z axis
*
* Params:
* mat - mat4 to rotate
* angle - angle (in radians) to rotate
* dest - Optional, mat4 receiving operation result. If not specified result is written to mat
*
* Returns:
* dest if specified, mat otherwise
*/
mat4.rotateZ = function (mat, angle, dest) {
    var s = Math.sin(angle);
    var c = Math.cos(angle);

    // Cache the matrix values (makes for huge speed increases!)
    var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3];
    var a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7];

    if (!dest) {
        dest = mat
    } else if (mat != dest) { // If the source and destination differ, copy the unchanged last row
        dest[8] = mat[8];
        dest[9] = mat[9];
        dest[10] = mat[10];
        dest[11] = mat[11];

        dest[12] = mat[12];
        dest[13] = mat[13];
        dest[14] = mat[14];
        dest[15] = mat[15];
    }

    // Perform axis-specific matrix multiplication
    dest[0] = a00 * c + a10 * s;
    dest[1] = a01 * c + a11 * s;
    dest[2] = a02 * c + a12 * s;
    dest[3] = a03 * c + a13 * s;

    dest[4] = a00 * -s + a10 * c;
    dest[5] = a01 * -s + a11 * c;
    dest[6] = a02 * -s + a12 * c;
    dest[7] = a03 * -s + a13 * c;

    return dest;
};

/*
* mat4.frustum
* Generates a frustum matrix with the given bounds
*
* Params:
* left, right - scalar, left and right bounds of the frustum
* bottom, top - scalar, bottom and top bounds of the frustum
* near, far - scalar, near and far bounds of the frustum
* dest - Optional, mat4 frustum matrix will be written into
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
mat4.frustum = function (left, right, bottom, top, near, far, dest) {
    if (!dest) { dest = mat4.create(); }
    var rl = (right - left);
    var tb = (top - bottom);
    var fn = (far - near);
    dest[0] = (near * 2) / rl;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = (near * 2) / tb;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = (right + left) / rl;
    dest[9] = (top + bottom) / tb;
    dest[10] = -(far + near) / fn;
    dest[11] = -1;
    dest[12] = 0;
    dest[13] = 0;
    dest[14] = -(far * near * 2) / fn;
    dest[15] = 0;
    return dest;
};

/*
* mat4.perspective
* Generates a perspective projection matrix with the given bounds
*
* Params:
* fovy - scalar, vertical field of view
* aspect - scalar, aspect ratio. typically viewport width/height
* near, far - scalar, near and far bounds of the frustum
* dest - Optional, mat4 frustum matrix will be written into
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
mat4.perspective = function (fovy, aspect, near, far, dest) {
    var top = near * Math.tan(fovy * Math.PI / 360.0);
    var right = top * aspect;
    return mat4.frustum(-right, right, -top, top, near, far, dest);
};

/*
* mat4.ortho
* Generates a orthogonal projection matrix with the given bounds
*
* Params:
* left, right - scalar, left and right bounds of the frustum
* bottom, top - scalar, bottom and top bounds of the frustum
* near, far - scalar, near and far bounds of the frustum
* dest - Optional, mat4 frustum matrix will be written into
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
mat4.ortho = function (left, right, bottom, top, near, far, dest) {
    if (!dest) { dest = mat4.create(); }
    var rl = (right - left);
    var tb = (top - bottom);
    var fn = (far - near);
    dest[0] = 2 / rl;
    dest[1] = 0;
    dest[2] = 0;
    dest[3] = 0;
    dest[4] = 0;
    dest[5] = 2 / tb;
    dest[6] = 0;
    dest[7] = 0;
    dest[8] = 0;
    dest[9] = 0;
    dest[10] = -2 / fn;
    dest[11] = 0;
    dest[12] = -(left + right) / rl;
    dest[13] = -(top + bottom) / tb;
    dest[14] = -(far + near) / fn;
    dest[15] = 1;
    return dest;
};

/*
* mat4.ortho
* Generates a look-at matrix with the given eye position, focal point, and up axis
*
* Params:
* eye - vec3, position of the viewer
* center - vec3, point the viewer is looking at
* up - vec3 pointing "up"
* dest - Optional, mat4 frustum matrix will be written into
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
mat4.lookAt = function (eye, center, up, dest) {
    if (!dest) { dest = mat4.create(); }

    var eyex = eye[0],
                eyey = eye[1],
                eyez = eye[2],
                upx = up[0],
                upy = up[1],
                upz = up[2],
                centerx = center[0],
                centery = center[1],
                centerz = center[2];

    if (eyex == centerx && eyey == centery && eyez == centerz) {
        return mat4.identity(dest);
    }

    var z0, z1, z2, x0, x1, x2, y0, y1, y2, len;

    //vec3.direction(eye, center, z);
    z0 = eyex - center[0];
    z1 = eyey - center[1];
    z2 = eyez - center[2];

    // normalize (no check needed for 0 because of early return)
    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    //vec3.normalize(vec3.cross(up, z, x));
    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    };

    //vec3.normalize(vec3.cross(z, x, y));
    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    dest[0] = x0;
    dest[1] = y0;
    dest[2] = z0;
    dest[3] = 0;
    dest[4] = x1;
    dest[5] = y1;
    dest[6] = z1;
    dest[7] = 0;
    dest[8] = x2;
    dest[9] = y2;
    dest[10] = z2;
    dest[11] = 0;
    dest[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    dest[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    dest[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    dest[15] = 1;

    return dest;
};

/*
* mat4.str
* Returns a string representation of a mat4
*
* Params:
* mat - mat4 to represent as a string
*
* Returns:
* string representation of mat
*/
mat4.str = function (mat) {
    return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] + ', ' + mat[3] +
                ', ' + mat[4] + ', ' + mat[5] + ', ' + mat[6] + ', ' + mat[7] +
                ', ' + mat[8] + ', ' + mat[9] + ', ' + mat[10] + ', ' + mat[11] +
                ', ' + mat[12] + ', ' + mat[13] + ', ' + mat[14] + ', ' + mat[15] + ']';
};

/*
* quat4 - Quaternions 
*/
quat4 = {};

/*
* quat4.create
* Creates a new instance of a quat4 using the default array type
* Any javascript array containing at least 4 numeric elements can serve as a quat4
*
* Params:
* quat - Optional, quat4 containing values to initialize with
*
* Returns:
* New quat4
*/
quat4.create = function (quat) {
    var dest = new glMatrixArrayType(4);

    if (quat) {
        dest[0] = quat[0];
        dest[1] = quat[1];
        dest[2] = quat[2];
        dest[3] = quat[3];
    }

    return dest;
};

/*
* quat4.set
* Copies the values of one quat4 to another
*
* Params:
* quat - quat4 containing values to copy
* dest - quat4 receiving copied values
*
* Returns:
* dest
*/
quat4.set = function (quat, dest) {
    dest[0] = quat[0];
    dest[1] = quat[1];
    dest[2] = quat[2];
    dest[3] = quat[3];

    return dest;
};

/*
* quat4.calculateW
* Calculates the W component of a quat4 from the X, Y, and Z components.
* Assumes that quaternion is 1 unit in length. 
* Any existing W component will be ignored. 
*
* Params:
* quat - quat4 to calculate W component of
* dest - Optional, quat4 receiving calculated values. If not specified result is written to quat
*
* Returns:
* dest if specified, quat otherwise
*/
quat4.calculateW = function (quat, dest) {
    var x = quat[0], y = quat[1], z = quat[2];

    if (!dest || quat == dest) {
        quat[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
        return quat;
    }
    dest[0] = x;
    dest[1] = y;
    dest[2] = z;
    dest[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
    return dest;
}

/*
* quat4.inverse
* Calculates the inverse of a quat4
*
* Params:
* quat - quat4 to calculate inverse of
* dest - Optional, quat4 receiving inverse values. If not specified result is written to quat
*
* Returns:
* dest if specified, quat otherwise
*/
quat4.inverse = function (quat, dest) {
    if (!dest || quat == dest) {
        quat[0] *= -1;
        quat[1] *= -1;
        quat[2] *= -1;
        return quat;
    }
    dest[0] = -quat[0];
    dest[1] = -quat[1];
    dest[2] = -quat[2];
    dest[3] = quat[3];
    return dest;
}

/*
* quat4.length
* Calculates the length of a quat4
*
* Params:
* quat - quat4 to calculate length of
*
* Returns:
* Length of quat
*/
quat4.length = function (quat) {
    var x = quat[0], y = quat[1], z = quat[2], w = quat[3];
    return Math.sqrt(x * x + y * y + z * z + w * w);
}

/*
* quat4.normalize
* Generates a unit quaternion of the same direction as the provided quat4
* If quaternion length is 0, returns [0, 0, 0, 0]
*
* Params:
* quat - quat4 to normalize
* dest - Optional, quat4 receiving operation result. If not specified result is written to quat
*
* Returns:
* dest if specified, quat otherwise
*/
quat4.normalize = function (quat, dest) {
    if (!dest) { dest = quat; }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3];
    var len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len == 0) {
        dest[0] = 0;
        dest[1] = 0;
        dest[2] = 0;
        dest[3] = 0;
        return dest;
    }
    len = 1 / len;
    dest[0] = x * len;
    dest[1] = y * len;
    dest[2] = z * len;
    dest[3] = w * len;

    return dest;
}

/*
* quat4.multiply
* Performs a quaternion multiplication
*
* Params:
* quat - quat4, first operand
* quat2 - quat4, second operand
* dest - Optional, quat4 receiving operation result. If not specified result is written to quat
*
* Returns:
* dest if specified, quat otherwise
*/
quat4.multiply = function (quat, quat2, dest) {
    if (!dest) { dest = quat; }

    var qax = quat[0], qay = quat[1], qaz = quat[2], qaw = quat[3];
    var qbx = quat2[0], qby = quat2[1], qbz = quat2[2], qbw = quat2[3];

    dest[0] = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    dest[1] = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    dest[2] = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    dest[3] = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

    return dest;
}

/*
* quat4.multiplyVec3
* Transforms a vec3 with the given quaternion
*
* Params:
* quat - quat4 to transform the vector with
* vec - vec3 to transform
* dest - Optional, vec3 receiving operation result. If not specified result is written to vec
*
* Returns:
* dest if specified, vec otherwise
*/
quat4.multiplyVec3 = function (quat, vec, dest) {
    if (!dest) { dest = vec; }

    var x = vec[0], y = vec[1], z = vec[2];
    var qx = quat[0], qy = quat[1], qz = quat[2], qw = quat[3];

    // calculate quat * vec
    var ix = qw * x + qy * z - qz * y;
    var iy = qw * y + qz * x - qx * z;
    var iz = qw * z + qx * y - qy * x;
    var iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    dest[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    dest[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    dest[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return dest;
}

/*
* quat4.toMat3
* Calculates a 3x3 matrix from the given quat4
*
* Params:
* quat - quat4 to create matrix from
* dest - Optional, mat3 receiving operation result
*
* Returns:
* dest if specified, a new mat3 otherwise
*/
quat4.toMat3 = function (quat, dest) {
    if (!dest) { dest = mat3.create(); }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3];

    var x2 = x + x;
    var y2 = y + y;
    var z2 = z + z;

    var xx = x * x2;
    var xy = x * y2;
    var xz = x * z2;

    var yy = y * y2;
    var yz = y * z2;
    var zz = z * z2;

    var wx = w * x2;
    var wy = w * y2;
    var wz = w * z2;

    dest[0] = 1 - (yy + zz);
    dest[1] = xy - wz;
    dest[2] = xz + wy;

    dest[3] = xy + wz;
    dest[4] = 1 - (xx + zz);
    dest[5] = yz - wx;

    dest[6] = xz - wy;
    dest[7] = yz + wx;
    dest[8] = 1 - (xx + yy);

    return dest;
}

/*
* quat4.toMat4
* Calculates a 4x4 matrix from the given quat4
*
* Params:
* quat - quat4 to create matrix from
* dest - Optional, mat4 receiving operation result
*
* Returns:
* dest if specified, a new mat4 otherwise
*/
quat4.toMat4 = function (quat, dest) {
    if (!dest) { dest = mat4.create(); }

    var x = quat[0], y = quat[1], z = quat[2], w = quat[3];

    var x2 = x + x;
    var y2 = y + y;
    var z2 = z + z;

    var xx = x * x2;
    var xy = x * y2;
    var xz = x * z2;

    var yy = y * y2;
    var yz = y * z2;
    var zz = z * z2;

    var wx = w * x2;
    var wy = w * y2;
    var wz = w * z2;

    dest[0] = 1 - (yy + zz);
    dest[1] = xy - wz;
    dest[2] = xz + wy;
    dest[3] = 0;

    dest[4] = xy + wz;
    dest[5] = 1 - (xx + zz);
    dest[6] = yz - wx;
    dest[7] = 0;

    dest[8] = xz - wy;
    dest[9] = yz + wx;
    dest[10] = 1 - (xx + yy);
    dest[11] = 0;

    dest[12] = 0;
    dest[13] = 0;
    dest[14] = 0;
    dest[15] = 1;

    return dest;
}

/*
* quat4.slerp
* Performs a spherical linear interpolation between two quat4
*
* Params:
* quat - quat4, first quaternion
* quat2 - quat4, second quaternion
* slerp - interpolation amount between the two inputs
* dest - Optional, quat4 receiving operation result. If not specified result is written to quat
*
* Returns:
* dest if specified, quat otherwise
*/
quat4.slerp = function (quat, quat2, slerp, dest) {
    if (!dest) { dest = quat; }

    var cosHalfTheta = quat[0] * quat2[0] + quat[1] * quat2[1] + quat[2] * quat2[2] + quat[3] * quat2[3];

    if (Math.abs(cosHalfTheta) >= 1.0) {
        if (dest != quat) {
            dest[0] = quat[0];
            dest[1] = quat[1];
            dest[2] = quat[2];
            dest[3] = quat[3];
        }
        return dest;
    }

    var halfTheta = Math.acos(cosHalfTheta);
    var sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
        dest[0] = (quat[0] * 0.5 + quat2[0] * 0.5);
        dest[1] = (quat[1] * 0.5 + quat2[1] * 0.5);
        dest[2] = (quat[2] * 0.5 + quat2[2] * 0.5);
        dest[3] = (quat[3] * 0.5 + quat2[3] * 0.5);
        return dest;
    }

    var ratioA = Math.sin((1 - slerp) * halfTheta) / sinHalfTheta;
    var ratioB = Math.sin(slerp * halfTheta) / sinHalfTheta;

    dest[0] = (quat[0] * ratioA + quat2[0] * ratioB);
    dest[1] = (quat[1] * ratioA + quat2[1] * ratioB);
    dest[2] = (quat[2] * ratioA + quat2[2] * ratioB);
    dest[3] = (quat[3] * ratioA + quat2[3] * ratioB);

    return dest;
}


/*
* quat4.str
* Returns a string representation of a quaternion
*
* Params:
* quat - quat4 to represent as a string
*
* Returns:
* string representation of quat
*/
quat4.str = function (quat) {
    return '[' + quat[0] + ', ' + quat[1] + ', ' + quat[2] + ', ' + quat[3] + ']';
};/*
* Copyright 2010, Google Inc.
* All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are
* met:
*
*     * Redistributions of source code must retain the above copyright
* notice, this list of conditions and the following disclaimer.
*     * Redistributions in binary form must reproduce the above
* copyright notice, this list of conditions and the following disclaimer
* in the documentation and/or other materials provided with the
* distribution.
*     * Neither the name of Google Inc. nor the names of its
* contributors may be used to endorse or promote products derived from
* this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
* "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
* LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
* A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
* OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
* SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
* LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
* DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
* THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
* OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


/**
* @fileoverview This file contains functions every webgl program will need
* a version of one way or another.
*
* Instead of setting up a context manually it is recommended to
* use. This will check for success or failure. On failure it
* will attempt to present an approriate message to the user.
*
*       gl = WebGLUtils.setupWebGL(canvas);
*
* For animated WebGL apps use of setTimeout or setInterval are
* discouraged. It is recommended you structure your rendering
* loop like this.
*
*       function render() {
*         window.requestAnimFrame(render, canvas);
*
*         // do rendering
*         ...
*       }
*       render();
*
* This will call your rendering function up to the refresh rate
* of your display but will stop rendering if your app is not
* visible.
*/

WebGLUtils = function () {

    /**
    * Creates the HTLM for a failure message
    * @param {string} canvasContainerId id of container of th
    *        canvas.
    * @return {string} The html.
    */
    var makeFailHTML = function (msg) {
        return '' +
    '<table style="background-color: #8CE; width: 100%; height: 100%;"><tr>' +
    '<td align="center">' +
    '<div style="display: table-cell; vertical-align: middle;">' +
    '<div style="">' + msg + '</div>' +
    '</div>' +
    '</td></tr></table>';
    };

    /**
    * Mesasge for getting a webgl browser
    * @type {string}
    */
    var GET_A_WEBGL_BROWSER = '' +
  'This page requires a browser that supports WebGL.<br/>' +
  '<a href="http://get.webgl.org" target="_blank">Click here to upgrade your browser.</a>';

    /**
    * Mesasge for need better hardware
    * @type {string}
    */
    var OTHER_PROBLEM = '' +
  "It doesn't appear your computer can support WebGL.<br/>" +
  '<a href="http://get.webgl.org/troubleshooting/" target="_blank">Click here for more information.</a>';

    /**
    * Creates a webgl context. If creation fails it will
    * change the contents of the container of the <canvas>
    * tag to an error message with the correct links for WebGL.
    * @param {Element} canvas. The canvas element to create a
    *     context from.
    * @param {WebGLContextCreationAttirbutes} opt_attribs Any
    *     creation attributes you want to pass in.
    * @return {WebGLRenderingContext} The created context.
    */
    var setupWebGL = function (canvas, opt_attribs) {
        function showLink(str) {
            var container = canvas.parentNode;
            if (container) {
                container.innerHTML = makeFailHTML(str);
            }
        };

        if (!window.WebGLRenderingContext) {
            showLink(GET_A_WEBGL_BROWSER);
            return null;
        }

        var context = create3DContext(canvas, opt_attribs);
        if (!context) {
            showLink(OTHER_PROBLEM);
        }
        return context;
    };

    /**
    * Creates a webgl context.
    * @param {!Canvas} canvas The canvas tag to get context
    *     from. If one is not passed in one will be created.
    * @return {!WebGLContext} The created context.
    */
    var create3DContext = function (canvas, opt_attribs) {
        var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
        var context = null;
        for (var ii = 0; ii < names.length; ++ii) {
            try {
                context = canvas.getContext(names[ii], opt_attribs);
            } catch (e) { }
            if (context) {
                break;
            }
        }
        return context;
    }

    return {
        create3DContext: create3DContext,
        setupWebGL: setupWebGL
    };
} ();

/**
* Provides requestAnimationFrame in a cross browser way.
*/
window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
         window.webkitRequestAnimationFrame ||
         window.mozRequestAnimationFrame ||
         window.oRequestAnimationFrame ||
         window.msRequestAnimationFrame ||
         function (/* function FrameRequestCallback */callback, /* DOMElement Element */element) {
             window.setTimeout(callback, 1000 / 60);
         };
})();;;(function () {
    "use strict";

    var glowscript = { version: "1.2dev" }

    // GlowScript uses lots of javascript properties (Object.defineProperty) with getters and setters
    // This is an attempt to create a more declarative syntax for declaring an object with lots of properties

    // This file also exports a function Export() which is used by all other glowscript modules to export their
    // symbols.  At present the symbols go both into window and window.glowscript objects.

    /* Example:
    function myClass() {}
    property.declare( myClass.prototype, {
    // By default, properties are writable, but are forced to have the same type they have initially
    // Each one gets a corresponding data property (e.g. __name) that should be used with great care
    x:0, y:0, z:0,
    name: "Me",

    // Properties starting with __ are non-enumerable and not typechecked
    __hidden = 57,

    // Derived properties can be read-only or read-write
    length: { get: function() { return this.x+this.y+this.z } },
    x_plus_one: { get: function() { return this.x+1 }, set: function(value) { this.x = value-1 } ),

    // onchanged lets a property work as normal (including typechecking) but trigger a function after being modified
    title: { value: "Mr.", onchanged: function() { console.log("Now you are " + this.title + " " + this.name + "!") } },

    // You can make a property read only by setting readonly to true.  It can be changed via __whatever
    salary: { value: 0, readonly: true },

    // You can also turn off typechecking by setting type to null, or force a particular type check by setting it
    anything: { value: null, type: null },
    number: { value: 0, type: Number },
    short: { value: "", type: function(x) { if (typeof x !== "string" || x.length>8) throw new Error("Not a string"); return x; } }
    } )
    */

    var property = {
        declare: function (proto, propertyMap) {
            $.each(propertyMap, function (name, definition) {
                if (definition === null || (definition.value===undefined && !definition.get))
                    definition = { value: definition }
                definition.name = name
                var internal = definition.internal || name.substr(0, 2) === "__"
                if (definition.enumerable === undefined)
                    definition.enumerable = !internal
                if (definition.type === undefined && !definition.get && !internal) {
                    var tp = typeof definition.value
                    if (tp === "number")
                        definition.type = property.check_number
                    else if (tp === "string")
                        definition.type = property.check_string
                    else if (definition.value instanceof attributeVector)
                        definition.type = property.check_attributeVector
                    else if (definition.value instanceof attributeVectorPos)
                        definition.type = property.check_attributeVectorPos
                    else if (definition.value instanceof attributeVectorAxis)
                        definition.type = property.check_attributeVectorAxis
                    else if (definition.value instanceof attributeVectorSize)
                        definition.type = property.check_attributeVectorSize
                    else if (definition.value instanceof vec)
                        definition.type = property.check_vec
                }

                if ((definition.readonly && definition.set) ||
                    (definition.onchanged && definition.set) ||
                    (definition.value !== undefined && definition.get))
                    throw new Error("Erroneous property definition '" + name + "'.")

                function readOnlyError() { throw new Error("Property '" + name + "' is read-only.") }

                //console.log("property", proto.constructor.name, name, definition, proto)

                if (definition.get) {
                    Object.defineProperty(proto, name, { enumerable: definition.enumerable, get: definition.get, set: definition.set || readOnlyError })
                } else {
                    // If no typechecking, we just define a plain jane data descriptor
                    if (!definition.type && !definition.onchanged)
                        Object.defineProperty(proto, name, { enumerable: definition.enumerable, writable: !definition.readonly, value: definition.value })
                    else{ 
                        var internal = "__" + name
                        var prop = {
                            enumerable: definition.enumerable,
                            get: function () { return this[internal] }
                        }

                        if (definition.set)
                            prop.set = definition.set
                        else if (definition.onchanged && definition.type)
                            prop.set = function (val) { var old = this[internal]; this[internal] = definition.type.call(this, val, definition); definition.onchanged.call(this, old) }
                        else if (definition.onchanged)
                            prop.set = function (val) { var old = this[internal]; this[internal] = val; definition.onchanged.call(this, old) }
                        else if (definition.type)
                            prop.set = function (val) { this[internal] = definition.type.call(this, val, definition) }
                        /*else
                        prop.set = function (val) { this[internal] = val; }*/

                        Object.defineProperty(proto, internal, { enumerable: false, writable: true, value: definition.value })
                        Object.defineProperty(proto, name, prop)
                    }
                }
            })
        },
        nullable_attributeVector: function nullable_attributeVector(v, def) {
            if (v === null) return null
            return property.check_attributeVector.call(this, v, def)
        },
        check_attributeVector: function check_attributeVector(v, def) {
            if (!(v instanceof vec)) throw new Error("Property '" + def.name + "' must be a vec.");
            return new attributeVector( this, v.x, v.y, v.z )
        },
        check_attributeVectorPos: function check_attributeVectorPos(v, def) {
            if (!(v instanceof vec)) throw new Error("Property '" + def.name + "' must be a vec.");
            return new attributeVectorPos( this, v.x, v.y, v.z )
        },
        check_attributeVectorAxis: function check_attributeVectorAxis(v, def) {
            if (!(v instanceof vec)) throw new Error("Property '" + def.name + "' must be a vec.");
            return new attributeVectorAxis( this, v.x, v.y, v.z )
        },
        check_attributeVectorSize: function check_attributeVectorSize(v, def) {
            if (!(v instanceof vec)) throw new Error("Property '" + def.name + "' must be a vec.");
            return new attributeVectorSize( this, v.x, v.y, v.z )
        },
        check_vec: function check_vec(v, def) { if (!v instanceof vec) throw new Error("Property '" + def.name + "' must be a vec."); return v; },
        check_number: function check_number(v, def) { return v; },
        check_string: function check_string(v, def) { return v; },
    }

    var global = window
    function Export( exports ) {
        for(var id in exports) {
            glowscript[id] = exports[id]
            global[id] = exports[id]
        }
    }

    var module_exports = {
        glowscript: glowscript,
        property: property,
        Export: Export
    }
    Export(module_exports)
})();;(function () {
    "use strict";

    function vec(x, y, z) {
        if (!(this instanceof vec)) {
            // vec(vec) makes a copy of the argument:
            if (arguments.length == 1 && x.x !== undefined) return new vec(x.x, x.y, x.z)  // TODO: Why?
            return new vec(x, y, z)
        }

        this.x = x
        this.y = y
        this.z = z

        if (arguments.length !== 3) throw new Error("vec() requires 3 arguments: x, y, and z.")
    }
    
    
    // These attributeVector objects must be set up in property.js

    function attributeVector(parent, x, y, z) {
        this.__parent = parent
        this.__x = x
        this.__y = y
        this.__z = z
        if (parent) parent.__change()
    }

    attributeVector.prototype = new vec(0, 0, 0)
    attributeVector.prototype.constructor = attributeVector

    function attributeVectorPos(parent, x, y, z) { // for pos in VPython environment, to make make_trail work
        this.__parent = parent
        this.__x = x
        this.__y = y
        this.__z = z
        if (parent) {
        	parent.__change()
        	if (parent.__make_trail) parent.__update_trail()
        }
    }

    attributeVectorPos.prototype = new vec(0, 0, 0)
    attributeVectorPos.prototype.constructor = attributeVectorPos

    function attributeVectorAxis(parent, x, y, z) { // for axis in VPython environment
        this.__parent = parent
        this.__x = x
        this.__y = y
        this.__z = z
        if (parent) {
        	parent.__size.__x = Math.sqrt(x*x + y*y + z*z)
        	parent.__change()
        }
    }

    attributeVectorAxis.prototype = new vec(1, 0, 0)
    attributeVectorAxis.prototype.constructor = attributeVectorAxis

    function attributeVectorSize(parent, x, y, z) { // for size in VPython environment
        this.__parent = parent
        this.__x = x
        this.__y = y
        this.__z = z
        if (parent) {
            // Be careful not to alter the attributeVectorAxis character of parent.__axis
        	if (x !== 0) { // can get in trouble if we make axis be a zero vector
	            var v = parent.__axis.norm().multiply(x)
	        	parent.__axis.__x = v.x
	        	parent.__axis.__y = v.y
	        	parent.__axis.__z = v.z
        	}
        	parent.__change()
        }
    }

    attributeVectorSize.prototype = new vec(1,1,1)
    attributeVectorSize.prototype.constructor = attributeVectorSize
    
    // Ordinary attributeVector --------------------------------------------------------------------

    Object.defineProperty(attributeVector.prototype, '__x', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVector.prototype, 'x', {
        enumerable: true,
        get:
            function () { return this.__x },
        set:
            function (value) {
                this.__x = value
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVector.prototype, '__y', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVector.prototype, 'y', {
        enumerable: true,
        get:
            function () { return this.__y },
        set:
            function (value) {
                this.__y = value
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVector.prototype, '__z', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVector.prototype, 'z', {
        enumerable: true,
        get:
            function () { return this.__z },
        set:
            function (value) {
                this.__z = value
                this.__parent.__change()
            }
    });
    
    // attributeVectorPos for VPython pos attribute ------------------------------------------------------

    Object.defineProperty(attributeVectorPos.prototype, '__x', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorPos.prototype, 'x', {
        enumerable: true,
        get:
            function () { return this.__x },
        set:
            function (value) {
                this.__x = value
                this.__parent.__change()
            	if (this.__parent.__make_trail) this.__parent.__update_trail()
            }
    });

    Object.defineProperty(attributeVectorPos.prototype, '__y', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorPos.prototype, 'y', {
        enumerable: true,
        get:
            function () { return this.__y },
        set:
            function (value) {
            	this.__y = value
                this.__parent.__change()
            	if (this.__parent.__make_trail) this.__parent.__update_trail()
            }
    });

    Object.defineProperty(attributeVectorPos.prototype, '__z', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorPos.prototype, 'z', {
        enumerable: true,
        get:
            function () { return this.__z },
        set:
            function (value) {
        		this.__z = value
                this.__parent.__change()
            	if (this.__parent.__make_trail) this.__parent.__update_trail()
            }
    });
    
    // attributeVectorAxis for VPython axis attribute ------------------------------------------------------

    Object.defineProperty(attributeVectorAxis.prototype, '__x', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorAxis.prototype, 'x', {
        enumerable: true,
        get:
            function () { return this.__x },
        set:
            function (value) {
                this.__x = this.__parent.__axis.__x = value
				this.__parent.__size.x = this.mag()
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVectorAxis.prototype, '__y', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorAxis.prototype, 'y', {
        enumerable: true,
        get:
            function () { return this.__y },
        set:
            function (value) {
        		this.__y = this.__parent.__axis.__y = value
				this.__parent.__size.x = this.mag()
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVectorAxis.prototype, '__z', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorAxis.prototype, 'z', {
        enumerable: true,
        get:
            function () { return this.__z },
        set:
            function (value) {
        		this.__z = this.__parent.__axis.__z = value
				this.__parent.__size.x = this.mag()
                this.__parent.__change()
            }
    });
    
    // attributeVectorSize for VPython size attribute --------------------------------------------------------

    Object.defineProperty(attributeVectorSize.prototype, '__x', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorSize.prototype, 'x', {
        enumerable: true,
        get:
            function () { return this.__x },
        set:
            function (value) {
                this.__x = value
                // Be careful not to alter the attributeVectorAxis character of this.__parent.__axis
                var v = this.__parent.__axis.norm().multiply(value)
            	this.__parent.__axis.__x = v.x
            	this.__parent.__axis.__y = v.y
            	this.__parent.__axis.__z = v.z
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVectorSize.prototype, '__y', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorSize.prototype, 'y', {
        enumerable: true,
        get:
            function () { return this.__y },
        set:
            function (value) {
                this.__y = value
                this.__parent.__change()
            }
    });

    Object.defineProperty(attributeVectorSize.prototype, '__z', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(attributeVectorSize.prototype, 'z', {
        enumerable: true,
        get:
            function () { return this.__z },
        set:
            function (value) {
                this.__z = value
                this.__parent.__change()
            }
    });
    
    // General vec properties

    vec.prototype.toString = function () {
        // Mimics the vector display of VPython
        var input = [this.x, this.y, this.z]
        var output = []
        var c, eloc, period, char, end
        for (var i = 0; i < 3; i++) {
            var c = input[i]
            if (c == 0) {
                output.push('0')
                continue
            }
            if (Math.abs(c) < 1e-4) c = c.toExponential(5)
            else c = c.toPrecision(6)
            period = c.indexOf('.')
            if (period >= 0) {
                end = c.indexOf('e')
                if (end < 0) end = c.length
                char = end
                while (true) {
                    char--
                    if (c.charAt(char) == '0') continue
                    if (char == period) {
                        output.push(c.slice(0, period).concat(c.slice(end, c.length)))
                        break
                    }
                    if (end == c.length) output.push(c.slice(0, char + 1))
                    else output.push(c.slice(0, char + 1).concat(c.slice(end, c.length)))
                    break
                }
            } else output.push(c)
        }
        return "< " + output[0] + ", " + output[1] + ", " + output[2] + " >"
    }

    vec.prototype.add = function (v) {
        return new vec(this.x + v.x, this.y + v.y, this.z + v.z)
    }

    vec.prototype.sub = function (v) {
        return new vec(this.x - v.x, this.y - v.y, this.z - v.z)
    }

    vec.prototype.multiply = function (s) {
        return new vec(this.x * s, this.y * s, this.z * s)
    }

    vec.prototype.mag = function (s) {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    }

    vec.prototype.mag2 = function (s) {
        return this.x * this.x + this.y * this.y + this.z * this.z
    }

    vec.prototype.divide = function (s) {
        return new vec(this.x / s, this.y / s, this.z / s)
    }

    vec.prototype.norm = function () {
        var r = this.mag()
        if (r == 0) return new vec(0, 0, 0)
        return new vec(this.x / r, this.y / r, this.z / r)
    }

    vec.prototype.dot = function (v) {
        return this.x * v.x + this.y * v.y + this.z * v.z
    }

    vec.prototype.equals = function (v) {
    	if (v === null) return false
        return (this.x == v.x && this.y == v.y && this.z == v.z)
    }

    vec.prototype.proj = function (v) {
        var B = norm(v)
        return B.multiply(this.dot(B))
    }

    vec.prototype.comp = function (v) {
        return this.dot(norm(v))
    }

    vec.prototype.cross = function (v) {
        return new vec(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x)
    }

    vec.prototype.diff_angle = function (v) {
        return Math.acos(this.norm().dot(v.norm()))
    }

    vec.prototype.rotate = function (args) {
    	var angle, axis
	    if (arguments.length == 1) {
	        if (args !== null && args !== undefined) {
	        	if (typeof args === 'number') {
	        		angle = args
	        	} else {
		        	angle = args.angle
		        	axis = args.axis
	        	}
	        }
	    } else if (arguments.length == 2) {
        	angle = arguments[0]
        	axis = arguments[1]
        }
    	if (angle === undefined) throw new Error("To rotate a vector you must specify an angle.")
        if (axis === undefined) axis = new vec(0, 0, 1)
        var theta = this.diff_angle(axis)
        if (theta == 0) return new vec(this.x, this.y, this.z)
        var axis = axis.norm()
        var parallel = axis.multiply(axis.dot(this)) // projection along axis
        var perp = axis.cross(this)
        var pmag = perp.mag() // length of 'this' projected onto plane perpendicular to axis
        perp = perp.norm()
        var y = perp.cross(axis) // y, perp, axis is an orthogonal coordinate system
        var rotated = y.multiply(pmag * Math.cos(angle)).add(perp.multiply(pmag * Math.sin(angle)))
        return parallel.add(rotated)
    }

    vec.random = function () {
        return new vec(-1 + 2 * Math.random(), -1 + 2 * Math.random(), -1 + 2 * Math.random())
    }

    // Support operator overloading
    String.prototype['+'] = function (r) { return this + r }
    Number.prototype['+'] = function (r) { return this + r }
    Number.prototype['-'] = function (r) { return this - r }
    Number.prototype['*'] = function (r) { return r['*r'](this); }
    Number.prototype['*r'] = function (l) { return l * this; }
    Number.prototype['/'] = function (r) { return this / r }
    Number.prototype["-u"] = function () { return -this }
    vec.prototype['+'] = vec.prototype.add
    vec.prototype['-'] = vec.prototype.sub
    vec.prototype['*'] = vec.prototype.multiply
    vec.prototype['*r'] = vec.prototype.multiply
    vec.prototype['/'] = function (r) { return this.divide(r) }
    vec.prototype["-u"] = function () { return new vec(-this.x, -this.y, -this.z) }

    var exports = { vec: vec, 
    		        attributeVector: attributeVector,
    		        attributeVectorPos: attributeVectorPos,
    		        attributeVectorAxis: attributeVectorAxis, 
    		        attributeVectorSize: attributeVectorSize }
    Export(exports)
})()

; (function vectorLibraryWrappers() {
    "use strict";

    function mag(A) {
        return A.mag();
    }
    function mag2(A) {
        return A.mag2();
    }
    function norm(A) {
        return A.norm();
    }
    function dot(A,B) {
        return A.dot(B);
    }
    function cross(A,B) {
        return A.cross(B);
    }
    function comp(A,B) {
        return A.comp(B);
    }
    function diff_angle(A,B) {
        return A.diff_angle(B);
    }
    function rotate(args) {
    	var angle, axis
    	var v = arguments[0]
	    if (arguments.length == 2) {
	        var args = arguments[1]
	        if (args !== null && args !== undefined) {
	        	if (typeof args === 'number') {
	        		angle = args
	        	} else {
		        	angle = args.angle
		        	axis = args.axis
	        	}
	        }
        } else if (arguments.length == 3) {
        	angle = arguments[1]
        	axis = arguments[2]
        }
    	if (angle === undefined) throw new Error("To rotate a vector you must specify an angle.")
    	if (axis === undefined) axis = new vec(0,0,1)
        return v.rotate({angle:angle, axis:axis})
    }
    var exports = {
        mag: mag,
        mag2: mag2,
        norm: norm,
        dot: dot,
        cross: cross,
        comp: comp,
        diff_angle: diff_angle,
        rotate: rotate
    }
    Export(exports)
})();

;;(function () {
    "use strict";

    // Mesh() represents a mesh of triangles
    // TODO: Big meshes (>64K vertices) for compound()
    function Mesh() {
        this.pos = []
        this.normal = []
        this.color = []
        this.opacity = []
        this.shininess = []
        this.emissive = []
        this.texpos = []
        this.bumpaxis = []
        this.index = []
        this.model_transparent = false
    }
    $.extend( Mesh.prototype, {
        merge: function merge(otherMesh, object, bias) {
        	var xmin = null, xmax = null, ymin = null, ymax = null, zmin = null, zmax = null
            var offset = this.pos.length / 3
            if (object instanceof vertex) {
	            if (bias < 0) this.index.push(offset + bias)
	            else {
	        		if (xmin === null || object.__pos.x < xmin) xmin = object.__pos.x
	        		if (xmax === null || object.__pos.x > xmax) xmax = object.__pos.x        	
	        		if (ymin === null || object.__pos.y < ymin) ymin = object.__pos.y
	        		if (ymax === null || object.__pos.y > ymax) ymax = object.__pos.y        	
	        		if (zmin === null || object.__pos.z < zmin) zmin = object.__pos.z
	        		if (zmax === null || object.__pos.z > zmax) zmax = object.__pos.z
		            this.pos.push(object.__pos.x, object.__pos.y, object.__pos.z)
		            this.normal.push(object.__normal.x, object.__normal.y, object.__normal.z)
		            this.color.push(object.__color.x, object.__color.y, object.__color.z)
	            	if (object.__opacity < 1) this.model_transparent = true
	            	this.opacity.push(object.__opacity)
	            	this.shininess.push(object.__shininess)
	            	this.emissive.push(object.__emissive)
		            this.texpos.push(object.__texpos.x, object.__texpos.y)
		            this.bumpaxis.push(object.__bumpaxis.x, object.__bumpaxis.y, object.__bumpaxis.z) 
		            this.index.push(offset) 
	            }
            } else {
                var c = [object.__color.x, object.__color.y, object.__color.z]
	            for (var j = 0; j < otherMesh.pos.length; j++) {
	            	if (j%3 === 0) {
	            		if (xmin === null || otherMesh.pos[j] < xmin) xmin = otherMesh.pos[j]
	            		if (xmax === null || otherMesh.pos[j] > xmax) xmax = otherMesh.pos[j]
	            	} else if (j%3 === 1) {
	            		if (ymin === null || otherMesh.pos[j] < ymin) ymin = otherMesh.pos[j]
	            		if (ymax === null || otherMesh.pos[j] > ymax) ymax = otherMesh.pos[j]
	            	} else if (j%3 === 2) {
	            		if (zmin === null || otherMesh.pos[j] < zmin) zmin = otherMesh.pos[j]
	            		if (zmax === null || otherMesh.pos[j] > zmax) zmax = otherMesh.pos[j]
	            	}
	                this.pos.push(otherMesh.pos[j])
	            }
	            for (var j = 0; j < otherMesh.normal.length; j++)
	                this.normal.push(otherMesh.normal[j])
	            for (var j = 0; j < otherMesh.color.length; j++) 
	            	this.color.push( c[j % 3] * otherMesh.color[j] )
	            for (var j = 0; j < otherMesh.opacity.length; j++) {
	            	var opacity = object.__opacity * otherMesh.opacity[j]
	            	if (opacity < 1) this.model_transparent = true
	                this.opacity.push(opacity)
	            }
	            for (var j = 0; j < otherMesh.shininess.length; j++) {
	            	var shininess = object.__shininess * otherMesh.shininess[j]
	            	this.shininess.push( shininess )
	            }
		        for (var j = 0; j < otherMesh.emissive.length; j++)  {
		            var emissive = object.__emissive || otherMesh.emissive[j] ? 1 : 0
		            this.emissive.push( emissive )
		        }
	            for (var j = 0; j < otherMesh.texpos.length; j++)
	                this.texpos.push(otherMesh.texpos[j])
	            for (var j = 0; j < otherMesh.bumpaxis.length; j++)
	                this.bumpaxis.push(otherMesh.bumpaxis[j])
	            for (var j = 0; j < otherMesh.index.length; j++)
	                this.index.push(offset + otherMesh.index[j])
            }
            return {__xmin:xmin, __ymin:ymin, __zmin:zmin, __xmax:xmax, __ymax:ymax, __zmax:zmax}
        },
        transformed: function transformed(matrix) {
            var normalTrans = mat3.toMat4(mat3.transpose(mat4.toInverseMat3(matrix)))
            var out = new Mesh()
            out.index = this.index
            out.color = this.color
            out.opacity = this.opacity
            out.shininess = this.shininess
            out.emissive = this.emissive
            out.texpos = this.texpos
            for (var i = 0; i < this.pos.length; i += 3) {
                var v = [this.pos[i], this.pos[i + 1], this.pos[i + 2]]
                var n = [this.normal[i], this.normal[i + 1], this.normal[i + 2], 0]
                var b = [this.bumpaxis[i], this.bumpaxis[i + 1], this.bumpaxis[i + 2]]
                mat4.multiplyVec3(matrix, v)
                mat4.multiplyVec4(normalTrans, n)
                mat4.multiplyVec3(matrix, b)
                out.pos.push(v[0], v[1], v[2])
                out.normal.push(n[0], n[1], n[2])
                out.bumpaxis.push(b[0], b[1], b[2])
            }
            return out
        },
        /* Seems not useful; not needed if gl.CULL_FACE not enabled
        make_twosided: function make_twosided() {
        	var offset = this.pos.length/3
        	this.pos = this.pos.concat(this.pos)
        	this.normal = this.normal.concat(this.normal)
        	this.texpos = this.texpos.concat(this.texpos)
        	this.bumpaxis = this.bumpaxis.concat(this.bumpaxis)
        	this.index = this.index.concat(this.index)
        	var end = this.normal.length
        	for (var i=end/2; i<end; i++) {
        		this.normal[i] *= -1
        		this.bumpaxis[i] *= -1
        	}
        	end = this.index.length
			for (var i=end/2; i<end; i+=3) {
				var temp = this.index[i+2]
				this.index[i+2] = offset+this.index[i]
				this.index[i] = offset+temp
				this.index[i+1] += offset
			}
        }
        */
    })

    // Mesh.make*() generate meshes for specific primitives
    $.extend( Mesh, {
        makeCube: function() {
            var m = new Mesh()
            var s = 0.5; // from VPython; 1x1x1 cube
            m.pos.push( 
                  +s, +s, +s,    +s, -s, +s,     +s, -s, -s,     +s, +s, -s,   // Right face
                  -s, +s, -s,    -s, -s, -s,     -s, -s, +s,     -s, +s, +s,   // Left face
                  -s, -s, +s,    -s, -s, -s,     +s, -s, -s,     +s, -s, +s,   // Bottom face
                  -s, +s, -s,    -s, +s, +s,     +s, +s, +s,     +s, +s, -s,   // Top face
                  -s, +s, +s,    -s, -s, +s,     +s, -s, +s,     +s, +s, +s,   // Front face
                  +s, +s, -s,    +s, -s, -s,     -s, -s, -s,     -s, +s, -s )  // Back face
            m.normal.push(
                  +1, 0, 0 ,  +1, 0, 0 ,  +1, 0, 0 ,  +1, 0, 0,
                  -1, 0, 0,   -1, 0, 0,   -1, 0, 0,   -1, 0, 0,
                  0, -1, 0,   0, -1, 0,   0, -1, 0,   0, -1, 0,
                  0, +1, 0,   0, +1, 0,   0, +1, 0,   0, +1, 0,
                  0, 0, +1,   0, 0, +1,   0, 0, +1,   0, 0, +1,
                  0, 0, -1,   0, 0, -1,   0, 0, -1,   0, 0, -1 )
            m.color.push(
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1,
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1,
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1,
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1,
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1,
            	  1, 1, 1,    1, 1, 1,    1, 1, 1,    1, 1, 1 )
            m.opacity.push(
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1 )
            m.shininess.push(
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1,
            	  1, 1, 1, 1 )
            m.emissive.push(
	           	  0, 0, 0, 0,
	           	  0, 0, 0, 0,
	           	  0, 0, 0, 0,
	           	  0, 0, 0, 0,
	           	  0, 0, 0, 0,
	           	  0, 0, 0, 0 )
            m.texpos.push(
                  0, 1,  0, 0,  1, 0,  1, 1,
                  0, 1,  0, 0,  1, 0,  1, 1,
                  0, 1,  0, 0,  1, 0,  1, 1,
                  0, 1,  0, 0,  1, 0,  1, 1,
                  0, 1,  0, 0,  1, 0,  1, 1,
                  0, 1,  0, 0,  1, 0,  1, 1 )
            m.bumpaxis.push(
                  0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
                  0, 0, +1,  0, 0, +1,  0, 0, +1,  0, 0, +1,
                  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,
                  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,
                  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,  +1, 0, 0,
                  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0 )
            m.index.push(
                  0, 1, 2, 0, 2, 3,   4, 5, 6, 4, 6, 7,   8, 9, 10, 8, 10, 11,
                  12, 13, 14, 12, 14, 15,   16, 17, 18, 16, 18, 19,   20, 21, 22, 20, 22, 23 )
            //m.make_twosided() // seems not useful
            return m
        },

        makeQuad: function() { // origin of 2-triangle quad at lower left: (0, 0); used for depth peeling merge
            var m = new Mesh()
            m.pos.push( 
            	  -1, -1, 0,    +1, -1, 0,    +1, +1, 0,    -1, +1, 0 )
            m.normal.push(
                  0, 0, 1,    0, 0, 1,    0, 0, 1,    0, 0, 1 )
            m.color.push(
            	   1, 1, 1,    1, 1, 1,   1, 1, 1,   1, 1, 1)
            m.opacity.push(
            	   1,  1,  1,  1)
            m.shininess.push(
                   1,  1,  1,  1)
            m.emissive.push(
            	   0,  0,  0,  0)
            m.texpos.push( 
            	  0, 0,    1, 0,    1, 1,    0, 1 )
            m.bumpaxis.push(
                  1, 0, 0,    1, 0, 0,    1, 0, 0,    1, 0, 0 )
            m.index.push(
                  0, 1, 2,    0, 2, 3 )
            return m
        },
        
        makeCylinder: function(R) {
            var N = 50 // number of sides of the cylinder, of radius 1 and axis < 1,0,0 >
            // Total number of pos is 4*N+2 = 202 for N = 50
            var dtheta = 2*Math.PI/N
            var sind = Math.sin(dtheta), cosd = Math.cos(dtheta)
            // sin(theta+dtheta) = sin(theta)*cosd + cos(theta)*sind, so newy = y*cosd + z*sind
            // cos(theta+dtheta) = cos(theta)*cosd - sin(theta)*sind, so newz = z*cosd - y*sind
            var y = 0, z = -R
            var newy, newz
            var m = new Mesh()
            m.pos.push( 0, 0, 0,  1, 0, 0 )
            m.normal.push( -1, 0, 0,  1, 0, 0 )
            m.color.push( 1, 1, 1,  1, 1, 1 )
            m.opacity.push( 1, 1, 1, 1, 1, 1 )
            m.shininess.push( 1, 1, 1, 1, 1, 1 )
            m.emissive.push( 0, 0, 0, 0, 0, 0 )
            m.texpos.push( 0.5,0.5,  0.5,0.5 )
            m.bumpaxis.push( 0,0,-1,  0,0,-1 )
            for (var i=2; i<=2+4*N; i+=4) {
                
                m.pos.push( 0,y,z,  0,y,z,  1,y,z,  1,y,z )
                
                m.normal.push( -1,0,0,  0,y,z,  1,0,0,  0,y,z )
                
                m.color.push( 1,1,1,  1,1,1,  1,1,1,  1,1,1)
                
                m.opacity.push(1,  1,  1,  1)
                
                m.shininess.push(1,  1,  1,  1)
                
                m.emissive.push(0, 0, 0, 0)
                
                m.texpos.push( 0.5*(1+z/R),0.5+0.5*y/R, 1-(i-2)/N/4,0, 0.5*(1-z/R),0.5+0.5*y/R, 1-(i-2)/N/4,1 )
                
                m.bumpaxis.push( 1,0,0,  1,0,0,  1,0,0,  1,0,0  )
                
                if (i != 2+4*N) m.index.push( 0,i,i+4,  i+1,i+3,i+7,    i+1,i+7,i+5,    1,i+6,i+2  )
                
                newy = y*cosd + z*sind
                newz = z*cosd - y*sind
                y = newy
                z = newz
            }
            return m
        },
        
        /*
        // Doesn't quite work, but in any case one would need a special shader and special mesh
        // because the API says that size.x is the diameter of the cross section.
        makeRing: function(R1, R2) { // R1 = radius of ring; R2 = radius of cross section of ring
            var N = 30 // number of sides of each open cylinder
            var NC = 50 // number of open cylinders
            var dtheta = 2*Math.PI/N // going around a cross-section, the sides of each cylinder
            var dphi = 2*Math.PI/NC  // goind around the ring
            var sind = Math.sin(dtheta), cosd = Math.cos(dtheta)
            var sphi = Math.sin(dphi/2)
            // sin(theta+dtheta) = sin(theta)*cosd + cos(theta)*sind, so newy = y*cosd + z*sind
            // cos(theta+dtheta) = cos(theta)*cosd - sin(theta)*sind, so newz = z*cosd - y*sind
            var newy, newz
            var m = new Mesh()
            var phi = dphi/2
            for (var c=0; c<NC; c++) {
            	var r = vec(0, Math.sin(phi), -Math.cos(phi)) // unit vector from origin to center of cylindrical element
            	var R = r.multiply(R1)
            	var w = vec(0, Math.cos(phi), Math.sin(phi)) // unit vector along the cylindrical element
            	var q = vec(-1,0,0)
            	var y = 0, z = -R2
                for (var i=0; i<=2*N; i+=4) {
                	var rrel = (r.multiply(z).add(q.multiply(y)))
                	var r2 = rrel.add(R) // a point on the circular cross section
                	var L = vec(0, r2.y, r2.z).mag()*sphi // distance from point on cross section to end of cylindrical element
	                var end1 = r2.add(w.multiply(-L))
	                var end2 = r2.add(w.multiply(L))
	                
	                m.pos.push( end1.x,end1.y,end1.z,  end2.x,end2.y,end2.z )
	                
	                m.normal.push( rrel.x,rrel.y, rrel.z,  rrel.x,rrel.y, rrel.z )
                	
	                m.color.push( 1,1,1,  1,1,1 )
	                
	                m.opacity.push( 1, 1 )
	                
	                m.texpos.push( 0,0,  1,0 ) // TODO: these texpos values are not right
	                //m.texpos.push( 0.5*(1+z/R),0.5+0.5*y/R, 1-(i-2)/N/4,0, 0.5*(1-z/R),0.5+0.5*y/R, 1-(i-2)/N/4,1 )
	                
	                m.bumpaxis.push( 1,0,0,  1,0,0 )	                
	                
	                if (i != 2*N) m.index.push( i+1,i+3,i+7,    i+1,i+7,i+5  )
	                
	                newy = y*cosd + z*sind
	                newz = z*cosd - y*sind
	                y = newy
	                z = newz
	            }
            }
            return m
        },
        */

        makeSphere: function(R, N) {
            // A scheme which used spherical symmetry didn't save any time and was somewhat harder to read.
            // An improvement would be to offset alternate latitudes by dphi/2 to make equilateral triangles.
        	var Nlat = N, Nlong = N   // number of latitude and longitude slices
            var dtheta = Math.PI/Nlat   // polar angle (latitude)
            var dphi = 2*Math.PI/Nlong  // azimuthal angle (longitude)
            var sint = Math.sin(dtheta), cost = Math.cos(dtheta)
            var sinp = Math.sin(dphi), cosp = Math.cos(dphi)
            // sin(theta+dtheta) = sin(theta)*cost + cos(theta)*sint
            // cos(theta+dtheta) = cos(theta)*cost - sin(theta)*sint
            var m = new Mesh()
            var x1, x2, y1, y2, z1, z2, newy1, newz1, s, firstz2
            var i, j
            x1 = R // rightmost latitude in this latitude band
            y1 = 0
            z1 = 0
            // This algorithm started out with the "cut line" in from (z > 0).
            // z-related quantities now have minus signs to put the cut line at the back,
            // to make textures look better.
            for (i=0; i<Nlat; i++) { 
                    x2 = x1*cost-z1*sint // leftmost latitude in this latitude band
                    y2 = 0
                    firstz2 = z2 = z1*cost+x1*sint
                    for (j=0; j<=Nlong; j+=1) {
                    
                        m.pos.push( x1,y1,-z1 )
                        m.normal.push( x1/R,y1/R,-z1/R )
                        m.color.push( 1,1,1 )
                        m.opacity.push( 1 )
                        m.shininess.push( 1 )
                        m.emissive.push( 0 )
                        m.texpos.push( 1-j/Nlong,1-i/Nlat )
                        m.bumpaxis.push( 0,z1/R,y1/R )
                    
                        s = i*(Nlong+1)
                        if (j != Nlong) m.index.push( s+j,s+j+Nlong+2,s+j+1,  s+j,s+j+Nlong+1,s+j+Nlong+2 )
                    
                        newy1 = y1*cosp+z1*sinp
                        newz1 = z1*cosp-y1*sinp
                        y1 = newy1
                        z1 = newz1
                    }
                    x1 = x2
                    y1 = 0
                    z1 = firstz2
    	            if (i == Nlat-1) {
    	            	z1 = R // to make it possible to calculate bumpaxis
    	                for (j=0; j<=Nlong; j+=1) {
    	                    m.pos.push( -R,0,0 )
    	                    m.normal.push( -1,0,0 )
                            m.color.push( 1,1,1 )
                            m.opacity.push( 1 )
                            m.shininess.push( 1 )
                            m.emissive.push( 0 )
                            m.texpos.push( 1-j/Nlong,0 )
    	                    m.bumpaxis.push( 0,z1/R,y1/R )
                            newy1 = y1*cosp+z1*sinp
                            newz1 = z1*cosp-y1*sinp
    	                    y1 = newy1
    	                    z1 = newz1
    	                }
    	            }
                }
            return m
        },

        makeCone: function(R) {
            // This cone algorithm gives the same unsmooth display as PhiloGL and should be changed to use the
            // VPython algorithm, which apparently generates a series of rings in order to make the cone smooth.
            // Dave: You shouldn't need vertical slices to make the cone smooth.  I think you just need two triangles per "face" of the cone,
            //    so the normal on the edges can be different at the tip
        
            var N = 100 // number of sides of the cone, of radius 1 and axis < 1,0,0 >
            // Total number of pos is 3*N+1 = 301 for N = 100 (not smooth enough with N = 50)
            var dtheta = 2*Math.PI/N
            var sind = Math.sin(dtheta), cosd = Math.cos(dtheta)
            var k = 1/Math.sqrt(2)
            // sin(theta+dtheta) = sin(theta)*cosd + cos(theta)*sind, so newy = y*cosd + z*sind
            // cos(theta+dtheta) = cos(theta)*cosd - sin(theta)*sind, so newz = z*cosd - y*sind
            var y = 0, z = -R
            var newy, newz
            var m = new Mesh()
            m.pos.push( 0, 0, 0 )
            m.normal.push( -1, 0, 0 )
            m.color.push( 1, 1, 1 )
            m.opacity.push( 1 )
            m.shininess.push( 1 )
            m.emissive.push( 0 )
            m.texpos.push( 0.5,0.5 )
            m.bumpaxis.push( 0,0,1 )
            for (var i=1; i<=1+3*N; i+=3) {
                newy = y*cosd + z*sind
                newz = z*cosd - y*sind
            
                m.pos.push( 0,y,z,  0,y,z,      1,0,0 )
                
                m.normal.push( -1,0,0,  k,k*y,k*z,  k,k*(y+newy)/2,k*(z+newz)/2 )
                
                m.color.push( 1,1,1,  1,1,1,  1,1,1 )
                
                m.opacity.push( 1,  1,  1 )
                
                m.shininess.push( 1, 1, 1 )
                
                m.emissive.push( 0, 0, 0 )
                
                m.texpos.push( 0.5*(1+z/R),0.5*(1+y/R), 1-(i-1)/N/3,0,  1-(i-1)/N/3,1 )
                
                m.bumpaxis.push( 0,0,1,  0,0,1,  0,-z,y )
                 
                if (i != 1+3*N) m.index.push( 0,i,i+3,  i+1,i+2,i+4  )
            
                y = newy
                z = newz
            }
            return m
        },

        makePyramid: function() {
            // pyramid has base that is length (x) by width (z) by height (y); default axis is < 1,0,0 >
            var m = new Mesh()
            m.pos.push(
                    0,.5,.5,   0,.5,-.5,  0,-.5,-.5,  0,-.5,.5,  // base (on left)
                    0,.5,-.5,   0,.5,.5,    1,0,0,  // top
                    0,-.5,-.5,  0,.5,-.5,   1,0,0,  // back
                    0,-.5,.5,   0,-.5,-.5,  1,0,0,  // bottom
                    0,.5,.5,    0,-.5,.5,   1,0,0 ) // front
            m.normal.push(
                    -1,0,0,  -1,0,0,  -1,0,0,  -1,0,0,  // base (on left)
                    1,2,0,   1,2,0,   1,2,0,  // top
                    1,0,-2,  1,0,-2,  1,0,-2, // back
                    1,-2,0,  1,-2,0,  1,-2,0, // bottom
                    1,0,2,   1,0,2,   1,0,2 ) // front
            m.color.push(
            		1,1,1,  1,1,1,  1,1,1,  1,1,1,
            		1,1,1,  1,1,1,  1,1,1,
            		1,1,1,  1,1,1,  1,1,1,
            		1,1,1,  1,1,1,  1,1,1,
            		1,1,1,  1,1,1,  1,1,1)
            m.opacity.push(
            		1,  1,  1,  1,
            		1,  1,  1,
            		1,  1,  1,
            		1,  1,  1,
            		1,  1,  1 )
            m.shininess.push(
                    1,  1,  1,  1,
                    1,  1,  1,
                    1,  1,  1,
                    1,  1,  1,
                    1,  1,  1 )
             m.emissive.push(
                    0,  0,  0,  0,
                    0,  0,  0,
                    0,  0,  0,
                    0,  0,  0,
                    0,  0,  0 )
            m.texpos.push( 1,1, 0,1, 0,0, 1,0,           // base (on left) 
            				0,0,    0.25,0,   0.125,1,    // top
            				1,0,    0.75,0,   0.875,1,    // back
            				0.5,0,  0.75,0,   0.625,1,    // bottom
            				0.25,0, 0.5,0,    0.375,1 )   // front
            m.bumpaxis.push( 0,0,1, 0,0,1, 0,0,1, 0,0,1,     // base (on left)  
   				 			 0,0,1,  0,0,1,  0,0,1,          // top
            				 0,1,0,  0,1,0,  0,1,0,          // back  
            				 0,0,-1, 0,0,-1, 0,0,-1,         // bottom
            				 0,-1,0, 0,-1,0, 0,-1,0  )       // front
            m.index.push(0,1,2,  0,2,3,  4,5,6,  7,8,9,  10,11,12,  13,14,15)
            return m
        },
        
        makeCurveSegment: function(R) {
            // A low-triangle-count cylinder with a hemisphere at one end, to be rendered using the "curve_vertex" program
            // which will stretch the cylinder, but not the hemisphere, over the length of the segment.  To make this possible,
            // we provide 4D pos x,y,z,w, with w=0 being the beginning of the segment and w=1 the end. The position of a
        	// vertex with w=0 is relative to the beginning of the segment. The position of a vertex with w=1 is relative
        	// to the center of the hemisphere at the end of the segment. For example, x=0, y=0, z=0 with w=1 is the center
        	// of the hemisphere, whereas x=0, y=0, z=0 with w=0 is the center of the beginning of the segment.

            // An open-ended low-triangle-count cylinder for segments of a curve object
            var N = 16 // number of sides of the cylinder, of radius 1 and axis < 1,0,0 >
            // Total number of pos is 2*N = 32 for N = 16
            var dtheta = 2*Math.PI/N
            var sind = Math.sin(dtheta), cosd = Math.cos(dtheta)
            // sin(theta+dtheta) = sin(theta)*cosd + cos(theta)*sind, so newy = y*cosd + z*sind
            // cos(theta+dtheta) = cos(theta)*cosd - sin(theta)*sind, so newz = z*cosd - y*sind
            var y = 0, z = -R
            var newy, newz
            var m = new Mesh()
            for (var i=0; i<=2*N; i+=2) {
            
                m.pos.push( 0,y,z,0,  0,y,z,1 )
                m.normal.push(  0,y,z,  0,y,z )
                m.color.push( 1,1,1,  1,1,1 )
                m.opacity.push( 1, 1 )
                m.shininess.push ( 1, 1 )
                m.emissive.push( 0, 0 )
                m.texpos.push( 0,0, 0,0 ) // no textures or bumpmaps currently for curve points
                m.bumpaxis.push( 0,0,0, 0,0,0 )

                if (i != 2*N) m.index.push( i,i+2,i+1,  i+1,i+2,i+3  )
                
                newy = y*cosd + z*sind
                newz = z*cosd - y*sind
                y = newy
                z = newz
            }
            
            var offset = m.pos.length/4
            var sph = Mesh.makeSphere(R, N)
            // sph.pos.length/3 = 81 for N = 8; 9 pos per latitude (where points 0 and 8 coincide)
            for(var i=0; i<(N/2+1)*(N+1); i+=1) { // N/2+1 groups of N+1 pos for the hemisphere, including the equator
                m.pos.push( sph.pos[3*i], sph.pos[3*i+1], sph.pos[3*i+2], 1 )
                m.normal.push(sph.normal[3*i], sph.normal[3*i+1], sph.normal[3*i+2])
                m.color.push(1, 1, 1)
                m.opacity.push(1)
                m.shininess.push ( 1 )
                m.emissive.push( 0 )
                m.texpos.push( sph.texpos[2*i], sph.texpos[2*i+1] )
                m.bumpaxis.push( sph.bumpaxis[3*i], sph.bumpaxis[3*i+1], sph.bumpaxis[3*i+2] )
            }
            for(var i=0; i<sph.index.length/2; i++)
                m.index.push(sph.index[i] + offset)
            return m
        }
    })

    var exports = {
        Mesh:Mesh
        }

    Export(exports)
})();;(function () {
    "use strict";
    
    // keycode to character tables
    var _unshifted = ['', '', '', '', '', '', '', '', 'backspace', 'tab', // 0-9
                      '', '', '', '\n', '', '', 'shift', 'ctrl', 'alt', '', // 10-19
                      'caps lock', '', '', '', '', '', '', 'esc', '', '', // 20-29
                      '', '', ' ', 'pageup', 'pagedown', 'end', 'home', 'left', 'up', 'right', // 30-39
                      'down', '', '', '', ',', 'insert', 'delete', '/', '0', '1', // 40-49
                      '2', '3', '4', '5', '6', '7', '8', '9', '', ';', // 50-59
                      '', '=', '', '', '', 'a', 'b', 'c', 'd', 'e', // 60-69
                      'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', // 70-79
                      'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', // 80-89
                      'z', '[', '\\', ']', '', '', '`', '', '', '', // 90-99
                      '', '', '', '', '', '', '', '', '', '', // 100-109
                      '', '', '', '', '', '', '', '', '', '', // 110-119
                      '', '', '', '', '', '', '', 'delete'] //120-127
   _unshifted[187] = '='
   _unshifted[189] = '-'
   _unshifted[192] = "`"
   _unshifted[219] = '['
   _unshifted[220] = '\\'
   _unshifted[221] = ']'
   _unshifted[186] = ';'
   _unshifted[222] = "'"
   _unshifted[188] = ','
   _unshifted[190] = '.'
   _unshifted[191] = '/'
      
   var _shifted = ['', '', '', '', '', '', '', '', 'backspace', 'tab', // 0-9
      '', '', '', '\n', '', '', 'shift', 'ctrl', 'alt', 'break', // 10-19
      'caps lock', '', '', '', '', '', '', 'esc', '', '', //20-29
      '', '', '', '!', '"', '//', '$', '%', '&', '"', // 30-39
      '(', ')', '*', '+', '<', '_', '>', '?', ')', '!', // 40-49
      '@', '#', '$', '%', '^', '&', '*', '(', ':', ':', // 50-59
      '<', '=', '>', '?', '@', 'A', 'B', 'C', 'D', 'E', // 60-69
      'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', // 70-79
      'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', // 80-89
      'Z', '{', '|', '}', '^', '_', '~', '', '', '', // 90-99
      '', '', '', '', '', '', '*', '+', '', '', // 100-109
      '', '', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', // 110-119
      'f9', 'f10', '', '{', '|', '}', '~', 'delete'] //120-127
   _shifted[187] = '+'
   _shifted[189] = '_'
   _shifted[192] = "~"
   _shifted[219] = '{'
   _shifted[220] = '|'
   _shifted[221] = '}'
   _shifted[186] = ':'
   _shifted[222] = '"'
   _shifted[188] = '<'
   _shifted[190] = '>'
   _shifted[191] = '?'
    
    var shiftlock = false

    function canvas(options) {
        if (!(this instanceof canvas)) return new canvas(options)
        if (!options) options = {}

        canvas.all.push(this)
        canvas.selected = this

        for(var id in options) this[id] = options[id]

        // Lots of canvas's members are mutable objects, so they can't just be defined on canvas.prototype.
        this.events = $("<div/>")
        this.wrapper = $("<div/>")
        this.title = $("<div/>")
        this.menu = $("<div/>")
        this.caption = $("<div/>")
        this.__canvas_element = document.createElement('canvas')
        this.__overlay_element = document.createElement('canvas')
        this.elements = $([this.__canvas_element, this.__overlay_element])
        this.__overlay_objects = { objects: [], __changed: false }
        this.__visiblePrimitives = {}
        this.lights = [
            { direction: vec(0.21821789, 0.4364357, 0.8728715), color: vec(.8, .8, .8) },
            { direction: vec(-0.872872, -0.218218, -0.436436), color: vec(.3, .3, .3) },
        ]
        this.trails = [] // from attach_trail
        this.arrows = [] // from attach_arrow
        this.__points_objects = [] // list of points objects
        this.__opaque_objects = {}
        this.__transparent_objects = {}
        this.vertex_id = 1
        var N = 100 // the number of additional vertices to allocate each time we need more storage
        this.__vertices = {
            Nalloc:N, pos:new Float32Array(3*N), normal:new Float32Array(3*N), 
            color:new Float32Array(3*N), opacity:new Float32Array(N), 
            shininess:new Float32Array(N), emissive:new Float32Array(N),
            texpos:new Float32Array(2*N), bumpaxis:new Float32Array(3*N), 
            index: new Uint16Array(N), // not actually used
            model_transparent: false, // not actually used
            object_info:{} // vertex_object:[list of triangles/quads using this vertex]
        }
        // Sort triangles/quads into renderable categories. For example, an entry in opaque:textures
        // has the form texture_name:[indices of all the opaque triangles that share this texture].
        // In the case of plain, there's only one entry -- all:[indices...].
        // In lists of indices, quads are represented as 6 indices, already reduced to two triangles.
        this.__sort_objects = { 
            opaque: { plain:{}, textures:{}, bumpmaps:{}, textures_and_bumpmaps:{} },
            transparent: { plain:{}, textures:{}, bumpmaps:{}, textures_and_bumpmaps:{} }
        }
        this.camera = orbital_camera(this) // bind events first to the camera, for spin and zoom
        this.mouse = new Mouse(this)
        this.__range = 10
        this.__autoscale = true
        this.textures = {} // index loaded textures by file name; data is image
        this.textures_requested = {} // index requested textures by file name; data is list of requesting objects
        this.__changed = {}
        this.__vertex_changed = {}
        this.visible = true
        this.waitfor_textures = false
        this.__lastcenter = vec(0,0,0)
        this.__waitfor = '' // if waitfor('keydown keyup'), this.__waitfor is 'keydown keyup'
        this.__expecting_key = false // true if binding for keydown or keyup
    }
    property.declare( canvas.prototype, {
        __activate: function () {
            this.__activated = true
            this.__activate = function(){}

            var container = canvas.container
            this.title.css("white-space","pre").appendTo( container )
            this.menu.css("white-space","pre").appendTo( container )
            this.wrapper.addClass("glowscript-canvas-wrapper").appendTo( container )
            this.caption.css("white-space","pre").appendTo( container )
            this.wrapper.css("position", "relative")  // flows with page, but can have absolute positioning inside
            // this.wrapper.css("display", "inline-block")

            // TODO: Use jquery for this, too?
            var cv = this.__canvas_element
            cv.style.position = "absolute"  // removed from flow inside wrapper, so overlay will be positioned at the same spot
            
            var overlay = this.__overlay_element
            overlay.style.position = "relative"  // not removed from flow, so wrapper will be the right size
            overlay.style.backgroundColor = "transparent"

            this.__canvas_element.setAttribute('width', this.width)
            this.__overlay_element.setAttribute('width', this.width)
            this.__canvas_element.setAttribute('height', this.height)
            this.__overlay_element.setAttribute('height', this.height)
            this.wrapper.append(cv)
            this.wrapper.append(overlay)

            $(this.wrapper).resizable()
            $(this.wrapper).on("resize", {this: this},
                function( event, ui ) {
                    event.data.this.width=ui.size.width
                    event.data.this.height=ui.size.height
                }
            )
            if (!this.resizable) $(this.wrapper).resizable("disable")
                        
            this.__renderer = new WebGLRenderer( this, cv, overlay )
            if (this.camera.__activate) this.camera.__activate()
            this.__handleEvents()
        },

        __change_size: function() {
            if (this.__activated) {
                this.__canvas_element.style.width = Math.floor(this.width).toString()+"px"
                this.__overlay_element.style.width = Math.floor(this.width).toString()+"px"
                this.__canvas_element.style.height = Math.floor(this.height).toString()+"px"
                this.__overlay_element.style.height = Math.floor(this.height).toString()+"px"
            }
        },

        __handleEvents: function() {
            var canvas = this
            var elements = canvas.elements
            
            // Mouse and touch events other than mouseenter and mouseleave
            // are handled in orbital_camera.js which does all the logic
            // for calling (or not calling) canvas.trigger. For example,
            // a move of zero distance does not trigger a user event, and
            // a click event is triggered by an up event if the mouse has
            // moved no more than 5 pixels in x or y.
            elements.bind("mouseenter mouseleave", function(ev) {
            	if (ev.which == 1) canvas.trigger("mouse", ev) 
            })
            
            var keys = { shift:16, ctrl:17, alt:18 }
            // Mac cmd key is 91 on MacBook Pro but apparently may be different on other Macs.
            $(document).bind("keydown keyup", function (ev) { // keypress is not documented in GlowScript docs
                for (var k in keys) {
                    if (keys[k] == ev.which) {
                        canvas.mouse[k] = (ev.type == "keydown")
                        break
                    }
                }
            	if (canvas.__waitfor.length > 0 && (canvas.__waitfor.search(ev.type) < 0)) return
            	if (!canvas.__expecting_key) return
            	ev.event = ev.type
            	if (ev.which == 20 && ev.type == "keydown") shiftlock = !shiftlock
            	ev.shift = (canvas.mouse.shift || shiftlock)
            	ev.key = _unshifted[ev.which]
            	if (shiftlock && (65 <= ev.which && ev.which <= 90)) ev.key = _shifted[ev.which]
            	else if (canvas.mouse.shift) ev.key = _shifted[ev.which]
            	ev.alt = canvas.mouse.alt
            	ev.ctrl = canvas.mouse.ctrl
            	// The statement "canvas.trigger(ev.type, ev)" is needed to make keyboard events work,
            	// but if this statement is executed one cannot copy from a window, nor type into a textarea.
            	if (canvas.__waitfor) {
            		canvas.__expecting_key = false
            		canvas.__waitfor = ''
            		canvas.trigger(ev.type, ev) // make keyboard events work
            	} else if (canvas.__expecting_key) {
            		canvas.trigger(ev.type, ev) // make keyboard events work
            	}
            })
        },

        __change: function() {  // Called when attributeVectors are changed
            if (!this.__lastcenter.equals(this.__center) && this.mouse.pos) {
                // This update corrects for a change in canvas.center, which affects canvas.mouse.pos and ray.
                this.mouse.pos = this.mouse.pos.sub(this.__lastcenter).add(this.__center)
                this.mouse.ray = this.mouse.pos.sub(this.camera.pos).norm()
                this.__lastcenter = this.__center
            }
        },
        
        // Event handling functions, which just forward to this.events
        waitfor: function( eventTypes, callback ) {
        	if (eventTypes.search('key') >= 0) {
        		this.__waitfor = eventTypes
        		this.__expecting_key = true
        	} else {
        		this.__waitfor = ''
        		this.__expecting_key = false
        	}
            if (eventTypes == 'textures') this.waitfor_textures = true
            return this.events.waitfor(eventTypes, callback) 
        },
        pause: function( prompt_phrase, callback ) {
            if (arguments.length > 1) {
                if (this.__prompt == undefined) {
                    this.__prompt = label({
                        align:'right', pixel_pos:true, height:14, 
                        color:color.black, background:color.white, opacity:1, box:false
                    })
                }
                this.__prompt.pos = vec(this.__width,this.__height-12,0)
                this.__prompt.text = prompt_phrase
                this.__prompt.visible = true
                this.events.pause(this.__prompt, callback)
            } else {
                if (this.__draw == undefined) this.__draw = draw()
                var x = this.width-5, y = this.height-20
                this.__draw.points = [vec(x,y,0), vec(x-30,y-13,0), vec(x-30,y+15,0), vec(x,y,0)]
                this.__draw.opacity = 1
                this.__draw.color = color.black
                this.__draw.fillcolor = color.white
                this.__draw.visible = true
                this.events.pause(this.__draw, prompt_phrase) // only one argument passed to pause
            }
        },
        
        bind: function( eventTypes, callback ) {
        	if (eventTypes.search('key') >= 0) this.__expecting_key = true
        	return this.events.bind( eventTypes, callback )
        },
        
        unbind: function( eventTypes, callback ) {
        	if (eventTypes.search('key') >= 0) this.__expecting_key = false
        	return this.events.unbind( eventTypes, callback )
        },
        
        // "one" event needs some thought to deal with keyboard input properly, the problem being
        //    that with "bind" this.__expecting_key stays valid until "unbind", and
        //    with "waitfor" the processing of a keypress can set this.__expecting_key = false,
        //    but with "one" there's no obvious place to set this.__expecting_key = false.
        one: function( eventTypes, callback ) { return this.events.one( eventTypes, callback ) },
        
        trigger: function( type, ev ) {
        	if (type == "mouse") {
        		type = ev.type
        		// Send to user program minimal event data; may be expanded in the future
        		var ev = {type:type, pageX:ev.pageX, pageY:ev.pageY, which:1}
        		this.mouse.__update(ev)
	            ev.event = ev.type
	            ev.pos = this.mouse.pos
	            if (ev.type == 'mousedown') {
	                ev.press = 'left'
	                ev.release = null
	            } else if (ev.type == "mousemove") {
		            ev.press = null
		            ev.release = null
	            } else if (ev.type == "mouseup") {
	                ev.press = null
	                ev.release = 'left'
	            } else if (ev.type == "mouseenter" || ev.type == "mouseleave") {
	                ev.press = null
	                ev.release = null
	            } else if (ev.type == "click") {
	                ev.press = null
	                ev.release = 'left'
	            }
	        }
            var nev = new $.Event( type, ev )
            this.events.trigger(nev)
        },

        // Using attributeVector here ensures that there is an error if a program tries to modify e.g. scene.center.x
        // (rather than changing the prototype).  immutableVector would be better, or just copying these in the constructor
        background: new attributeVector(null,0,0,0),
        ambient: new attributeVector(null,0.2, 0.2, 0.2),
        center: new attributeVector(null,0,0,0),
        forward: new attributeVector(null,0,0,-1),
        up: new attributeVector(null,0,1,0),

        __last_forward: null,
        __activated: false,
        userzoom: true,
        userspin: true,
        fov: 60*Math.PI/180,
        
        width: { value: 640, onchanged: function() { this.__change_size() } },
        height: { value: 400, onchanged: function() { this.__change_size() } },
        resizable: {
            value: false,
            onchanged: function() {
                if (this.__activated) {
                    $(this.wrapper).resizable((this.resizable?"en":"dis")+"able")
                    
                }
            }
        },

        //autocenter: { value: false, onchanged: function(oldVal) { if (oldVal && !this.autocenter) Autoscale.compute_autocenter(this) } },

        autoscale: {
            get: function() { return this.__autoscale },
            set: function(value) {
                // If turning off autoscaling, update range to reflect the current size of the scene
                if (this.__autoscale && !value) Autoscale.compute_autoscale(this)
                this.__autoscale = value
            }
        },

        range: {
            get: function() {
                if (this.__autoscale) { // need to perform autoscale to update range
                    Autoscale.compute_autoscale(this)
                }
                return this.__range 
            },
            set: function(value) {
                this.__autoscale = false // no autoscaling if range set explicitly
                this.__range = value
            }
        },

        pixel_to_world: {
            get: function() {
                // Convert number of pixels into distance in real-world coordinates
                var w = this.__width
                var h = this.__height
                var d = 2*this.range
                if (w >= h) {
                    return d/h
                } else {
                    return d/w
                }
            },
            set: function(value) {
                throw new Error("Cannot assign a value to pixel_to_world.")
            }
        },
        
        objects: {
            get: function() {
                var all = []
                for(var id in this.__visiblePrimitives)
                  all.push(this.__visiblePrimitives[id])
                for(var id in this.__overlay_objects.objects) {
                    var obj = this.__overlay_objects.objects[id]
                    if (obj instanceof label) all.push(obj)
                }
                return all
            }
        }
    })

    // Static properties (canvas.*, rather than canvas().*)
    property.declare( canvas, {
        selected: { 
            get: function() { return window.__context.canvas_selected || null },
            set: function(value) { window.__context.canvas_selected = value }
        },
        all: {
            get: function() { 
                var v = window.__context.canvas_all
                if (v === undefined) v = window.__context.canvas_all = []
                return v
            }
        },
        container: { 
            get: function() { return window.__context.glowscript_container || null },
            set: function(value) { window.__context.glowscript_container = $(value) }
        },
    })

    // TODO: All the dependencies on camera and canvas internals
    function Mouse(canvas) {
        this.canvas = canvas
    }
    property.declare(Mouse.prototype, {
        canvas: null,
        pos: null,
        ray: null,
        __pickx: null,
        __picky: null,
        pick: function () {
            return this.canvas.__renderer.render(1) // render in hidden canvas to do GPU picking
        },
        project: function (args) {
            if (args.normal === undefined) throw new Error("scene.mouse.project() must specify a normal in {normal:..}")
            var normal = args.normal
            var dist
            if (args.d === undefined && args.point === undefined) dist = normal.dot(this.canvas.__center)
            else if (args.d !== undefined) {
                dist = args.d
            } else if (args.point !== undefined) {
                dist = normal.dot(args.point)
            }
            var ndc = normal.dot(this.canvas.camera.pos) - dist
            var ndr = normal.dot(this.ray)
            if (ndr == 0) return null
            var t = -ndc / ndr
            return this.canvas.camera.pos.add(this.ray.multiply(t))
        },
        alt: false,
        ctrl: false,
        shift: false,
        __update: function (ev) {
            var canvas = this.canvas, factor
            if (canvas.__width > canvas.__height) factor = 2 * canvas.__range / canvas.__height // real coord per pixel
            else  factor = 2 * canvas.__range / canvas.__width
            // mx,my in plane perpendicular to canvas.forward:
            var o = $(canvas.__canvas_element).offset()
            this.__pickx = ev.pageX - o.left
            this.__picky = canvas.__height - (ev.pageY - o.top)
            var mx = (this.__pickx - canvas.__width / 2) * factor
            var my = (this.__picky - canvas.__height / 2) * factor
            var xaxis = canvas.__forward.norm().cross(canvas.__up).norm()
            var yaxis = xaxis.cross(canvas.__forward.norm()) // this is normalized by construction
            this.pos = canvas.__center.add(xaxis.multiply(mx).add(yaxis.multiply(my)))
            this.ray = this.pos.sub(canvas.camera.pos).norm()
        }
    })

    var exports = { canvas: canvas }
    Export(exports)
})();; (function () {
    "use strict";

    function orbital_camera(canvas, args) {
        if (!(this instanceof orbital_camera)) return new orbital_camera(canvas, args)

        this.canvas = canvas
        this.follower = null
    }

    property.declare(orbital_camera.prototype, {
        pos: { get: function() {
            var c = this.canvas
            return c.center.sub( c.forward.norm().multiply( c.range / Math.tan(c.fov/2) ) )
            } },
        
        follow: function(objectOrFunction) { this.follower = objectOrFunction },

        __activate: function () {
            var canvas = this.canvas
            var camera = this

            var contextMenuDisabled = false
            var lastX=[null,null], lastY=[null,null] // corresponding to two fingers
            var downX=[null,null], downY=[null,null] // initial mouse locations
            var angleX = 0, angleY = 0
            var afterdown = false
            var rotating, zrotating, zooming // zrotating is subset of zooming (both involve two fingers)
            var leftButton=false, rightButton=false
            
            // The following variables have mainly to do with touch inputs
			var lastSep = null // previous separation of two fingers
            var lastAngle = null  // 0 to 2*pi angle of line from first finger to second figure (rotate about z)
			var fingers = 0    // number of fingers down
			var nomove = false // true if removing fingers from zooming
			var tstart         // time of touchstart
			var zoompos=[null,null] // locations of two fingers when 2nd finger makes contact
			var saveEvent      // touchstart event

            var zoom = function (delta) {
                var z = Math.exp(-delta * .05)
                canvas.range = canvas.range * z
            }
            
            var zrotate = function(dtheta) {
            	canvas.up = canvas.up.rotate({angle:2*dtheta, axis:canvas.__forward})
            }
            
            var spin = function(ev) {
                var dx = ev.pageX - lastX[0]
				var dy = ev.pageY - lastY[0]
                angleX += dx * .01
                angleY += dy * .01
                if (angleY < -1.4) angleY = -1.4
                if (angleY > 1.4) angleY = 1.4
                //var distance = canvas.range / Math.tan(canvas.fov / 2)
                canvas.__forward = canvas.__forward.rotate({angle:-.01 * dx, axis:canvas.up})
                var max_vertical_angle = canvas.up.diff_angle(canvas.__forward.multiply(-1))
                var vertical_angle = .01 * dy
                if (!(vertical_angle >= max_vertical_angle || vertical_angle <= (max_vertical_angle - Math.PI))) {
                    // Over the top (or under the bottom) rotation
                    canvas.__forward = canvas.__forward.rotate({angle:-vertical_angle, axis:canvas.__forward.cross(canvas.__up)})
                }
            }

            $(document).bind("contextmenu", function (e) {
                return !contextMenuDisabled
            })
            canvas.elements.mousewheel(function (ev, delta) { // ev.which is 0 during mousewheel move
                if (canvas.userzoom) zoom(delta)
                return false
            })
            
            canvas.elements.mousedown(function (ev) {
                // This basic mousedown event happens before the user program's mousedown event
                // ev.which is 1 for left button, 2 for mousewheel, 3 for right button
                if (ev.which == 1) leftButton = true
                if (ev.which == 3) rightButton = true
                rotating = canvas.userspin && (ev.which == 3 || (ev.which == 1 &&
                			 canvas.mouse.ctrl && !canvas.mouse.alt))
                zooming = canvas.userzoom && (ev.which == 2 || (ev.which == 1 &&
                			 canvas.mouse.alt && !canvas.mouse.ctrl) || (leftButton && rightButton))
                downX[0] = lastX[0] = ev.pageX
                downY[0] = lastY[0] = ev.pageY
                if (rotating || zooming) contextMenuDisabled = true
                else canvas.trigger("mouse", ev)
	            afterdown = true
	            ev.preventDefault()
	            ev.stopPropagation()
	            return false // makes jquery handlers execute preventDefault and stopPropagation
            })
            // Ideally we should bind and unbind this as rotating and zooming change
            $(document).mousemove(function (ev) {
            	if (!afterdown) return // eliminate mousemove events due to touchmove generating a mousemove
            	if (ev.pageX === lastX[0] && ev.pageY === lastY[0]) return
                if (zooming) {
                    var dy = lastY[0] - ev.pageY
                    if (dy !== 0) zoom(0.1 * dy)
                } else if (rotating) {
                	spin(ev)
                } else if (ev.which == 1) canvas.trigger("mouse", ev)
                lastX[0] = ev.pageX
				lastY[0] = ev.pageY
            })
            $(document).mouseup(function (ev) {
                if (ev.which == 1) leftButton = false
                if (ev.which == 3) rightButton = false
                if (ev.which == 3 && contextMenuDisabled)
                    setTimeout(function () { contextMenuDisabled = false }, 0)
                if (!(rotating || zooming) && ev.which == 1) {
                	canvas.trigger("mouse", ev) // the up event
                	if (abs(ev.pageX - downX[0]) <= 5 && abs(ev.pageY - downY[0]) <= 5) {
                		ev.type = "click"
                		canvas.trigger("mouse", ev) // add a click event
                	}
                }
                rotating = zooming = afterdown = false
            	lastX = [null,null]
            	lastY = [null,null]
            })
			
			$(canvas.elements).bind('touchstart', function (ev) {
			  rotating = zooming = nomove = false
			  lastSep = lastAngle = null
			  var pt
			  var data = ev.originalEvent.targetTouches
			  if (data.length > 2) return
			  if (data.length == 2 && !(canvas.userspin || canvas.userzoom)) return
			  fingers++
			  for (var i=0; i<data.length; i++) {
			  	  pt = data[i]
			      downX[i] = lastX[i] = pt.clientX
			      downY[i] = lastY[i] = pt.clientY
			      zoompos[i] = vec(downX[i], downY[i], 0)
			  }
			  lastSep = null
			  saveEvent = {type:"mousedown", pageX:downX[0], pageY:downY[0], which:1}
			  if (!(canvas.userspin || canvas.userzoom)) { // no need to delay decision about this event
			  	  canvas.trigger("mouse", saveEvent)
			  	  saveEvent = null
			  }
			  // Delay passing touchstart info until we've checked whether rotating or not
			  tstart = msclock()
              ev.preventDefault()
              ev.stopPropagation()
              return false // makes jquery handlers execute preventDefault and stopPropagation
			})
			
			$(document).bind('touchmove', function (ev) {
			  if (nomove) return
			  var t = msclock() - tstart
			  var data = ev.originalEvent.targetTouches
			  if (data.length > 2) return
			  var pt
			  var newx=[null,null], newy=[null,null]
			  var relx=[0,0], rely=[0,0]       // relative to downX, downY of touchstart
			  for (var i=0; i<data.length; i++) {
				  pt = data[i]
				  newx[i] = pt.clientX
				  newy[i] = pt.clientY
				  relx[i] = newx[i] - downX[i]
				  rely[i] = newy[i] - downY[i]
			  }
			  if (data.length == 2) {
			    if (!(canvas.userspin || canvas.userzoom)) return
			  	var dzoom = [null,null]
			  	if (!zooming) {
			  		zrotating = false
			  		for (var i=0; i<2; i++) dzoom[i] = vec(newx[i],newy[i],0).sub(zoompos[i])
			  		if (dzoom[0].mag() > 15 || dzoom[1].mag() > 15) { // can make a decision
			  			saveEvent = null
			  			zooming = true
			  			//if (dzoom[0].mag() <= 4 || dzoom[1].mag() <= 4) zrotating = true
			  			var r = zoompos[1].sub(zoompos[0]).norm() // unit vector from one finger to the other
			  			var angmom = r.cross(dzoom[1]).sub(r.cross(dzoom[0])).mag()
			  			if (angmom > 10) {
			  				zrotating = canvas.userspin
			  				if (!canvas.userspin) zooming = false
			  			}
			  		} else return
			  	}
			  }
			  if (saveEvent !== null) { // not yet emitted mousedown event
			    if (data.length == 2) {
			  		saveEvent = null
			  	} else {
			  		var near = (relx[0] <= 5 && rely[0] <= 5)
			  		if (!rotating && t > 150 && near) {
			  			// The following triggers a mousedown event from within a touchmove
			  			// context, with the result that the mousemove event above gets
			  			// triggered but is ignored without a preceding real mousedown event.
			  			canvas.trigger("mouse", saveEvent)
			  			saveEvent = null
			  		} else if (!near) {
			  			rotating = canvas.userspin
			  			saveEvent = null
			  		}
			  	}
			  } else {
			  	  if (newx[0] === lastX[0] && newy[0] === lastY[0] &&
			  	  	  newx[1] === lastX[1] && newy[1] === lastY[1]) return
                  ev.pageX = newx[0]
                  ev.pageY = newy[0]
                  ev.type = "mousemove"
			      if (rotating) spin(ev)
			      else if (zooming) {
		        	  var xx = newx[1] - newx[0]
		              var yy = newy[1] - newy[0]
		              if (zrotating) {
			              var angle = Math.atan2(yy, xx)
			              if (lastAngle !== null) {
			      	  		var dangle
			              	var va = vec(Math.cos(lastAngle),Math.sin(lastAngle),0)
			              	var vb = vec(Math.cos(angle),    Math.sin(angle),    0)
			              	var vc = va.cross(vb)
			              	var amag = Math.abs(Math.asin(vc.mag()))
			              	if (vc.z >= 0) dangle = -amag
			              	else dangle = amag
			              	zrotate(dangle)
			              }
			              lastAngle = angle
		              } else if (canvas.userzoom) { // zooming
		              	var sep = Math.sqrt(xx*xx + yy*yy)
		                if (lastSep !== null && sep != lastSep) zoom(0.2*(sep -lastSep))
					  	lastSep = sep
					  }
			      } else canvas.trigger("mouse", ev)
			  }
			  lastX[0] = newx[0]
			  lastX[1] = newx[1]
			  lastY[0] = newy[0]
			  lastY[1] = newy[1]
			})
			
			$(document).bind('touchend', function (ev) {
				fingers--
				if (saveEvent !== null && !(rotating || zooming)) {
					canvas.trigger("mouse", saveEvent)
					saveEvent = null
				}
				var data = ev.originalEvent.changedTouches
			    ev.pageX = data[0].clientX
			    ev.pageY = data[0].clientY
                if (!(rotating || zooming)) {
				    ev.type = "mouseup"
	                canvas.trigger("mouse", ev) // the up event
	                	if (abs(ev.pageX - downX[0]) <= 5 && abs(ev.pageY - downY[0]) <= 5) {
	                		ev.type = "click"
	                		canvas.trigger("mouse", ev) // add a click event
	                	}
                }
                if (zooming) {
                	if (fingers > 0) nomove = true
                	else zooming = nomove = false
                }
	            rotating = false
            	lastX = [null,null]
            	lastY = [null,null]
            	lastSep = lastAngle = null
			})
        }
    })

    var exports = {
        orbital_camera: orbital_camera
    }
    Export(exports)
})();; (function () {
    "use strict";

    // CPU-based autoscaling module
    // TODO: This is messy.  Maybe we can get the GPU to do some of this and save some code *and* processor time

    function extent() { }
    $.extend(extent.prototype, {
        xmin: null,
        ymin: null,
        zmin: null,
        xmax: null,
        ymax: null,
        zmax: null,
        zx_camera: 0,
        zy_camera: 0,
        last_zx_camera: -1,
        last_zy_camera: -1,
        find_autocenter: false,

        point_extent: function (obj, p) {
            this.xmin = Math.min(p.x, this.xmin)
            this.ymin = Math.min(p.y, this.ymin)
            this.zmin = Math.min(p.z, this.zmin)
            this.xmax = Math.max(p.x, this.xmax)
            this.ymax = Math.max(p.y, this.ymax)
            this.zmax = Math.max(p.z, this.zmax)

            // TODO: This doesn't work when obj.__xmin is null and the object doesn't contain 0!
            obj.__xmin = Math.min(p.x, obj.__xmin)
            obj.__ymin = Math.min(p.y, obj.__ymin)
            obj.__zmin = Math.min(p.z, obj.__zmin)
            obj.__xmax = Math.max(p.x, obj.__xmax)
            obj.__ymax = Math.max(p.y, obj.__ymax)
            obj.__zmax = Math.max(p.z, obj.__zmax)
        }
    })

    var exports = {
        Autoscale: {
            compute_autocenter: function compute_autocenter(canvas) {
                var ext = canvas.__extent
                if (!ext) ext = canvas.__extent = new extent()
                ext.find_autocenter = true
                ext.xmin = null
                ext.ymin = null
                ext.zmin = null
                ext.xmax = null
                ext.ymax = null
                ext.zmax = null
                ext.zx_camera = 0
                ext.zy_camera = 0
                var cot_hfov = 1 / Math.tan(canvas.__fov / 2)
                ext.__cot_hfov = cot_hfov // used by extent routines
                ext.__centerx = canvas.center.x
                ext.__centery = canvas.center.y
                ext.__centerz = canvas.center.z
                var check = false
                var obj
                for (var id in canvas.__visiblePrimitives) {
                    obj = canvas.__visiblePrimitives[id]
                    check = true
                    if (canvas.__changed[obj.__id])
                        obj.__get_extent(ext)
                    else {
                        ext.xmin = Math.min(ext.xmin, obj.__xmin)
                        ext.ymin = Math.min(ext.ymin, obj.__ymin)
                        ext.zmin = Math.min(ext.zmin, obj.__zmin)
                        ext.xmax = Math.max(ext.xmax, obj.__xmax)
                        ext.ymax = Math.max(ext.ymax, obj.__ymax)
                        ext.zmax = Math.max(ext.zmax, obj.__zmax)
                    }
                }
                if (check) {
                    canvas.center = vec((ext.xmin + ext.xmax) / 2, (ext.ymin + ext.ymax) / 2, (ext.zmin + ext.zmax) / 2)
                }
                ext.find_autocenter = false
            },
            compute_autoscale: function compute_autoscale(canvas) {
                var ext = canvas.__extent
                if (!ext) ext = canvas.__extent = new extent()
                var ctrx = canvas.center.x, ctry = canvas.center.y, ctrz = canvas.center.z
                var all = canvas.__visiblePrimitives

                ext.zx_camera = 0
                ext.zy_camera = 0
                var cot_hfov = 1 / Math.tan(canvas.__fov / 2)
                ext.__cot_hfov = cot_hfov // used by extent routines
                ext.__centerx = canvas.center.x
                ext.__centery = canvas.center.y
                ext.__centerz = canvas.center.z
                var check = false
                
                var obj
                for (var id in all) {
                    obj = all[id]
                    if (obj.constructor.name == 'point') continue // extent is handled by curve
                    if (obj.constructor.name == 'points') continue // should be handled by extent of points' spheres
                    check = true
                    if (canvas.__changed[obj.__id] || obj.__zx_camera == null || obj.__zy_camera == null) {
                        obj.__get_extent(ext)
                        var xx = Math.max(Math.abs(obj.__xmin - ctrx), Math.abs(obj.__xmax - ctrx))
                        var yy = Math.max(Math.abs(obj.__ymin - ctry), Math.abs(obj.__ymax - ctry))
                        var zz = Math.max(Math.abs(obj.__zmin - ctrz), Math.abs(obj.__zmax - ctrz))
                        obj.__zx_camera = xx * cot_hfov + zz
                        obj.__zy_camera = yy * cot_hfov + zz
                    }
                    ext.zx_camera = Math.max(ext.zx_camera, obj.__zx_camera)
                    ext.zy_camera = Math.max(ext.zy_camera, obj.__zy_camera)
                }
                if (check) {
                    if (ext.zx_camera > ext.last_zx_camera || ext.zx_camera < ext.last_zx_camera / 3 ||
                            ext.zy_camera > ext.last_zy_camera || ext.zy_camera < ext.last_zy_camera / 3) {
                        var predicted_zy = ext.zx_camera * canvas.__height / canvas.__width
                        if (predicted_zy > ext.zy_camera) {
                            if (canvas.__width >= canvas.__height) {
                                canvas.__range = 1.1 * (canvas.__height / canvas.__width) * ext.zx_camera / cot_hfov
                            } else {
                                canvas.__range = 1.1 * ext.zx_camera / cot_hfov
                            }
                        }
                        else {
                            if (canvas.__width >= canvas.__height) {
                                canvas.__range = 1.1 * ext.zy_camera / cot_hfov
                            } else {
                                canvas.__range = 1.1 * (canvas.__width / canvas.__height) * ext.zy_camera / cot_hfov
                            }
                        }
                        ext.last_zx_camera = ext.zx_camera
                        ext.last_zy_camera = ext.zy_camera
                    }
                }
            },

            find_extent: function find_extent(obj, ext) {
                if (obj.constructor.name == 'points') return // should be handled by extent of points' spheres
            	
                var size = obj.__size
                var sizex = size.__x, sizey = size.__y, sizez = size.__z
                var start = obj.__pos
                var startx = start.__x, starty = start.__y, startz = start.__z

                var center_pos = obj.__hasPosAtCenter
                var length;
                if (center_pos)
                    length = Math.sqrt(sizex * sizex + sizey * sizey + sizez * sizez) / 2
                else
                    length = Math.sqrt(sizex * sizex + sizey * sizey / 4 + sizez * sizez / 4)
                if (!ext.find_autocenter) {
                    // Quick check for whether this changed object can affect autoscaling
                    var px = startx - ext.__centerx
                    var py = starty - ext.__centery
                    var pz = startz - ext.__centerz
                    var zzx = (Math.abs(px) + length) * ext.__cot_hfov + Math.abs(pz) + length
                    var zzy = (Math.abs(py) + length) * ext.__cot_hfov + Math.abs(pz) + length
                    if (zzx < ext.zx_camera && zzy < ext.zy_camera) {
                        obj.__zx_camera = null  // obj.__zx_camera is no longer correct
                        obj.__zy_camera = null
                        return
                    }
                }
                var axis = obj.__axis.norm()
                var up = obj.__up.norm()
                if (center_pos) start = start.sub(axis.multiply(sizex / 2))
                var long = axis.multiply(sizex)
                var z = axis.cross(up).norm()
                if (z.dot(z) < 1e-10) {
                    z = axis.cross(vec(1, 0, 0)).norm()
                    if (z.dot(z) < 1e-10) z = axis.cross(vec(0, 1, 0)).norm()
                }
                var y = z.cross(axis)
                var pt1 = start.add(y.multiply(-sizey / 2).add(z.multiply(-sizez / 2)))
                var pt2 = pt1.add(y.multiply(sizey))
                var pt3 = pt1.add(z.multiply(sizez))
                var pt4 = pt2.add(z.multiply(sizez))
                var pt5 = pt1.add(long)
                var pt6 = pt2.add(long)
                var pt7 = pt3.add(long)
                var pt8 = pt4.add(long)

                ext.point_extent(obj, pt1)
                ext.point_extent(obj, pt2)
                ext.point_extent(obj, pt3)
                ext.point_extent(obj, pt4)
                ext.point_extent(obj, pt5)
                ext.point_extent(obj, pt6)
                ext.point_extent(obj, pt7)
                ext.point_extent(obj, pt8)
            }
        }
    }

    Export(exports)
})();;(function () {
    "use strict";
    
    // mode values:
    var RENDER = 0, PICK = 1, EXTENT = 2, RENDER_TEXTURE = 3
    // minor mode values for depth peeling:
    var PEEL_C0 = 4  // color map for opaque objects
    var PEEL_D0 = 5  // create depth buffer D0 for opaque objects
    var PEEL_C1 = 6  // 1st transparency color map
    var PEEL_D1 = 7  // create depth buffer D1 for 1st transparent peel based on D0
    var PEEL_C2 = 8  // 2nd transparency color map
    var PEEL_D2 = 9  // create depth buffer D2 for 2nd transparent peel based on D0 and D1 
    var PEEL_C3 = 10 // 3rd transparency color map
    var PEEL_D3 = 11 // create depth buffer D3 for 3rd transparent peel based on D0 and D2
    var PEEL_C4 = 12 // 4th transparency color maps
    var MERGE   = 13 // merge C0, C1, C2, C3, C4 onto a quad

    var fps = 0                // measured average frames per second
    var renderMS = 0           // measured average milliseconds per render
    var lastStartRedraw = 0    // time in milliseconds of most recent start of render
    var lastEndRedraw = 0      // time in milliseconds of most recent end of render\

    function WebGLRenderer(canvas, canvasElement, overlay) {
    	//canvas.caption.text("1.1dev 10:45")
    	
        var renderer = this
        var gl = WebGLUtils.setupWebGL(canvasElement) // main canvas
        if (!gl) throw new Error("Can't create canvas: WebGL not supported")
        
        // The hidden canvas for pick evaluation must have antialias turned off.
        // Otherwise on a seam between two objects the pixel may be averaged between the two object values.
        // TODO: maybe pick label objects?
        
        canvas.overlay_context = overlay.getContext("2d") // for label and pause displays
        
        // Place these statements here rather than inside the render function,
        // to avoid repeated garbage collection. However, seemed to make little difference.
        var MAX_LIGHTS = 8
        var light_pos = new Float32Array( MAX_LIGHTS*4 )
        var light_color = new Float32Array( MAX_LIGHTS*3 )
		var light_ambient = new Float32Array( 3 )
		var canvas_size = new Float32Array( 2 )
		var save = new Array(4)
		var pixels = new Uint8Array(4)
        
        // A non-power-of-two texture has restrictions; see
        //    http://www.khronos.org/webgl/wiki/WebGL_and_OpenGL_Differences
        // So we render to a power-of-two texture, and in the shaders in
        // RENDER_TEXTURE mode we display a quad with the texture to fit the canvas.
        // Important note: This destroys antialiasing, so render to texture is
        // fully useful only for doing some computations, unless we do our own antialiasing.
        // We could render to a large offscreen texture, say twice the width and height.
        
        // Texture usage: TEXTURE0/TECTURE1 are user textures/bumpmaps to apply to an object
        //  TEXTURE2/TEXTURE3 are the color and depth maps for the opaque objects
        //  TEXTURE4/TEXTURE5/TEXTURE6 are depth maps for depth-peeling
        //  TEXTURE7/TEXTURE8/TEXTURE9/TEXTURE10 are the color maps for depth-peeled transparency renders
    
	    // It seems to be the case that shader compilation times are long in the presence of ifs.
	    // For that reason the various rendering situations are split into separate shaders.
        // Shaders are compiled as needed. For example, if there are no transparent objects,
        // the depth peeling shaders are not compiled.
	    var standard_program = null, curve_program = null, triangle_program = null // mode == RENDER || minormode == PEEL_C0
	    var peel_depth_programD0 = null // PEEL_D0
	    var peel_color_programC1 = null // PEEL_C1
	    var peel_depth_programD1 = null // PEEL_D1
	    var peel_color_programC2 = null // PEEL_C2
	    var peel_depth_programD2 = null // PEEL_D2
	    var peel_color_programC3 = null // PEEL_C3
	    var peel_depth_programD3 = null // PEEL_D3
	    var peel_color_programC4 = null // PEEL_C4
	    var tri_peel_color_program = null, tri_peel_depth_program = null
	    var pick_program = null, curve_pick_program = null, tri_pick_program = null // mode == PICK
	    var extent_program = null, curve_extent_program = null // mode == EXTENT, which doesn't work yet
	    var merge_program = null // mode == RENDER_TEXTURE
	    var merge_program2 = null // mode == RENDER_TEXTURE for mobile devices with few texture units
        
        // Might render to extra-large texture to reduce aliasing:
        var k = 1
        var Twidth = k*canvas.__width
        var Theight = k*canvas.__height
        
        var peels = {C0:null, D0:null, C1:null, D1:null, C2:null, D2:null, C3:null, D3:null, C4:null, EXTENT_TEXTURE:null}
        
        // TEXTURE0 and TEXTURE1 are used for object textures and bumpmaps
        var textureN = {C0:gl.TEXTURE2, D0:gl.TEXTURE3, C1:gl.TEXTURE4, D1:gl.TEXTURE5, 
        		        C2:gl.TEXTURE6, D2:gl.TEXTURE7, C3:gl.TEXTURE8, D3:gl.TEXTURE9, C4:gl.TEXTURE10,
        				EXTENT_TEXTURE:gl.TEXTURE11}
        
        function makeTexture(T) {
	        peels[T] = gl.createTexture()
	        gl.activeTexture(textureN[T])
    		gl.bindTexture(gl.TEXTURE_2D, peels[T])
	        
	        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	        // EXTENT_TEXTURE not working yet
	        if (false && T == 'EXTENT_TEXTURE') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Twidth, Theight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	        gl.bindTexture(gl.TEXTURE_2D, null)
	    }
        
        for (var T in peels) {
        	makeTexture(T) 
        }
        
        var peelFramebuffer = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, peelFramebuffer)
        
        var peelRenderbuffer = gl.createRenderbuffer() // create depth buffer
        gl.bindRenderbuffer(gl.RENDERBUFFER, peelRenderbuffer)
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, Twidth, Theight)
        //gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA4, Twidth, Theight)
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, peelRenderbuffer)
        
        gl.bindRenderbuffer(gl.RENDERBUFFER, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        
        var fullpeels = (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) >= 16) // iPad Mini 2 has only 8
        
        /*
        alert(fullpeels+', '+gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)+', '+
        	gl.getParameter(gl.MAX_TEXTURE_SIZE)+', '+
        	gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)+', '+
        	gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)+', '+
        	gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)+', '+
        	gl.getParameter(gl.MAX_VERTEX_ATTRIBS)+', '+
        	gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)+', '+
        	gl.getParameter(gl.MAX_VARYING_VECTORS)+', '+
        	gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))
        */
        
        // In shaders, gl_MaxDrawBuffers (minimum 1), the size of the gl_FragData array.
        // Four different Windows machines with GT 240, 8500 GT, and GTX 590 all have
        // MAX_TEXTURE_SIZE, MAX_COMBINED_TEXTURE_IMAGE_UNITS, MAX_VERTEX_ATTRIBS, MAX_VERTEX_UNIFORM_VECTORS.
        // MAX_VERTEX_TEXTURE_IMAGE_UNITS, MAX_VARYING_VECTORS, MAX_FRAGMENT_UNIFORM_VECTORS:
        //	  8192, 8192, 20, 16, 254, 4, 10, 221
        // Dual-boot Windows/Ubuntu machine with GeForce 8500 GT claims on Ubuntu to have
        //    8192, 8192, 96, 16, 1024, 32, 15, 512
        //    This is strange, because running Windows on this dual-boot machine I get the numbers shown above.
        //    It is quite possible the wrong driver is present on Ubuntu and is reporting wrong data.
        // MacBook Pro with GeForce 8600M GT has 
        //    8192, 8192, 16, 16, 1024, 16, 15, 1024
        
        // "shaders" is an object exported by shaders.gen.js (when running a new version)
        // or by glow.X.Y.min.js for an official version. The Python program build.py,
        // or its reduced version build_only_shaders.py, creates shaders.gen.js.
        function shaderProgram(fragSrc, vertSrc, gls) {
            function makeShader(text, type, glx) {
                var shader = glx.createShader(type)
                glx.shaderSource(shader, text)
                glx.compileShader(shader)
                if (!glx.getShaderParameter(shader, glx.COMPILE_STATUS)) {
                    alert( glx.getShaderInfoLog(shader) )
                    throw new Error("Shader compile error")
                }
                return shader
            }
            var vertexShader = makeShader(vertSrc, gls.VERTEX_SHADER, gls)
            var fragmentShader = makeShader(fragSrc, gls.FRAGMENT_SHADER, gls)
            var P = gls.createProgram()
            gls.attachShader(P, vertexShader)
            gls.attachShader(P, fragmentShader)
            gls.linkProgram(P)
            if (!gls.getProgramParameter(P, gls.LINK_STATUS)) {
                alert(gls.getProgramInfoLog(P))
                throw new Error("Shader link error")
            }
            var uniforms = gls.getProgramParameter(P, gls.ACTIVE_UNIFORMS)
            P.uniforms = {}
            for (var i = 0; i < uniforms; i++) {
                var t = gls.getActiveUniform(P, i)
                var name = t.name
                if (name.substring(name.length-3)=="[0]") name = name.substring(0, name.length-3)
                P.uniforms[name] = gls.getUniformLocation(P, name)
                //console.log('uniforms',t.name, name)
            }
            var attributes = gls.getProgramParameter(P, gls.ACTIVE_ATTRIBUTES)
            P.attributes = {}
            for (var i = 0; i < attributes; i++) {
                var t = gls.getActiveAttrib(P, i)
                P.attributes[t.name] = gls.getAttribLocation(P, t.name)
                //console.log('attributes',t.name, name)
            }
            return P
        }
    	  
        var Model = function(mesh, dynamism) {
        	if (dynamism) this.dynamism = gl.DYNAMIC_DRAW
        	else this.dynamism = gl.STATIC_DRAW // cannot change the built-in models
        	this.elementType = gl.TRIANGLES
    		this.mesh = mesh
        	this.model_transparent = mesh.model_transparent
            this.pos = new Float32Array(mesh.pos)
            this.normal = new Float32Array(mesh.normal)
        	this.color = new Float32Array(mesh.color)
        	this.opacity = new Float32Array(mesh.opacity)
        	this.shininess = new Float32Array(mesh.shininess)
        	this.emissive = new Float32Array(mesh.emissive)
        	this.texpos = new Float32Array(mesh.texpos)
        	this.bumpaxis = new Float32Array(mesh.bumpaxis)
            this.index = new Uint16Array(mesh.index)

            this.posBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.pos, this.dynamism)

            this.normalBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.normal, this.dynamism)
            
            this.colorBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.color, this.dynamism)
			
            this.opacityBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.opacityBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.opacity, this.dynamism)
			
            this.shininessBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.shininessBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.shininess, this.dynamism)
			
            this.emissiveBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.emissiveBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.emissive, this.dynamism)
            
            this.texposBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.texposBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.texpos, this.dynamism)

            this.bumpaxisBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bumpaxisBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, this.bumpaxis, this.dynamism)
			
            this.indexBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.index, this.dynamism)
        }
        
        var mbox = new Model( Mesh.makeCube(), false )
        var mcylinder = new Model( Mesh.makeCylinder(.5), false )
        var msphere = new Model( Mesh.makeSphere(.5,30), false )
        var mpyramid = new Model( Mesh.makePyramid(), false )
        var mcone = new Model( Mesh.makeCone(.5), false )
        
        // These get rendered with the standard (non-curve) vertex program
        var object_models = {
            triangle: new Model( canvas.__vertices, true),			 	 // triangles and quads
            quad: new Model( Mesh.makeQuad(), false ),		 			 // used just to merge; the user quad object generates triangles
       		curve: new Model( Mesh.makeCurveSegment(1), false )          // default curve_segment size is (1,1,1)
        }
        
        // Only create the models that will be used, because the renderer loops over models
        if (window.__GSlang == 'vpython') {
        	object_models.vp_box = mbox
        	object_models.vp_pyramid = mpyramid
        	object_models.vp_cylinder = mcylinder
        	object_models.vp_cone = mcone
        	object_models.vp_sphere = msphere
        	object_models.vp_ellipsoid = msphere
        } else {
        	object_models.box = mbox
        	object_models.pyramid = mpyramid
        	object_models.cylinder = mcylinder
        	object_models.cone = mcone
        	object_models.sphere = msphere
        }
        
        var models = this.models = {}
        for(var id in object_models) models[id] = object_models[id]
        
        this.add_model = function(mesh, dynamism) {
    	   var i = mesh.__mesh_id
    	   models[i] = object_models[i] = new Model(mesh, dynamism)
    	   models[i].id_object = {}
        }
        
        this.screenshot = function screenshot(callback) {
            canvas.waitfor("draw_complete", function(err) {
            var image = new Image()
            image.src = canvasElement.toDataURL()
            callback( err, image )
            })
        }

        this.reset = function () {
            for (var t in object_models)
                object_models[t].id_object = {}
        }

        var camera = { target: vec3.create([0,0,0]), up: vec3.create([0,1,0]), fovy: 60, angleX: 0, angleY: 0, distance: 1 }
        
        this.reset()
        
        function isPowerOfTwo(x) {
            return (x & (x - 1)) === 0
        }
         
        function nextHighestPowerOfTwo(x) {
            --x;
            for (var i = 1; i < 32; i <<= 1) {
                x = x | x >> i
            }
            return x + 1
        }
        
        function handleLoadedTexture(image, obj, bump) {
            var name, t0, ref
        	if (bump) {
        		name = obj.__tex.bumpmap
        		ref = obj.__tex.bumpmap_ref
        		t0 = obj.__tex.bumpmap_t0
        	} else {
        		name = obj.__tex.file
        		ref = obj.__tex.texture_ref
        		t0 = obj.__tex.texture_t0
        	}
			var tf = msclock()
			tf = tf-t0
			if (name in canvas.textures) {
            	ref.reference = canvas.textures[name]
            } else {
            	canvas.textures[name] = ref.reference = gl.createTexture()
	            gl.bindTexture(gl.TEXTURE_2D, ref.reference)
	            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
			    if (!isPowerOfTwo(image.width) || !isPowerOfTwo(image.height)) {
			        // Scale up the texture width and height to the next higher power of 2.
			        var c = document.createElement("canvas")
			        c.width = nextHighestPowerOfTwo(image.width)
			        c.height = nextHighestPowerOfTwo(image.height)
			        var ctx = c.getContext("2d")
			        ctx.drawImage(image, 0, 0, c.width, c.height)
			        image = c;
			    }
	            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	    		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	    		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST)
	            gl.generateMipmap(gl.TEXTURE_2D)
	            gl.bindTexture(gl.TEXTURE_2D, null)
            }
        	if (name in canvas.textures_requested) {
        		var done = canvas.textures_requested[name]
        		while (done.length > 0) {
        			var data = done.pop()
        			if (data[1]) {
        				data[0].__tex.bumpmap_ref.reference = ref.reference
        			} else {
        				data[0].__tex.texture_ref.reference = ref.reference
        			}
        			data[0].__change()
        		}
        	}
        }
        
        this.initTexture = function (name, obj, bump) { // bump is true if it's a bump map
            if (bump) obj.__tex.bumpmap = name
        	else obj.__tex.file = name
        	if (name in canvas.textures) {
	        	if (bump) obj.__tex.bumpmap_ref.reference = canvas.textures[name]
	        	else obj.__tex.texture_ref.reference = canvas.textures[name]
	        	return
	        }
        	if (name in canvas.textures_requested) {
        		canvas.textures_requested[name].push([obj,bump])
        		return
        	} else canvas.textures_requested[name] = [[obj,bump]]
        	var t0 = msclock()
        	if (bump) obj.__tex.bumpmap_t0 = t0
        	else obj.__tex.texture_t0 = t0
        	// http://hacks.mozilla.org/2011/11/using-cors-to-load-webgl-textures-from-cross-domain-images/
        	var image = new Image()
            image.crossOrigin = "anonymous"
            image.src = name
            image.onload = function() { handleLoadedTexture(image, obj, bump) }
        }

        var update_vertices = 0 // signal to render_triangles to update vertex information
        
//--------------------------------------------------------------------------------------------------------
//--------------------------------------------------------------------------------------------------------
            
        // mode: RENDER = 0, PICK = 1, EXTENT = 2, RENDER_TEXTURE = 3
        this.render = function(mode) {
        	
            if (mode == RENDER) {
	            var check_objects = canvas.objects
	    		if (canvas.waitfor_textures) {
	        		for (var o in check_objects) {
	        			var obj = check_objects[o]
	        			if (obj.__tex === undefined) continue
	        			if (!obj.ready) return
	        		}
	        		canvas.waitfor_textures = false
	        		canvas.trigger("textures", null)
	        	}
            }
            
            if (!canvas.visible) {
            	if (mode == RENDER) return
            	return null
            }
            
            //if (canvas.autocenter) Autoscale.compute_autocenter(canvas) // scene.autocenter has been abolished
            
            // autoscale of 10x10x10 cubes takes about 10 ms.
            // Since minimum readPixels is about 7 ms, if autoscaling is done
            // by the GPUs we should not read back the computed camera distance
            // unless the program requests that value, as we do with pick.
            // The computed camera distance should just stay in GPU memory.
            
            // An attempt to do the autoscale computation in the GPUs (mode = EXTENT)
            // took about 60 ms for 10x10x10 cubes, and didn't work. However, if it
            // could be made to work fully, without having to use readPixels to
            // get the camera distance to the CPU, it might be advantageous; hard to say.
            // The attempted EXTENT algorithm was to render off-screen (using the PICK
            // mechanism) with POINTS instead of __triangles and with the depth criterion
            // set to GREATER instead of LEQUAL, with the depth set to the extent of
            // a point. Setting gl_Position to a single location failed, as did setting
            // it to a position based on false-color ID: readPixels always gets zero.
            // Code is left in place for a possible later try.
            
            if (canvas.autoscale) Autoscale.compute_autoscale(canvas)
            
            if (canvas.camera.follower !== null) {
            	// Setting canvas.center will adjust canvas.mouse.pos if necessary
                canvas.center = (typeof canvas.camera.follower !== "function") ? canvas.camera.follower.pos :
                    canvas.camera.follower()
            }
            
            if (mode == RENDER) {
                for (var i in canvas.arrows) { // attach_arrow
                    var a = canvas.arrows[i]
                    if (!a.run) continue
                    if (a.obj !== undefined) {
                        if (a.obj.pos !== undefined) a.arrow.pos = a.obj.pos
                        else continue // trailed object no longer exists
                    }
                    if (a.last_pos !== null && pos.equals(a.last_pos)) continue
                    if (!a.arrow.visible) a.arrow.visible = true
                    a.arrow.axis_and_length = a.obj[a.attr].multiply(a.scale)
                    /*
                    // TODO: The following needs revision after further discussion of the API:
                    
                    if (typeof a.attr !== "function") { // a string representing an attribute
                        a.arrow.axis_and_length = a.obj[a.attr].multiply(a.scale)
                    } else { // a function to be called
                        a.arrow.axis_and_length = a.attr().multiply(a.scale)
                    }
                    */
                }
            
                for (var i in canvas.trails) { // attach_trail
                    // TODO: Need to handle visible intelligently
                    var pos
                    var a = canvas.trails[i]
                    if (!a.__run) continue
                    if (typeof a.__obj !== "function") {
                        if (a.__obj !== undefined) {
                            if (a.__obj.pos !== undefined) pos = a.__obj.pos
                            else continue // trailed object no longer exists
                        }
                    } else pos = a.__obj()
                    if (a.__last_pos !== null && pos.equals(a.__last_pos)) continue
                    if (a.pps > 0) {
                        var tnow = msclock()
                        if (a.__last_time === null) a.last_time = tnow
                        if (tnow-a.__last_time > 1000/a.pps) a.__last_time = tnow
                        else if (tnow != a.__last_time) continue
                    }
                    if (a.retain > 0 && a.__elements == a.retain) {
                        if (a.type == 'curve') {
                            a.__curve.shift()
                            a.__curve.push(pos)
                        } else {
                        	var s = a.__spheres.shift()
                        	s.pos = pos
                        	a.__spheres.push(s)
                        }
                    } else {
                        if (a.type == 'curve') a.__curve.push(pos)
                        else {
                        	var sobj = (window.__GSlang == 'vpython') ? vp_sphere : sphere
                        	var s = sobj({pos: pos, canvas:a.__options.canvas, color:a.__options.color, size:a.__options.size,
                        		pickable:a.__options.pickable})
                        	a.__spheres.push(s)
                        }
                        a.__elements += 1
                    }
                    a.__last_pos = vec(pos) // save a copy of pos
                }
            }
        
            camera.target = vec3.create([canvas.__center.x, canvas.__center.y, canvas.__center.z])
            camera.up = vec3.create([canvas.__up.x, canvas.__up.y, canvas.__up.z])
            camera.fovy = canvas.__fov*180/Math.PI
            var xz_unit_vector = vec(canvas.__forward.x,0,canvas.__forward.z).norm()
            camera.angleX = Math.atan2(xz_unit_vector.x,-xz_unit_vector.z)
            camera.angleY = Math.PI/2 - Math.acos(-canvas.__forward.norm().y)
            if (canvasElement.clientWidth >= canvasElement.clientHeight) camera.distance = canvas.__range/Math.tan(canvas.__fov/2)
            else camera.distance = canvas.__range*(canvasElement.clientHeight / canvasElement.clientWidth)/Math.tan(canvas.__fov/2)
            
            camera.pos = mat4.multiplyVec3(
                mat4.rotateX(mat4.rotateY(mat4.identity(mat4.create()), -camera.angleX), -camera.angleY),
                vec3.create([0,0,camera.distance]))
            camera.pos = vec3.create([canvas.__center.x+camera.pos[0],
                                      canvas.__center.y+camera.pos[1],
                                      canvas.__center.z+camera.pos[2]])
            
            // For picking, we only need to render the pixel under the mouse, but scissoring makes no difference in pick time (why?).
            // With or without scissoring, pick in 1000-rotating-boxes takes about 12 ms in 100x100 canvas, about 20 ms in 1000x1000 canvas.
            // Compare with normal render of about 8 ms in 100x100 canvas, about 10 ms in 1000x1000 canvas.
            /*
            if (mode == PICK) {
                gl.scissor(canvas.mouse.__pickx, canvas.mouse.__picky, 1, 1)
                gl.enable(gl.SCISSOR_TEST)
            } else gl.disable(gl.SCISSOR_TEST)
            */

	        // Compute a view and projection matrix from camera, z range, and the canvas aspect ratio
	        camera.zNear = camera.distance / 100
	        camera.zFar = camera.distance * 10
	        var projMatrix = mat4.perspective( camera.fovy, canvasElement.clientWidth / canvasElement.clientHeight, camera.zNear, camera.zFar)
	        var viewMatrix = mat4.lookAt(camera.pos, camera.target, camera.up)
	        //mat4.multiply(projMatrix, viewMatrix, viewMatrix)
	
            // Transform lights into eye space
            var light_count = Math.min(canvas.lights.length, MAX_LIGHTS)
            for(var i=0; i<light_count; i++) {
                var light = canvas.lights[i]
                if (light.direction === undefined)
                    var lightVec4 = [ light.pos.x, light.pos.y, light.pos.z, 1 ]
                else
                    var lightVec4 = [ light.direction.x, light.direction.y, light.direction.z, 0 ]
                light.transformed = lightVec4
                mat4.multiplyVec4(viewMatrix, lightVec4)
                for(var c=0; c<4; c++)
                    light_pos[i*4+c] = lightVec4[c]
                light_color[i*3] = light.color.x
                light_color[i*3+1] = light.color.y
                light_color[i*3+2] = light.color.z
            }
            
            light_ambient[0] = canvas.ambient.x
            light_ambient[1] = canvas.ambient.y
            light_ambient[2] = canvas.ambient.z
            
            // Make spheres used in points object have nearly constant size independent of zoom
            if (canvas.__points_objects.length > 0) {
	            var ptsobj = canvas.__points_objects
	        	var scale = 3*canvas.__range/canvas.__width
	        	var D
	            for (var i=0; i<ptsobj.length; i++) {
	            	var p = ptsobj[i]
	            	if (p.__pixels) {
		            	if (p === undefined || p.__last_range === canvas.__range) continue
		            	p.__last_range = canvas.__range
		            	D = (p.__size === 0) ? 5*scale : scale*p.__size
	            	} else D = p.__size
	            	for (var s=0; s<p.__points.length; s++) p.__points[s].size = vec(D,D,D)
	            }
            }
                
            if (mode == RENDER) { // for PICK and EXTENT, ignore labels and other objects on overlay for now
                if (canvas.__overlay_objects.objects.length > 0 && (canvas.__overlay_objects.__changed ||
                        !(canvas.__forward.equals(canvas.__last_forward) && (canvas.__range == canvas.__last_range)))) {
                    canvas.__overlay_objects.__changed = false
                    var ctx = canvas.overlay_context
                    ctx.clearRect(0, 0, canvas.__width, canvas.__height)
                    for (var i=0; i<canvas.__overlay_objects.objects.length; i++) {
                        var obj = canvas.__overlay_objects.objects[i]
                        if (!obj.visible) continue
                        obj.__update(ctx, camera)
                    }
                }
            }
            
            var lengths = {pos:3, normal:3, color:3, opacity:1, shininess:1, emissive:1, texpos:2, bumpaxis:3}
            var c = canvas.__vertices
            //var vertex_changed = new Uint8Array(canvas.vertex_id+1) // initialized to zeros
            //var start = canvas.vertex_id, end = 0
    		
            for (var id in canvas.__vertex_changed) {
            	var vert = canvas.__vertex_changed[id]
            	var Nvert = vert.__id
            	update_vertices++
            	//if (Nvert < start) start = Nvert
            	//if (Nvert > end) end = Nvert
            	//vertex_changed[Nvert] = 1
    			
    			for (var t in lengths) {
    				var g = vert['__'+t]
    				if (lengths[t] == 1) {
    					c[t][Nvert]   = g
    				} else if (lengths[t] == 2) {
    					c[t][2*Nvert]   = g.x
    					c[t][2*Nvert+1] = g.y
    				} else {
    					c[t][3*Nvert]   = g.x
    					c[t][3*Nvert+1] = g.y
    					c[t][3*Nvert+2] = g.z
    				}
    			}
            }
            canvas.__vertex_changed = {}
            
            // It is considerably slower to update even contiguous vertices with gl.bufferSubData
            // than simply to update the entire data on every render using gl.bufferData, so at
            // least for now we'll abandon using gl.bufferSubData and rather use gl.bufferData.
            // gl.bufferSubData was slower whether one updated contiguous runs of changed vertices
            // or updated from the first changed vertex to the last (the version shown here).
            // Perhaps one could get some benefit if update_vertices is a relatively small
            // fraction of the total number of vertices, given by canvas.vertex_id. My tests
            // were in a situation where nearly half the vertices were changing.
            /*
            if (update_vertices) {
	            var start = null, end
	            for (var i=0; i<canvas.vertex_id+1; i++) {
	            	if (vertex_changed[i]) {
	            		if (start === null) start = i
	            		else end = i
	            	}
	            }
    			// modified vertices run from start to end inclusive
    			gl.bindBuffer(gl.ARRAY_BUFFER, models.triangle.paramsBuffer)
				gl.bufferSubData(gl.ARRAY_BUFFER, 4*2*start, c.params.subarray(2*start, 2*(end+1)))
				for (var t in lengths) {
					gl.bindBuffer(gl.ARRAY_BUFFER, models.triangle[t+"Buffer"])
	                gl.bufferSubData(gl.ARRAY_BUFFER, 4*start*lengths[t], c[t].subarray(start*lengths[t], (end+1)*lengths[t]))
				}
    			update_vertices = 0
        	}
        	*/
            
            /*
            // Another attempt at using gl.bufferSubData, which doesn't help
            if (update_vertices) {
    			// modified vertices run from start to end inclusive
    			gl.bindBuffer(gl.ARRAY_BUFFER, models.triangle.paramsBuffer)
				gl.bufferSubData(gl.ARRAY_BUFFER, 4*2*start, c.params.subarray(2*start, 2*(end+1)))
				for (var t in lengths) {
					gl.bindBuffer(gl.ARRAY_BUFFER, models.triangle[t+"Buffer"])
	                gl.bufferSubData(gl.ARRAY_BUFFER, 4*start*lengths[t], c[t].subarray(start*lengths[t], (end+1)*lengths[t]))
				}
    			update_vertices = 0
            }
            */
            
            for (var id in canvas.__changed) {
            	canvas.__changed[id].__update()
            	delete canvas.__changed[id]
            }
            // Repeat, to catch cases of objects created by objects in the first loop,
            // such as for example a helix that creates a curve.
            for (var id in canvas.__changed) {
            	canvas.__changed[id].__update()
            }
            canvas.__changed = {}
            
            for (var m in object_models) {
            	canvas.__opaque_objects[m] = {}
            	canvas.__transparent_objects[m] = {}
            }
            
            var need_RENDER_TEXTURE = false
            for (var m in object_models) {
                if (m == 'triangle' || m == 'quad' || m == 'point') continue
            	var model = object_models[m]
                var objs = model.id_object
                for (var id in objs) {
					var obj = objs[id]
					if (m == 'curve') {
						canvas.__opaque_objects[m][id] = obj
						continue
					}
                    var data = obj.__data
                    if (mode == RENDER && (data[19] < 1.0 || model.model_transparent)) {
                    	canvas.__transparent_objects[m][id] = obj
                    	need_RENDER_TEXTURE = true
					} else {
						canvas.__opaque_objects[m][id] = obj
					}
                }
            }
            
            /*
            // The following code was an attempt to categorize non-triangles/quads into
            // opaque and transparent categories. It needs more work because it needs to
            // be consistent with the visible attribute. Currently this code will retain
            // in canvas.__opaque or canvas.__transparent an object that has been made
            // invisible.
            function categorize(obj) {
	    		var m = obj.constructor.name
	        	var model = object_models[m]
	        	var transparent = (obj.__opacity < 1)
	        	if (obj.__prev_opacity === null) { // this object has not been previously categorized
	        		obj.__prev_opacity = obj.__opacity
	        		if (transparent) {
	        			if (canvas.__transparent_objects[m] === undefined) {
	        				canvas.__transparent_objects[m] = {}
	        			}
	        			canvas.__transparent_objects[m][id] = obj
	        		} else {
	        			if (canvas.__opaque_objects[m] === undefined) {
	        				canvas.__opaque_objects[m] = {}
	        			}
	        			canvas.__opaque_objects[m][id] = obj
	        		}
	        	} else if ( !obj.__opacity_change ) {
	        		return
	        	} else {
	            	// The opaque/transparent category has changed since the last render.
	                // Remove id from previous category, add to other category.
	                obj.__prev_opacity = obj.__opacity
	                if (transparent) {
	                	delete canvas.__opaque_objects[m][id]
	                	canvas.__transparent_objects[m][id] = obj
	                } else {
	                	delete canvas.__transparent_objects[m][id]
	                	canvas.__opaque_objects[m][id] = obj
	                }
	        	}
            }
            
            // Categorize non-triangle/quad objects as opaque or transparent:
            for (var id in canvas.__changed) {
            	var obj = canvas.__changed[id]
            	obj.__update()
            	if (obj instanceof triangle || obj instanceof quad) continue
                if (obj.__components) {
                	for (var i = 0; i < obj.__components.length; i++) 
                		categorize(obj.__components[i], obj.__components[i].__id)
                } else {
                	categorize(obj, id)
                }
            	obj.__opacity_change = false
            }
            
            // Determine whether there are any transparent elements in the scene:
            var need_RENDER_TEXTURE = false
            var c = canvas.__transparent_objects
            if (c !== undefined) {
	            for (var m in c) {
	            	if (object_models[m].model_transparent) {
	        			need_RENDER_TEXTURE = true
	        			break
	            	}
	            	if (c[m] !== undefined) {
	            		for (var id in c[m]) {
	            			need_RENDER_TEXTURE = true
	            			break
	            		}
	            	}
	            }
            }
            if (!need_RENDER_TEXTURE) {
                var c = canvas.__opaque_objects
                if (c !== undefined) {
	                for (var m in c) {
	                	if (object_models[m].model_transparent) {
	            			need_RENDER_TEXTURE = true
	            			break
	                	}
	                }
                }
            }
            */
            
            // We should incrementally categorize triangles into opaque/transparent, plain/texture/bumpmap/texture and bumpmap
            // In a dynamic rug with 1000 vertices, about half of them changing, 20 ms of the 30 ms render time is spent
            // doing this categorization, running through all triangles/quads at the start of each render. But after making some
            // preliminary stabs at this (in the case of the non-triangle/quad objects) I'm setting this issue aside for now.
            // Both the other objects as well as triangle/quads should be categorized incrementally,
            // which requires some significant reworking.
            var sort = canvas.__sort_objects
            for (var op in sort) { // reset the sorting of triangle objects
            	for (var a in sort[op]) 
            		sort[op][a] = {}
            }
            
            var Nvert
            var vnames = ['v0', 'v1', 'v2', 'v3']
        	
        	function add_indices(A, T, obj) {
        		var c = A[T]
        		if (c === undefined) c = A[T] = [obj] // representative object is given as first element of list
        		if (Nvert == 3) c.push(obj.v0.__id, obj.v1.__id, obj.v2.__id)
    			else c.push(obj.v0.__id, obj.v1.__id, obj.v2.__id, obj.v0.__id, obj.v2.__id, obj.v3.__id)
            	/*
            	var s = ''
            	var t = canvas.__sort_objects.opaque.plain.all
            	for (var n=1; n<c.length; n++) {
            		var j = c[n]
            		s += j+': '
            		s += '  '+t.pos[3*j]+', '+t.pos[3*j+1]+', '+t.pos[3*j+2]+'\n'
            		s += '     '+t.normal[3*j]+', '+t.normal[3*j+1]+', '+t.normal[3*j+2]+'\n'
            	}
            	canvas.caption.text(s)
            	*/
        	}
        	
        	var pickdata = {pos:[], color:[], index:[]}
            
            // Set up triangles (or triangles from quads)
        	var triangles_exist = false, model
        	for (var m=0; m<2; m++) {
            	if (m === 0) {
            		Nvert = 3
            		model = object_models['triangle']
            	} else {
            		Nvert = 4
            		model = object_models['quad']
            	}
	            var objs = model.id_object
	            for (var id in objs) {
	            	triangles_exist = true
	            	var obj = objs[id] 
	            	if (mode == PICK) {
	            		var color = obj.__falsecolor
	            		var p
        				for (var i=0; i<3; i++) {
        					p = obj[vnames[i]].pos
        					pickdata.pos.push(p.x, p.y, p.z)
	        				pickdata.color.push(color[0], color[1], color[2], color[3])
	        				pickdata.index.push(pickdata.index.length)
        				}
	        			if (Nvert == 4) {
	        				var indices = [0,2,3]
	        				for (var ind in indices) {
	        					var i = indices[ind]
	        					p = obj[vnames[i]].pos
	        					pickdata.pos.push(p.x, p.y, p.z)
		        				pickdata.color.push(color[0], color[1], color[2], color[3])
		        				pickdata.index.push(pickdata.index.length)
	        				}
	        			}
	            	} else if (mode == RENDER) {
		            	var opaque = true
		            	for (var i=0; i<Nvert; i++) {
			            	if (obj[vnames[i]].opacity < 1) {
			            		opaque = false
			            		break
			            	}
			            }
		        		var t = obj.__tex.file
		        		var b = obj.__tex.bumpmap
		            	if (opaque) {
		            		if (t !== null) {
		            			add_indices(sort.opaque.textures, t, obj)
		            			if (b != null) {
		            				add_indices(sort.opaque.textures_and_bumpmaps, b, obj)
		            			}
		            		} else if (b != null) {
		            			add_indices(sort.opaque.bumpmaps, b, obj)
		            		} else add_indices(sort.opaque.plain, 'all', obj)
		            	} else {
		            		need_RENDER_TEXTURE = true
		            		if (t !== null) {
		            			add_indices(sort.transparent.textures, t, obj)
		            			if (b != null) {
		            				add_indices(sort.transparent.textures_and_bumpmaps, b, obj)
		            			}
		            		} else if (b != null) {
		            			add_indices(sort.transparent.bumpmaps, b, obj)
		            		} else add_indices(sort.transparent.plain, 'all', obj)
		            	}
	            	}
	            }
            }
            
            if (need_RENDER_TEXTURE) mode = RENDER_TEXTURE
            
            var program
            
            canvas_size[0] = Twidth
            canvas_size[1] = Theight
            
            function useProgram(prog, minormode) {
                // This needs to happen once per program, before rendering objects with that program
                program = prog
                gl.useProgram(prog)
                gl.enableVertexAttribArray(prog.attributes.pos)
                if (mode == MERGE || minormode > PEEL_D0)
                	gl.uniform2fv(prog.uniforms.canvas_size, canvas_size)
                
                if (minormode != MERGE) {
	                
	                if (mode == RENDER || minormode == PEEL_C0 || minormode == PEEL_C1 ||
	                		              minormode == PEEL_C2 || minormode == PEEL_C3 || 
	                		              minormode == PEEL_C4) {
		                gl.uniform1i(prog.uniforms.light_count, light_count)
		                gl.uniform4fv(prog.uniforms.light_pos, light_pos)
		                gl.uniform3fv(prog.uniforms.light_color, light_color)
		                gl.uniform3fv(prog.uniforms.light_ambient, light_ambient)
	                	gl.enableVertexAttribArray(prog.attributes.normal)
		                if (prog != curve_program) {
			                gl.enableVertexAttribArray(prog.attributes.color) 
			                gl.enableVertexAttribArray(prog.attributes.opacity) 
			                gl.enableVertexAttribArray(prog.attributes.shininess) 
			                gl.enableVertexAttribArray(prog.attributes.emissive)
			                gl.enableVertexAttribArray(prog.attributes.texpos)
			                gl.enableVertexAttribArray(prog.attributes.bumpaxis)
			                gl.uniform1i(prog.uniforms.texmap, 0)  // TEXTURE0 - user texture
			                gl.uniform1i(prog.uniforms.bumpmap, 1) // TEXTURE1 - user bumpmap
		                }
	                }
	                
	                gl.uniformMatrix4fv(prog.uniforms.viewMatrix, false, viewMatrix)
	                gl.uniformMatrix4fv(prog.uniforms.projMatrix, false, projMatrix)
	                //if (mode == EXTENT) gl.uniform3fv(prog.uniforms.center, camera.target) // doesn't work yet
		                
                } 
                if (minormode == MERGE) {
                	gl.uniform1i(prog.uniforms.C0, 2) // TEXTURE2   - opaque color map
                    gl.uniform1i(prog.uniforms.C1, 4) // TEXTURE4   - color map for transparency render 1
                    if (fullpeels) { // plenty of texture units available
                        gl.uniform1i(prog.uniforms.C2, 6) // TEXTURE6   - color map for transparency render 2
	                    gl.uniform1i(prog.uniforms.C3, 8) // TEXTURE8   - color map for transparency render 3
	                	gl.uniform1i(prog.uniforms.C4,10) // TEXTURE10  - color map for transparency render 4
                    }
                } else if (minormode > PEEL_D0) {
	                gl.uniform1i(prog.uniforms.D0, 3)     // TEXTURE3 - opaque depth map
	                if (minormode == PEEL_C2 || minormode == PEEL_D2)
	                	gl.uniform1i(prog.uniforms.D1, 5) // TEXTURE5 - 1st depth map
	                else if (minormode == PEEL_C3 || minormode == PEEL_D3)
	                	gl.uniform1i(prog.uniforms.D2, 7) // TEXTURE7 - 2nd depth map
	                else if (minormode == PEEL_C4)
	                	gl.uniform1i(prog.uniforms.D3, 9) // TEXTURE9 - 3rd depth map
                }
                
            }
            
            //console.log(light_count, light_pos, light_color, program.uniforms.light_count, program.uniforms.light_pos, program.uniforms.light_color, program.uniforms.light_ambient)
            
            // If culling is enabled, __triangles are one-sided, but 10x10x10 cube rendering time
            // seems not to change much, and there are advantages to two-sided triangles.
            //gl.enable(gl.CULL_FACE)
            
            function subrender(minormode, T, Trefs) {
            	if (mode == RENDER_TEXTURE && Trefs.length > 0) {
            		for (var i=0; i<Trefs.length; i++) {
	            		var a = Trefs[i]
	            		if (a == T) continue
	            		gl.activeTexture( textureN[a] )
	            		gl.bindTexture(gl.TEXTURE_2D, peels[a])
	            	}
	            }
            	
            	if (T === null) {
	            	gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            	} else {
            		gl.bindFramebuffer(gl.FRAMEBUFFER, peelFramebuffer)
            		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, peels[T], 0)
            	}
	            
	            gl.viewport(0, 0, Twidth, Theight)
	            gl.enable(gl.DEPTH_TEST)
	            if (mode == PICK || minormode > PEEL_C0) gl.clearColor(0, 0, 0, 0)
	            else if (mode == EXTENT) gl.clearColor(0, 0, 0, 1)
	            else gl.clearColor(canvas.__background.x, canvas.__background.y, canvas.__background.z, 1)
	            if (mode == EXTENT) {
	            	gl.depthFunc(gl.GREATER)
	                gl.clearDepth(0) // set to 0 if using gl.GREATER
	            } else {
	            	gl.depthFunc(gl.LEQUAL)
	            	gl.clearDepth(1) // set to 1 if using gl.LEQUAL
	            }
	            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	
	            function render_curves() {
		            var model = object_models.curve
		            var objs = model.id_object
		            var elements = model.elementType
	                var model_length = model.index.length
		            var setup = true
		            for(var id in objs) {
		            	if (!objs[id].visible) break // if the entire curve is invisible
		                
		            	if (minormode > PEEL_C0) break  // currently curves are opaque, with no texture
						if (setup) {
				            // Render all curve segments, using a special program
				            // Needs more work to build C0 and D0 textures to include the opaque curves.
				            if (minormode == RENDER || minormode == PEEL_C0) {
				            	if (curve_program == null) curve_program = shaderProgram( shaders.opaque_render_fragment, shaders.curve_render_vertex, gl )
				            	useProgram(curve_program, minormode)
			            	} else if (minormode == PICK) {
				            	if (curve_pick_program == null) curve_pick_program = shaderProgram( shaders.pick_fragment, shaders.curve_pick_vertex, gl )
				            	useProgram(curve_pick_program, minormode)
				            } //else if (mode == EXTENT) useProgram(curve_extent_program, 0, 0)
				            
				            gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
							gl.vertexAttribPointer(program.attributes.pos, 4, gl.FLOAT, false, 0, 0)
							if (minormode != PICK) {
								gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer)
								gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0)
							}
							gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer)
							if (mode == EXTENT) elements = gl.POINTS // no need to process interiors of __triangles
							setup = false
						}

						var obj = objs[id]
						var p = obj.__points
						var length = p.length
						var save_radius = obj.__data[15]
						if (save_radius === 0) { // overall radius
							 obj.__data[15] = 6*canvas.__range/canvas.__width
						}
						gl.uniform4fv(program.uniforms.objectData, obj.__data) // overall curve data
						for (var t=1; t<length; t++) {
							var pnt = p[t]	
			                if (!pnt.visible) continue					
			                var data = pnt.__prevsegment
			                if (mode == PICK) {
			                    var falsecolor = pnt.__falsecolor
			                    for (var i=0; i<4; i++) {
			                        save[i] = data[8+i]
			                        save[i+4] = data[12+i]
			                        data[12+i] = data[8+i] = falsecolor[i]
			                    }
			                }
			                gl.uniform4fv(program.uniforms.segmentData, data) // point data for this curve
			                gl.drawElements(elements, model_length, gl.UNSIGNED_SHORT, 0)
			                if (mode == PICK) {
			                    for (var i=0; i<8; i++) data[8+i] = save[i]
			                }
			                
						}
						obj.__data[15] = save_radius
		            }
	            }
	            
	            function render_triangles() {
	            	var model = object_models.triangle 
	            	var elements = model.elementType
	                var model_arrays = canvas.__vertices
	                if (mode != PICK) {
	                    if (PEEL_D0 <= minormode && minormode <= PEEL_D2) {
			            	if (tri_peel_depth_program == null) tri_peel_depth_program = shaderProgram( shaders.peel_depth_fragment, shaders.tri_render_vertex, gl )
			            	useProgram(tri_peel_depth_program, minormode)
			            } else if (minormode > PEEL_C0) {
			            	if (tri_peel_color_program == null) tri_peel_color_program = shaderProgram( shaders.peel_color_fragment, shaders.tri_render_vertex, gl )
			            	useProgram(tri_peel_color_program, minormode)
			            } else if (mode == RENDER || mode == RENDER_TEXTURE) {
			            	if (triangle_program == null) triangle_program = shaderProgram( shaders.opaque_render_fragment, shaders.tri_render_vertex, gl )
			            	useProgram(triangle_program, minormode)
			            } else if (mode == EXTENT) { // The EXTENT machinery doesn't actually work
		            		if (extent_program == null) extent_program = shaderProgram( shaders.pick_fragment, shaders.extent_vertex, gl )
			            	useProgram(extent_program, minormode)
						}
	            	} else {
		            	if (tri_pick_program == null) tri_pick_program = shaderProgram( shaders.pick_fragment, shaders.tri_pick_vertex, gl )
		            	useProgram(tri_pick_program, minormode)
                		model_arrays = {}
	                	model_arrays.pos = new Float32Array(pickdata.pos)
                		model_arrays.color = new Float32Array(pickdata.color)
                		model_index = new Uint16Array(pickdata.index)
                		model_length = model_index.length
                		
			            gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
		                gl.bufferData(gl.ARRAY_BUFFER, model_arrays.pos, gl.DYNAMIC_DRAW)
						gl.vertexAttribPointer(program.attributes.pos, 3, gl.FLOAT, false, 0, 0)
						
						gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer)
		                gl.bufferData(gl.ARRAY_BUFFER, model_arrays.color, gl.DYNAMIC_DRAW)
						gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0)
						
						gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer)
		                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model_index, gl.DYNAMIC_DRAW)
						gl.vertexAttribPointer(program.attributes.color, 4, gl.FLOAT, false, 0, 0)
						
	                	gl.drawElements(elements, model_length, gl.UNSIGNED_SHORT, 0)
	                	
	                	// Restore standard pos and color data:
	                	gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
		                gl.bufferData(gl.ARRAY_BUFFER, canvas.__vertices.pos, gl.DYNAMIC_DRAW)
		                
						gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer)
		                gl.bufferData(gl.ARRAY_BUFFER, canvas.__vertices.color, gl.DYNAMIC_DRAW)
						return
					}
		            
		            gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.pos, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.pos, 3, gl.FLOAT, false, 0, 0)
	                
					gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.color, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0)
		            
					gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.normal, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0)
					
					gl.bindBuffer(gl.ARRAY_BUFFER, model.opacityBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.opacity, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.opacity, 1, gl.FLOAT, false, 0, 0)
					
					gl.bindBuffer(gl.ARRAY_BUFFER, model.shininessBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.shininess, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.shininess, 1, gl.FLOAT, false, 0, 0)
					
					gl.bindBuffer(gl.ARRAY_BUFFER, model.emissiveBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.emissive, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.emissive, 1, gl.FLOAT, false, 0, 0)
					
					gl.bindBuffer(gl.ARRAY_BUFFER, model.texposBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.texpos, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.texpos, 2, gl.FLOAT, false, 0, 0)
					
					gl.bindBuffer(gl.ARRAY_BUFFER, model.bumpaxisBuffer)
	                if (update_vertices) gl.bufferData(gl.ARRAY_BUFFER, model_arrays.bumpaxis, gl.DYNAMIC_DRAW)
					gl.vertexAttribPointer(program.attributes.bumpaxis, 3, gl.FLOAT, false, 0, 0)
					
		            update_vertices = 0 // clear this counter only after making sure the vertex info has been sent to the GPUs
					
	                var sort = canvas.__sort_objects
	                
	                for (var op in sort) { // opaque and transparent
	                  if (minormode > PEEL_D0) {
	                	  if (op == 'opaque') continue
	                  } else {
	                	  if (op == 'transparent') continue
	                  }
		              for (var sort_type in sort[op]) { // plain, textures, bumpmaps, textures_and_bumpmaps
		                for (var sort_list in sort[op][sort_type]) { // lists of index values
		                	
		                	var indices = sort[op][sort_type][sort_list]
		                	var tbobj = indices[0] // representative object is given as first element of list
		                	var model_index = new Uint16Array(indices.slice(1))
		                	var model_length = model_index.length
							
							gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer)
			                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model_index, gl.DYNAMIC_DRAW)
							
							if (mode == EXTENT) elements = gl.POINTS // no need to process interiors of triangles
							
							var Tdata = 0, Bdata = 0
							
							if (sort_type == 'textures') {
			                    if ((mode == RENDER || mode == RENDER_TEXTURE) && tbobj.__tex.file !== null) { // true if texture requested
			                    	if (tbobj.__tex.texture_ref.reference !== null) {
			                    		gl.activeTexture( gl.TEXTURE0 )
			                    		gl.bindTexture(gl.TEXTURE_2D, tbobj.__tex.texture_ref.reference)
			                    		Tdata = 1
			                    	} else continue // don't show until the texture is ready
			                    }
							} else if (sort_type == 'bumpmaps') {
			                    if ((mode == RENDER || mode == RENDER_TEXTURE) && tbobj.__tex.bumpmap !== null) { // true if bump map requested
			                    	if (tbobj.__tex.bumpmap_ref.reference !== null) {
			                    		gl.activeTexture( gl.TEXTURE1 )
			                    		gl.bindTexture(gl.TEXTURE_2D, tbobj.__tex.bumpmap_ref.reference)
			                    		Bdata = 1
			                    	} else continue // don't show until the bumpmap is ready
			                    }
							} else if (sort_type == 'textures_and_bumpmaps') {
			                    if ((mode == RENDER || mode == RENDER_TEXTURE) && tbobj.__tex.file !== null) { // true if texture requested
			                    	if (tbobj.__tex.texture_ref.reference !== null) {
			                    		gl.activeTexture( gl.TEXTURE0 )
			                    		gl.bindTexture(gl.TEXTURE_2D, tbobj.__tex.texture_ref.reference)
			                    		Tdata = 1
			                    	} else continue // don't show until the texture is ready
			                    }
			                    if ((mode == RENDER || mode == RENDER_TEXTURE) && tbobj.__tex.bumpmap !== null) { // true if bump map requested
			                    	if (tbobj.__tex.bumpmap_ref.reference !== null) {
			                    		gl.activeTexture( gl.TEXTURE1 )
			                    		gl.bindTexture(gl.TEXTURE_2D, tbobj.__tex.bumpmap_ref.reference)
			                    		Bdata = 1
			                    	} else continue // don't show until the bumpmap is ready
			                    }
							}

		                    gl.uniform1f(program.uniforms.T, Tdata)
		                    gl.uniform1f(program.uniforms.B, Bdata)
		                    gl.drawElements(elements, model_length, gl.UNSIGNED_SHORT, 0)
			            }
		              }
	                }
	            }
	            
	            function render_merge() {
	            	var model = object_models.quad
	                var elements = model.elementType
	                var model_length = model.index.length
	                if (fullpeels) { // device has plenty of texture units
	                	if (merge_program == null) merge_program = shaderProgram( shaders.merge_fragment, shaders.merge_vertex, gl )
			            useProgram(merge_program, minormode)
	                } else { // typically a mobile device
	                	if (merge_program2 == null) merge_program2 = shaderProgram( shaders.merge_fragment2, shaders.merge_vertex, gl )
			            useProgram(merge_program2, minormode)
	                }
		            
					gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
					gl.vertexAttribPointer(program.attributes.pos, 3, gl.FLOAT, false, 0, 0)
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer)
					gl.drawElements(elements, model_length, gl.UNSIGNED_SHORT, 0)
	            	
	            }
	            
            	if (triangles_exist) render_triangles()

                for(var m in object_models) { 
                	// We display a quad in merge mode only in the case of transparents, 
                	// in which case a quad is actually driven by the first transparent.
                	// The merge shaders know the vertex structure of the quad.
                	if (m == 'quad' || m == 'triangle') continue
                	if (m == 'curve') {
                		render_curves()
                		continue
                	}
                	if (minormode >= MERGE) {
                		render_merge()
                		break
                	}
                	
	                var model = object_models[m]
	                var elements = model.elementType
	                var model_length = model.index.length
	                var objs
	                if (minormode > PEEL_D0) {
	                	if (canvas.__transparent_objects[m] === undefined) continue
	                	objs = canvas.__transparent_objects[m]
	                } else {
	                	if (canvas.__opaque_objects[m] === undefined) continue
	                	objs = canvas.__opaque_objects[m]
	                }
    	            var setup = true
	                for (var id in objs) {
						var obj = objs[id]
	                    var data = obj.__data
	                    
						if (setup) {
		                    // This needs to happen once per model, before rendering objects with that model.
							switch(minormode) {
								case RENDER:
								case PEEL_C0:
									if (standard_program == null) standard_program = shaderProgram( shaders.opaque_render_fragment, shaders.render_vertex, gl )
									useProgram(standard_program, minormode)
									break
								case PICK:
					            	if (pick_program == null) pick_program = shaderProgram( shaders.pick_fragment, shaders.pick_vertex, gl )
					            	useProgram(pick_program, minormode)
					            	break
								case EXTENT: // The EXTENT machinery doesn't actually work
				            		if (extent_program == null) extent_program = shaderProgram( shaders.pick_fragment, shaders.extent_vertex, gl )
			            			useProgram(extent_program, minormode)
			            			break
								case PEEL_D0:
					            	if (peel_depth_programD0 == null) peel_depth_programD0 = shaderProgram( shaders.peel_depth_fragmentD0, shaders.peel_depth_vertex, gl )
					            	useProgram(peel_depth_programD0, minormode)
					            	break
								case PEEL_D1:
					            	if (peel_depth_programD1 == null) peel_depth_programD1 = shaderProgram( shaders.peel_depth_fragmentD1, shaders.peel_depth_vertex, gl )
					            	useProgram(peel_depth_programD1, minormode)
					            	break
								case PEEL_D2:
					            	if (peel_depth_programD2 == null) peel_depth_programD2 = shaderProgram( shaders.peel_depth_fragmentD2, shaders.peel_depth_vertex, gl )
					            	useProgram(peel_depth_programD2, minormode)
					            	break
								case PEEL_D3:
					            	if (peel_depth_programD3 == null) peel_depth_programD3 = shaderProgram( shaders.peel_depth_fragmentD3, shaders.peel_depth_vertex, gl )
					            	useProgram(peel_depth_programD3, minormode)
					            	break
								case PEEL_C1:
					            	if (peel_color_programC1 == null) peel_color_programC1 = shaderProgram( shaders.peel_color_fragmentC1, shaders.render_vertex, gl )
					            	useProgram(peel_color_programC1, minormode)
					            	break
								case PEEL_C2:
					            	if (peel_color_programC2 == null) peel_color_programC2 = shaderProgram( shaders.peel_color_fragmentC2, shaders.render_vertex, gl )
					            	useProgram(peel_color_programC2, minormode)
					            	break
								case PEEL_C3:
					            	if (peel_color_programC3 == null) peel_color_programC3 = shaderProgram( shaders.peel_color_fragmentC3, shaders.render_vertex, gl )
					            	useProgram(peel_color_programC3, minormode)
					            	break
								case PEEL_C4:
					            	if (peel_color_programC4 == null) peel_color_programC4 = shaderProgram( shaders.peel_color_fragmentC4, shaders.render_vertex, gl )
					            	useProgram(peel_color_programC4, minormode)
					            	break
							}
				            
							gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer)
							gl.vertexAttribPointer(program.attributes.pos, 3, gl.FLOAT, false, 0, 0)
							if (mode != PICK && (mode == RENDER || minormode == PEEL_C0 || minormode == PEEL_C1 ||
              		              minormode == PEEL_C2 || minormode == PEEL_C3 || minormode == PEEL_C4)) {
								gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer)
								gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer)
								gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.opacityBuffer)
								gl.vertexAttribPointer(program.attributes.opacity, 1, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.shininessBuffer)
								gl.vertexAttribPointer(program.attributes.shininess, 1, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.emissiveBuffer)
								gl.vertexAttribPointer(program.attributes.emissive, 1, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.texposBuffer)
								gl.vertexAttribPointer(program.attributes.texpos, 2, gl.FLOAT, false, 0, 0)
								gl.bindBuffer(gl.ARRAY_BUFFER, model.bumpaxisBuffer)
								gl.vertexAttribPointer(program.attributes.bumpaxis, 3, gl.FLOAT, false, 0, 0)
							}
							gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer)
			                
							if (mode == EXTENT) elements = gl.POINTS // no need to process interiors of triangles
							setup = false
						}
						
						if (minormode < MERGE && mode != PICK) {
		                    if ((mode == RENDER || mode == RENDER_TEXTURE) && obj.__tex.file !== null) { // true if texture requested
		                    	if (obj.__tex.texture_ref.reference !== null) {
		                    		gl.activeTexture( gl.TEXTURE0 )
		                    		gl.bindTexture(gl.TEXTURE_2D, obj.__tex.texture_ref.reference)
		                    	} else continue // don't show until the texture is ready
		                    }
		                    if ((mode == RENDER || mode == RENDER_TEXTURE) && obj.__tex.bumpmap !== null) { // true if bump map requested
		                    	if (obj.__tex.bumpmap_ref.reference !== null) {
		                    		gl.activeTexture( gl.TEXTURE1 )
		                    		gl.bindTexture(gl.TEXTURE_2D, obj.__tex.bumpmap_ref.reference)
		                    	} else continue // don't show until the bumpmap is ready
		                    }
						}

	                    if (mode == PICK) {
	                        var falsecolor = obj.__falsecolor
	                        for (var i=0; i<4; i++) {
	                            save[i] = data[16+i]
	                            data[16+i] = falsecolor[i]
	                        }
	                    }
	                    
	                    // This stuff needs to happen for each individual object
	                    gl.uniform4fv(program.uniforms.objectData, data)
	                    gl.drawElements(elements, model_length, gl.UNSIGNED_SHORT, 0)
	                    
	                    if (mode == PICK) {
	                        for (var i=0; i<4; i++) data[16+i] = save[i]
	                    }

	                }
	            } // end of "for(var m in object_models)"
            	
            	if (mode != PICK) {
	                gl.bindRenderbuffer(gl.RENDERBUFFER, null)
	                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            	}
            	

            } // end of "function subrender(minormode, T, Trefs) {"
            
            if (mode == RENDER) {
            	subrender(mode, null, [])
            } else if (mode == PICK) {
            	subrender(mode, 'C0', [''])
            	//subrender(PEEL_D0, 'D0', []) // for testing purposes
            } else if (mode == EXTENT) { // The EXTENT machinery doesn't actually work
            	subrender(mode, 'EXTENT_TEXTURE', [])
            } else if (mode == RENDER_TEXTURE) {
            	
            	subrender(PEEL_C0, 'C0', [])          //  4 - opaque color
            	
            	subrender(PEEL_D0, 'D0', [])          //  5 - opaque depth; no max depth map involved 
            	
            	subrender(PEEL_C1, 'C1', ['D0'])      //  6 - 1st transparency color, based on D0
            	
            	if (fullpeels) { // plenty of texture units available
                	subrender(PEEL_D1, 'D1', ['D0'])      //  7 - 1st transparency depth; based on D0 
                	
                	subrender(PEEL_C2, 'C2', ['D0','D1']) //  8 - 2nd transparency color, based on D0 and D1
                	
	            	subrender(PEEL_D2, 'D2', ['D0','D1']) //  9 - 2nd transparency depth; based on D0 and D1
	            	
	            	subrender(PEEL_C3, 'C3', ['D0','D2']) // 10 - 3rd transparency color, based on D0 and D2
	            	
	            	subrender(PEEL_D3, 'D3', ['D0','D2']) // 11 - 3rd transparency depth; based on D0 and D2
	            	
	            	subrender(PEEL_C4, 'C4', ['D0','D3']) // 12 - 4th transparency color, based on D0 and D3
	            	
	            	// Render directly to the screen, merging colors onto a quad:
	            	subrender(MERGE, null, ['C0', 'C1', 'C2', 'C3', 'C4'])   // 13 - merge C0, C1, C2, C3, C4
	            	
            	} else subrender(MERGE, null, ['C0', 'C1'])

            	/*
            	// Render to a texture, then apply to a quad:
        		subrender(MERGE, 'FINAL', 0, dependencies)   // 12 - merge C0, C1, C2, C3, C4 into FINAL
        		gl.bindTexture(gl.TEXTURE_2D, peels.FINAL)
        		gl.generateMipmap(gl.TEXTURE_2D)
        		gl.bindTexture(gl.TEXTURE_2D, null)
            	subrender(FINAL, null, 0, [])   // 13 - place FINAL onto a quad
            	*/
            }
        	
            if (mode == EXTENT) { // The EXTENT machinery doesn't actually work; the intent was to do autoscaling in GPUs
            	// The idea was to store into a render into location 0,0 of a small texture (3x3, say) the extent of each
            	// object vertex, using gl.depthFunc(gl.GREATER) instead of gl.depthFunc(gl.LEQUAL) to get largest value
            	// of the distance from the center of the scene.
            	// See comment at start of this file about reading the buffer.
            	gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
                var mantissa = (256*pixels[1] + pixels[2])/65536;
                var exponent = pixels[0]
                if (exponent > 128) {
                	exponent = -(exponent - 128)
                	mantissa = -mantissa
                }
            	var extent
            	if (mantissa == 0 && exponent == 0) extent = 0
                else extent = Math.exp(mantissa + exponent)
            	//canvas.title.text(pixels[0]+" "+pixels[1]+" "+pixels[2]+" "+pixels[3]+' : '+canvas.mouse.__pickx+' '+canvas.mouse.__picky)
            	//canvas.caption.text('extent='+extent.toExponential(3))
            	return null
            } else if (mode == PICK) { // pick
            	// readPixels returns RGBA values in range 0-255, 
                // starting at lower left corner, left to right, bottom to top
                // Chrome: The readPixels operation takes about [ 7 + 8e-5*(canvas.width*canvas.height) ] ms.
            	// The fact that only one pixel is being read is irrelevant; what matters is the canvas size.
            	// Example: If the canvas is 1000*1000, reading one pixel takes about 90 ms. Yuck.
            	// From http://www.khronos.org/message_boards/viewtopic.php?f=4&t=711:
            	//   Generally glReadPixels() is slow and should really only be used 
            	//   when doing screencapture at which point performance is non critical. 
            	//   The main cause for this loss of performance is due to synchronisation: 
            	//   the glReadPixels() call forces synchronisation between the CPU and 
            	//   the Graphics Core thus serialising them and resulting in lost CPU and 
            	//   Graphics Core performance. At which point it does not matter that much 
            	//   if you access only a single pixel or copy the whole buffer, 
            	//   you lost most of the performance with the synchronisation.
            	// TODO: Would it help to render to a one-pixel renderbuffer, located where the mouse is?
            	gl.readPixels(canvas.mouse.__pickx, canvas.mouse.__picky, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            	var id = 16777216*pixels[0] + 65536*pixels[1] + 256*pixels[2] + pixels[3]
                var obj = canvas.__visiblePrimitives[id]
            	
            	// Debugging:
            	//var z = (pixels[0] + pixels[1]/256.0)/256.0
            	//console.log(z, pixels[0], pixels[1], pixels[2], pixels[3])
            	//var w = 256*pixels[2] + pixels[3]
			    //var exponent = pixels[0]-100;
			    //var m = (pixels[1] + pixels[2]/256)/250;
			    //var m = (pixels[1] + pixels[2]/256 + pixels[3]/65536)/250;
			    //var z = exp(exponent, m)
            	//console.log('z', z, exponent, m)
            	
            	//canvas.caption.text(id.toExponential(3))
                //canvas.caption.text(canvas.mouse.__pickx+' '+canvas.mouse.__picky+': '+(pixels[0]/255).toFixed(3)+" "+(pixels[1]/255).toFixed(3)+" "+
                //		(pixels[2]/255).toFixed(3)+" "+(pixels[3]/255).toFixed(3)+": "+id+" "+obj)
            	//var k = 100
            	//canvas.caption.text(canvas.mouse.__pickx+' '+canvas.mouse.__picky+': '+k*(pixels[0]/255).toFixed(2)+" "+
            	//		k*(pixels[1]/255).toFixed(2)+" "+(pixels[2]).toFixed(2)+" "+(pixels[3]).toFixed(2)+": "+id)
                //canvas.title.text(canvas.mouse.__pickx+' '+canvas.mouse.__picky+': '+pixels[0]+" "+pixels[1]+" "+pixels[2]+" "+pixels[3]+": "+id)
                if (obj === undefined) return null
                if (obj.constructor.name == 'point') { // picked an individual point on a curve
                	if (!obj.__curve.pickable || !obj.pickable) return null
                    var pts = obj.__curve.__points
                    var L = pts.length
                    for (var i=0; i<L; i++) {
                        if (pts[i] === obj) {
                            obj = obj.__curve
                            obj.pick = i
                            return obj
                            }
                    }
                    return null // could not find this point along this curve
                }
                if (!obj.pickable) return null
                else return obj
            }
        }
        
        /* At top of this file
	    var fps = 0                // measured average frames per second
	    var renderMS = 0           // measured average milliseconds per render
	    var lastStartRedraw = 0    // time in milliseconds of most recent start of render
	    var lastEndRedraw = 0      // time in milliseconds of most recent end of render
        */
        
        function trigger_render() {
            var doAverage = (lastStartRedraw > 0) // true if this is not the first redraw event
            var t = msclock()
            var elapsed = 0
            if (doAverage) elapsed = t - lastStartRedraw
            lastStartRedraw = t
            canvas.trigger("redraw", { dt: elapsed })
            
            renderer.render(RENDER) // send data to GPU
            
            t = msclock()
            elapsed = 0
            if (doAverage) elapsed = t - lastEndRedraw
            lastEndRedraw = t
            
            if (doAverage) {
            	renderMS = renderMS * .95 + (t - lastStartRedraw) * .05
            	fps = fps * .95 + (1000 / elapsed) * .05
        	} else {
        		renderMS = (t - lastStartRedraw)
        		fps = 0
        	}
            
        	var total = fps * renderMS
            $("#fps").text(fps.toFixed(1) + " renders/s * " + renderMS.toFixed(1) + 
            		" ms/render = " + total.toFixed(1) + " ms rendering/s")
            canvas.trigger("draw_complete", { dt: elapsed })
            canvas.__last_forward = canvas.__forward
            canvas.__last_range = canvas.__range
            
        	window.requestAnimFrame(trigger_render, canvasElement) // calls the version of requestAnimationFrame found in webgl-utils.js       
        }
        
        this.reset()
        trigger_render() // initial call, to get the rendering started
    } // end of this.render(mode)

    var desired_fps = 60 // desired renders per second
    var N = 0    // number of iterations to do between renders
    var enditers
    
    function rate(iters, cb) {
        if (cb === undefined)
            throw new Error("rate(iterations_per_second, wait) called without wait")
        if (N > 0) {
        	N--
        	if (msclock() > enditers) N = 0 // truncate the iterations to permit renders to occur
        	if (N > 0) cb()
        	else {
        		setTimeout(cb, Math.ceil(1000/desired_fps))
        	}
        } else {
        	if (iters <= 120) {
        		setTimeout(cb, Math.ceil(1000/iters))
        	} else {
        		N = Math.ceil(iters/desired_fps) // number of iterations to do between renders
        		enditers = msclock() + Math.ceil(1000/desired_fps)
        		cb() // execute the first iteration
        	}
        }
    }
    
    var exports = { WebGLRenderer: WebGLRenderer, rate: rate }
    Export(exports)
})();;(function () {
    "use strict";
    
    function log10(val) {
        return Math.log(val)/Math.LN10
    }
    var eformat = false
    var nformat = 0
    var nmax = 0
    function format_number(val,axis) { // callback routine for formatting tick labels
        if (axis.ticks.length == 0) { // when the first tick of this axis is sent to this function
            var delta = axis.tickSize // axis.tickSize is interval between ticks
            var amin = axis.min, amax = axis.max // axis.min and axis.max are the ends of this axis
            var nticks = Math.floor((amax-amin)/delta+0.5)+1
            var vmax, test
            for (var i=0; i<nticks; i++) {
                test = abs(amin + i*delta)
                if (vmax === undefined || (test > vmax && test != 0)) vmax = test
            }
            nmax = Math.floor(log10(vmax))+1 // +3 for 100; -2 for 0.001
            var n = Math.floor(log10(delta))+1 // +3 for 100; -2 for 0.001
            if (n > 3) { // ok
                eformat = true
                nformat = n
            } else if (n > 0) { // ok
                eformat = false
                nformat = 0
            } else if (n < 0) {
                eformat = true
                nformat = n
                if (nmax >= 0) {
                    eformat = false
                    nformat = -n+1
                }
            } else {
                eformat = false
                nformat = 1
            }
        }
        if (val == 0) return '0'
        if (eformat) {
            var nf, nexp
            var mantissa = val*pow(10,-nformat+1)
            nf = 0
            nexp = nformat-1
            if (nmax > nformat) {
                mantissa *= .1
                nf += 1
                nexp += 1
            }
            return mantissa.toFixed(nf)+'e'+nexp
        } else {
            return val.toFixed(nformat)
        }
    }

    function graph(options) {
        if (!(this instanceof graph)) return new graph(options)
        if (options === undefined) options = {}
        this.graph_options = { series: { shadowSize:0 }, crosshair: { mode: "xy", color: "rgba(0,0,0,1)" } }
        this.__width = 640
        this.__height = 400
        this.__xmin = this.__xmax = this.__ymin = this.__ymax = null
        if (!(options.width === undefined)) {
            this.__width = options.width
            delete options.width
        }
        if (!(options.height === undefined)) {
            this.__height = options.height
            delete options.height
        }
        this.graph_options.xaxis = {min:null, max:null, tickFormatter:format_number}
        this.graph_options.yaxis = {min:null, max:null, tickFormatter:format_number}
        if (!(options.title === undefined)) {
            this.__title = options.title
            delete options.title
        }
        if (!(options.xmin === undefined)) {
            this.__xmin = this.graph_options.xaxis.min = options.xmin
            delete options.xmin
        }
        if (!(options.xmax === undefined)) {
            this.__xmax = this.graph_options.xaxis.max = options.xmax
            delete options.xmax
        }
        if (!(options.ymin === undefined)) {
            this.__ymin = this.graph_options.yaxis.min = options.ymin
            delete options.ymin
        }
        if (!(options.ymax === undefined)) {
            this.__ymax = this.graph_options.yaxis.max = options.ymax
            delete options.ymax
        }
        this.__logx = this.__logy = false
        if (!(options.logx === undefined)) {
            this.__logx = this.graph_options.logx
            delete options.logx
        }
        if (!(options.logy === undefined)) {
            this.__logy = this.graph_options.logy
            delete options.logy
        }
        if (this.__logx) {
            this.graph_options.xaxis.transform = function (v) { return log10(v) }
            this.graph_options.xaxis.inverseTransform = function (v) { return pow(10,v) }
        }
        if (this.__logy) {
            this.graph_options.yaxis.transform = function (v) { return log10(v) }
            this.graph_options.yaxis.inverseTransform = function (v) { return pow(10,v) }
        }
        var err = '', count = 0
        for (var attr in options) {
            count += 1
            err += attr+', '
        }
        if (err.length > 0) {
            if (count == 1) throw new Error(err.slice(0,err.length-2)+' is not an attribute of a graph')
            else throw new Error('These are not attributes of a graph: '+err.slice(0,err.length-2))
        }
        /*
        // Doesn't seem to make sense to capture other attributes.
        for (var id in options)
            this.options[id] = options[id]
        */

        graph.selected = this

        if (this.__title !== undefined && this.__title.length > 0) $("<div>"+this.__title+"</div>").appendTo(canvas.container)
        this.wrapper = $("<div/>")
        this.wrapper.addClass("glowscript-graph").css("width", this.__width).css("height", this.__height).appendTo( canvas.container )

        this.graph_series = []

        // At least for now, graphs are updated independently of canvases.
        this.__update()
    }
    property.declare(graph, {
        selected: { 
            get: function() { return window.__context.graph_selected || null },
            set: function(value) { window.__context.graph_selected = value } }
    })

    property.declare( graph.prototype, {
        __update: function() {
            var self = this
            window.requestAnimFrame( function() { self.__update.call(self) }, this.wrapper.get(0) )

            if (!this.changed) return
            var info = []
            for (var i = 0; i < this.graph_series.length; i++) {
                var thisseries = this.graph_series[i]
                if (thisseries.__visible) {
                    info.push(thisseries.options)
                    if (thisseries.__dot && thisseries.__type == 'line' && thisseries.options.data.length > 0) {
                        var dotdisplay = { points: { show: true } }
                        if (!(thisseries.__dot_radius === null)) dotdisplay.points.radius = thisseries.__dot_radius
                        else dotdisplay.points.radius = thisseries.__width+1
                        if (!(thisseries.__dot_color === null)) dotdisplay.color = color.to_html(thisseries.__dot_color)
                        else dotdisplay.color = color.to_html(thisseries.__color)
                        dotdisplay.data = [thisseries.options.data[thisseries.options.data.length-1]]
                        info.push(dotdisplay)
                    }
                }
            }
            this.changed = false
            if (info.length == 0) return
            var plot = $.plot(this.wrapper, info, this.graph_options)
            plot.draw()
            // These don't work to update the crosshair overlay machinery after a canvas update:
            //make_plot.drawOverlay()
            //make_plot.triggerRedrawOverlay()
        },
        add_to_graph: function (obj) {
            this.graph_series.push(obj)
        },
        changed: false
    })
    
    Object.defineProperty(graph.prototype, '__width', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'width', {
        enumerable: true,
        get:
            function () { return this.__width },
        set:
            function (value) {
                this.__width = value
                this.wrapper.css('width', value)
                var plot = $.plot(this.wrapper, [], this.graph_options)
                plot.resize()
                plot.setupGrid()
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__height', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'height', {
        enumerable: true,
        get:
            function () { return this.__height },
        set:
            function (value) {
                this.__height = value
                this.wrapper.css('height', value)
                var plot = $.plot(this.wrapper, [], this.graph_options)
                plot.resize()
                plot.setupGrid()
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__title', { enumerable: false, writable: true, value: '' })
    Object.defineProperty(graph.prototype, 'title', {
        enumerable: true,
        get:
            function () { return this.__title },
        set:
            function (value) {
                this.__title = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__xmin', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'xmin', {
        enumerable: true,
        get:
            function () { return this.__xmin },
        set:
            function (value) {
                this.__xmin = this.graph_options.xaxis.min = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__xmax', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'xmax', {
        enumerable: true,
        get:
            function () { return this.__xmax },
        set:
            function (value) {
                this.__xmax = this.graph_options.xaxis.max = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__ymin', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'ymin', {
        enumerable: true,
        get:
            function () { return this.__ymin },
        set:
            function (value) {
                this.__ymin = this.graph_options.yaxis.min = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__ymax', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'ymax', {
        enumerable: true,
        get:
            function () { return this.__ymax },
        set:
            function (value) {
                this.__ymax = this.graph_options.yaxis.max = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__logx', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'logx', {
        enumerable: true,
        get:
            function () { return this.__logx },
        set:
            function (value) {
                if (this.__logx == value) return
                if (value) {
                    this.graph_options.xaxis.transform = function (v) { return log10(v) }
                    this.graph_options.xaxis.inverseTransform = function (v) { return pow(10,v) }
                } else {
                    delete this.graph_options.xaxis.transform
                    delete this.graph_options.xaxis.inverseTransform
                }
                this.__logx = value
                this.changed = true
            }
    })
    Object.defineProperty(graph.prototype, '__logy', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(graph.prototype, 'logy', {
        enumerable: true,
        get:
            function () { return this.__logy },
        set:
            function (value) {
                if (this.__logy == value) return
                if (value) {
                    this.graph_options.yaxis.transform = function (v) { return log10(v) }
                    this.graph_options.yaxis.inverseTransform = function (v) { return pow(10,v) }
                } else {
                    delete this.graph_options.yaxis.transform
                    delete this.graph_options.yaxis.inverseTransform
                }
                this.__logy = value
                this.changed = true
            }
    })

    var type_to_flot_type = { line: "lines", scatter: "points", bar: "bars", __proto__:null }

    function gobject(options) {
        if (options === undefined) options = { data: [] }
        else if (options.data === undefined) options.data = []
        if (options.graph !== undefined) {
            this.__graph = options.graph
            delete options.graph
        } else {
            this.__graph = graph.selected
            if (!this.__graph) this.__graph = graph()
        }
        this.__type = 'line' // default type; others are 'scatter' and 'bar'
        if (!(options.type === undefined)) {
            this.__type = options.type
            delete options.type
        }
        var ftype = type_to_flot_type[this.__type]
        if (!ftype) throw new Error("Unknown series type: " + this.__type)
        this.options = {} // build the flot options
        this.options.data = options.data
        delete options.data
        this.options[ftype] = { show: true, align: 'center', horizontal: false, barWidth: 1 }
        if (!(options.horizontal === undefined)) {
            this.__horizontal = this.options[ftype].horizontal = options.horizontal
            delete options.horizontal
        }
        if (!(options.delta === undefined)) {
            this.__delta = this.options[ftype].barWidth = options.delta
            delete options.delta
        }
        if (!(options.width === undefined)) {
            this.__width = this.options[ftype].lineWidth = options.width
            delete options.width
        }
        if (!(options.radius === undefined)) {
            this.__radius = this.options[ftype].radius = options.radius
            delete options.radius
        }
        if (!(options.dot === undefined)) {
            this.__dot = options.dot
            delete options.dot
        }
        if (!(options.dot_color === undefined)) {
            this.__dot_color = options.dot_color
            delete options.dot_color
        }
        if (!(options.dot_radius === undefined)) {
            this.__dot_radius = options.dot_radius
            delete options.dot_radius
        }
        if (!(options.color === undefined)) {
            this.__color = options.color
            this.options.color = color.to_html(options.color)
            delete options.color
        }
        if (!(options.label === undefined)) {
            this.__label = this.options.label = options.label
            delete options.label
        }
        if (this.options.data.length > 0) this.__graph.changed = true
        this.__visible = true
        if (!(options.visible === undefined)) {
            this.__visible = options.visible
            delete options.visible
        }
        var err = '', count = 0
        for (var attr in options) {
            count += 1
            err += attr+', '
        }
        if (err.length > 0) {
            if (count == 1) throw new Error(err.slice(0,err.length-2)+' is not an attribute of a series')
            else throw new Error('These are not attributes of a series: '+err.slice(0,err.length-2))
        }
        /*
        // Doesn't seem to make sense to capture other attributes.
        for (var id in options) {
            this.options[ftype][id] = options[id]
        }
        */
        this.__graph.add_to_graph(this)

        this.plot = function (data) {
            // Accept plot(x,y) or plot([x,y], [x,y], ...) or plot([[x,y], [x,y], ...]])
            this.__graph.changed = true
            if (typeof arguments[0] == 'number') { // x,y
                this.options.data.push([arguments[0], arguments[1]])
            } else if (typeof arguments[0][0] == 'number') { // [x,y], [x,y], ....
                var xy
                for (var i = 0; i < arguments.length; i++) {
                    xy = arguments[i]
                    this.options.data.push(xy)
                }
            } else if (arguments.length == 1) {
                if (data.pos !== undefined) { // for VPython we have g.plot(pos=(x,y))
                	data = data.pos
                	if (typeof data[0] == 'number') data = [data]
                }
                var xy
                for (var i = 0; i < data.length; i++) { // [ [x,y], [x,y], .... ]
                    xy = data[i]
                    this.options.data.push(xy)
                }
            } else {
                throw new Error("must be plot(x,y) or plot([x,y]) or plot([x,y], ...) or plot([ [x,y], ... ])")
            }
        }
    }

    Object.defineProperty(gobject.prototype, '__graph', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(gobject.prototype, 'graph', {
        enumerable: true,
        get:
            function () { return this.__graph },
        set:
            function (value) {
                this.__graph.changed = true
                this.__graph.graph_series.splice(this.__graph.graph_series.indexOf(this), 1)
                this.__graph = value
                this.__graph.add_to_graph(this)
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__type', { enumerable: false, writable: true, value: 'line' })
    Object.defineProperty(gobject.prototype, 'type', {
        enumerable: true,
        get:
            function () { return this.__type },
        set:
            function (value) {
                var oldvalue = this.__type
                if (value == oldvalue) return
                var oldftype = type_to_flot_type[oldvalue]
                var ftype = type_to_flot_type[value]
                if (!ftype) throw new Error("Unknown series type: " + value)
                this.options[ftype] = this.options[oldftype]
                delete this.options[oldftype]
                this.__type = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__color', { enumerable: false, writable: true, value: vec(0,0,0) })
    Object.defineProperty(gobject.prototype, 'color', {
        enumerable: true,
        get:
            function () { return this.__color },
        set:
            function (value) {
                if (this.__color.equals(value)) return
                this.__color = value
                this.options.color = color.to_html(value)
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__label', { enumerable: false, writable: true, value: null })
    Object.defineProperty(gobject.prototype, 'label', {
        enumerable: true,
        get:
            function () {
                if (this.options.label === undefined) return ''
                return this.options.label
            },
        set:
            function (value) {
                if (this.options.label == value) return
                this.options.label = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__delta', { enumerable: false, writable: true, value: 1 })
    Object.defineProperty(gobject.prototype, 'delta', {
        enumerable: true,
        get:
            function () { return this.__delta },
        set:
            function (value) {
                if (this.__delta == value) return
                this.__delta = value
                var ftype = type_to_flot_type[this.__type]
                this.options[ftype].barWidth = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__width', { enumerable: false, writable: true, value: 1 })
    Object.defineProperty(gobject.prototype, 'width', {
        enumerable: true,
        get:
            function () { return this.__width },
        set:
            function (value) {
                if (this.__width == value) return
                this.__width = value
                var ftype = type_to_flot_type[this.__type]
                this.options[ftype].lineWidth = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__radius', { enumerable: false, writable: true, value: 3 })
    Object.defineProperty(gobject.prototype, 'radius', {
        enumerable: true,
        get:
            function () { return this.__radius },
        set:
            function (value) {
                if (this.__radius == value) return
                this.__radius = value
                var ftype = type_to_flot_type[this.__type]
                this.options[ftype].radius = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__horizontal', { enumerable: false, writable: true, value: false })
    Object.defineProperty(gobject.prototype, 'horizontal', {
        enumerable: true,
        get:
            function () { return this.__delta },
        set:
            function (value) {
                if (this.__horizontal == value) return
                this.__horizontal = value
                var ftype = type_to_flot_type[this.__type]
                this.options[ftype].horizontal = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__dot', { enumerable: false, writable: true, value: false })
    Object.defineProperty(gobject.prototype, 'dot', {
        enumerable: true,
        get:
            function () { return this.__dot },
        set:
            function (value) {
                if (this.__dot == value) return
                this.__dot = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__dot_color', { enumerable: false, writable: true, value: null })
    Object.defineProperty(gobject.prototype, 'dot_color', {
        enumerable: true,
        get:
            function () { return this.__dot_color },
        set:
            function (value) {
                if (this.__dot_color.equals(value)) return
                this.__dot_color = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__dot_radius', { enumerable: false, writable: true, value: null })
    Object.defineProperty(gobject.prototype, 'dot_radius', {
        enumerable: true,
        get:
            function () { return this.__dot_radius },
        set:
            function (value) {
                if (this.__dot_radius == value) return
                this.__dot_radius = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__visible', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(gobject.prototype, 'visible', {
        enumerable: true,
        get:
            function () { return this.__visible },
        set:
            function (value) {
                if (this.__visible == value) return
                this.__visible = value
                this.__graph.changed = true
            }
    });
    Object.defineProperty(gobject.prototype, '__data', { enumerable: false, writable: true, value: 0 })
    Object.defineProperty(gobject.prototype, 'data', {
        enumerable: true,
        get:
            function () { return this.options.data },
        set:
            function (value) {
                this.options.data = []
                this.plot(value)
            }
    });
    
    function series(options) {
        return new gobject(options)
    }
    
    function gdisplay(options) {
    	if (options === undefined) return new graph()
    	if (options.x !== undefined) delete options.x
    	if (options.y !== undefined) delete options.y
    	var title='', xtitle='', ytitle=''
    	var indent = '&nbsp&nbsp&nbsp&nbsp&nbsp'
    	if (options.title !== undefined) {
    		title = options.title
    		delete options.title
    	}
    	if (options.xtitle !== undefined) {
    		xtitle = options.xtitle
    		delete options.xtitle
    	}
    	if (options.ytitle !== undefined) {
    		ytitle = options.ytitle
    		delete options.ytitle
    	}
    	var t1 = ''
    	var t2 = ''
    	if (title.length > 0 && (xtitle.length > 0 || ytitle.length > 0)) t1 = title + '<br>'
    	else if (title.length > 0) t1 = title
    	if (ytitle.length > 0) {
    		t2 = ytitle
    		if (xtitle.length > 0) t2 += ' vs '+xtitle
    	} else if (xtitle.length > 0) t2 = xtitle
    	if (t1.length > 0) t1 = indent + t1
    	if (t2.length > 0) options.title = t1+indent+t2
    	else if (t1.length > 0) options.title = t1
    	return new graph(options)
    }
    
    function gcurve(options) {
    	if (options === undefined) options = {}
    	options.type = 'line'
    	if (options.pos !== undefined) {
    		options.data = options.pos
    		delete options.pos
    	}
    	if (options.radius !== undefined) {
    		options.width = 2*options.radius
    		delete options.radius
    	}
    	if (options.size !== undefined) {
    		options.dot_radius = options.size/2
    		delete options.size
    	} else options.dot_radius = 4
    	return new gobject(options)
    }
    
    function gdots(options) {
    	if (options === undefined) options = {}
    	options.type = 'scatter'
    	if (options.pos !== undefined) {
    		options.data = options.pos
    		delete options.pos
    	}
    	if (options.size !== undefined) {
    		options.dot_radius = options.size/2
    		delete options.size
    	} else options.radius = 2.6
    	return new gobject(options)
    }
    
    function gvbars(options) {
    	if (options === undefined) options = {}
    	options.type = 'bar'
    	if (options.pos !== undefined) {
    		options.data = options.pos
    		delete options.pos
    	}
    	return new gobject(options)
    }
    
    function ghbars(options) {
    	if (options === undefined) options = {}
    	options.type = 'bar'
    	options.horizontal = true
    	if (options.pos !== undefined) {
    		options.data = options.pos
    		delete options.pos
    	}
    	return new gobject(options)
    }
    
    function ghistogram(options) {
    	throw new Error('ghistogram is not implemented in GlowScript.')
    }

    var exports = {
        graph: graph,
        series: series,
        gdisplay: gdisplay,
        gcurve: gcurve,
        gdots: gdots,
        gvbars: gvbars,
        ghbars: ghbars
    }
    Export(exports)
})();; (function () {
    "use strict";

    var color = {
        red: vec(1, 0, 0),
        green: vec(0, 1, 0),
        blue: vec(0, 0, 1),
        yellow: vec(1, 1, 0),
        orange: vec(1, 0.6, 0),
        cyan: vec(0, 1, 1),
        magenta: vec(1, 0, 1),
        white: vec(1, 1, 1),
        black: vec(0, 0, 0),
        gray: function (g) { return vec(g, g, g) },
        hsv_to_rgb: function (hsv) { // algorithm from Python colorsys module
            var h = hsv.x
            var s = hsv.y
            var v = hsv.z
            if (s == 0) { return vec(v, v, v) }
            var i = Math.floor(6 * h)
            var f = (6 * h) - i
            var p = v * (1 - s)
            var q = v * (1 - s * f)
            var t = v * (1 - s * (1 - f))
            var i = i % 6
            switch (i) {
                case 0:
                    return vec(v, t, p)
                case 1:
                    return vec(q, v, p)
                case 2:
                    return vec(p, v, t)
                case 3:
                    return vec(p, q, v)
                case 4:
                    return vec(t, p, v)
                case 5:
                    return vec(v, p, q)
                    // other cases are not possible
            }
        },
        rgb_to_hsv: function (rgb) { // algorithm from Python colorsys module
            var r = rgb.x
            var g = rgb.y
            var b = rgb.z
            var maxc = Math.max(r, g, b)
            var minc = Math.min(r, g, b)
            var v = maxc
            if (minc == maxc) { return vec(0, 0, v) }
            var s = (maxc - minc) / maxc
            var rc = (maxc - r) / (maxc - minc)
            var gc = (maxc - g) / (maxc - minc)
            var bc = (maxc - b) / (maxc - minc)
            var h
            if (r == maxc) {
                h = bc - gc
            } else if (g == maxc) {
                h = 2 + rc - bc
            } else {
                h = 4 + gc - rc
            }
            h = (h / 6)
            if (h < 0) h++
            return vec(h, s, v)
        },
        to_html: function (color) {
            var r = Math.floor(255 * color.x)
            var g = Math.floor(255 * color.y)
            var b = Math.floor(255 * color.z)
            return 'rgb(' + r + ',' + g + ',' + b + ')'
        },
        to_html_rgba: function (color, opacity) {
            var r = Math.floor(255 * color.x)
            var g = Math.floor(255 * color.y)
            var b = Math.floor(255 * color.z)
            return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')'
        }
    }

    var exports = { color: color }
    Export(exports)
})();; (function () {
    "use strict";

    function subclass(sub, base) {
        sub.prototype = new base({ visible: false, canvas: null })
        sub.prototype.constructor = sub
    }
    
    function id_to_falsecolor(N) { // convert integer object id to floating RGBA for pick operations
        var R=0, G=0, B=0
        if (N >= 16777216) {
            R = Math.floor(N/16777216)
            N -= R*16777216
        }
        if (N >= 65536) {
            G = Math.floor(N/65536)
            N -= G*65536
        }
        if (N >= 256) {
            B = Math.floor(N/256)
            N -= B*256
        }
        return [R/255, G/255, B/255, N/255]
    }

    // Factored because there are way too many things that add themselves to canvas in different ways
    // TODO: Make them all subclasses of VisualObject or something and give them a uniform way of tracking themselves!
    // TODO: Prohibit or handle changing primitive.canvas (need to update model even if it is invisible)
    function init(obj, args) {
    	if (window.__GSlang == 'vpython' && args.display !== undefined) {
    		args.canvas = args.display
    		delete args.display
    	}
        if (args.canvas !== undefined) {
            obj.canvas = args.canvas
            delete args.canvas
        } else
            obj.canvas = canvas.selected
        if (obj.canvas) {
            obj.canvas.__activate()
            obj.__model = obj.__get_model()
        }
        // Set radius, size, size_units and color before setting pos, to benefit curve and points objects
        if (args.radius !== undefined) {
        	obj.radius = args.radius
        	delete args.radius
        }
        if (args.size_units !== undefined) {
        	obj.size_units = args.size_units
        	delete args.size_units
        }
        // treat axis before size or length or height or width to match classic VPython constructor API
        if (args.axis !== undefined) { 
        	obj.axis = args.axis
        	delete args.axis
        }
        if (args.size !== undefined) {
        	obj.size = args.size
        	delete args.size
        }
        if (args.color !== undefined) {
        	obj.color = args.color
        	delete args.color
        }
        if (args.pos !== undefined) {
        	obj.pos = args.pos // set obj.pos now to avoid trail update if make_trail = True
        	delete args.pos
        }

        // Mimic classic VPython (though GlowScript attach_trail is more powerful)
        if (obj.constructor != curve && obj.constructor != points && args.make_trail !== undefined) {
        	obj.__make_trail = args.make_trail
        	delete args.make_trail
        	if (args.interval !== undefined) {
        		obj.__interval = args.interval
        		delete args.interval
        	} else obj.__interval = 1
        	if (args.retain !== undefined) {
        		obj.__retain = args.retain
        		delete args.retain
        	} else obj.__retain = -1 // signal retain not set
        	var c = color.white
        	if (obj.color !== undefined) c = obj.color
	    	obj.__trail_type = 'curve'
	        	if (args.trail_type !== undefined) {
	        		if (args.trail_type != 'curve' && args.trail_type != 'points')
	        			throw new Error ("trail_type = "+args.trail_type+" but must be 'curve' or 'points'.")	        		
	        		obj.__trail_type = args.trail_type
	        		delete args.trail_type
	        	}

    		if (obj.__trail_type == 'curve') obj.__trail_object = curve({color:c})
    		else obj.__trail_object = points({color:c})
			if (obj.pos !== undefined) obj.__trail_object.push(obj.pos)
    		obj.__ninterval = 0
        }

        for (var id in args) obj[id] = args[id]

        // We have to set visible unless args has visible:false or canvas:null
        if (args.visible === undefined && obj.canvas !== null) obj.visible = true
    }

    function initObject(obj, constructor, args) {
        if (!(obj instanceof constructor)) return new constructor(args)  // so box() is like new box()
        if (args === undefined) args = {}  // so box() is like box({})
        obj.__tex = {file: null, bumpmap: null, texture_ref: {reference: null}, bumpmap_ref: {reference: null}, 
				  left: false, right: false, sides: false, flipx: false, flipy: false, turn: 0, flags: 0 }

    	// We have to initialize ALL vector attributes here, because they need pointers back to this :-(
        if (args.pos === undefined) obj.pos = obj.pos
        if (args.color === undefined) obj.color = obj.color
        if (constructor != points) {
        	if (constructor == arrow) {
        		if (args.axis !== undefined) throw new Error("arrow does not have axis; replace with axis_and_length")
        		else if (args.axis_and_length === undefined) obj.axis_and_length = obj.axis_and_length
        	} else if (args.axis === undefined) obj.axis = obj.axis
	        if (args.up === undefined) obj.up = obj.up
	        if (args.size === undefined) obj.size = obj.size
        }
        if (args.opacity === undefined) obj.__opacity = 1
        if (args.make_trail === undefined) obj.__make_trail = false
        
        obj.__opacity_change = true

        init(obj, args)
    }

    // For now, ids are ever-increasing.  Perhaps change this to keep a compact list
    // of indices, or lists of different primitive types if that is convenient to the renderer
    var nextVisibleId = 1
    
    // ":" is illegal in a filename on Windows and Mac, though it is legal on Linux
    var textures = { flower: ":flower_texture.jpg", granite: ":granite_texture.jpg", gravel: ":gravel_texture.jpg",
    			     metal: ":metal_texture.jpg", rock: ":rock_texture.jpg", rough: ":rough_texture.jpg", 
    			     rug: ":rug_texture.jpg", stones: ":stones_texture.jpg", stucco: ":stucco_texture.jpg", 
    			     wood: ":wood_texture.jpg", wood_old: ":wood_old_texture.jpg"}
    var bumpmaps = { gravel: ":gravel_bumpmap.jpg", rock: ":rock_bumpmap.jpg", stones: ":stones_bumpmap.jpg", 
    				 stucco: ":stucco_bumpmap.jpg", wood_old: ":wood_old_bumpmap.jpg"}
    
    function setup_texture(name, obj, isbump) {
    	if (name.slice(0,1) == ':') {
    		//name = "images/"+name.slice(1) // our images were formerly here
    		name = "https://s3.amazonaws.com/glowscript/textures/"+name.slice(1)
    	}
    	obj.canvas.__renderer.initTexture(name, obj, isbump)
    }
    
    function Primitive() {}
    // The declare function in file property.js creates attributes such as pos as __pos
    property.declare( Primitive.prototype, {
        __id: null,
        __hasPosAtCenter: false,

        __zx_camera: null, __zy_camera: null, 
        __xmin:null, __ymin: null, __zmin: null,
        __xmax: null, __ymax: null, __zmax: null, 

        pos:   new attributeVector(null, 0,0,0),
        color: new attributeVector(null, 1,1,1),
        up:    new attributeVector(null, 0,1,0),
        axis:  new attributeVector(null, 1,0,0),
        size:  new attributeVector(null, 1,1,1),
        opacity: {
        	get: function() { return this.__opacity },
        	set: function(value) {
        		if (value == this.__opacity) return
        		if ( (this.__opacity < 1 && value  == 1) || (this.__opacity == 1 && value  < 1) ) {
            		this.__opacity_change = true
                }
        		this.__opacity = value
        		this.__change()
        	}
        },
        x: {
        	get: function() {      throw new Error('"object.x" is not supported; perhaps you meant "object.pos.x"') },
        	set: function(value) { throw new Error('"object.x" is not supported; perhaps you meant "object.pos.x"') }
        },
        y: {
        	get: function() {      throw new Error('"object.y" is not supported; perhaps you meant "object.pos.y"') },
        	set: function(value) { throw new Error('"object.y" is not supported; perhaps you meant "object.pos.y"') }
        },
        z: {
        	get: function() {      throw new Error('"object.z" is not supported; perhaps you meant "object.pos.z"') },
        	set: function(value) { throw new Error('"object.z" is not supported; perhaps you meant "object.pos.z"') }
        },
    	__opacity_change: false, // not really used yet: intended to help categorize into opaque/transparent objects
    	__prev_opacity: null,
        shininess: { value: 0.6, onchanged: function() { this.__change() } },
        emissive: { value: false, onchanged: function() { this.__change() } },
        pickable: { value: true, onchanged: function() { this.__change() } },
        ready: { get: function() { return (this.__tex.file === null || this.__tex.texture_ref.reference !== null &&
        		                        this.__tex.bumpmap === null || this.__tex.bumpmap_ref.reference !== null) } },
        
        texture: {
            get: function() {
                return {file: this.__tex.file, bumpmap: this.__tex.bumpmap, 
                	left: this.__tex.left, right: this.__tex.right, sides: this.__tex.sides, 
  				    flipx: this.__tex.flipx, flipy: this.__tex.flipy, turn: this.__tex.turn }
            },
            set: function(args) { // file name, or { file: f, place: option or [option1, option2], bumpmap: f }
            	this.__tex = {file: null, bumpmap: null, texture_ref: {reference: null}, bumpmap_ref: {reference: null}, 
            				  left: false, right: false, sides: false, flipx: false, flipy: false, turn: 0, flags: 0 }
            	if (args === null) {
            		;
            	} else if (typeof args === 'string') {
            		this.__tex.left = this.__tex.right = this.__tex.sides = true
            		setup_texture(args, this, false)
            	} else {
            		if (args.file !== undefined && typeof args.file === 'string') {
            			setup_texture(args.file, this, false)
            		} else throw new Error("You must specify a file name for a texture.")
            		if (args.bumpmap !== undefined) {
            			if (args.bumpmap !== null) {
            				if (typeof args.bumpmap !== 'string') throw new Error("You must specify a file name for a bumpmap.")
            				setup_texture(args.bumpmap, this, true)
            			}
            		}
            		if (args.flipx !== undefined) this.__tex.flipx = args.flipx
            		if (args.flipy !== undefined) this.__tex.flipy = args.flipy
            		if (args.turn !== undefined) this.__tex.turn = Math.round(args.turn)
            		if (args.place !== undefined) {
            			if (typeof args.place === 'string') args.place = [args.place]
            			for (var i=0; i<args.place.length; i++) {
            				switch (args.place[i]) {
            					case 'left': 
	            					this.__tex.left = true
	            					break
            					case 'right': 
	            					this.__tex.right = true
	            					break
            					case 'sides': 
	            					this.__tex.sides = true
	            					break
            					case 'ends': 
	            					this.__tex.left = this.__tex.right = true
	            					break
            					case 'all': 
            						this.__tex.left = this.__tex.right = this.__tex.sides = true
	            					break
            				}
            			}
            		} else this.__tex.left = this.__tex.right = this.__tex.sides = true
            	}
            	this.__tex.flags = 0
            	if (this.__tex.file !== null) this.__tex.flags += 1
            	if (this.__tex.bumpmap !== null) this.__tex.flags += 2
            	if (this.__tex.left) this.__tex.flags += 4
            	if (this.__tex.right) this.__tex.flags += 8
            	if (this.__tex.sides) this.__tex.flags += 16
            	if (this.__tex.flipx) this.__tex.flags += 32
            	if (this.__tex.flipy) this.__tex.flags += 64
            	var turns = this.__tex.turn % 4
            	if (turns < 0) turns += 4
            	this.__tex.flags += 128*turns
            	this.__change()
            }
        },
        visible: { 
            get: function() { return this.__id != null },
            set: function(value) {
                if (value == (this.__id != null)) return
                if (value) {
                    this.__id = nextVisibleId
                    nextVisibleId++
                    this.canvas.__visiblePrimitives[this.__id] = this
                    this.__falsecolor = id_to_falsecolor(this.__id)
                    this.canvas.__changed[this.__id] = this
                    if (this instanceof triangle || this instanceof quad) {
                    	var vars = ['__v0', '__v1', '__v2', '__v3'], N = 3
                    	if (this instanceof quad) N = 4
                    	// mark vertices used by this triangle/quad, to support autoscaling when the vertex changes
                        for (var i=0; i<N; i++) {
                        	this.canvas.__vertices.object_info[ this[vars[i]].__id ][this.__id] = this
                        }
                    }
                } else {
                    delete this.canvas.__visiblePrimitives[this.__id]
                    delete this.canvas.__changed[this.__id]
                    if (this.__model) delete this.__model.id_object[this.__id]
                    if (this.__components)
                        for (var i = 0; i < this.__components.length; i++)
                            delete this.__components[i].__model.id_object[this.__components[i].__id]
                    if (this instanceof triangle || this instanceof quad) {
                    	var vars = ['__v0', '__v1', '__v2', '__v3'], N = 3
                    	if (this instanceof quad) N = 4
                    	// mark vertices as not currently used by this triangle/quad
                        for (var i=0; i<N; i++) {
                        	delete this.canvas.__vertices.object_info[ this[vars[i]].__id ][this.__id]
                        }
                    }
                    this.__id = null
                }
            }},
        clone: function(args) {
        	if (this instanceof triangle || this instanceof quad)
        		throw new Error('Cannot clone a '+this.constructor.name+' object.')
        	var newargs = {pos:this.__pos, color:this.__color, opacity:this.__opacity, 
        			size:this.__size, axis:this.__axis, up:this.__up, __tex:this.__tex,
            		shininess:this.__shininess, emissive:this.__emissive, 
            		visible:true, pickable:this.__pickable}
        	for (var attr in args) {
        		newargs[attr] = args[attr]
        	}
        	return new this.constructor(newargs)
        },
        __change: function() { if (this.__id) this.canvas.__changed[this.__id] = this },
        __get_extent: function(ext) { Autoscale.find_extent(this, ext) },
        __get_model: function() { return this.canvas.__renderer.models[this.constructor.name] },
        __update: function() {
            var pos = this.__pos
            var size = this.__size
            var color = this.__color
            var axis = this.__axis
            var up = this.__up

            var data = this.__data
            if (!data) this.__data = data = new Float32Array(20)
            this.__model.id_object[this.__id] = this

        	data[0] = pos.__x; data[1] = pos.__y; data[2] = pos.__z
            data[3] = this.__shininess
            data[4] = axis.__x; data[5] = axis.__y; data[6] = axis.__z, data[7] = this.__emissive ? 1 : 0
            data[8] = up.__x; data[9] = up.__y; data[10] = up.__z
            data[11] = this.__tex.flags
            data[12] = size.__x; data[13] = size.__y; data[14] = size.__z
            data[16] = color.__x; data[17] = color.__y; data[18] = color.__z
            data[19] = this.__opacity
        },
        rotate: function (args) {
            if (args === undefined || args.angle === undefined) { throw new Error("object.rotate() requires angle:...") }
            var angle = args.angle
            var rotaxis, origin
            if (args.axis === undefined) { rotaxis = this.__axis }
            else rotaxis = args.axis.norm()
            if (args.origin === undefined) { origin = this.__pos }
            else origin = args.origin
            
            var isarrow = (this.constructor == arrow)
            
            var X = isarrow ? this.__axis_and_length.norm() : this.__axis.norm()
            var Y = this.__up.norm()
            var Z = X.cross(Y)
            if (Z.dot(Z) < 1e-10) {
            	Y = vec(1,0,0)
                Z = X.cross(Y)
                if (Z.dot(Z) < 1e-10)
                	Y = vec(0,1,0)
            }
            
            this.pos = origin.add(this.__pos.sub(origin).rotate({angle:angle, axis:rotaxis}))
            if (isarrow) this.axis_and_length = this.__axis_and_length.rotate({angle:angle, axis:rotaxis})
            else this.axis = this.__axis.rotate({angle:angle, axis:rotaxis})
            this.up = Y.rotate({angle:angle, axis:rotaxis})
        	
        },
        getTransformedMesh: function() {
            var X = this.__axis.norm()
            var Y = this.__up.norm()
            var Z = X.cross(Y)
            if (Z.dot(Z) < 1e-10) {
            	Y = vec(1,0,0)
                Z = X.cross(Y)
                if (Z.dot(Z) < 1e-10)
                	Y = vec(0,1,0)
                    Z = X.cross(Y)
            }
            Z = Z.norm()
            var Y = Z.cross(X).norm()
            X = X.multiply(this.__size.x)
            Y = Y.multiply(this.__size.y)
            Z = Z.multiply(this.__size.z)
            var T = this.__pos
            var matrix = [X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, T.x, T.y, T.z, 1]
            return this.__model.mesh.transformed(matrix);
        }
    })

    function box(args) { return initObject(this, box, args) }
    subclass(box, Primitive)
    box.prototype.__hasPosAtCenter = true

    function cylinder(args) { return initObject(this, cylinder, args) }
    subclass(cylinder, Primitive)

    function cone(args) { return initObject(this, cone, args) }
    subclass(cone, cylinder)

    function pyramid(args) { return initObject(this, pyramid, args) }
    subclass(pyramid, box)

    function sphere(args) { return initObject(this, sphere, args) }
    subclass(sphere, Primitive)
    sphere.prototype.__hasPosAtCenter = true
    
    function vp_box(args) { return initObject(this, vp_box, args) }
    subclass(vp_box, box)
    property.declare( vp_box.prototype, {
        pos:  new attributeVectorPos(null, 0,0,0),
        axis: new attributeVectorAxis(null, 1,0,0),
        size: new attributeVectorSize(null, 1,1,1),
        display: {
        	get: function() { return this.canvas },
        	set: function(value) { throw new Error('Cannot change display of existing object')}
        },
        length: {
        	get: function() { return this.__size.__x },
        	set: function(value) {
	    		this.axis = this.__axis.norm().multiply(value) // this will set length
        		this.__change()
        	}
        },
	    height: {
	    	get: function() { return this.__size.__y },
	    	set: function(value) {
	    		this.__size.__y = value
	    		this.__change()
	    	}
	    },
        width: {
        	get: function() { return this.__size.__z },
        	set: function(value) {
        		this.__size.__z = value
        		this.__change()
        	}
        },
    	red: {
    		get: function() { return this.__color.__x },
	    	set: function(value) {
	    		this.__color.__x = value
	    		this.__change()
	    	}
    	},
	    green: {
	    	get: function() { return this.__color.__y },
	    	set: function(value) {
	    		this.__color.__y = value
	    		this.__change()
	    	}
	    },
	    blue: {
	    	get: function() { return this.__color.__z },
	    	set: function(value) {
	    		this.__color.__z = value
	    		this.__change()
	    	}
	    },
	    make_trail: {
	    	get: function() { return this.__make_trail },
	    	set: function(value) { this.__make_trail = value }
	    },
	    interval: {
	    	get: function() { return this.__interval },
	    	set: function(value) { 
	    		this.__interval = value
	    		this.__ninterval = 0
	    	}
	    },
	    retain: { // -1 means don't retain
	    	get: function() { return this.__retain },
	    	set: function(value) { this.__retain = value }
	    },
	    trail_type: {
	    	get: function() {
	    		if (this.__trail_type == 'curve') return 'curve'
	    		else if (this.__trail_type == 'spheres') return 'points'
	    		else return this.__trail_type
	    		},
	    	set: function(value) {
	    		if (value == 'curve') this.__trail_type = 'curve'
	    		else if (value == 'points') this.__trail_type = 'spheres'
	    		else throw new Error('trail_type must be "curve" or "points".')
	    	}
	    },
	    trail_object: {
	    	get: function() { return this.__trail_object }
	    },
	    __update_trail: function() {
	    	this.__ninterval++
	    	if (this.__ninterval >= this.__interval) {
	    		this.__ninterval = 0
				if (this.__retain == -1) this.__trail_object.push(this.__pos)
				else this.__trail_object.push({pos:this.__pos, retain:this.__retain})
	    	}
	    }
    })
    
    function vp_pyramid(args) { return initObject(this, vp_pyramid, args) }
    subclass(vp_pyramid, vp_box)
    
    function vp_sphere(args) { return initObject(this, vp_sphere, args) }
    subclass(vp_sphere, vp_box)
    property.declare( vp_sphere.prototype, {
        axis: new attributeVectorAxis(null, 2,0,0),
        size: new attributeVectorSize(null, 2,2,2),
        radius: {
        	get: function() { return this.__size.__y/2 },
        	set: function(value) {
        		this.__size.__x = this.__size.__y = this.__size.__z = 2*value
        		this.__change()
        	}
        }
    })
    
    function vp_ellipsoid(args) { return initObject(this, vp_ellipsoid, args) }
    subclass(vp_ellipsoid, vp_box)
    property.declare( vp_ellipsoid.prototype, {
        radius: {
        	get: function() { throw new Error('An ellipsoid does not have a radius attribute.') },
        	set: function(value) { throw new Error('An ellipsoid does not have a radius attribute.') }
        }
    })
    
    function vp_cylinder(args) { return initObject(this, vp_cylinder, args) }
    subclass(vp_cylinder, vp_box)
    property.declare( vp_cylinder.prototype, {
        size: new attributeVectorSize(null, 1,2,2),
        radius: {
        	get: function() { return this.__size.__y/2 },
        	set: function(value) {
        		this.__size.__y = this.__size.__z = 2*value
        		this.__change()
        	}
        }
    })
    
    function vp_cone(args) { return initObject(this, vp_cone, args) }
    subclass(vp_cone, vp_cylinder)
    
    function arrow_update(obj, vp) { // arrow or vp_arrow (in which case vp is true)
    	var pos = obj.__pos
        var color = obj.__color
        var axis
        if (vp) axis = obj.__axis
        else axis = obj.__axis_and_length
        var size = obj.__size
        var up = obj.__up
        var L = size.__x
        var A = axis.norm()
        var sw = obj.__shaftwidth || L * .1
        var hw = obj.__headwidth || sw * 2
        var hl = obj.__headlength || sw * 3

        if (sw < L * .02) {
            var scale = L * .02 / sw
            if (!obj.__shaftwidth) sw *= scale
            if (!obj.__headwidth) hw *= scale
            if (!obj.__headlength) hl *= scale
        }
        if (hl > L * .5) {
            var scale = L * .5 / hl
            if (!obj.__shaftwidth) sw *= scale
            if (!obj.__headwidth) hw *= scale
            if (!obj.__headlength) hl *= scale
        }

        var components = obj.__components
        if (!components) {
        	if (vp) components = obj.__components = [vp_box({ canvas:obj.canvas, visible: obj.visible }), 
        	                                         vp_pyramid({ canvas:obj.canvas, visible: obj.visible })]
        	else components = obj.__components = [box({ canvas:obj.canvas, visible: obj.visible }), 
                                                  pyramid({ canvas:obj.canvas, visible: obj.visible })]
            for (var i = 0; i < components.length; i++) {
                components[i].__id = nextVisibleId++
                components[i].__falsecolor = obj.__falsecolor
            }
        }
        var shaft = components[0]
        var tip = components[1]

        shaft.pos = pos.add(A.multiply(.5 * (L - hl)))
        tip.pos = pos.add(A.multiply(L - hl))
        shaft.axis = tip.axis = axis
        shaft.up = tip.up = up
        shaft.size = vec(L - hl, sw, sw)
        tip.size = vec(hl, hw, hw)
        shaft.color = tip.color = obj.color
        shaft.opacity = tip.opacity = obj.opacity

        obj.size = vec(L, hw, hw)

        shaft.__update()
        tip.__update()
    }

    function arrow(args) { return initObject(this, arrow, args) }
    subclass(arrow, box)
    property.declare( arrow.prototype, {
        __primitiveCount: 2,
        shaftwidth: 0,
        headwidth: 0,
        headlength: 0,
        axis_and_length: new attributeVectorAxis(null, 1,0,0),
        __update: function () { arrow_update(this, false) },
        __get_extent: function(ext) {
        	if (!this.__components) this.__update()
	        Autoscale.find_extent(this.__components[0], ext)
	        Autoscale.find_extent(this.__components[1], ext)
        }
    })
    
    function vp_arrow(args) { return initObject(this, vp_arrow, args) }
    subclass(vp_arrow, arrow)
    property.declare( vp_arrow.prototype, {
    	axis: new attributeVectorAxis(null, 1,0,0),
    	__update: function () { arrow_update(this, true) }
    })

    function vertex(args)  {
    	// Comment by David Scherer: In WebGL indices are required to be Uint16Array, so less than 65536.
    	// To handle more than this many index values, we need more lists. Moreover, a triangle or quad might
    	// use vertex objects from more than one list, which requires some duplication. As a temporary
    	// measure to get going, just give an error if one tries to create more than 65536 vertex objects.
    	// Also, he points out that one could keep info on what triangles or quad use a vertex, and if the
    	// count goes to zero, the slot can be reused (we're currently keeping a list of those triangles/quads
    	// use this vertex).
    	if (!(this instanceof vertex)) { return new vertex(args) } // so vertex() is like new vertex()
    	args = args || {}
        if (args.canvas !== undefined) {
            this.canvas = args.canvas
            delete args.canvas
        } else if (args.display !== undefined) {
            obj.canvas = obj.display = args.display
            delete args.display
        } else {
            this.canvas = canvas.selected
        }
    	for (var attr in args) this[attr] = args[attr]
    	if (args.opacity === undefined) this.opacity = 1
    	if (this.__texpos.z !== 0) throw new Error('In a vertex the z component of texpos must be zero.')
    	if (this.canvas.vertex_id >= 65536) throw new Error('Currently the number of vertices is limited to 65536.')
    	var lengths = {pos:3, normal:3, color:3, opacity:1, shininess:1, emissive:1, texpos:2, bumpaxis:3}
    	this.__id = this.canvas.vertex_id
    	var c = this.canvas.__vertices
    	if (this.canvas.vertex_id % c.Nalloc === 0) { // need to extend arrays
    		var temp
    		var L = this.canvas.vertex_id + c.Nalloc
    		for (var t in lengths) {
				temp = new Float32Array(lengths[t]*L)
				temp.set(c[t], 0)
				c[t] = temp
			}
		}
    	this.canvas.vertex_id++
    	this.canvas.__vertices.object_info[this.__id] = {} // initialize dictionary of triangles/quads that use this vertex
    	this.__change()
    }
    property.declare( vertex.prototype, {
        __id: null,
        __hasPosAtCenter: true,
        pos: new attributeVector(null, 0,0,0),
        normal: new attributeVector(null, 0,0,1),
        color: new attributeVector(null, 1,1,1),
        opacity: {
        	get: function() { return this.__opacity },
        	set: function(value) {
        		if (value == this.__opacity) return
        		if ( (this.__opacity < 1 && value  == 1) || (this.__opacity == 1 && value  < 1) ) {
            		var users = this.canvas.__vertices.object_info[this.__id]
                	for (var u in users) {
                		users[u].__change()
                		users[u].__opacity_change = true
                	}
        		}
        		this.__opacity = value
        		this.canvas.__vertex_changed[this.__id] = this
        	}
        	
        },
        texpos: new attributeVector(null, 0,0,0),
        bumpaxis: new attributeVector(null, 1,0,0),
        shininess: { value: 0.6, onchanged: function() { this.__change() } },
        emissive: { value: false, onchanged: function() { this.__change() } },
        __change: function() { 
        	if (this.__id) {
        		this.canvas.__vertex_changed[this.__id] = this
        		if (this.canvas.__autoscale) { // alert triangles/quads that use this vertex, to support autoscaling
	        		var users = this.canvas.__vertices.object_info[this.__id]
	            	for (var u in users) users[u].__change()
        		}
        	}
        },
        rotate: function (args) {
            if (args.angle === undefined) { throw new Error("vertex.rotate() requires angle:...") }
            var angle = args.angle
            if (args.axis === undefined) { throw new Error("vertex.rotate() requires axis:...") }
            var axis = args.axis.norm()
            var origin
            if (args.origin === undefined) { origin = vec(0,0,0) }
            else origin = args.origin
            this.pos = origin.add(this.__pos.sub(origin).rotate({angle:angle, axis:axis})) 
        	this.__change()           
        },
    })
    
    function tri_quad_error(object_type, attribute) {
    	throw new Error('A '+object_type+' has no '+attribute+' attribute.')
    }
    
    function triangle(args)  {
    	// e.g. triangle( { v0:..., v1:..., v2:..., texture:textures.flower, myid:'left side' }
    	// 1000000 Float32Array(array) or Uint16Array(array) costs about 15 ms
    	// Conclusion: keep data arrays in Float32Array format except for index array, which should be an ordinary array
	    if (!(this instanceof triangle)) return new triangle(args)  // so triangle() is like new triangle()
	    args = args || {}
	    var vnames = ['v0', 'v1', 'v2']
	    for (var i=0; i<3; i++)
	    	if (args[vnames[i]] === undefined) throw new Error('A triangle must have a vertex '+vnames[i]+'.')
        this.__tex = {file: null, bumpmap: null, texture_ref: {reference: null}, bumpmap_ref: {reference: null}, 
				  left: false, right: false, sides: false, flipx: false, flipy: false, turn: 0, flags: 0 }
	    init(this, args)
	    //this.__v0.__change() // force display of the triangle
	}
    subclass(triangle, box)
    property.declare( triangle.prototype, {
    	v0: {
    		get: function() { return this.__v0 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v0 must be a vertex object.')
    			this.__v0 = value
    			this.__change()
    			}
    	},
    	v1: {
    		get: function() { return this.__v1 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v1 must be a vertex object.')
    			this.__v1 = value
    			this.__change()
    			}
    	},
    	v2: {
    		get: function() { return this.__v2 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v2 must be a vertex object.')
    			this.__v2 = value
    			this.__change()
    			}
    	},
    	pos: {
    		get: function() { tri_quad_error('triangle', 'pos') },
    		set: function(value) { tri_quad_error('triangle', 'pos') }
    	},
    	color: {
    		get: function() { tri_quad_error('triangle', 'color') },
    		set: function(value) { tri_quad_error('triangle', 'color') }
    	},
    	size: {
    		get: function() { tri_quad_error('triangle', 'size') },
    		set: function(value) { tri_quad_error('triangle', 'size') }
    	},
    	axis: {
    		get: function() { tri_quad_error('triangle', 'axis') },
    		set: function(value) { tri_quad_error('triangle', 'axis') }
    	},
    	up: {
    		get: function() { tri_quad_error('triangle', 'up') },
    		set: function(value) { tri_quad_error('triangle', 'up') }
    	},
    	opacity: {
    		get: function() { tri_quad_error('triangle', 'opacity') },
    		set: function(value) { tri_quad_error('triangle', 'opacity') }
    	},
    	shininess: {
    		get: function() { tri_quad_error('triangle', 'shininess') },
    		set: function(value) { tri_quad_error('triangle', 'shininess') }
    	},
    	emissive: {
    		get: function() { tri_quad_error('triangle', 'emissive') },
    		set: function(value) { tri_quad_error('triangle', 'emissive') }
    	},
    	__prev_texture: null,
    	__prev_bumpmap: null,
        __update: function () { this.__model.id_object[this.__id] = this },
        __get_extent: function (ext) {
    	    var vnames = ['__v0', '__v1', '__v2']
            for (var i=0; i<3; i++) ext.point_extent(this, this[vnames[i]].pos) // this triangle uses these vertices
        },
        rotate: function (args) { throw new Error('A triangle has no rotate method; rotate the vertices instead.')
        }
    })
    
    function quad(args)  { // quads are actually rendered as triangles; their indices are added to the triangle indices
	    if (!(this instanceof quad)) return new quad(args)  // so quad() is like new quad()
	    args = args || {}
	    var vnames = ['v0', 'v1', 'v2', 'v3']
	    for (var i=0; i<4; i++)
	    	if (args[vnames[i]] === undefined) throw new Error('A quad must have a vertex '+vnames[i]+'.')
        this.__tex = {file: null, bumpmap: null, texture_ref: {reference: null}, bumpmap_ref: {reference: null}, 
				  left: false, right: false, sides: false, flipx: false, flipy: false, turn: 0, flags: 0 }
	    init(this, args)
	    //this.__v0.__change() // force display of the quad
	}
    subclass(quad, box)
    property.declare( quad.prototype, {
    	v0: {
    		get: function() { return this.__v0 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v0 must be a vertex object.')
    			this.__v0 = value
    			this.__change()
    			}
    	},
    	v1: {
    		get: function() { return this.__v1 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v1 must be a vertex object.')
    			this.__v1 = value
    			this.__change()
    			}
    	},
    	v2: {
    		get: function() { return this.__v2 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v2 must be a vertex object.')
    			this.__v2 = value
    			this.__change()
    			}
    	},
    	v3: {
    		get: function() { return this.__v3 },
    		set: function(value) {
    			if (!(value instanceof vertex)) throw new Error('v3 must be a vertex object.')
    			this.__v3 = value
    			this.__change()
    			}
    	},
    	pos: {
    		get: function() { tri_quad_error('quad', 'pos') },
    		set: function(value) { tri_quad_error('quad', 'pos') }
    	},
    	color: {
    		get: function() { tri_quad_error('quad', 'color') },
    		set: function(value) { tri_quad_error('quad', 'color') }
    	},
    	size: {
    		get: function() { tri_quad_error('quad', 'size') },
    		set: function(value) { tri_quad_error('quad', 'size') }
    	},
    	axis: {
    		get: function() { tri_quad_error('quad', 'axis') },
    		set: function(value) { tri_quad_error('quad', 'axis') }
    	},
    	up: {
    		get: function() { tri_quad_error('quad', 'up') },
    		set: function(value) { tri_quad_error('quad', 'up') }
    	},
    	opacity: {
    		get: function() { tri_quad_error('quad', 'opacity') },
    		set: function(value) { tri_quad_error('quad', 'opacity') }
    	},
    	shininess: {
    		get: function() { tri_quad_error('quad', 'shininess') },
    		set: function(value) { tri_quad_error('quad', 'shininess') }
    	},
    	__prev_texture: null,
    	__prev_bumpmap: null,
        __update: function () { this.__model.id_object[this.__id] = this },
        __get_extent: function (ext) {
    	    var vnames = ['__v0', '__v1', '__v2', '__v3']
            for (var i=0; i<4; i++) ext.point_extent(this, this[vnames[i]].pos) // this quad uses these vertices
        },
        rotate: function (args) { throw new Error('A quad has no rotate method; rotate the vertices instead.')
        }
    })

    var compound_id = 0
    
    function compound(objects, parameters) {
        if (!(this instanceof compound)) return new compound(objects, parameters);
        parameters = parameters || {}
        if (objects.length === undefined) throw new Error("compound takes a list of objects")
        initObject(this, compound, parameters)
        var cloning = false
        if (parameters.__cloning) {
        	cloning = true
        	var mesh = parameters.__cloning
        	delete parameters.__cloning
        }
        
        var visible = true
        if (parameters !== undefined) {
        	for (var attr in parameters) this[attr] = parameters[attr]
            visible = (parameters.visible === undefined) ? true : parameters.visible
            //parameters.visible = false // not used
        }
        
        function update_extent(c, extent) {
	        for (var ext in extent) {
	        	var value = extent[ext]
	        	if (ext.slice(-3) == 'min') { if (c[ext] === null || value < c[ext]) c[ext] = value }
	        	else { if (c[ext] === null || value > c[ext]) c[ext] = value }
	        }
        }

        if (!cloning) {
	        var mesh = new Mesh()
	        for (var i = 0; i < objects.length; i++) {
	            var o = objects[i]
	            //if (o instanceof triangle || o instanceof quad)
	            //	throw new Error('Currently cannot include a '+o.constructor.name+' in a compound.')
	            if (o instanceof arrow)
	            	throw new Error('Currently cannot include an arrow in a compound.')
	            if (o.__tex.file !== null)
	            	throw new Error('Currently objects in a compound cannot have their own texture.')
	            if (o.__tex.bumpmap !== null)
	            	throw new Error('Currently objects in a compound cannot have their own bumpmap.')
	            o.visible = false
	            if (o instanceof triangle || o instanceof quad) {
	        		update_extent( this, mesh.merge(o.v0, o.v0, 0) )
	        		update_extent( this, mesh.merge(o.v1, o.v1, 0) )
	        		update_extent( this, mesh.merge(o.v2, o.v2, 0) )
	            	if (o instanceof quad) {
	            		// Bias the index to point to already existing data:
	            		update_extent( this, mesh.merge(o.v0, o.v0, -3) )
	            		update_extent( this, mesh.merge(o.v2, o.v2, -1) )
	            		update_extent( this, mesh.merge(o.v3, o.v3, 0) )
	            	}
	            } else {
	            	update_extent( this, mesh.merge(o.getTransformedMesh(), o, 0) )
	            }
	        }
	        this.__center = vec( (this.__xmin + this.__xmax)/2, (this.__ymin + this.__ymax)/2, (this.__zmin + this.__zmax)/2 )
	        this.__pseudosize = vec( (this.__xmax-this.__xmin), 
	        				(this.__ymax-this.__ymin), (this.__zmax-this.__zmin) )
	        compound_id++
			mesh.__mesh_id = 'compound'+compound_id
	        this.canvas.__renderer.add_model(mesh, false)
        }
		this.__mesh = mesh
        this.__model = this.canvas.__renderer.models[mesh.__mesh_id]

        this.visible = visible
    }
    subclass(compound, box)
    property.declare( compound.prototype, {
        clone: function(args) {
        	var newargs = {pos:this.__pos, color:this.__color, opacity:this.__opacity, 
        			size:this.__size, axis:this.__axis, up:this.__up, textures:this.__texture,
            		shininess:this.__shininess, emissive:this.__emissive, 
            		visible:true, pickable:this.__pickable,
            		__center:this.__center, __pseudosize:this.__pseudosize}
        	for (var attr in args) {
        		newargs[attr] = args[attr]
        	}
        	newargs.__cloning = this.__mesh
        	return new this.constructor([], newargs)
        },
        _world_zaxis: function() {
	        var axis = this.__axis
	        var up = this.__up
	        var z_axis
	        if (Math.abs(axis.dot(up)) / Math.sqrt(up.mag2()*axis.mag2()) > 0.98) {
	            if (Math.abs(axis.norm().dot(vec(-1,0,0))) > 0.98) {
	                z_axis = axis.cross(vec(0,0,1)).norm()
	            } else {
	                z_axis = axis.cross(vec(-1,0,0)).norm()
	            }
	        } else {
	            z_axis = axis.cross(up).norm()
	        }
	        return z_axis
        },
	    world_to_compound: function(v) {
	        var axis = this.__axis
	        var z_axis = this._world_zaxis()
	        var y_axis = z_axis.cross(axis).norm()
	        var x_axis = axis.norm()
	        var v = v.sub(this.__pos)
	        return vec(v.dot(x_axis), v.dot(y_axis), v.dot(z_axis))
	    },	
	    compound_to_world: function(v) {
	    	var axis = this.__axis        
	    	var z_axis = this._world_zaxis()
	        var y_axis = z_axis.cross(axis).norm()
	        var x_axis = axis.norm()
	        return this.__pos.add(x_axis.multiply(v.x)).add(y_axis.multiply(v.y)).add(z_axis.multiply(v.z))
	    },
        __get_model: function() { return this.__model },
    	__get_extent: function(ext) {
    		// Mock up appropriate data structures for Autoscale.find_extent
    		var savepos = this.__pos, savesize = this.__size
    		var v = vec(this.__size.x*this.__center.x, this.__size.y*this.__center.y, this.__size.z*this.__center.z) 
    		var tpos = v.add(this.__pos)
    		var tsize = vec(this.__size.x*this.__pseudosize.x, this.__size.y*this.__pseudosize.y, this.__size.z*this.__pseudosize.z)
    		this.__pos = tpos
    		this.__pos.__x = tpos.x
    		this.__pos.__y = tpos.y
    		this.__pos.__z = tpos.z
    		this.__size = tsize
    		this.__size.__x = tsize.x
    		this.__size.__y = tsize.y
    		this.__size.__z = tsize.z
    		Autoscale.find_extent(this, ext)
    		this.__pos = savepos
    		this.__size = savesize
    	},
    })

    function curve(args) { // TODO: shrinking a curve's extent doesn't trigger moving the camera inward; dunno why.
        if (!(this instanceof curve)) return new curve(args)  // so curve() is like new curve()
        args = args || {}
    	if (args['texture'] !== undefined) throw new Error("Textures are not available for curve objects.")
    	if (args['opacity'] !== undefined) throw new Error("Opacity is not available for curve objects.")
    	this.__points = []
    	
    	initObject(this, curve, args)

        if (this.radius === undefined) this.radius = 0 // means width of a few pixels
    }
    subclass(curve, Primitive)
    property.declare( curve.prototype, {
    	pos: {
    		get: function() {
    			var ret = []
    			var pts = this.__points
    			for (var i=0; i<pts.length; i++) ret.append(pts[i].__pos)
    			return ret
    		},
    		set: function(value) {
    			this.__points = []
    			this.push(value) 
    		}
    	},
    	origin: new attributeVector(null, 0,0,0),
        radius: 0,
        __no_autoscale: false,
        __get_extent: function (ext) {
        	if (this.__no_autoscale) return
        	// TODO: must do more sophisticated extent calculation now that points are relative to origin
        	var xmin=null, ymin=null, zmin=null, xmax=null, ymax=null, zmax=null
        	var length = this.__points.length
        	var pnt = this.__points
        	var p
            for (var i = 0; i < length; i++) {
                //ext.point_extent(this, pnt[i].__pos)
            	p = pnt[i].__pos
            	if (xmin === null || p.x < xmin) xmin = p.x
            	if (ymin === null || p.y < ymin) ymin = p.y
            	if (zmin === null || p.z < zmin) zmin = p.z
            	if (xmax === null || p.x > xmax) xmax = p.x
            	if (ymax === null || p.y > ymax) ymax = p.y
            	if (zmax === null || p.z > zmax) zmax = p.z
            }
    		// Mock up appropriate data structures for Autoscale.find_extent
	        var center = vec( (xmin + xmax)/2, (ymin + ymax)/2, (zmin + zmax)/2 )
	        var pseudosize = vec( (xmax-xmin),(ymax-ymin), (zmax-zmin) )
    		var savepos = this.__pos, savesize = this.__size
    		var v = vec(this.__size.x*center.x, this.__size.y*center.y, this.__size.z*center.z) 
    		var tpos = v.add(this.__pos)
    		var tsize = vec(this.__size.x*pseudosize.x, this.__size.y*pseudosize.y, this.__size.z*pseudosize.z)
    		this.__pos = tpos
    		this.__pos.__x = tpos.x
    		this.__pos.__y = tpos.y
    		this.__pos.__z = tpos.z
    		this.__size = tsize
    		this.__size.__x = tsize.x
    		this.__size.__y = tsize.y
    		this.__size.__z = tsize.z
    		Autoscale.find_extent(this, ext)
    		this.__pos = savepos
    		this.__size = savesize	
        },
        push: function(pts) {
            var args = [], pt
            if (pts.length !== undefined) args = pts
            else for (var i=0; i<arguments.length; i++) args.push(arguments[i])
            for (var i=0; i<args.length; i++) {
                pt = point(args[i])
                if (args[i].retain !== undefined) if (this.__points.length >= args[i].retain) this.shift()
                pt.__curve = this
                pt.__id = nextVisibleId++
                this.canvas.__visiblePrimitives[pt.__id] = pt // needs to be in visiblePrimitives for mouse picking
                pt.__falsecolor = id_to_falsecolor(pt.__id)
                if (this.__points.length) {
                    var prev = this.__points[this.__points.length - 1]
                    var s = pt.__prevsegment = prev.__nextsegment = new Float32Array(16)
                    s[11] = s[15] = 1;  // opacities
                    prev.__change()
                } // TODO: Do something clever to cap the beginning of the curve
                this.__points.push(pt)
                pt.__change()
                }
            this.__change()
        },
        append: function(pts) { // synonym for push, for better match to Python
        	this.push(pts)
        },
        pop: function() {
            var p = this.__points.pop()
            p.visible = false
            this.__change()
            return {pos:p.pos, color:p.color, radius:p.radius, visible:p.visible}
        },
        clear: function() {
            this.splice(0,this.__points.length)
            this.__change()
        },
        shift: function() {
            var p = this.__points.shift()
            p.visible = false
            this.__change()
            return {pos:p.pos, color:p.color, radius:p.radius, visible:p.visible}
        },
        unshift: function(args) {
            var pts = []
            if (args.length !== undefined) pts = args
            else for (var i=0; i<arguments.length; i++) pts.push(arguments[i]) 
            this.splice(0,0,pts)
            this.__change()
        },
        splice: function(args) {
            var index = arguments[0]
            var howmany = arguments[1]
            var pts = []
            for (var i=2; i<arguments.length; i++) pts.push(arguments[i])
            if (pts.length == 1 && pts[0].length !== undefined) pts = pts[0]
            var s = this.__points.slice(index+howmany) // points to be saved
            var t = []
            for (var i=0; i<s.length; i++) 
                t.push({pos:s[i].pos, color:s[i].color, radius:s[i].radius, visible:s[i].visible})
            for (var i=index; i<this.__points.length; i++) this.__points[i].visible = false // "delete" howmany points
            this.__points.splice(index) // remove deleted points from this.__points
            this.push(pts) // push the new points
            this.push(t) // add back the saved points
            this.__change()
        },
        modify: function(N, args) {
            if (args instanceof vec) args = {pos:args}
            for (var attr in args) {
                if (attr == 'x') this.__points[N].pos.x = args[attr]
                if (attr == 'y') this.__points[N].pos.y = args[attr]
                if (attr == 'z') this.__points[N].pos.z = args[attr]
                else this.__points[N][attr] = args[attr]
            }
            this.__points[N].__change()
            this.__change()
        },
        slice: function(start, end) {
            var s = this.__points.slice(start,end)
            var t = []
            for (var i=0; i<s.length; i++) 
                t.push({pos:s[i].pos, color:s[i].color, radius:s[i].radius, visible:s[i].visible})
            return t
        },
        __update: function() {
            var origin = this.__origin
            var size = this.__size
            var color = this.__color
            var axis = this.__axis
            var up = this.__up

            var data = this.__data
            if (!data) this.__data = data = new Float32Array(20)
            this.__model.id_object[this.__id] = this

        	data[0] = origin.__x; data[1] = origin.__y; data[2] = origin.__z
            data[3] = this.__shininess
            data[4] = axis.__x; data[5] = axis.__y; data[6] = axis.__z, data[7] = this.__emissive ? 1 : 0
            data[8] = up.__x; data[9] = up.__y; data[10] = up.__z
            data[12] = size.__x; data[13] = size.__y; data[14] = size.__z
        	data[15] = this.__radius
            data[16] = color.__x; data[17] = color.__y; data[18] = color.__z
            data[19] = this.__opacity
        }
    })

    // point is solely a curve element and is not exported (not to be confused with the points object)
    function point(args) {
        if (!(this instanceof point)) return new point(args)
        if (args instanceof vec) args = {pos:args}
        for (var id in args)
            this[id] = args[id]
        if (this.pos === undefined) throw new Error("Must specify pos for a point on a curve")
    }
    property.declare( point.prototype, {
        __curve: null,
        pos: new attributeVector(null, 0,0,0),
        color: new attributeVector(null, -1,-1,-1),
        radius: { value: -1, onchanged: function() { this.__change() } },
        pickable: { value: true, onchanged: function() { this.__change() } },
        visible: { value: true, onchanged: function() { this.__change() } },
        __change: function() { 
                if (this.__id) {
                    this.__curve.canvas.__changed[this.__id] = this 
                    this.__curve.canvas.__changed[this.__curve.__id] = this.__curve 
                }
            },
        __update: function() {
            var pos = this.__pos
            var radius = this.radius || -1
            var color = this.color || vec(-1,-1,-1)
            var s = this.__prevsegment
            if (s) {
                s[4] = pos.x; s[5] = pos.y; s[6] = pos.z; s[7] = radius;
                s[12] = color.x; s[13] = color.y; s[14] = color.z; // eventually, s[15] = opacity
            }
            s = this.__nextsegment
            if (s) {
                s[0] = pos.x; s[1] = pos.y; s[2] = pos.z; s[3] = radius;
                s[8] = color.x; s[9] = color.y; s[10] = color.z; // eventually, s[11] = opacity
            }
        },
    })
    
    function points(args) { 
	    if (!(this instanceof points)) return new points(args)  // so points() is like new points()
	    args = args || {}
		if (args['texture'] !== undefined) throw new Error("Textures are not available for points objects.")
		if (args['opacity'] !== undefined) throw new Error("Opacity is not available for points objects.")
	    this.__points = []
		this.__size = 0 // means width of a few pixels
		this.__pixels = true
		
		initObject(this, points, args)
	
		this.__last_range = -1
    	this.canvas.__points_objects.push(this)
    }
    subclass(points, curve)
    property.declare( points.prototype, {
    	origin: {
    		get: function() { throw new Error("The points object has no origin attribute.") },
    		set: function(value) { throw new Error("The points object has no origin attribute.") }
    	},
    	axis: {
    		get: function() { throw new Error("The points object has no axis attribute.") },
    		set: function(value) { throw new Error("The points object has no axis attribute.") }
    	},
    	up: {
    		get: function() { throw new Error("The points object has no up attribute.") },
    		set: function(value) { throw new Error("The points object has no up attribute.") }
    	},
    	radius: {
    		get: function() { throw new Error("The points object does not have a radius attribute.") },
    		set: function(value) { throw new Error("The points object does not have a radius attribute.") }
    	},
    	size: {
    		get: function() { return this.__size },
    		set: function(value) { this.__size = value }
    	},
    	size_units: {
    		get: function() { return (this.__pixels) ? 'pixels' : 'world' },
    		set: function(value) { 
    			if (value == 'pixels') this.__pixels = true
    			else if (value == 'world') this.__pixels = false
    			else throw new Error("The points object ")
    		}
    	},
    	shape: {
    		get: function() { return 'round' },
    		set: function(value) { if (value != 'round') throw new Error('The points object only supports shape = "round".')}
    	},
        push: function(pts) {
            var args = [], pt
            if (pts.length !== undefined) args = pts
            else for (var i=0; i<arguments.length; i++) args.push(arguments[i])
            for (var i=0; i<args.length; i++) {
            	var arg = args[i]
            	if (arg instanceof vec) arg = {pos:arg}
            	if (arg.radius !== undefined) throw new Error("The points object does not have a radius attribute.")
            	if (arg.size !== undefined) throw new Error("Individual points objects do not have a size attribute.")
                if (arg.retain !== undefined && this.__points.length >= arg.retain) {
                	var obj = this.__points.shift()
                	obj.pos = arg.pos
                	this.__points.push(obj)
                } else {
                	var D = this.__size
                	var c = (arg.color === undefined) ? this.__color : arg.color
                	// Avoid resetting all sphere diameters (in WebGLRenderer.js) if possible:
                	if (this.__last_range != -1 && this.__last_range === this.canvas.__range) {
                		D = this.__points[0].__size.x // can use diameter of existing sphere
    				} else {
    					D = 0
    					this.__last_range = -1 // force readjustments of diameter
    				}
	            	if (window.__GSlang == 'vpython') {
	                    this.__points.push(vp_sphere({pos:arg.pos, size:vec(D,D,D), color:c, pickable:false}))
	            	} else{
	            		this.__points.push(sphere({pos:arg.pos, size:vec(D,D,D), color:c, pickable:false}))
	            	}
                }
            }
        },
        append: function(pts) { // synonym for push, for better match to Python
        	this.push(pts)
        },
        __update: function() { } // changes drive updates to the sphere objects
    })

    function helix(args) { return initObject(this, helix, args) }
    subclass(helix, cylinder)
    property.declare( helix.prototype, {
        __initialize: true,
        thickness: { value: 0, onchanged: function() { this.__change() } },
        coils: { value: 5, onchanged: function() { this.__initialize = true; this.__change() } },
        __update: function () {
            var NCHORDS = 20 // number of chords in one coil of a helix
            
            if (this.__initialize) {
                if (this.__curve !== undefined) {
                    this.__curve.clear()
                } else {
                    this.__curve = curve({__no_autoscale:true})
                }
            }

            var c = this.__curve
        	c.origin = this.__pos
        	c.axis = this.__axis
        	c.up = this.__up
        	c.size = this.__size
        	c.color = this.__color
            c.radius = this.__thickness ? this.__thickness / 2 : this.__size.y/40
            if (!this.__initialize) return
            
            // Create a helix in the direction (1,0,0) with length 1 and diameter 1, with specified number of coils
            var X = vec(1,0,0)
            var Y = vec(0,1,0)
            var Z = vec(0,0,1)

            var r = 0.5
            var count = this.__coils * NCHORDS
            var dx = 1/count
            var ds = Math.sin(2 * Math.PI / NCHORDS), dc = Math.cos(2 * Math.PI / NCHORDS)
            var x = 0, y = 0, z = r
            var znew

            for (var i = 0; i < count+1; i++) {
            	c.push( vec(x,y,z) )
            	x += dx
                znew = z * dc - y * ds
                y = y * dc + z * ds
                z = znew
            }
        	this.__initialize = false
        }
    })
    
    function vp_helix(args) { return initObject(this, vp_helix, args) }
    subclass(vp_helix, helix)
    property.declare( vp_helix.prototype, {
        axis: new attributeVectorAxis(null, 1,0,0),
        size: new attributeVectorSize(null, 1,2,2),
        radius: {
        	get: function() { return this.__size.__y/2 },
        	set: function(value) {
        		this.__size.__y = this.__size.__z = 2*value
        		this.__change()
        	}
        },
        length: {
        	get: function() { return this.__size.__x },
        	set: function(value) {
        		this.__size.__x = value
        		this.__change()
        	}
        },
	    height: {
	    	get: function() { return this.__size.__y },
	    	set: function(value) {
	    		this.__size.__y = value
	    		this.__change()
	    	}
	    },
        width: {
        	get: function() { return this.__size.__z },
        	set: function(value) {
        		this.__size.__z = value
        		this.__change()
        	}
        }
    })

    // This is an implementation of ring, using curve.
    // Because the API specifies that size.x is the diameter of the cross section
    // of the ring, unless there is a special shader for rings it's not possible
    // to use the standard mesh machinery, since there are two radii to deal with.
    // Because curve doesn't currently average the normals of adjacent segments,
    // it is necessary to use an unusually large number for NCHORDS.
    function ring(args) { return initObject(this, ring, args) }
    subclass(ring, box)
    property.declare( ring.prototype, {
        __initialize: true,
        __hasPosAtCenter: true,
        __size: new attributeVector(null, 0.1, 1, 1), // exception to size (1,1,1)
        __update: function() {
            if (this.__initialize) {
                if (this.__ring !== undefined) {
                    for (var i = 0; i < this.__ring.__points.length; i++)
                        this.__ring.__points[i].pos = this.__pos
                    this.__ring.__update()
                    this.__ring.__points = []
                } else {
                    this.__ring = curve({__no_autoscale:true})
                    this.__ring.__id = nextVisibleId++
                }
            }
            var c = this.__ring
            // Should update the curve's color separately; no need to update vertices
            c.color = this.__color
            c.radius = this.__size.x / 2

            var X = this.__axis.norm()
            var Y, Z
            Z = X.cross(this.__up)
            if (Math.abs(Z.dot(Z)) < 1e-10) {
                Z = X.cross(vec(1, 0, 0))
                if (Math.abs(Z.dot(Z)) < 1e-10) {
                    Z = X.cross(vec(0, 1, 0))
                }
            }
            Z = Z.norm()
            Y = Z.cross(X)

            var NCHORDS = 100 // number of chords
            var r = (this.__size.y - this.__size.x) / 2
            var rcos = r, rsin = 0, newrsin
            var ds = Math.sin(2 * Math.PI / NCHORDS), dc = Math.cos(2 * Math.PI / NCHORDS)
            var start = this.__pos

            for (var i = 0; i <= NCHORDS; i++) {
                var v = start.add(Y.multiply(rsin)).add(Z.multiply(rcos))
                if (this.__initialize) {
                    c.push(point(v))
                } else {
                    c.__points[i].pos = v
                }
                newrsin = rsin * dc + rcos * ds
                rcos = rcos * dc - rsin * ds
                rsin = newrsin
            }

            c.__update()
            this.__initialize = false
        }
    })
    
    function vp_ring(args) { return initObject(this, vp_ring, args) }
    subclass(vp_ring, ring)
    property.declare( vp_ring.prototype, {
        size: new attributeVector(null, 0.2,2,2),
        thickness: {
        	get: function() { return this.__size.__x/2 },
        	set: function(value) {
        		this.__thickness = value
        		this.__size.__x = 2*value
        		this.__size.__y = this.__size.__z = 2*(value + this.__radius)
        		this.__change()
        	}
        },
        radius: {
        	get: function() { return (this.__size.__y-this.__size.__x)/2 },
        	set: function(value) {
        		this.__radius = value
        		this.__size.__y = this.__size.__z = 2*(value + this.__thickness)
        		this.__change()
        	}
        },
        length: {
        	get: function() { return this.__size.__x },
        	set: function(value) {
        		this.__size.__x = value
        		this.__change()
        	}
        },
	    height: {
	    	get: function() { return this.__size.__y },
	    	set: function(value) {
	    		this.__size.__y = value
	    		this.__change()
	    	}
	    },
        width: {
        	get: function() { return this.__size.__z },
        	set: function(value) {
        		this.__size.__z = value
        		this.__change()
        	}
        }
    })

    function distant_light(args) {
        if (!(this instanceof distant_light)) return new distant_light(args)  // so distant_light() is like new distant_light()
        if (args.direction === undefined) throw new Error("Must specify the distant_light, direction:..")
        init(this, args)
        this.canvas.lights.push(this)
    }
    property.declare( distant_light.prototype, {
        direction: new attributeVector(null, 0,0,1),
        color: new attributeVector(null, 1,1,1),
        __get_model: function() { return this.canvas.__renderer.models[this.constructor.name] },
        __change: function() {}
    })

    function local_light(args) {
        if (!(this instanceof local_light)) return new local_light(args)  // so local_light() is like new local_light()
        if (args.pos === undefined) throw new Error("Must specify the local_light position, pos:..")
        init(this, args)
        this.canvas.lights.push(this)
    }
    property.declare( local_light.prototype, {
        pos: new attributeVector(null, 0,0,0),
        color: new attributeVector(null, 1,1,1),
        __get_model: function() { return this.canvas.__renderer.models[this.constructor.name] },
        __change: function() {}
    })

    function draw(args) {
    // This is adequate for GlowScript purposes, including drawing an icon for scene.pause.
    // However, it needs more work before release and documentation, because there is no
    // mechanism here for detecting changes in the this.points array.
        if (!(this instanceof draw)) return new draw(args)  // so draw() is like new draw()
        args = args || {}

        this.points = []
        init(this, args)

        this.canvas.__overlay_objects.objects.push(this) // should be in list of visible objects
    }
    property.declare( draw.prototype, {
        color: { value: null, type: property.nullable_attributeVector },
        fillcolor: { value: null, type: property.nullable_attributeVector },
        linewidth: { value: 1, onchanged: function() { this.__change() } }, 
        opacity: { value: 0.66, onchanged: function() { this.__change() } }, 
        visible: { value: false, onchanged: function() { this.__change() } },

        __get_model: function() { return this.canvas.__renderer.models[this.constructor.name] },
        __update: function (ctx, camera) {
            var pts = this.points.length
            if (pts < 2) return
            if (this.fillcolor != null) {
                ctx.lineWidth = 1
                ctx.fillStyle = color.to_html_rgba(this.fillcolor, this.opacity)
                ctx.beginPath()
                for (var i=0; i<pts; i++) {
                    if (i == 0) ctx.moveTo(this.points[i].x,this.points[i].y)
                    else ctx.lineTo(this.points[i].x,this.points[i].y)
                }
                ctx.fill()
            }
            
            if (this.color != null) {
                ctx.lineWidth = this.linewidth
                ctx.strokeStyle = color.to_html_rgba(this.color, this.opacity)
                ctx.beginPath()
                for (var i=0; i<pts; i++) {
                    if (i == 0) ctx.moveTo(this.points[i].x,this.points[i].y)
                    else if (i == pts-1 && this.points[i].equals(this.points[0])) ctx.closePath()
                    else ctx.lineTo(this.points[i].x,this.points[i].y)
                }
                ctx.stroke()
            }
        },
        __change: function () { this.canvas.__overlay_objects.__changed = true }
    })

    function label(args) {
        if (!(this instanceof label)) return new label(args)  // so label() is like new label()
        args = args || {}

        this.pos = this.pos
        this.color = this.color
        init(this,args)

        this.canvas.__overlay_objects.objects.push(this) // should be in list of visible objects
    }
    property.declare( label.prototype, {
        pos: new attributeVector(null, 0,0,0), 
        color: { value: null, type: property.nullable_attributeVector },
        line: { value: true, onchanged: function() { this.__change() } },
        linecolor: { value: null, type: property.nullable_attributeVector },
        background: { value: null, type: property.nullable_attributeVector },
        opacity: { value: 0.66, onchanged: function() { this.__change() } },
        text: { value: "", onchanged: function() { this.__change() } },
        font: { value: "Verdana", onchanged: function() { this.__change() } },
        height: { value: 13, onchanged: function() { this.__change() } },
        visible: { value: false, onchanged: function() { this.__change() } },
        align: { value: "center", onchanged: function() { this.__change() } },
        box: { value: true, onchanged: function() { this.__change() } },
        border: { value: 5, onchanged: function() { this.__change() } },
        linewidth: { value: 1, onchanged: function() { this.__change() } }, 
        xoffset: { value: 0, onchanged: function() { this.__change() } },
        yoffset: { value: 0, onchanged: function() { this.__change() } },
        space: { value: 0, onchanged: function() { this.__change() } },
        // if pixel_pos == true, pos interpreted as a pixel position:
        pixel_pos: { value: false, onchanged: function() { this.__change() } }, 

        __get_model: function () { return null },
        __update: function (ctx, camera) {
            var xoffset = this.__xoffset, yoffset = this.__yoffset
            var posx, posy
            if (this.__pixel_pos) {
                posx = this.__pos.x
                posy = this.__pos.y
                yoffset = -yoffset
            } else {
                if (this.canvas.__width >= this.canvas.__height) var factor = 2 * this.canvas.__range / this.canvas.__height // real coord per pixel
                else var factor = 2 * this.canvas.__range / this.canvas.__width
                var vnew = mat4.multiplyVec3(
                    mat4.rotateY(mat4.rotateX(mat4.identity(mat4.create()), camera.angleY), camera.angleX),
                    vec3.create([this.pos.x - this.canvas.center.x, this.pos.y - this.canvas.center.y, this.pos.z - this.canvas.center.z]))
                var d = camera.distance
                var k = (1 + vnew[2] / (d - vnew[2])) / factor
                posx = Math.round(k * vnew[0] + this.canvas.__width / 2) // label.pos in terms of pixels
                posy = Math.round(-k * vnew[1] + this.canvas.__height / 2)
                // Need to check for wrap-around of label, but this isn't right:
                //if (vnew[2] < camera.zNear || vnew[2] > camera.zFar) return
            }

            ctx.font = this.__height + 'px ' + this.__font
            ctx.textAlign = 'left' // make explicit to simplify/clarify later calculations
            ctx.textBaseline = 'middle'
            ctx.lineWidth = this.__linewidth
            var default_color = vec(1,1,1)
            if (this.canvas.__background.equals(vec(1,1,1))) default_color = vec(0,0,0)
            ctx.strokeStyle = color.to_html(this.__linecolor || this.__color || default_color)

            var tx = posx, ty = posy
            var twidth = ctx.measureText(this.__text).width
            var tw, th, xleft, ytop, xend, yend
            tw = Math.ceil(twidth)
            th = Math.ceil(this.__height + 2 * this.__border)
            xleft = Math.floor(tx - this.__border) + 0.5
            ytop = Math.ceil(ty - .4 * th) - 0.5
            if (xoffset || yoffset) {
                if (Math.abs(yoffset) > Math.abs(xoffset)) {
                    if (yoffset > 0) {
                        ytop -= yoffset + th / 2
                        ty -= yoffset + th / 2
                        yend = ytop + th
                    } else {
                        ytop -= yoffset - th / 2
                        ty -= yoffset - th / 2
                        yend = ytop
                    }
                    tx += xoffset - tw / 2
                    xleft = tx - this.border
                    xend = tx + tw / 2
                } else {
                    if (xoffset > 0) {
                        xleft += xoffset
                        tx += xoffset
                        xend = xleft
                    } else {
                        tx += xoffset - tw
                        xleft = tx - this.border
                        xend = tx + tw + this.border
                    }
                    ty -= yoffset
                    ytop -= yoffset
                    yend = ytop + th / 2
                }
                if (this.__line) {
                    ctx.beginPath()
                    if (this.space > 0) {
                        var v = (vec(xend - posx, yend - posy, 0).norm()).multiply(k * this.space)
                        v = v.add(vec(posx, posy, 0))
                        ctx.moveTo(v.x, v.y)
                    } else ctx.moveTo(posx, posy)
                    ctx.lineTo(xend, yend)
                    ctx.stroke()
                }
            } else {
                switch (this.__align) {
                    case 'center':
                        tx -= twidth / 2
                        xleft -= twidth / 2
                        break
                    case 'right':
                        tx -= twidth
                        xleft -= twidth
                }
            }
            
            tw += 2 * this.__border
            var bcolor
            if (this.__background == null) bcolor = this.canvas.__background
            else bcolor = this.__background
            ctx.fillStyle = color.to_html_rgba(bcolor, this.__opacity)
            ctx.fillRect(xleft,ytop,tw,th)
            
            if (this.__box) {
                ctx.beginPath()
                ctx.moveTo(xleft, ytop)
                ctx.lineTo(xleft + tw, ytop)
                ctx.lineTo(xleft + tw, ytop + th)
                ctx.lineTo(xleft, ytop + th)
                ctx.closePath()
                ctx.stroke()
            }
            
            ctx.fillStyle = color.to_html(this.__color || default_color)
            ctx.fillText(this.__text, tx, ty)
        },
        __change: function () { if (this.canvas !== undefined) this.canvas.__overlay_objects.__changed = true }
    })

    function attach_trail(objectOrFunction, options) {
        if (!(this instanceof attach_trail)) return new attach_trail(objectOrFunction, options)  // so attach_trail() is like new attach_trail()
        if (options === undefined) options = {}
    	if (window.__GSlang == 'vpython' && options.display !== undefined) {
    		options.canvas = options.display
    		delete options.display
    	}
        if (options.canvas === undefined) {
            options.canvas = canvas.selected
            if (typeof objectOrFunction !== "function") options.canvas = objectOrFunction.canvas
        }
        if (options.type === undefined) {
            this.type = 'curve'
        } else {
            switch (options.type) {
                case 'curve':
                    this.type = options.type
                    delete options.type
                    break
                case 'spheres':
                    this.type = options.type
                    delete options.type
                    break
                default:
                    throw new Error("attach_trail type must be 'curve' or 'spheres'")
            }
        }
        this.retain = -1 // show all trail points
        if (options.retain !== undefined) {
            this.retain = options.retain
            delete options.retain
        }
        this.pps = 0 // means show all trail points
        if (options.pps !== undefined) {
            this.pps = options.pps
            delete options.pps
        } 
        var radius
        this.__obj = objectOrFunction // either an object or a function
        if (typeof objectOrFunction !== "function") {
            if (options.color === undefined) options.color = objectOrFunction.color
            if (options.radius === undefined) radius = 0.1*objectOrFunction.size.y
            else {
                radius = options.radius
                delete options.radius
            }
        } else {
            if (options.radius === undefined) radius = 0.001*options.canvas.__range
            else {
                radius = options.radius
                delete options.radius
            }
        }
        if (this.type == 'curve') options.radius = radius
        else options.size = vec(2*radius,2*radius,2*radius)
        options.pickable = false
        this.__options = options
        if (this.type == 'curve') this.__curve = curve({canvas:options.canvas, color:options.color, radius:options.radius})
        else this.__spheres = []
        this.__last_pos = null
        this.__last_time = null
        this.__run = true
        this.__elements = 0 // number of curve points or spheres created
        options.canvas.trails.push(this)
        
        this.start = function() {
            this.__run = true
            if (this.type === 'curve') this.curve = curve(this.options) // start new curve
        }
        this.stop = function() {this.__run = false}
        this.clear = function() {
            this.__last_pos = null
            this.__last_time = null
            this.__elements = 0 // number of curve points or spheres created
            if (this.type == 'curve') {
                this.__curve.clear()
            } else {
                var c = this.__spheres
                for (var i=0; i<c.length; i++) {
                    c[i].visible = false // make all existing spheres invisible
                }
                this.__spheres = [] // create a new set of spheres
            }
        }
    }

    function attach_arrow(obj, attr, options) {
        if (!(this instanceof attach_arrow)) return new attach_arrow(obj, attr, options)  // so attach_trail() is like new attach_trail()
        if (options === undefined) options = {}
        if (options.canvas === undefined) options.canvas = obj.canvas
        this.obj = obj
        this.attr = attr
        this.scale = 1
        if (options.scale !== undefined) {
            this.scale = options.scale
            delete options.scale
        }
        if (options.color === undefined) options.color = obj.color
        this.options = options
        var thiscanvas = options.canvas
        this.arrow = arrow(this.options)
        this.arrow.visible = false
        this.arrow.pickable = false
        this.last_pos = null
        this.run = true
        thiscanvas.arrows.push(this)
        
        this.start = function() {this.arrow.visible = this.run = true}
        this.stop = function()  {this.arrow.visible = this.run = false}
    }

    eval("0") // Force minifier not to mangle e.g. box function name (since it breaks constructor.name)

    var exports = {
        box: box, vp_box: vp_box,
        cylinder: cylinder, vp_cylinder: vp_cylinder,
        cone: cone, vp_cone: vp_cone,
        pyramid: pyramid, vp_pyramid: vp_pyramid,
        sphere: sphere, vp_sphere: vp_sphere, vp_ellipsoid: vp_ellipsoid,
        arrow: arrow, vp_arrow: vp_arrow,
        curve: curve,
        points: points,
        helix: helix, vp_helix: vp_helix,
        ring: ring, vp_ring: vp_ring,
        compound: compound,
        vertex: vertex,
        triangle: triangle,
        quad: quad,
        draw: draw,
        label: label,
        distant_light: distant_light,
        local_light: local_light,
        attach_trail: attach_trail,
        attach_arrow: attach_arrow,
        textures: textures,
        bumpmaps: bumpmaps,
    }

    Export(exports)
})();;(function () {
    "use strict";
    // Miscellaneous API stuff that doesn't belong in any other module, and doesn't deserve its own

    // Extend jquery-ui with a menubar functionality ... currently only has non-collapsable vertical menu.
    // Might need to be placed in a controls.js eventually, but for now this will do.
    $.fn.extend({
      gsmenubar: function(cmd) {
          if (!this.is("ul")) {
              alert("MenuBar top level must be unordered list, i.e. <ul>.")
              return
          }
          this.addClass("gsmenubar");
          this.children("li").children("ul").each(function() { $(this).menu() })
      }
    });
    
    // Extend jquery with waitfor, useful for event handling with streamline.js
    $.fn.waitfor = function( eventTypes, callback ) {
        var self = this
        function cb(ev) {
            self.unbind( eventTypes, cb )
            callback(null, ev)
        }
        this.bind( eventTypes, cb )
    }
    
    $.fn.pause = function( prompt, callback ) {
        var self = this
        function cb(ev) {
            prompt.visible = false
            self.unbind( "click", cb )
            callback(null, ev)
        }
        this.bind( "click", cb )
    }

    function get_library(URL, cb) { // import a JavaScript library file, by URL
        var tries = 0
        if (cb === undefined)
            throw new Error("get_display(URL, wait) called without wait")
        var done = false
        var t1 = msclock()

        $.getScript(URL)
          .done(function(script, textStatus) {
              done = true
          })

          .fail(function(jqxhr, settings, exception) {
              alert('Could not access the library\n  '+URL)
              cb()
              return
          })

        function require_wait() {
            if (done) {
              cb()
              return
            }
            var t2 = msclock()
            if (t2-t1 > 6000) {
                var yes = confirm('Timed out trying to access the library\n  '+URL+'\nTry again?')
                if (yes) {
                    t1 = msclock()
                } else {
                    cb()
                    return
                }
            }
            sleep(0.05, require_wait)
        }
        require_wait()
    }
    
    // From David Scherer:
    // The convention for callbacks in node.js, which is adopted by streamline, is that
    // an asynchronous function foo(param,callback) on success "returns" a result by 
    // calling callback(null, result) and on failure "throws" an error by calling callback(error).
    // When you pass wait as the callback to such a function,  streamline converts the first call
    // into a return value and the second call into an exception in the calling code.  When you 
    // implement an asynchronous function *using* streamline (declaring the function foo(param,wait) 
    // streamline also takes care of calling the callback when your function returns or throws.
    // If you write the function in plain javascript,  you need to follow the callback convention
    // (and shouldn't normally return or throw).

    // There are actually some examples in glowscript - look at event handling code.

    // http://bjouhier.wordpress.com/2011/04/04/currying-the-callback-or-the-essence-of-futures/
    
    function read_local_file(place, cb) {
        var info
        if (arguments.length === 0) {
            throw new Error("read_local_file(place, wait) called with no arguments")
        } else if (arguments.length == 1) {
            cb = place
            if (toType(cb) !== 'function')
              throw new Error("Should be 'read_local_file(wait)'")
            place = $('body')
        } else {
            if (arguments.length > 2 || toType(cb) !== 'function')
              throw new Error("Should be 'read_local_file(place, wait)'")
        }
        place.append('<input type="file" id="read_local_file"/>')
        var contents = null
        
        function readSingleFile(evt) {
            var f, reader;
            f = evt.target.files[0];
            if (f) {
                // Also available: f.name, f.size, f.type, and 
                // if f.lastModifiedDate, f.lastModifiedDate.toLocaleDateString()
        
                reader = new FileReader();
                reader.onload = function(e) {
                    contents = e.target.result
                    var moddate = (f.lastModifiedDate) ? f.lastModifiedDate.toLocaleDateString() : ''
                    info = {name:f.name, text:contents, size:f.size, type:f.type, date:moddate}
                    $('#read_local_file').remove()
                }
                return reader.readAsText(f)
            } else {
                alert("Failed to load file")
                return
            }
        }
        
        document.getElementById('read_local_file').addEventListener('change', readSingleFile, false);
        
        function read_file_wait() {
            if (contents !== null) {
                cb(null, info)
                return
            }
            sleep(0.05, read_file_wait)
        }
        read_file_wait()
    }
    
    // http://my.opera.com/edvakf/blog/how-to-overcome-a-minimum-time-interval-in-javascript
    // This function is supposed to return almost instantly if there is nothing pending to do
    /*
    function async(cb) {
        function wrapCB() {
            cb()
        }
        var img = new Image;
        img.addEventListener('error', wrapCB, false);
        img.src = 'data:,';
    }
    */
    
    function update(cb) {
        // TODO: Be fast when called in a tight loop (only sleep every x ms)
        sleep(0,cb)
    }

    function sleep(dt, cb) { // sleep for dt seconds; minimum working sleep is about 5 ms with Chrome, 4 ms with Firefox
        dt = 1000*dt // convert to milliseconds
        function wrapCB() {
            cb() 
        } // In Firefox, setTimeout callback is invoked with a random integer argument, which streamline will interpret as an error!
        if (dt > 5) setTimeout(wrapCB, dt-5)
        else setTimeout(wrapCB, 0)
    }
   
    // Angus Croll: http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
    // {...} "object"; [...] "array"; new Date "date"; /.../ "regexp"; Math "math"; JSON "json";
    // Number "number"; String "string"; Boolean "boolean"; new ReferenceError) "error"

    var toType = function(obj) { 
        return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
    }
    
    function convert(arg) {
        if (arg instanceof vec) { arg = arg.toString()
        } else if (arg === null) { arg = "null"
        } else if (arg === undefined) { arg = "undefined"
        } else if (toType(arg) == "object") { arg = "<Object>"
        } else if (toType(arg) == "number") {
            arg = arg.toPrecision(6)
            if (arg.match(/e/)) {
                arg = arg.replace(/0*e/, 'e')
                arg = arg.replace(/\.e/, 'e')
            } else if (arg.match(/\./)) arg = arg.replace(/0*$/, '')
            arg = arg.replace(/\.$/,'')
        } else arg = arg.toString()
        return arg
    }
    
    var printarea = null // don't create a textarea until a print statement is executed
    var poptions = {width:640, height:100, readonly:true, pos:"bottom"}
    
    function modify_printarea() {
        var w = (poptions.width === undefined) ? 640 : poptions.width
        var h = (poptions.height === undefined) ? 100 : poptions.height
        var readonly = (poptions.readonly === undefined) ? true : poptions.readonly
        if (poptions.pos == "right") canvas.container.css({float:"left"})
        else if (poptions.pos == "bottom") canvas.container.css({clear:"both"})
        printarea.css('width', w).css('height', h)
        if (readonly) printarea.attr('readonly', 'readonly')
        else printarea.attr('readonly', null)
    }
    
    var print_container = $("<div/>")
    
    function print(args) { // similar to Python print()
        // print(x, y, z, {sep:' ', end:'\n'}) // specifying different sep and/or end is optional
        if (printarea === null) {
            var container = print_container
            //container.css({float:"left"})
            container.appendTo($('body'))
            window.__context.print_container = container
            printarea = $('<textarea id=print/>').appendTo(container).css('font-family', 'Verdana', 'Sans-Serif').css('font-size', '100%')
            modify_printarea()
        }
      
        var sep = ' '
        var end = '\n'
        var L = arguments.length
        var arg = arguments[L-1]
        if (arg != null && arg !== undefined) {
            var isobject = false
            if (arg.sep !== undefined) {
                sep = arg.sep
                isobject = true
            }
            if (arg.end !== undefined) {
                end = arg.end
                isobject = true
            }
            if (isobject) L--
        }
        
        var s = ''
        for (var i=0; i<L; i++) { // TODO: array handling needs to be recursive for [1, [2,3], 4]
            var arg = arguments[i]
            if (toType(arg) == "array") {
                var a = "["
                for (var i=0; i<arg.length; i++) {
                    a += convert(arg[i])
                    if (i < arg.length-1) a += ", "
                }
                a += "]"
                arg = a
            } else if (arg === null) {
            	arg = 'null'
            } else {
                arg = convert(arg)
            }
            if (s.length === 0) s += arg
            else s += sep+arg
        }
        s += end
        printarea.val(printarea.val()+s)
        // Make the latest addition visible. Does not scroll if entire text is visible,
        // and does not move the scroll bar more than is necessary.
        printarea.scrollTop(printarea.scrollTop() + 10000)
    }
    
    function print_options(args) {
        var contents = ''
        for (var a in args) {
            poptions[a] = args[a]
        }
        //if (args.clear !== undefined && printarea !== null) printarea.val('')   //Duplicate?
        if (printarea !== null) {
            if (args.clear !== undefined && args.clear) printarea.val('')
            modify_printarea()
            if (args.contents !== undefined && args.contents) contents = printarea.val()
            if (args.delete !== undefined && args.delete) {
                printarea.remove()
                printarea = null
            }
        }
        return contents
    }
    
	window.performance = window.performance || {};
    
    function msclock() {
    	if (performance.now) return performance.now()
    	else return new Date().getTime()
    }
    
    function clock() {
    	return 0.001*msclock()
    }

    var exports = {
        // Top-level math functions
        sqrt: Math.sqrt,
        pi: Math.PI,
        abs: Math.abs,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        atan2: Math.atan2,
        exp: Math.exp,
        log: Math.log,
        pow: Math.pow,
        ceil: Math.ceil,
        floor: Math.floor,
        max: Math.max,
        min: Math.min,
        random: Math.random,
        round: Math.round,
        radians: function radians(deg) { return (deg * Math.PI / 180) },
        degrees: function degrees(rad) { return (rad * 180 / Math.PI) },

        sleep: sleep,
        //rate: rate,
        update: update,
        print: print,
        print_options: print_options,
        print_container: print_container,
        clock: clock,
        msclock: msclock,
        get_library: get_library,
        read_local_file: read_local_file
    }
    Export(exports)
})();Export({ shaders: {
"curve_pick_vertex":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec4 pos;       // pos.w is 0 at the beginning of the segment and 1 at the end; \n                          // pos.xyz are relative to that end in an normal basis with x pointing along the segment and scaled by radius\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectShininess objectData[0].w\n#define objectAxis objectData[1].xyz\n#define objectEmissive objectData[1].w\n#define objectUp objectData[2].xyz\n#define flags objectData[2].w\n#define objectScale objectData[3].xyz\n#define objectRadius objectData[3].w\n#define objectColor objectData[4].rgb\n\nuniform vec4 segmentData[4];\n#define segmentPosR(i) segmentData[i]\n#define segmentColor(i) segmentData[2+i]\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec4 vcolor;\n\nvec4 start;\nvec4 end;\n\nmat3 getObjectRotation() {\n    // Construct the object rotation matrix.\n    float vmax = max( max( abs(objectAxis.x), abs(objectAxis.y) ), abs(objectAxis.z) );\n    vec3 X = normalize(objectAxis/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nmat3 getSegmentRotation() {\n    // Construct the object rotation matrix.\n    vec3 v = end.xyz - start.xyz;\n    float vmax = max( max( abs(v.x), abs(v.y) ), abs(v.z) );\n    vec3 X = normalize(v/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    vec4 start_color = segmentColor(0);\n    vec4 end_color = segmentColor(1);\n    if (start_color.r < 0.0) start_color.rgb = objectColor;\n    if (end_color.r < 0.0) end_color.rgb = objectColor.rgb;\n    \n    // The following code looks very clumsy, but all other more sensible schemes \n    // failed due to what might be bugs in shader compiling or execution.\n    // Specifically, trying to set start or end inside the if statement fails\n    // if the curve radius is less than about 1e-7 !!??\n    float sw = 0.0;\n    if (segmentPosR(0).w < 0.0) {\n        sw = 1.0;\n    }\n    start = vec4(segmentPosR(0).xyz, sw*objectRadius + (1.0-sw)*segmentPosR(0).w);\n    sw = 0.0;\n    if (segmentPosR(1).w < 0.0) {\n        sw = 1.0;\n    }\n    end = vec4(segmentPosR(1).xyz, sw*objectRadius + (1.0-sw)*segmentPosR(1).w);\n    \n    mat3 rotObject = getObjectRotation();\n    start.xyz = rotObject*(objectScale*start.xyz) + objectPos;\n    end.xyz = rotObject*(objectScale*end.xyz) + objectPos;\n\n    // A rotation matrix with x pointed along the segment\n    mat3 rot = getSegmentRotation();\n\n    // The position and radius of "this" end of the segment in world space\n    vec4 ws_segmentEnd = start * (1.-pos.w) + end * pos.w;\n\n    // The position of this vertex in world space\n    vec3 ws_pos = ws_segmentEnd.xyz + rot * (ws_segmentEnd.w*pos.xyz);\n\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    vcolor = start_color * (1.-pos.w) + end_color * pos.w;\n    gl_Position = projMatrix * pos4;\n}\n',
"curve_render_vertex":'// Vertex shader for rendering curve segments, parameterized by\n// pos1, pos2, radius, color\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec4 pos;       // pos.w is 0 at the beginning of the segment and 1 at the end; \n                          // pos.xyz are relative to that end in a normal basis with x pointing along the segment and scaled by radius\nattribute vec3 normal;\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectShininess objectData[0].w\n#define objectAxis objectData[1].xyz\n#define objectEmissive objectData[1].w\n#define objectUp objectData[2].xyz\n#define flags objectData[2].w\n#define objectScale objectData[3].xyz\n#define objectRadius objectData[3].w\n#define objectColor objectData[4].rgb\n\nuniform vec4 segmentData[4];\n#define segmentPosR(i) segmentData[i]\n#define segmentColor(i) segmentData[2+i]\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump, flipx, flipy, turn\n\nvec4 start;\nvec4 end;\n   \nmat3 getObjectRotation() {\n    // Construct the object rotation matrix.\n    float vmax = max( max( abs(objectAxis.x), abs(objectAxis.y) ), abs(objectAxis.z) );\n    vec3 X = normalize(objectAxis/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nmat3 getSegmentRotation() {\n  // Construct the segment rotation matrix.\n    vec3 v = end.xyz - start.xyz;\n    float vmax = max( max( abs(v.x), abs(v.y) ), abs(v.z) );\n    vec3 X = normalize(v/vmax);\n    vec3 Z = cross(X,normalize(vec3(0,1,0)));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    vec4 start_color = segmentColor(0);\n    vec4 end_color = segmentColor(1);\n    if (start_color.r < 0.0) start_color.rgb = objectColor;\n    if (end_color.r < 0.0) end_color.rgb = objectColor.rgb;\n    \n    // The following code looks very clumsy, but all other more sensible schemes \n    // failed due to what might be bugs in shader compiling or execution.\n    // Specifically, trying to set start.w or end.w inside the if statement fails\n    // if the curve radius is less than about 1e-7. After setting the value\n    // inside the if, it\'s zero upon exit from the if. !!?!\n    float sw = 0.0;\n    if (segmentPosR(0).w < 0.0) { // -1 means use the curve global radius\n        sw = 1.0;\n    }\n    start = vec4(segmentPosR(0).xyz, sw*objectRadius + (1.0-sw)*segmentPosR(0).w);\n    sw = 0.0;\n    if (segmentPosR(1).w < 0.0) {\n        sw = 1.0;\n    }\n    end = vec4(segmentPosR(1).xyz, sw*objectRadius + (1.0-sw)*segmentPosR(1).w);\n    \n    mat3 rotObject = getObjectRotation();\n    start.xyz = rotObject*(objectScale*start.xyz) + objectPos;\n    end.xyz = rotObject*(objectScale*end.xyz) + objectPos;\n\n    // A rotation matrix with x pointed along the segment\n    mat3 rot = getSegmentRotation();\n\n    // The position and radius of "this" end of the segment in world space\n    vec4 ws_segmentEnd = start * (1.-pos.w) + end * pos.w;\n\n    // The position of this vertex in world space\n    vec3 ws_pos = ws_segmentEnd.xyz + rot * (ws_segmentEnd.w*pos.xyz);\n\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    es_position = pos4.xyz;\n    es_normal = (viewMatrix * vec4(rot * normal, 0.0)).xyz;\n    \n    // no texture or bump map yet for curve object:\n    parameters = vec4(objectShininess, objectEmissive, 0.0, 0.0);\n    mat_pos = vec2(0.0, 0.0);\n    bumpX = vec3(1.0, 0.0, 0.0);\n    \n    vcolor = start_color * (1.-pos.w) + end_color * pos.w;\n    gl_Position = projMatrix * pos4;\n}',
"extent_vertex":"// Vertex shader for rendering standard 'objects' parameterized by\n// pos, axis, up, scale, color\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\nattribute vec3 normal;\nattribute vec3 color;\nattribute float opacity;\nattribute vec2 texpos;\nattribute vec3 bumpaxis;\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectShininess objectData[0].w\n#define objectAxis objectData[1].xyz\n#define objectEmissive objectData[1].w\n#define objectUp objectData[2].xyz\n#define flags objectData[2].w\n#define objectScale objectData[3].xyz\n#define objectColor objectData[4].rgba\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\nuniform vec3 center;\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump, flipx, flipy, turn\n\nvec3 encode_float(float k) { // assumes k is >= 0\n    if (k <= 0.0) return vec3(0.0, 0.0, 0.0);\n    float logk = log(k);\n    if (logk < 0.0) {\n        logk = -logk + 128.0;\n    }\n    return vec3(\n        floor(logk)/255.0,\n        floor(256.0*fract(logk))/255.0,\n        floor(256.0*fract(256.0*logk))/255.0);\n}\n\nmat3 getObjectRotation() {\n    // Construct the object rotation matrix.  A waste to do this per vertex, but GPU >> CPU\n    vec3 X = normalize(objectAxis);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    mat3 rot = getObjectRotation();\n    // The position of this vertex in world space\n    vec3 ws_pos = rot*(objectScale*position) + objectPos;\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    es_position = pos4.xyz;\n    es_normal = (viewMatrix * vec4(rot*normal, 0.0)).xyz;\n    vec4 posp = projMatrix * pos4;\n    bumpX = (viewMatrix * vec4(rot*bumpaxis, 0.0)).xyz;\n    mat_pos = texpos;\n    float extent = abs(ws_pos.x-center.x);\n    extent = max(abs(ws_pos.y-center.y), extent);\n    extent = max(abs(ws_pos.z-center.z), extent);\n    mat_color = vec4(encode_float(extent), 1.0);\n    // Setting gl_Position.xy to (-1.0, -1.0) should store into pixel (0, 0), but doesn't work:\n    gl_Position = vec4(-1.0, -1.0, 1e-20*extent, 1.0);\n    //gl_Position = posp;\n    parameters = vec4(objectShininess, objectEmissive, 0.0, 0.0);\n}\n",
"merge_fragment":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform sampler2D C0; // TEXTURE2 - opaque color map (minormode 4)\nuniform sampler2D C1; // TEXTURE4 - color map for transparency render 1 (minormode 6)\nuniform sampler2D C2; // TEXTURE6 - color map for transparency render 2 (minormode 8)\nuniform sampler2D C3; // TEXTURE8 - color map for transparency render 3 (minormode 10)\nuniform sampler2D C4; // TEXTURE10 - color map for transparency render 4 (minormode 12)\nuniform vec2 canvas_size;\n\nvoid main(void) {\n    // need to combine colors from C0, C1, C2, C3, C4\n    vec2 loc = vec2( gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    vec4 c0 = texture2D(C0, loc);\n    vec4 c1 = texture2D(C1, loc);\n    vec4 c2 = texture2D(C2, loc);\n    vec4 c3 = texture2D(C3, loc);\n    vec4 c4 = texture2D(C4, loc);\n    \n    vec3 mcolor = c1.rgb*c1.a + \n                 (1.0-c1.a)*(c2.rgb*c2.a +\n                 (1.0-c2.a)*(c3.rgb*c3.a +\n                 (1.0-c3.a)*(c4.rgb*c4.a + \n                 (1.0-c4.a)*c0.rgb)));\n    gl_FragColor = vec4 (mcolor, 1.0);\n}\n',
"merge_fragment2":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform sampler2D C0; // TEXTURE2 - opaque color map (minormode 4)\nuniform sampler2D C1; // TEXTURE4 - color map for transparency render 1 (minormode 6)\nuniform vec2 canvas_size;\n\nvoid main(void) {\n    // need to combine colors from C0 and C1\n    // This is used with mobile devices that have few texture image units.\n    vec2 loc = vec2( gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    vec4 c0 = texture2D(C0, loc);\n    vec4 c1 = texture2D(C1, loc);    \n    \n    vec3 mcolor = c1.rgb*c1.a + (1.0-c1.a)*c0.rgb;\n    gl_FragColor = vec4 (mcolor, 1.0);\n}\n',
"merge_vertex":"// Vertex shader for rendering standard 'objects' parameterized by\n// pos, axis, up, size, color\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\n\nvoid main(void) {\n    gl_Position = vec4(pos, 1.0);\n}\n",
"opaque_render_fragment":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform int light_count;\nuniform vec4 light_pos[8];\nuniform vec3 light_color[8];\nuniform vec3 light_ambient;\n#define LP(i) light_pos[i]\n#define LC(i) light_color[i]\nuniform vec2 canvas_size;\n\nuniform sampler2D texmap;  // TEXTURE0 - user texture\nuniform sampler2D bumpmap; // TEXTURE1 - user bumpmap\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n#define shininess parameters[0]\n#define emissive parameters[1]\n#define hasTexture parameters[2]\n#define hasBump parameters[3]\n\nvec3 normal;\nvec3 pos;\nvec3 diffuse_color;\nvec3 specular_color;\nvec3 color;\n\nvoid calc_color(vec4 lpos, vec3 lcolor)\n{\n    vec3 L = lpos.xyz - pos*lpos.w; // w == 0 for distant_light\n    L = normalize(L);\n    float N = max(dot(normal,L), 0.0);\n    color += (lcolor * N)*diffuse_color;\n    if (shininess > 0.0) {\n        vec3 R = reflect(L,normal);\n        color += specular_color * LC(0) * pow(max(dot(R,normalize(pos)),0.0),100.0*shininess);\n    }\n}\n\n// Return lit surface color based on the given surface properties and the lights\n//   specified by the light_* uniforms.\nvoid lightAt()\n{    \n    if (hasTexture != 0.0) {\n        diffuse_color = diffuse_color * texture2D(texmap, mat_pos).xyz;\n    }\n    if (hasBump != 0.0) {\n        vec3 Y = cross(normal, bumpX);\n        vec3 Nb = texture2D(bumpmap, mat_pos).xyz;\n        Nb = 2.0*Nb - 1.0;\n        normal = normalize(Nb.x*bumpX + Nb.y*Y + Nb.z*normal);\n    }\n    if (emissive != 0.0) {\n        // From VPython materials.emissive:\n        float d = dot(normalize(-pos), normal);\n        d = pow(d * 1.5, 0.4) * 1.1;\n        if (d > 1.0) d = 1.0;\n        color = diffuse_color * d;\n        return;\n    }\n    \n    color = light_ambient * diffuse_color;\n    \n    // It was necessary to restructure this shader completely in order to\n    // run on the Samsung Galaxy S3 smartphone. Apparently its compiler\n    // does not handle for loops correctly. An Asus Android tablet was ok.\n    if (light_count == 0) return;\n    calc_color(LP(0), LC(0));\n    if (light_count == 1) return;\n    calc_color(LP(1), LC(1));\n    if (light_count == 2) return;\n    calc_color(LP(2), LC(2));\n    if (light_count == 3) return;\n    calc_color(LP(3), LC(3));\n    if (light_count == 4) return;\n    calc_color(LP(4), LC(4));\n    if (light_count == 5) return;\n    calc_color(LP(5), LC(5));\n    if (light_count == 6) return;\n    calc_color(LP(6), LC(6));\n    if (light_count == 7) return;\n    calc_color(LP(7), LC(7));\n}\n\nvoid main(void) {\n    normal = normalize(es_normal);\n    pos = es_position;\n    diffuse_color = vcolor.rgb;\n    specular_color = vec3(.8,.8,.8);\n    lightAt(); // determine color from lighting\n    gl_FragColor = vec4( color, 1.0 );\n}\n',
"peel_color_fragmentC1":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform int light_count;\nuniform vec4 light_pos[8];\nuniform vec3 light_color[8];\nuniform vec3 light_ambient;\n#define LP(i) light_pos[i]\n#define LC(i) light_color[i]\nuniform vec2 canvas_size;\n\nuniform sampler2D texmap;  // TEXTURE0 - user texture\nuniform sampler2D bumpmap; // TEXTURE1 - user bumpmap\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n#define shininess parameters[0]\n#define emissive parameters[1]\n#define hasTexture parameters[2]\n#define hasBump parameters[3]\n\nvec3 normal;\nvec3 pos;\nvec3 diffuse_color;\nvec3 specular_color;\nvec3 color;\n\nvoid calc_color(vec4 lpos, vec3 lcolor)\n{\n    vec3 L = lpos.xyz - pos*lpos.w; // w == 0 for distant_light\n    L = normalize(L);\n    float N = max(dot(normal,L), 0.0);\n    color += (lcolor * N)*diffuse_color;\n    if (shininess > 0.0) {\n        vec3 R = reflect(L,normal);\n        color += specular_color * LC(0) * pow(max(dot(R,normalize(pos)),0.0),100.0*shininess);\n    }\n}\n\n// Return lit surface color based on the given surface properties and the lights\n//   specified by the light_* uniforms.\nvoid lightAt()\n{    \n    if (hasTexture != 0.0) {\n        diffuse_color = diffuse_color * texture2D(texmap, mat_pos).xyz;\n    }\n    if (hasBump != 0.0) {\n        vec3 Y = cross(normal, bumpX);\n        vec3 Nb = texture2D(bumpmap, mat_pos).xyz;\n        Nb = 2.0*Nb - 1.0;\n        normal = normalize(Nb.x*bumpX + Nb.y*Y + Nb.z*normal);\n    }\n    if (emissive != 0.0) {\n        // From VPython materials.emissive:\n        float d = dot(normalize(-pos), normal);\n        d = pow(d * 1.5, 0.4) * 1.1;\n        if (d > 1.0) d = 1.0;\n        color = diffuse_color * d;\n        return;\n    }\n    \n    color = light_ambient * diffuse_color;\n    \n    // It was necessary to restructure this shader completely in order to\n    // run on the Samsung Galaxy S3 smartphone. Apparently its compiler\n    // does not handle for loops correctly. An Asus Android tablet was ok.\n    if (light_count == 0) return;\n    calc_color(LP(0), LC(0));\n    if (light_count == 1) return;\n    calc_color(LP(1), LC(1));\n    if (light_count == 2) return;\n    calc_color(LP(2), LC(2));\n    if (light_count == 3) return;\n    calc_color(LP(3), LC(3));\n    if (light_count == 4) return;\n    calc_color(LP(4), LC(4));\n    if (light_count == 5) return;\n    calc_color(LP(5), LC(5));\n    if (light_count == 6) return;\n    calc_color(LP(6), LC(6));\n    if (light_count == 7) return;\n    calc_color(LP(7), LC(7));\n}\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create transparency color map - C1 (minormode 6), C2 (8), C3 (19), C4 (12)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n\n    normal = normalize(es_normal);\n    pos = es_position;\n    diffuse_color = vcolor.rgb;\n    specular_color = vec3(.8,.8,.8);\n    lightAt(); // determine color from lighting\n\t\n\tif (zmin < z) {\n        gl_FragColor = vec4( color, vcolor.a );\n    } else {\n    \tdiscard;\n    }\n}\n',
"peel_color_fragmentC2":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform int light_count;\nuniform vec4 light_pos[8];\nuniform vec3 light_color[8];\nuniform vec3 light_ambient;\n#define LP(i) light_pos[i]\n#define LC(i) light_color[i]\nuniform vec2 canvas_size;\n\nuniform sampler2D texmap;  // TEXTURE0 - user texture\nuniform sampler2D bumpmap; // TEXTURE1 - user bumpmap\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\nuniform sampler2D D1; // TEXTURE5 - depth map (minormode 7)\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n#define shininess parameters[0]\n#define emissive parameters[1]\n#define hasTexture parameters[2]\n#define hasBump parameters[3]\n\nvec3 normal;\nvec3 pos;\nvec3 diffuse_color;\nvec3 specular_color;\nvec3 color;\n\n\nvoid calc_color(vec4 lpos, vec3 lcolor)\n{\n    vec3 L = lpos.xyz - pos*lpos.w; // w == 0 for distant_light\n    L = normalize(L);\n    float N = max(dot(normal,L), 0.0);\n    color += (lcolor * N)*diffuse_color;\n    if (shininess > 0.0) {\n        vec3 R = reflect(L,normal);\n        color += specular_color * LC(0) * pow(max(dot(R,normalize(pos)),0.0),100.0*shininess);\n    }\n}\n\n// Return lit surface color based on the given surface properties and the lights\n//   specified by the light_* uniforms.\nvoid lightAt()\n{    \n    if (hasTexture != 0.0) {\n        diffuse_color = diffuse_color * texture2D(texmap, mat_pos).xyz;\n    }\n    if (hasBump != 0.0) {\n        vec3 Y = cross(normal, bumpX);\n        vec3 Nb = texture2D(bumpmap, mat_pos).xyz;\n        Nb = 2.0*Nb - 1.0;\n        normal = normalize(Nb.x*bumpX + Nb.y*Y + Nb.z*normal);\n    }\n    if (emissive != 0.0) {\n        // From VPython materials.emissive:\n        float d = dot(normalize(-pos), normal);\n        d = pow(d * 1.5, 0.4) * 1.1;\n        if (d > 1.0) d = 1.0;\n        color = diffuse_color * d;\n        return;\n    }\n    \n    color = light_ambient * diffuse_color;\n    \n    // It was necessary to restructure this shader completely in order to\n    // run on the Samsung Galaxy S3 smartphone. Apparently its compiler\n    // does not handle for loops correctly. An Asus Android tablet was ok.\n    if (light_count == 0) return;\n    calc_color(LP(0), LC(0));\n    if (light_count == 1) return;\n    calc_color(LP(1), LC(1));\n    if (light_count == 2) return;\n    calc_color(LP(2), LC(2));\n    if (light_count == 3) return;\n    calc_color(LP(3), LC(3));\n    if (light_count == 4) return;\n    calc_color(LP(4), LC(4));\n    if (light_count == 5) return;\n    calc_color(LP(5), LC(5));\n    if (light_count == 6) return;\n    calc_color(LP(6), LC(6));\n    if (light_count == 7) return;\n    calc_color(LP(7), LC(7));\n}\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create transparency color map - C1 (minormode 6), C2 (8), C3 (19), C4 (12)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    int zmax = fdecode(texture2D(D1, loc));\n    \n    normal = normalize(es_normal);\n    pos = es_position;\n    diffuse_color = vcolor.rgb;\n    specular_color = vec3(.8,.8,.8);\n    lightAt(); // determine color from lighting\n    \n    if (zmin < z && z < zmax) {\n        gl_FragColor = vec4( color, vcolor.a );\n    } else {\n        discard;\n    }\n}\n',
"peel_color_fragmentC3":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform int light_count;\nuniform vec4 light_pos[8];\nuniform vec3 light_color[8];\nuniform vec3 light_ambient;\n#define LP(i) light_pos[i]\n#define LC(i) light_color[i]\nuniform vec2 canvas_size;\n\nuniform sampler2D texmap;  // TEXTURE0 - user texture\nuniform sampler2D bumpmap; // TEXTURE1 - user bumpmap\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\nuniform sampler2D D2; // TEXTURE7 - depth map (minormode 9)\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n#define shininess parameters[0]\n#define emissive parameters[1]\n#define hasTexture parameters[2]\n#define hasBump parameters[3]\n\nvec3 normal;\nvec3 pos;\nvec3 diffuse_color;\nvec3 specular_color;\nvec3 color;\n\n\nvoid calc_color(vec4 lpos, vec3 lcolor)\n{\n    vec3 L = lpos.xyz - pos*lpos.w; // w == 0 for distant_light\n    L = normalize(L);\n    float N = max(dot(normal,L), 0.0);\n    color += (lcolor * N)*diffuse_color;\n    if (shininess > 0.0) {\n        vec3 R = reflect(L,normal);\n        color += specular_color * LC(0) * pow(max(dot(R,normalize(pos)),0.0),100.0*shininess);\n    }\n}\n\n// Return lit surface color based on the given surface properties and the lights\n//   specified by the light_* uniforms.\nvoid lightAt()\n{    \n    if (hasTexture != 0.0) {\n        diffuse_color = diffuse_color * texture2D(texmap, mat_pos).xyz;\n    }\n    if (hasBump != 0.0) {\n        vec3 Y = cross(normal, bumpX);\n        vec3 Nb = texture2D(bumpmap, mat_pos).xyz;\n        Nb = 2.0*Nb - 1.0;\n        normal = normalize(Nb.x*bumpX + Nb.y*Y + Nb.z*normal);\n    }\n    if (emissive != 0.0) {\n        // From VPython materials.emissive:\n        float d = dot(normalize(-pos), normal);\n        d = pow(d * 1.5, 0.4) * 1.1;\n        if (d > 1.0) d = 1.0;\n        color = diffuse_color * d;\n        return;\n    }\n    \n    color = light_ambient * diffuse_color;\n    \n    // It was necessary to restructure this shader completely in order to\n    // run on the Samsung Galaxy S3 smartphone. Apparently its compiler\n    // does not handle for loops correctly. An Asus Android tablet was ok.\n    if (light_count == 0) return;\n    calc_color(LP(0), LC(0));\n    if (light_count == 1) return;\n    calc_color(LP(1), LC(1));\n    if (light_count == 2) return;\n    calc_color(LP(2), LC(2));\n    if (light_count == 3) return;\n    calc_color(LP(3), LC(3));\n    if (light_count == 4) return;\n    calc_color(LP(4), LC(4));\n    if (light_count == 5) return;\n    calc_color(LP(5), LC(5));\n    if (light_count == 6) return;\n    calc_color(LP(6), LC(6));\n    if (light_count == 7) return;\n    calc_color(LP(7), LC(7));\n}\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create transparency color map - C1 (minormode 6), C2 (8), C3 (19), C4 (12)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    int zmax = fdecode(texture2D(D2, loc));\n    \n    normal = normalize(es_normal);\n    pos = es_position;\n    diffuse_color = vcolor.rgb;\n    specular_color = vec3(.8,.8,.8);\n    lightAt(); // determine color from lighting\n    \n    if (zmin < z && z < zmax) {\n        gl_FragColor = vec4( color, vcolor.a );\n    } else {\n        discard;\n    }\n}\n',
"peel_color_fragmentC4":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nuniform int light_count;\nuniform vec4 light_pos[8];\nuniform vec3 light_color[8];\nuniform vec3 light_ambient;\n#define LP(i) light_pos[i]\n#define LC(i) light_color[i]\nuniform vec2 canvas_size;\n\nuniform sampler2D texmap;  // TEXTURE0 - user texture\nuniform sampler2D bumpmap; // TEXTURE1 - user bumpmap\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\nuniform sampler2D D3; // TEXTURE9 - depth map (minormode 11)\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n#define shininess parameters[0]\n#define emissive parameters[1]\n#define hasTexture parameters[2]\n#define hasBump parameters[3]\n\nvec3 normal;\nvec3 pos;\nvec3 diffuse_color;\nvec3 specular_color;\nvec3 color;\n\nvoid calc_color(vec4 lpos, vec3 lcolor)\n{\n    vec3 L = lpos.xyz - pos*lpos.w; // w == 0 for distant_light\n    L = normalize(L);\n    float N = max(dot(normal,L), 0.0);\n    color += (lcolor * N)*diffuse_color;\n    if (shininess > 0.0) {\n        vec3 R = reflect(L,normal);\n        color += specular_color * LC(0) * pow(max(dot(R,normalize(pos)),0.0),100.0*shininess);\n    }\n}\n\n// Return lit surface color based on the given surface properties and the lights\n//   specified by the light_* uniforms.\nvoid lightAt()\n{    \n    if (hasTexture != 0.0) {\n        diffuse_color = diffuse_color * texture2D(texmap, mat_pos).xyz;\n    }\n    if (hasBump != 0.0) {\n        vec3 Y = cross(normal, bumpX);\n        vec3 Nb = texture2D(bumpmap, mat_pos).xyz;\n        Nb = 2.0*Nb - 1.0;\n        normal = normalize(Nb.x*bumpX + Nb.y*Y + Nb.z*normal);\n    }\n    if (emissive != 0.0) {\n        // From VPython materials.emissive:\n        float d = dot(normalize(-pos), normal);\n        d = pow(d * 1.5, 0.4) * 1.1;\n        if (d > 1.0) d = 1.0;\n        color = diffuse_color * d;\n        return;\n    }\n    \n    color = light_ambient * diffuse_color;\n    \n    // It was necessary to restructure this shader completely in order to\n    // run on the Samsung Galaxy S3 smartphone. Apparently its compiler\n    // does not handle for loops correctly. An Asus Android tablet was ok.\n    if (light_count == 0) return;\n    calc_color(LP(0), LC(0));\n    if (light_count == 1) return;\n    calc_color(LP(1), LC(1));\n    if (light_count == 2) return;\n    calc_color(LP(2), LC(2));\n    if (light_count == 3) return;\n    calc_color(LP(3), LC(3));\n    if (light_count == 4) return;\n    calc_color(LP(4), LC(4));\n    if (light_count == 5) return;\n    calc_color(LP(5), LC(5));\n    if (light_count == 6) return;\n    calc_color(LP(6), LC(6));\n    if (light_count == 7) return;\n    calc_color(LP(7), LC(7));\n}\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create transparency color map - C1 (minormode 6), C2 (8), C3 (19), C4 (12)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    int zmax = fdecode(texture2D(D3, loc));\n    \n    normal = normalize(es_normal);\n    pos = es_position;\n    diffuse_color = vcolor.rgb;\n    specular_color = vec3(.8,.8,.8);\n    lightAt(); // determine color from lighting\n    \n    if (zmin < z && z < zmax) {\n        gl_FragColor = vec4( color, vcolor.a );\n    } else {\n        discard;\n    }\n}\n',
"peel_depth_fragmentD0":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\n// Construct depth maps for depth peeling handling of opacity\n\n// minormode = 0 render, 1 pick, 2 autoscale, 4 C0, 5 D0, 6 C1, 7 D1, 8 C2, 9 D2, 10 C3, 11 D3, 12 C4\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nvoid main(void) {\n    // create depth map D0 (5)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    gl_FragColor = vec4(float(c.r)/255.0, float(c.g)/255.0, 0, 0);\n}',
"peel_depth_fragmentD1":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\n// Construct depth maps for depth peeling handling of opacity\n\nuniform vec2 canvas_size;\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\n\n// minormode = 0 render, 1 pick, 2 autoscale, 4 C0, 5 D0, 6 C1, 7 D1, 8 C2, 9 D2, 10 C3, 11 D3, 12 C4\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create depth map D1 (6)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    if (zmin < z) {\n        gl_FragColor = vec4(float(c.r)/255.0, float(c.g)/255.0, 0, 0);\n    } else {\n        discard;\n    }\n}\n',
"peel_depth_fragmentD2":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\n// Construct depth maps for depth peeling handling of opacity\n\nuniform vec2 canvas_size;\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\nuniform sampler2D D1; // TEXTURE5 - 1st transparency depth map (minormode 7)\n\n// minormode = 0 render, 1 pick, 2 autoscale, 4 C0, 5 D0, 6 C1, 7 D1, 8 C2, 9 D2, 10 C3, 11 D3, 12 C4\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create depth map D2 (7)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    int zmax = fdecode(texture2D(D1, loc));\n    if (zmin < z && z < zmax) {\n    \tgl_FragColor = vec4(float(c.r)/255.0, float(c.g)/255.0, 0, 0);\n    } else {\n        discard;\n    }\n}',
"peel_depth_fragmentD3":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\n// Construct depth maps for depth peeling handling of opacity\n\nuniform vec2 canvas_size;\nuniform sampler2D D0; // TEXTURE3 - opaque depth map (minormode 5)\nuniform sampler2D D2; // TEXTURE7 - 2nd transparency depth map (minormode 9)\n\n// minormode = 0 render, 1 pick, 2 autoscale, 4 C0, 5 D0, 6 C1, 7 D1, 8 C2, 9 D2, 10 C3, 11 D3, 12 C4\n\nivec4 encode(float k) { // assumes k is >= 0\n    if (k <= 0.0) return ivec4(0, 0, 0, 0);\n    k = 3.0*128.0*k;\n    int b1 = int(k);\n    int b2 = int(256.0*fract(k));\n    return ivec4(\n    \tb1,\n    \tb2,\n    \t0,\n    \t0);\n}\n\nint decode(ivec4 d) {\n    return int(256*d[0] + d[1]);\n}\n\nint fdecode(vec4 d) {\n    return int(255.0*(256.0*d[0] + d[1]));\n}\n\nvoid main(void) {\n    // create depth map D3 (8)\n    ivec4 c = encode(1.0 - gl_FragCoord.z);\n    int z = decode(c);\n    vec2 loc = vec2(gl_FragCoord.x/canvas_size.x, gl_FragCoord.y/canvas_size.y);\n    int zmin = fdecode(texture2D(D0, loc));\n    int zmax = fdecode(texture2D(D2, loc));\n    if (zmin < z && z < zmax) {\n        gl_FragColor = vec4(float(c.r)/255.0, float(c.g)/255.0, 0, 0);\n    } else {\n        discard;\n    }\n}',
"peel_depth_vertex":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\nattribute vec3 normal;\nattribute vec3 color;\nattribute float opacity;\nattribute float shininess;\nattribute float emissive;\nattribute vec2 texpos;\nattribute vec3 bumpaxis;\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectShininess objectData[0].w\n#define objectAxis objectData[1].xyz\n#define objectEmissive objectData[1].w\n#define objectUp objectData[2].xyz\n#define flags objectData[2].w\n#define objectScale objectData[3].xyz\n#define objectColor objectData[4].rgba\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\n\nmat3 getObjectRotation() {\n    // Construct the object rotation matrix.\n    float vmax = max( max( abs(objectAxis.x), abs(objectAxis.y) ), abs(objectAxis.z) );\n    vec3 X = normalize(objectAxis/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    mat3 rot = getObjectRotation();\n    // The position of this vertex in world space\n    vec3 ws_pos = rot*(objectScale*pos) + objectPos;\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    es_position = pos4.xyz;\n    es_normal = (viewMatrix * vec4(rot*normal, 0.0)).xyz;\n    vec4 posp = projMatrix * pos4;\n    gl_Position = posp;\n}\n',
"pick_fragment":'#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nvarying vec4 vcolor;\n\nvoid main(void) {\n    gl_FragColor = vcolor;\n}\n',
"pick_vertex":"// Vertex shader for picking standard 'objects' parameterized by\n// pos, axis, up, size, color\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectAxis objectData[1].xyz\n#define objectUp objectData[2].xyz\n#define objectScale objectData[3].xyz\n#define objectColor objectData[4].rgba\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec4 vcolor;\n\nmat3 getObjectRotation() {\n  // Construct the object rotation matrix.\n    float vmax = max( max( abs(objectAxis.x), abs(objectAxis.y) ), abs(objectAxis.z) );\n    vec3 X = normalize(objectAxis/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    mat3 rot = getObjectRotation();\n    // The position of this vertex in world space\n    vec3 ws_pos = rot*(objectScale*pos) + objectPos;\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    vec4 posp = projMatrix * pos4;\n    gl_Position = posp;\n    vcolor = objectColor;\n}\n",
"render_vertex":"#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\nattribute vec3 normal;\nattribute vec3 color;\nattribute float opacity;\nattribute float shininess;\nattribute float emissive;\nattribute vec2 texpos;\nattribute vec3 bumpaxis;\n\nuniform vec4 objectData[5];\n#define objectPos objectData[0].xyz\n#define objectShininess objectData[0].w\n#define objectAxis objectData[1].xyz\n#define objectEmissive objectData[1].w\n#define objectUp objectData[2].xyz\n#define flags objectData[2].w\n#define objectScale objectData[3].xyz\n#define objectColor objectData[4].rgba\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump, flipx, flipy, turn=\n\nmat3 getObjectRotation() {\n    // Construct the object rotation matrix.\n    float vmax = max( max( abs(objectAxis.x), abs(objectAxis.y) ), abs(objectAxis.z) );\n    vec3 X = normalize(objectAxis/vmax);\n    vec3 Z = cross(X,normalize(objectUp));\n    if ( dot(Z,Z) < 1e-10 ) {\n        Z = cross(X, vec3(1,0,0));\n        if (dot(Z,Z) < 1e-10 ) {\n            Z = cross(X, vec3(0,1,0));\n        }\n    }\n    Z = normalize(Z);\n    return mat3( X, normalize(cross(Z,X)), Z );\n}\n\nvoid main(void) {\n    mat3 rot = getObjectRotation();\n    // The position of this vertex in world space\n    vec3 ws_pos = rot*(objectScale*pos) + objectPos;\n    vec4 pos4 = viewMatrix * vec4( ws_pos, 1.0);\n    es_position = pos4.xyz;\n    es_normal = (viewMatrix * vec4(rot*normal, 0.0)).xyz;\n    vec4 posp = projMatrix * pos4;\n    bumpX = (viewMatrix * vec4(rot*bumpaxis, 0.0)).xyz;\n    mat_pos = texpos;\n    vcolor = vec4(color*objectColor.rgb, opacity*objectColor.a);\n    gl_Position = posp;\n    \n    float f = flags; // turn, flipy, flipx, sides, right, left, bumpmap, texture\n    float turn = floor(f/128.0);\n    f -= 128.0*turn;\n    float flipy = floor(f/64.0);\n    f -= 64.0*flipy;\n    float flipx = floor(f/32.0);\n    f -= 32.0*flipx;\n    float sides = floor(f/16.0);\n    f -= 16.0*sides;\n    float right = floor(f/8.0);\n    f -= 8.0*right;\n    float left = floor(f/4.0);\n    f -= 4.0*left;\n    float B = floor(f/2.0);\n    f -= 2.0*B;\n    float T = f;\n    if (T != 0.0) {\n        if (flipx != 0.0) {\n            mat_pos.x = 1.0 - mat_pos.x;\n        }\n        if (flipy != 0.0) {\n            mat_pos.y = 1.0 - mat_pos.y;\n        }\n        if (turn > 0.0 && turn <= 3.0) {\n            if (turn == 1.0) {\n                mat_pos = vec2(mat_pos.y,1.0 - mat_pos.x);\n            } else if (turn == 2.0) {\n                mat_pos = vec2(1.0 - mat_pos.x,1.0 - mat_pos.y);\n            } else {\n                mat_pos = vec2(1.0 - mat_pos.y,mat_pos.x);\n            }\n        }\n        T = 0.0;\n        bool L = (normal.x == -1.0);\n        bool R = (normal.x == 1.0);\n        bool S = !L && !R;\n        if (L && left == 1.0) T = 1.0;\n        if (R && right == 1.0) T = 1.0;\n        if (S && sides == 1.0) T = 1.0;\n        if (T == 0.0) {\n            B = 0.0;\n        } else if (left == 0.0 || right == 0.0 || sides == 0.0) {\n            // don't mix texture and object color if texture doesn't cover entire object\n            vcolor = vec4(1.0, 1.0, 1.0, 1.0);\n        }\n    }\n    float emit = 0.0;\n    if (objectEmissive != 0.0) emit = 1.0;\n    if (emissive != 0.0) emit = 1.0;\n    parameters = vec4(objectShininess * shininess, emit, T, B);\n}\n",
"tri_pick_vertex":'// Vertex shader for picking triangles\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\nattribute vec4 color;\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\n\nvarying vec4 vcolor;\n\nvoid main(void) {\n    vec3 normal = vec3(0.0, 0.0, 1.0);\n    vec4 pos4 = viewMatrix * vec4( pos, 1.0);\n    vec4 posp = projMatrix * pos4;\n    gl_Position = posp;\n    vcolor = color;\n}\n',
"tri_render_vertex":'// Vertex shader for rendering triangles\n\n#ifdef GL_ES\n#  ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#  else\nprecision mediump float;\n#  endif\n#endif\n\nattribute vec3 pos;\nattribute vec3 normal;\nattribute vec3 color;\nattribute float opacity;\nattribute float shininess;\nattribute float emissive;\nattribute vec2 texpos;\nattribute vec3 bumpaxis;\n\nuniform mat4 viewMatrix;\nuniform mat4 projMatrix;\nuniform float T; // 1.0 if there is a texture, else 0.0\nuniform float B; // 1.0 if there is a bumpmap, else 0.0\n\nvarying vec3 es_position;     // eye space surface position\nvarying vec3 es_normal;       // eye space surface normal\nvarying vec2 mat_pos;         // surface material position in [0,1]^2\nvarying vec4 vcolor;\nvarying vec3 bumpX;\nvarying vec4 parameters; // shininess, emissive, hasTexture, hasBump\n\nvoid main(void) {\n    vec4 pos4 = viewMatrix * vec4( pos, 1.0);\n    es_position = pos4.xyz;\n    es_normal = (viewMatrix * vec4(normal, 0.0)).xyz;\n    vec4 posp = projMatrix * pos4;\n    bumpX = (viewMatrix * vec4(bumpaxis, 0.0)).xyz;\n    mat_pos = texpos;\n    vcolor = vec4(color, opacity);\n    gl_Position = posp;\n    parameters = vec4(shininess, emissive, T, B);\n}\n',
}});;var viewport = $('<div>').
  css({position: 'absolute', top: 0, left: 0}).
  appendTo('body');

window.__context = {
  glowscript_container: viewport
};

window.scene = canvas();
scene.width = window.innerWidth;
scene.height = window.innerHeight;

function makeVectorOp(str, f) {
  return function(a, b) {
    if (a instanceof vec) {
      return a[str](b);
    }
    else if (b instanceof vec) {
      return b[str](a);
    }
    else {
      return f(a, b);
    }
  }
}

window.add = makeVectorOp('add', function(a, b) { return a + b });
window.sub = makeVectorOp('sub', function(a, b) { return a - b });
window.mul = makeVectorOp('multiply', function(a, b) { return a * b });
window.div = makeVectorOp('divide', function(a, b) { return a / b });
