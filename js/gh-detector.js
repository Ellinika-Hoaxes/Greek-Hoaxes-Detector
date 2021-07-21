/*!
--- The basis of the code used is from: ---
 * B.S. Detector v0.2.7 (https://archive.is/20170122012534/http://bsdetector.tech/)
 * Copyright 2016 The B.S. Detector Authors (https://archive.ph/20200627200743/https://github.com/selfagency/gh-detector/graphs/contributors)
 * Licensed under LGPL-3.0

--- Adjustments by: ---
  * Andronikos Koutroumpelis, fact-checker at Ellinika Hoaxes (https://ellinikahoaxes.gr)
  * Greek Hoaxes Detector v2 (https://github.com/Ellinika-Hoaxes/Greek-Hoaxes-Detector)
  * Licensed under LGPL-3.0 (https://github.com/Ellinika-Hoaxes/Greek-Hoaxes-Detector/blob/master/LICENSE)
 */

/*global chrome,browser,self,top,console,$,JSON,MutationObserver*/
/*jslint browser: true */


/**
 * If we don't have a chrome object, check for browser and rename.
 */
if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    chrome = browser;
}



/**
 * @description Class constructor with variable initialisation
 *
 * @method BSDetector
 */
function BSDetector() {

    'use strict';

    this.bsId = null;
    this.currentSite = null;
    this.currentUrl = '';
    this.data = [];
    this.dataType = '';
    this.debugActive = false;
    this.expandLinks = null;
    this.expanded = {};
    this.flagState = 0; // 0 initial, 1 open, -1 hidden
    // this.firstLoad = true;
    this.shorts = [];
    this.shortUrls = [];
    this.siteId = '';
    this.warnMessage = '';
    this.articles = '';
    this.articles_fb = '';
    this.mutationObserver = {};
    this.windowUrl = window.location.hostname;
    this.observerRoot = null;
    this.observerFilter = null;
    this.ownHostRegExp = new RegExp(window.location.host);
    this.lfbRegExp = new RegExp(/^https?:\/\/l\.facebook\.com\/l\.php\?u=([^&]+)/);
}



BSDetector.prototype = {

    constructor: BSDetector,


    /**
     * @description Log debug messages, if the debug flag is set
     *
     * @method debug
     * @param {string}
     */
    debug: function () {

        'use strict';

        if (this.debugActive === true) {
            console.debug.apply(null, ['[Greek Hoaxes Detector'].concat(arguments));
        }
    },


    /**
     * @description Asynchronous loading function
     *
     * @method asynch
     * @param {string} thisFunc
     * @param {function} callback
     */
    asynch: function (thisFunc, callback) {

        'use strict';

        setTimeout(function () {
            thisFunc();
            if (typeof callback === 'function') {
                callback();
            }
        }, 10);
    },



    /**
     * @description Check if a string is valid JSON
     *
     * @method isJson
     * @param {string} string
     * @param {boolean}
     */
    isJson: function (string) {

        'use strict';

        try {
            JSON.parse(string);
        } catch (e) {
            console.error('Given string is no valid JSON');
            return false;
        }
        return true;
    },



    /**
     * @description Strip urls down to hostname
     *
     * @method cleanUrl
     * @param {string} url
     * @return {string}
     */
    cleanUrl: function (url) {

        'use strict';

        var
            testLink = '',
            thisUrl = '';

        if (this.siteId === 'facebook') {
            testLink = decodeURIComponent(url).substring(0, 30);

            if (testLink === 'https://l.facebook.com/l.php?u=' || testLink === 'http://l.facebook.com/l.php?u=') {
                thisUrl = decodeURIComponent(url).substring(30).split('&h=', 1);
                url = thisUrl;
            }

        }

        return url2Domain(url);
    },



    /**
     * @description Identify current site
     *
     * @method identifySite
     */
    identifySite: function () {

        'use strict';

        // currentSite looks for the currentUrl (window.location.hostname) in the JSON data file
        this.currentUrl = this.cleanUrl(this.windowUrl);

        if (self === top) {
            switch (this.currentUrl) {
            case 'www.facebook.com':
            case 'www.m.facebook.com':
            case 'm.facebook.com':
            case 'facebook.com':
                this.siteId = 'facebook';
                break;
            case 'twitter.com':
                this.siteId = 'twitter';
                break;
            default:
                this.siteId = 'none';
                // Try to find the site in data
                this.currentSite = this.data[this.currentUrl];
                if (typeof this.currentSite === 'undefined') {
                    // Maybe with 'www.' prefix?
                    this.currentSite = this.data['www.' + this.currentUrl];
                    if (typeof this.currentSite === 'undefined') {
                        // Maybe with regex? (TBD)
                        // For now, consider it not in the list..
                        this.currentSite = null;
                    }
                }
                if (this.currentSite) {
                    this.siteId = 'badlink';
                    this.dataType = this.currentSite.type;
                }
                break;
            }
        }

        this.debug('this.currentUrl: ', this.currentUrl);
        this.debug('this.currentSite: ', this.currentSite);
        this.debug('this.siteId: ', this.siteId);
        this.debug('this.dataType: ', this.dataType);

    },



    /**
     * @description Expand short urls and append to anchor tags
     *
     * @method getLinks
     */
    getLinks: function () {

        'use strict';

        var
            shorts = this.shorts,
            selectors = $('a[href]');

        $(selectors).filter(function (index, a) {
            var matches = shorts.some(function (shortener) {
                return a.hostname.endsWith(shortener);
            });

            return $.uniqueSort(matches);

        }).each(function (index, a) {
            bsd.toExpand.push(a.href);
        });
    },



    /*
     * @description Expanding short urls
     *
     * @method processLinks
     */
    processLinks: function () {

        'use strict';

        if (this.toExpand) {

            this.debug('this.toExpand[]: ', this.toExpand);

            chrome.runtime.sendMessage(null, {
                'operation': 'expandLinks',
                'shortLinks': this.toExpand.toString()
            }, null, function (response) {
                this.debug('Expanded Links: ', response);

                if (this.isJson(response)) {
                    this.expanded = JSON.parse(response);
                    $.each(this.expanded, function (key, value) {
                        $('a[href="' + value.requestedURL + '"]').attr('longurl', value.resolvedURL);
                    });
                } else {
                    this.debug('Could not expand shortened link');
                    this.debug('Response: ' + response);
                }
            });
        }
    },



    /**
     * @description Generate warning message for a given url
     *
     * @method warningMsg
     */
    warningMsg: function () {

        'use strict';

        var classType = '';

        switch (this.dataType) {
        case 'sat':
            classType = 'ΣΑΤΙΡΑ';
            break;
        case 'con':
            classType = 'ΘΕΩΡΙΕΣ ΣΥΝΩΜΟΣΙΑΣ';
            break;
        case 'ps':
            classType = 'ΨΕΥΔΟΕΠΙΣΤΗΜΗ';
            break;
        case 'mis':
            classType = 'ΠΑΡΑΠΛΗΡΟΦΟΡΗΣΗ';
            break;
        case 'cl':
            classType = 'CLICKBAIT';
            break;
        case 'hate':
            classType = 'ΡΗΤΟΡΙΚΗ ΜΙΣΟΥΣ';
            break;
        case 'test':
            classType = 'TEST';
            break;
        default:
            classType = '[Η ΤΑΞΙΝΟΜΗΣΗ ΕΚΚΡΕΜΕΙ]';
            break;
        }

        if (this.dataType === 'caution') {
            this.warnMessage = '⚠️ ΠΡΟΣΟΧΗ: Η ΠΗΓΗ ΜΠΟΡΕΙ ΝΑ ΕΙΝΑΙ ΑΞΙΟΠΙΣΤΗ ΑΛΛΑ ΤΑ ΠΕΡΙΕΧΟΜΕΝΑ ΧΡΕΙΑΖΟΝΤΑΙ ΕΠΙΠΛΕΟΝ ΕΞΑΚΡΙΒΩΣΗ';
        } else {
            this.currentUrl = this.cleanUrl(this.windowUrl);
            this.warnMessage = '⚠️ ΠΡΟΣΟΧΗ: Η ΠΗΓΗ ΕΧΕΙ ΥΠΑΡΞΕΙ ΑΝΑΞΙΟΠΙΣΤΗ (' + classType + ')';
            this.articles = ' | <a target="_blank" href="https://www.ellinikahoaxes.gr/?s=' + this.currentUrl + '">ΠΑΡΑΔΕΙΓΜΑΤΑ ΑΡΘΡΩΝ</a>';
        }

        this.debug('this.warnMessage: ', this.warnMessage);
    },



    /**
     * @description Flag entire site
     *
     * @method flagSite
     */
    flagSite: function () {

        'use strict';

        var navs = $('nav, #nav, #navigation, #navmenu');

        if (this.flagState !== 0) {
            return;
        }

        this.flagState = 1;
        this.warningMsg();

        if ($(navs)) {
            $(navs).first().addClass('gh-alert-shift');
        } else {
            $('body').addClass('gh-alert-shift');
        }

        if (this.dataType === 'caution') {
            $('body').prepend($('<div class="gh-alert gh-caution">'));
        } else {
            $('body').prepend($('<div class="gh-alert">'));
        }

        $('.gh-alert').append($('<div class="gh-alert-close">').text('✕'));
        $('.gh-alert').append($('<span class="gh-alert-span">').text(this.warnMessage));
        $('.gh-alert').append($('<span class="gh-alert-span">').html(this.articles));

        $('.gh-alert-close').on('click', function () {
            $(navs).first().removeClass('gh-alert-shift');
            $('body').removeClass('gh-alert-shift');
            $('.gh-alert').remove();
        });
    },



    /**
     * @description Make flags visible
     *
     * @method showFlag
     */
    showFlag: function () {

        'use strict';

        this.flagState = 1;
        $('.gh-alert').show();
    },



    /**
     * @description Make flags invisible
     *
     * @method hideFlag
     */
    hideFlag: function () {

        'use strict';

        this.flagState = -1;
        $('.gh-alert').hide();
    },



    /**
     * @description Get the hostname of a given element's link
     *
     * @method getHost
     * @param {object} $element
     * @return {string}
     */
    getHost: function ($element) {

        'use strict';

        var thisUrl = '';
        if ($element.attr('data-expanded-url') !== null && $element.attr('data-expanded-url') !== undefined) {
            thisUrl = $element.attr('data-expanded-url');
        } else {
            thisUrl = $element.attr('href');
        }
        if (thisUrl !== null && thisUrl !== undefined) {
            thisUrl = this.cleanUrl(thisUrl);
        }

        return thisUrl;
    },



    /**
     * @description Target links
     *
     * @method targetLinks
     */
    targetLinks: function () {

        'use strict';

        // find and label external links
        $('a[href]:not([href^="#"]), a[data-expanded-url]').each(function () {

            var
                testLink = '',
                thisUrl = '',
                matches = null;

            // exclude links that have the same hostname
            if (!bsd.ownHostRegExp.test(this.href)) {
                $(this).attr('data-external', true);
            }

            // convert facebook urls
            if (bsd.siteId === 'facebook') {

                testLink = decodeURIComponent(this.href);
                if (matches = bsd.lfbRegExp.exec(this.href)) {
                    thisUrl = decodeURIComponent(matches[1]);
                }
                if (thisUrl !== '') {
                    $(this).attr('data-external', true);
                    $(this).attr('data-expanded-url', thisUrl);
                }
            }
        });

        // process external links
        $('a[data-external="true"]').each(function () {
            var urlHost = '';

            if ($(this).attr('data-is-bs') !== 'true') {

                urlHost = bsd.getHost($(this));

                // console.log('urlHost: ' + urlHost);

                // check if link is in list of bad domains
                bsd.bsId = bsd.data[urlHost];

                // if link is in bad domain list, tag it

                // console.log('data: ' + bsd.bsId);

                if (typeof bsd.bsId !== 'undefined') {
                  // console.log('data-is-gh-2');
                  bsd.articles_fb = '<a target="_blank" href="https://www.ellinikahoaxes.gr/?s=' + urlHost + '">ΠΑΡΑΔΕΙΓΜΑΤΑ ΑΡΘΡΩΝ</a>';
                    $(this).attr('data-is-bs', true);
                    $(this).attr('data-gh-type', bsd.bsId.type);
                }
            }
        });
    },



    /**
     * @description Flag links
     *
     * @method flagPost
     * @param {object} $badlinkWrapper
     */
    flagPost: function ($badlinkWrapper) {

        'use strict';

        if (!$badlinkWrapper.hasClass('gh-flag')) {

            if (this.dataType === 'caution') {
                $badlinkWrapper.before($('<div class="gh-alert-inline warning">').text(this.warnMessage));

            } else {

                $badlinkWrapper.before($('<div class="gh-alert-inline">').html(this.warnMessage + ' | ' + this.articles_fb));
                //$badlinkWrapper.append($('<div class="gh-alert-inline">').html(this.articles_fb));

                // $badlinkWrapper.before($('<div class="gh-alert-inline">').html(this.warnMessage));
                // $("div.gh-alert-inline").append($(html(this.articles)));
            }

            $badlinkWrapper.addClass('gh-flag');
        }
    },



    /**
     * @description
     *
     * @method setAlertOnPosts
     * @param {string}
     */
    setAlertOnPosts: function () {

      // console.log('setAlertOnPost');

      'use strict';

      bsd.targetLinks();

        $('a[data-is-bs="true"]').each(function () {

          // console.log('setAlertOnPost2');

            bsd.dataType = $(this).attr('data-gh-type');
            bsd.warningMsg();

            bsd.debug('Current warning link: ', this);
            bsd.debug('bsd.dataType: ', bsd.dataType);

            switch (bsd.siteId) {
            case 'facebook':
                bsd.flagPost($(this).closest('div[role="article"]'));
                break;
            case 'twitter':
                console.log('tw');
                if ($(this).parents('.tweet').length >= 0) {
                    bsd.flagPost($(this).closest('article[role="article"]'));
                }
                break;
            case 'badlink':
            case 'none':
                break;
            default:
                break;
            }
        });

        // this.firstLoad = false;
    },

    /**
     * @description Main run this after a mutation
     *
     * @method observerCallback
     */
    observerCallback: function () {

        'use strict';

        bsd.debug('observerCallback');
        bsd.observerRoot.mutationSummary('disconnect');
        bsd.observerExec();
    },

    /**
     * @description Scan for posts, turn on the observer, and scan again for more changes
     *
     * @method observerExec
     */
    observerExec: function () {

        'use strict';
        // this.setAlertOnPosts();
        bsd.debug('observerExec');
        window.setTimeout(this.observe, 500);
        window.setTimeout(this.setAlertOnPosts, 2000);
    },

    /**
     * @description Turn on the mutation observer
     *
     * @method observe
     */
    observe: function () {

        'use strict';

        bsd.debug('observe', bsd.observerCallback, bsd.observerFilter, bsd.observerRoot);
        bsd.observerRoot.mutationSummary('connect', bsd.observerCallback, bsd.observerFilter);
    },

    /**
     * @description Main execution script
     *
     * @method execute
     */
    execute: function () {

        'use strict';

        // if (this.firstLoad === true) {
            this.identifySite();

            if (this.siteId === 'badlink') {
                this.flagSite();
            }

            // this.firstLoad = false;
        // }

        switch (this.siteId) {
        case 'facebook':
            this.observerRoot = $('body');
            this.observerFilter = [{ element: 'div' }];
            break;
        case 'twitter':
            this.observerRoot = $('div#page-container');
            this.observerFilter = [{ element: 'div' }];
            break;
        case 'badSite':
            break;
        case 'none':
        default:
            this.observerRoot = $('body');
            this.observerFilter = [{ element: 'div' }];
            break;
        }

        this.observerExec();

    }
};

/**
 * @description Grab data from background and execute extension
 * @link https://developer.chrome.com/extensions/runtime#method-sendMessage
 *
 * @method chrome.runtime.sendMessage
 * @param {string} extensionId
 * @param {mixed} message
 * @param {object} options
 * @param {function} responseCallback
 */
if (window === window.top || url2Domain(window.location.hostname) === 'twitter.com') {

    var bsd = new BSDetector();

    /**
     * @description Grab data from background and execute extension
     *
     * @method
     * @param {string}
     */
    chrome.runtime.sendMessage(null, {'operation': 'passData'}, null, function (state) {

        'use strict';

        // If we're ready, start loading data.
        if (state != 'undefined' && state.sites != 'undefined' && state.shorteners != 'undefined') {
            bsd.data = state.sites;
            bsd.shorts = state.shorteners;

            // Data loaded, start execution.
            $(document).ready(function () {
                bsd.expandLinks = bsd.asynch.bind(null, bsd.getLinks, bsd.processLinks);
                bsd.execute();
            });
        }
    });
}



/**
 * @description Listen for messages but only in the top frame
 * @link https://developer.chrome.com/extensions/runtime#event-onMessage
 *
 * @method chrome.runtime.onMessage.addListener
 * @param {function}
 */
if (window.top === window) {
    chrome.runtime.onMessage.addListener(function (message) {

        'use strict';

        switch (message.operation) {
        case 'flagSite':
            bsd.dataType = message.type;
            bsd.flagSite();
            break;
        case 'toggleFlag':
            if (bsd.flagState === 1) {
                bsd.hideFlag();
            } else if (bsd.flagState === -1) {
                bsd.showFlag();
            }
            break;
        }
    });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
