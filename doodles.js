// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


let doodles = {};

doodles.numDdllogResponsesReceived = 0;
doodles.lastDdllogResponse = '';

doodles.onDdllogResponse = null;


/**
 * Enum for classnames.
 * @enum {string}
 * @const
 */
doodles.CLASSES = {
  FADE: 'fade',            // Enables opacity transition on logo and doodle.
  SHOW_LOGO: 'show-logo',  // Marks logo/doodle that should be shown.
};


/**
 * Enum for HTML element ids.
 * @enum {string}
 * @const
 */
doodles.IDS = {
  DOODLE_SHARE_BUTTON: 'ddlsb',
  DOODLE_SHARE_BUTTON_IMG: 'ddlsb-img',
  DOODLE_SHARE_DIALOG: 'ddlsd',
  DOODLE_SHARE_DIALOG_CLOSE_BUTTON: 'ddlsd-close',
  DOODLE_SHARE_DIALOG_COPY_LINK_BUTTON: 'ddlsd-copy',
  DOODLE_SHARE_DIALOG_FACEBOOK_BUTTON: 'ddlsd-fbb',
  DOODLE_SHARE_DIALOG_LINK: 'ddlsd-text',
  DOODLE_SHARE_DIALOG_MAIL_BUTTON: 'ddlsd-emb',
  DOODLE_SHARE_DIALOG_TITLE: 'ddlsd-title',
  DOODLE_SHARE_DIALOG_TWITTER_BUTTON: 'ddlsd-twb',
  LOGO_DEFAULT: 'logo-default',
  LOGO_DOODLE: 'logo-doodle',
  LOGO_DOODLE_IMAGE: 'logo-doodle-image',
  LOGO_DOODLE_IFRAME: 'logo-doodle-iframe',
  LOGO_DOODLE_CONTAINER: 'logo-doodle-container',
  LOGO_DOODLE_BUTTON: 'logo-doodle-button',
  LOGO_DOODLE_NOTIFIER: 'logo-doodle-notifier',
};


/**
 * Counterpart of search_provider_logos::LogoType.
 * @enum {string}
 * @const
 */
doodles.LOGO_TYPE = {
  SIMPLE: 'SIMPLE',
  ANIMATED: 'ANIMATED',
  INTERACTIVE: 'INTERACTIVE',
};


/**
 * Subset of gws.plugins.doodle.SharingLightbox.LogType in
 * googledata/html/templates/gws/head/xjs/plugins/doodle/sharing_lightbox.js.
 * @enum {number}
 * @const
 */
doodles.SHARE_TYPE = {
  FACEBOOK: 2,
  TWITTER: 3,
  EMAIL: 5,
  LINK_COPY: 6,
};


/**
 * The ID of the doodle app for Facebook. Used to share doodles to Facebook.
 * @type {number}
 */
doodles.FACEBOOK_APP_ID = 738026486351791;


/**
 * The different types of events that are logged from the NTP. This enum is
 * used to transfer information from the NTP JavaScript to the renderer and is
 * not used as a UMA enum histogram's logged value.
 * Note: Keep in sync with common/ntp_logging_events.h
 * @enum {number}
 * @const
 */
doodles.LOG_TYPE = {
  // A static Doodle was shown, coming from cache.
  NTP_STATIC_LOGO_SHOWN_FROM_CACHE: 30,
  // A static Doodle was shown, coming from the network.
  NTP_STATIC_LOGO_SHOWN_FRESH: 31,
  // A call-to-action Doodle image was shown, coming from cache.
  NTP_CTA_LOGO_SHOWN_FROM_CACHE: 32,
  // A call-to-action Doodle image was shown, coming from the network.
  NTP_CTA_LOGO_SHOWN_FRESH: 33,

  // A static Doodle was clicked.
  NTP_STATIC_LOGO_CLICKED: 34,
  // A call-to-action Doodle was clicked.
  NTP_CTA_LOGO_CLICKED: 35,
  // An animated Doodle was clicked.
  NTP_ANIMATED_LOGO_CLICKED: 36,
};


/**
 * Handle the resizeDoodle command sent from the fpdoodle page
 * when an interactive doodle is clicked.
 * @param {Object} args, arguments sent to the page via postMessage.
 */
doodles.resizeDoodleHandler = function(args) {
  let width = args.width || null;
  let height = args.height || null;
  let duration = args.duration || '0s';
  let iframe = $(doodles.IDS.LOGO_DOODLE_IFRAME);

  var transitionCallback = function() {
    iframe.removeEventListener('webkitTransitionEnd', transitionCallback);
    iframe.contentWindow.postMessage(
        {cmd: 'resizeComplete'}, 'https://www.google.com');
  };
  iframe.addEventListener('webkitTransitionEnd', transitionCallback, false);

  document.body.style.setProperty('--logo-iframe-resize-duration', duration);
  document.body.style.setProperty('--logo-iframe-height', height);
  document.body.style.setProperty('--logo-iframe-width', width);
};


/*
 * Fetch doodle data and display it if one is present.
 */
doodles.init = function() {
  // Load the Doodle. After the first request completes (getting cached
  // data), issue a second request for fresh Doodle data.
  doodles.loadDoodle(/*v=*/ null, function(ddl) {
    if (ddl === null) {
      // Got no ddl object at all, the feature is probably disabled. Just show
      // the logo.
      doodles.showLogoOrDoodle(/*fromCache=*/ true);
      return;
    }

    // Got a (possibly empty) ddl object. Show logo or doodle.
    doodles.targetDoodle.image = ddl.image || null;
    doodles.targetDoodle.metadata = ddl.metadata || null;
    doodles.showLogoOrDoodle(/*fromCache=*/ true);
    // Never hide an interactive doodle if it was already shown.
    if (ddl.metadata && (ddl.metadata.type === doodles.LOGO_TYPE.INTERACTIVE)) {
      return;
    }
    // If we got a valid ddl object (from cache), load a fresh one.
    if (ddl.v !== null) {
      doodles.loadDoodle(ddl.v, function(ddl2) {
        if (ddl2.usable) {
          doodles.targetDoodle.image = ddl2.image || null;
          doodles.targetDoodle.metadata = ddl2.metadata || null;
          doodles.fadeToLogoOrDoodle();
        }
      });
    }
  });

  // Set up doodle notifier (but it may be invisible).
  var doodleNotifier = $(doodles.IDS.LOGO_DOODLE_NOTIFIER);
  doodleNotifier.title = configData.translatedStrings.clickToViewDoodle;
  doodleNotifier.addEventListener('click', function(e) {
    e.preventDefault();
    var state = window.history.state || {};
    state.notheme = true;
    window.history.replaceState(state, document.title);
    ntpApiHandle.logEvent(doodles.LOG_TYPE.NTP_STATIC_LOGO_SHOWN_FROM_CACHE);
    ntpApiHandle.onthemechange();
    if (e.detail === 0) {  // Activated by keyboard.
      $(doodles.IDS.LOGO_DOODLE_BUTTON).focus();
    }
  });
};


/**
 * Loads the Doodle. On success, the loaded script declares a global variable
 * ddl, which onload() receives as its single argument. On failure, onload() is
 * called with null as the argument. If v is null, then the call requests a
 * cached logo. If non-null, it must be the ddl.v of a previous request for a
 * cached logo, and the corresponding fresh logo is returned.
 * @param {?number} v
 * @param {function(?{v, usable, image, metadata})} onload
 */
doodles.loadDoodle = function(v, onload) {
  var ddlScript = document.createElement('script');
  ddlScript.src = 'chrome-search://local-ntp/doodle.js';
  if (v !== null) {
    ddlScript.src += '?v=' + v;
  }
  ddlScript.onload = function() {
    onload(ddl);
  };
  ddlScript.onerror = function() {
    onload(null);
  };
  document.body.appendChild(ddlScript);
};


/**
 * Handles the response of a doodle impression ping, i.e. stores the
 * appropriate interactionLogUrl or onClickUrlExtraParams.
 *
 * @param {!Object} ddllog Response object from the ddllog ping.
 * @param {!boolean} isAnimated
 */
doodles.handleDdllogResponse = function(ddllog, isAnimated) {
  if (ddllog && ddllog.interaction_log_url) {
    let interactionLogUrl =
        new URL(ddllog.interaction_log_url, configData.googleBaseUrl);
    if (isAnimated) {
      doodles.targetDoodle.animatedInteractionLogUrl = interactionLogUrl;
    } else {
      doodles.targetDoodle.staticInteractionLogUrl = interactionLogUrl;
    }
    doodles.lastDdllogResponse =
        'interaction_log_url ' + ddllog.interaction_log_url;
  } else if (ddllog && ddllog.target_url_params) {
    doodles.targetDoodle.onClickUrlExtraParams =
        new URLSearchParams(ddllog.target_url_params);
    doodles.lastDdllogResponse =
        'target_url_params ' + ddllog.target_url_params;
  } else {
    console.log('Invalid or missing ddllog response:');
    console.log(ddllog);
  }
};


/**
 * Logs a doodle impression at the given logUrl, and handles the response via
 * doodles.handleDdllogResponse.
 *
 * @param {!string} logUrl
 * @param {!boolean} isAnimated
 */
doodles.logDoodleImpression = function(logUrl, isAnimated) {
  doodles.lastDdllogResponse = '';
  fetch(logUrl, {credentials: 'omit'})
      .then(function(response) {
        return response.text();
      })
      .then(function(text) {
        // Remove the optional XSS preamble.
        const preamble = ')]}\'';
        if (text.startsWith(preamble)) {
          text = text.substr(preamble.length);
        }
        try {
          var json = JSON.parse(text);
        } catch (error) {
          console.log('Failed to parse doodle impression response as JSON:');
          console.log(error);
          return;
        }
        doodles.handleDdllogResponse(json.ddllog, isAnimated);
      })
      .catch(function(error) {
        console.log('Error logging doodle impression to "' + logUrl + '":');
        console.log(error);
      })
      .finally(function() {
        ++doodles.numDdllogResponsesReceived;
        if (doodles.onDdllogResponse !== null) {
          doodles.onDdllogResponse();
        }
      });
};


/**
 * TODO(896461): Add more click tracking parameters.
 * Logs a doodle sharing event.
 * Uses the ct param provided in metadata.onClickUrl to track the doodle.
 *
 * @param {string} platform Social media platform the doodle will be shared to.
 */
doodles.logDoodleShare = function(platform) {
  if (doodles.targetDoodle.metadata.onClickUrl) {
    const onClickUrl = new URL(doodles.targetDoodle.metadata.onClickUrl);
    const ct = onClickUrl.searchParams.get('ct');
    if (ct && ct != '') {
      const url = new URL('/gen_204', configData.googleBaseUrl);
      url.searchParams.append('atyp', 'i');
      url.searchParams.append('ct', 'doodle');
      url.searchParams.append('cad', 'sh,' + platform + ',ct:' + ct);
      url.searchParams.append('ntp', 1);
      navigator.sendBeacon(url.toString());
    }
  }
};


/**
 * Returns true if the target doodle is currently visible. If |image| is null,
 * returns true when the default logo is visible; if non-null, checks that it
 * matches the doodle that is currently visible. Here, "visible" means
 * fully-visible or fading in.
 *
 * @returns {boolean}
 */
doodles.isDoodleCurrentlyVisible = function() {
  var haveDoodle = ($(doodles.IDS.LOGO_DOODLE)
                        .classList.contains(doodles.CLASSES.SHOW_LOGO));
  var wantDoodle = (doodles.targetDoodle.metadata !== null) &&
      (doodles.targetDoodle.image !== null ||
       doodles.targetDoodle.metadata.type === doodles.LOGO_TYPE.INTERACTIVE);
  if (!haveDoodle || !wantDoodle) {
    return haveDoodle === wantDoodle;
  }

  // Have a visible doodle and a target doodle. Test that they match.
  if (doodles.targetDoodle.metadata.type === doodles.LOGO_TYPE.INTERACTIVE) {
    var logoDoodleIframe = $(doodles.IDS.LOGO_DOODLE_IFRAME);
    return logoDoodleIframe.classList.contains(doodles.CLASSES.SHOW_LOGO) &&
        (logoDoodleIframe.src === doodles.targetDoodle.metadata.fullPageUrl);
  } else {
    var logoDoodleImage = $(doodles.IDS.LOGO_DOODLE_IMAGE);
    var logoDoodleContainer = $(doodles.IDS.LOGO_DOODLE_CONTAINER);
    return logoDoodleContainer.classList.contains(doodles.CLASSES.SHOW_LOGO) &&
        ((logoDoodleImage.src === doodles.targetDoodle.image) ||
         (logoDoodleImage.src === doodles.targetDoodle.metadata.animatedUrl));
  }
};


/**
 * The image and metadata that should be shown, according to the latest fetch.
 * After a logo fades out, doodles.onDoodleFadeOutComplete fades in a logo
 * according to doodles.targetDoodle.
 */
doodles.targetDoodle = {
  image: null,
  metadata: null,
  // The log URLs and params may be filled with the response from the
  // corresponding impression log URL.
  staticInteractionLogUrl: null,
  animatedInteractionLogUrl: null,
  onClickUrlExtraParams: null,
};


doodles.getDoodleTargetUrl = function() {
  let url = new URL(doodles.targetDoodle.metadata.onClickUrl);
  if (doodles.targetDoodle.onClickUrlExtraParams) {
    for (var param of doodles.targetDoodle.onClickUrlExtraParams) {
      url.searchParams.append(param[0], param[1]);
    }
  }
  return url;
};


doodles.showLogoOrDoodle = function(fromCache) {
  const cachedInteractiveOffline = fromCache &&
      doodles.targetDoodle.metadata !== null &&
      doodles.targetDoodle.metadata.type == doodles.LOGO_TYPE.INTERACTIVE &&
      !window.navigator.onLine;
  if (doodles.targetDoodle.metadata !== null && !cachedInteractiveOffline) {
    doodles.applyDoodleMetadata();
    if (doodles.targetDoodle.metadata.type === doodles.LOGO_TYPE.INTERACTIVE) {
      $(doodles.IDS.LOGO_DOODLE_CONTAINER)
          .classList.remove(doodles.CLASSES.SHOW_LOGO);
      $(doodles.IDS.LOGO_DOODLE_IFRAME)
          .classList.add(doodles.CLASSES.SHOW_LOGO);
    } else {
      $(doodles.IDS.LOGO_DOODLE_IMAGE).src = doodles.targetDoodle.image;
      $(doodles.IDS.LOGO_DOODLE_CONTAINER)
          .classList.add(doodles.CLASSES.SHOW_LOGO);
      $(doodles.IDS.LOGO_DOODLE_IFRAME)
          .classList.remove(doodles.CLASSES.SHOW_LOGO);

      // Log the impression in Chrome metrics.
      var isCta = !!doodles.targetDoodle.metadata.animatedUrl;
      var eventType = isCta ?
          (fromCache ? doodles.LOG_TYPE.NTP_CTA_LOGO_SHOWN_FROM_CACHE :
                       doodles.LOG_TYPE.NTP_CTA_LOGO_SHOWN_FRESH) :
          (fromCache ? doodles.LOG_TYPE.NTP_STATIC_LOGO_SHOWN_FROM_CACHE :
                       doodles.LOG_TYPE.NTP_STATIC_LOGO_SHOWN_FRESH);
      ntpApiHandle.logEvent(eventType);

      // Ping the proper impression logging URL if it exists.
      var logUrl = isCta ? doodles.targetDoodle.metadata.ctaLogUrl :
                           doodles.targetDoodle.metadata.logUrl;
      if (logUrl) {
        doodles.logDoodleImpression(logUrl, /*isAnimated=*/ false);
      }
    }
    $(doodles.IDS.LOGO_DOODLE).classList.add(doodles.CLASSES.SHOW_LOGO);
  } else {
    // No doodle. Just show the default logo.
    $(doodles.IDS.LOGO_DEFAULT).classList.add(doodles.CLASSES.SHOW_LOGO);
  }
};


/**
 * Starts fading out the given element, which should be either the default logo
 * or the doodle.
 *
 * @param {HTMLElement} element
 */
doodles.startFadeOut = function(element) {
  if (!element.classList.contains(doodles.CLASSES.SHOW_LOGO)) {
    return;
  }

  // Compute style now, to ensure that the transition from 1 -> 0 is properly
  // recognized. Otherwise, if a 0 -> 1 -> 0 transition is too fast, the
  // element might stay invisible instead of appearing then fading out.
  window.getComputedStyle(element).opacity;

  element.classList.add(doodles.CLASSES.FADE);
  element.classList.remove(doodles.CLASSES.SHOW_LOGO);
  element.addEventListener('transitionend', doodles.onDoodleFadeOutComplete);
};


/**
 * Integrates a fresh doodle into the page as appropriate. If the correct logo
 * or doodle is already shown, just updates the metadata. Otherwise, initiates
 * a fade from the currently-shown logo/doodle to the new one.
 */
doodles.fadeToLogoOrDoodle = function() {
  // If the image is already visible, there's no need to start a fade-out.
  // However, metadata may have changed, so update the doodle's alt text and
  // href, if applicable.
  if (doodles.isDoodleCurrentlyVisible()) {
    if (doodles.targetDoodle.metadata !== null) {
      doodles.applyDoodleMetadata();
    }
    return;
  }

  // It's not the same doodle. Clear any loging URLs/params we might have.
  doodles.targetDoodle.staticInteractionLogUrl = null;
  doodles.targetDoodle.animatedInteractionLogUrl = null;
  doodles.targetDoodle.onClickUrlExtraParams = null;

  // Start fading out the current logo or doodle.
  // doodles.onDoodleFadeOutComplete will apply the change when the fade-out
  // finishes.
  doodles.startFadeOut($(doodles.IDS.LOGO_DEFAULT));
  doodles.startFadeOut($(doodles.IDS.LOGO_DOODLE));
};


doodles.onDoodleFadeOutComplete = function(e) {
  // Fade-out finished. Start fading in the appropriate logo.
  $(doodles.IDS.LOGO_DOODLE).classList.add(doodles.CLASSES.FADE);
  $(doodles.IDS.LOGO_DEFAULT).classList.add(doodles.CLASSES.FADE);
  doodles.showLogoOrDoodle(/*fromCache=*/ false);

  this.removeEventListener('transitionend', doodles.onDoodleFadeOutComplete);
};


doodles.applyDoodleMetadata = function() {
  var logoDoodleImage = $(doodles.IDS.LOGO_DOODLE_IMAGE);
  var logoDoodleButton = $(doodles.IDS.LOGO_DOODLE_BUTTON);
  var logoDoodleIframe = $(doodles.IDS.LOGO_DOODLE_IFRAME);

  var logoDoodleShareButton = null;
  var logoDoodleShareDialog = null;

  switch (doodles.targetDoodle.metadata.type) {
    case doodles.LOGO_TYPE.SIMPLE:
      logoDoodleImage.title = doodles.targetDoodle.metadata.altText;

      // On click, navigate to the target URL.
      logoDoodleButton.onclick = function() {
        // Log the click in Chrome metrics.
        ntpApiHandle.logEvent(doodles.LOG_TYPE.NTP_STATIC_LOGO_CLICKED);

        // Ping the static interaction_log_url if there is one.
        if (doodles.targetDoodle.staticInteractionLogUrl) {
          navigator.sendBeacon(doodles.targetDoodle.staticInteractionLogUrl);
          doodles.targetDoodle.staticInteractionLogUrl = null;
        }

        window.location = doodles.getDoodleTargetUrl();
      };

      doodles.insertShareButton();
      doodles.updateShareDialog();
      break;

    case doodles.LOGO_TYPE.ANIMATED:
      logoDoodleImage.title = doodles.targetDoodle.metadata.altText;
      // The CTA image is currently shown; on click, show the animated one.
      logoDoodleButton.onclick = function(e) {
        e.preventDefault();

        // Log the click in Chrome metrics.
        ntpApiHandle.logEvent(doodles.LOG_TYPE.NTP_CTA_LOGO_CLICKED);

        // Ping the static interaction_log_url if there is one.
        if (doodles.targetDoodle.staticInteractionLogUrl) {
          navigator.sendBeacon(doodles.targetDoodle.staticInteractionLogUrl);
          doodles.targetDoodle.staticInteractionLogUrl = null;
        }

        // Once the animated image loads, ping the impression log URL.
        if (doodles.targetDoodle.metadata.logUrl) {
          logoDoodleImage.onload = function() {
            doodles.logDoodleImpression(
                doodles.targetDoodle.metadata.logUrl, /*isAnimated=*/ true);
          };
        }
        logoDoodleImage.src = doodles.targetDoodle.metadata.animatedUrl;

        // When the animated image is clicked, navigate to the target URL.
        logoDoodleButton.onclick = function() {
          // Log the click in Chrome metrics.
          ntpApiHandle.logEvent(doodles.LOG_TYPE.NTP_ANIMATED_LOGO_CLICKED);

          // Ping the animated interaction_log_url if there is one.
          if (doodles.targetDoodle.animatedInteractionLogUrl) {
            navigator.sendBeacon(
                doodles.targetDoodle.animatedInteractionLogUrl);
            doodles.targetDoodle.animatedInteractionLogUrl = null;
          }

          window.location = doodles.getDoodleTargetUrl();
        };

        doodles.insertShareButton();
        doodles.updateShareDialog();
      };
      break;

    case doodles.LOGO_TYPE.INTERACTIVE:
      logoDoodleIframe.title = doodles.targetDoodle.metadata.altText;
      logoDoodleIframe.src = doodles.targetDoodle.metadata.fullPageUrl;
      logoDoodleIframe.allow = 'autoplay';
      document.body.style.setProperty(
          '--logo-iframe-width',
          doodles.targetDoodle.metadata.iframeWidthPx + 'px');
      document.body.style.setProperty(
          '--logo-iframe-height',
          doodles.targetDoodle.metadata.iframeHeightPx + 'px');
      document.body.style.setProperty(
          '--logo-iframe-initial-height',
          doodles.targetDoodle.metadata.iframeHeightPx + 'px');
      break;
  }
};

/**
 * Creates a share button for static/animated doodles which opens the share
 * dialog upon click.
 */
doodles.insertShareButton = function() {
  // Terminates early if share button data are missing or incomplete.
  if (!doodles.targetDoodle.metadata ||
      !doodles.targetDoodle.metadata.shareButtonX ||
      !doodles.targetDoodle.metadata.shareButtonY ||
      !doodles.targetDoodle.metadata.shareButtonBg ||
      !doodles.targetDoodle.metadata.shareButtonIcon) {
    return;
  }
  var shareDialog = $(doodles.IDS.DOODLE_SHARE_DIALOG);

  var shareButtonWrapper = document.createElement('button');
  shareButtonWrapper.id = doodles.IDS.DOODLE_SHARE_BUTTON;
  var shareButtonImg = document.createElement('img');
  shareButtonImg.id = doodles.IDS.DOODLE_SHARE_BUTTON_IMG;
  shareButtonWrapper.appendChild(shareButtonImg);
  shareButtonWrapper.title = configData.translatedStrings.shareDoodle;

  shareButtonWrapper.style.left =
      doodles.targetDoodle.metadata.shareButtonX + 'px';
  shareButtonWrapper.style.top =
      doodles.targetDoodle.metadata.shareButtonY + 'px';

  // Alpha-less background color represented as an RGB HEX string.
  // Share button opacity represented as a double between 0 to 1.
  // Final background color is an RGBA HEX string created by combining
  // both.
  var backgroundColor = doodles.targetDoodle.metadata.shareButtonBg;
  if (!!doodles.targetDoodle.metadata.shareButtonOpacity ||
      doodles.targetDoodle.metadata.shareButtonOpacity == 0) {
    var backgroundOpacityHex =
        parseInt(doodles.targetDoodle.metadata.shareButtonOpacity * 255, 10)
            .toString(16);
    backgroundColor += backgroundOpacityHex;
  }

  shareButtonWrapper.style.backgroundColor = backgroundColor;
  shareButtonImg.src =
      'data:image/png;base64,' + doodles.targetDoodle.metadata.shareButtonIcon;
  shareButtonWrapper.onclick = function() {
    shareDialog.showModal();
  };

  var oldButton = $(doodles.IDS.DOODLE_SHARE_BUTTON);
  if (oldButton) {
    oldButton.remove();
  }

  var logoContainer = $(doodles.IDS.LOGO_DOODLE_CONTAINER);
  if (logoContainer) {
    logoContainer.appendChild(shareButtonWrapper);
  }
};

/**
 * Initiates the buttons on the doodle share dialog. Also updates the doodle
 * title and short link.
 */
doodles.updateShareDialog = function() {
  var shareDialog = $(doodles.IDS.DOODLE_SHARE_DIALOG);
  var shareDialogTitle = $(doodles.IDS.DOODLE_SHARE_DIALOG_TITLE);
  var closeButton = $(doodles.IDS.DOODLE_SHARE_DIALOG_CLOSE_BUTTON);
  var facebookButton = $(doodles.IDS.DOODLE_SHARE_DIALOG_FACEBOOK_BUTTON);
  var twitterButton = $(doodles.IDS.DOODLE_SHARE_DIALOG_TWITTER_BUTTON);
  var mailButton = $(doodles.IDS.DOODLE_SHARE_DIALOG_MAIL_BUTTON);
  var copyButton = $(doodles.IDS.DOODLE_SHARE_DIALOG_COPY_LINK_BUTTON);
  var linkText = $(doodles.IDS.DOODLE_SHARE_DIALOG_LINK);

  if (!doodles.targetDoodle.metadata ||
      !doodles.targetDoodle.metadata.shortLink ||
      !doodles.targetDoodle.metadata.altText) {
    return;
  }

  var closeDialog = function() {
    shareDialog.close();
  };

  closeButton.onclick = closeDialog;
  closeButton.title = configData.translatedStrings.shareClose;
  shareDialog.onclick = function(e) {
    if (e.target == shareDialog) {
      closeDialog();
    }
  };

  var title = doodles.targetDoodle.metadata.altText;

  shareDialogTitle.innerHTML = title;
  var shortLink = doodles.targetDoodle.metadata.shortLink;

  facebookButton.onclick = function() {
    var url = 'https://www.facebook.com/dialog/share' +
        '?app_id=' + doodles.FACEBOOK_APP_ID +
        '&href=' + encodeURIComponent(shortLink) +
        '&hashtag=' + encodeURIComponent('#GoogleDoodle');
    window.open(url);
    doodles.logDoodleShare(doodles.SHARE_TYPE.FACEBOOK);
  };
  facebookButton.title = configData.translatedStrings.shareFacebook;

  twitterButton.onclick = function() {
    var url = 'https://twitter.com/intent/tweet' +
        '?text=' + encodeURIComponent(title + '\n' + shortLink);
    window.open(url);
    doodles.logDoodleShare(doodles.SHARE_TYPE.TWITTER);
  };
  twitterButton.title = configData.translatedStrings.shareTwitter;

  mailButton.onclick = function() {
    var url = 'mailto:?subject=' + encodeURIComponent(title) +
        '&body=' + encodeURIComponent(shortLink);
    document.location.href = url;
    doodles.logDoodleShare(doodles.SHARE_TYPE.EMAIL);
  };
  mailButton.title = configData.translatedStrings.shareMail;

  linkText.value = shortLink;
  linkText.onclick = function() {
    linkText.select();
  };
  linkText.setAttribute('readonly', true);
  linkText.title = configData.translatedStrings.shareLink;
  copyButton.onclick = function() {
    linkText.select();
    document.execCommand('copy');
    doodles.logDoodleShare(doodles.SHARE_TYPE.LINK_COPY);
  };
  copyButton.title = configData.translatedStrings.copyLink;
};
