// File chooser for the Drive Studio extension.
//
// Chrome extensions may not load Google's Picker script, so the extension
// opens this page in a small window. The page:
// 1. tells the extension it is ready and receives an access token from it
//    (only from the Drive Studio extension, checked by origin);
// 2. shows the Google Picker, which also grants Drive Studio access to the
//    file or folder the user chooses (the drive.file permission);
// 3. sends back only the ID and name of what was chosen, and closes.
// The token is kept in memory only and never leaves this page.

(function () {
  'use strict';

  var EXTENSION_ORIGIN = 'chrome-extension://jkdkipflekoipmflbpnbihfbenjplnpo';
  var API_KEY = 'AIzaSyD7G9E_Hmfu5uiXH5TB3-979M2IcEKOL3Y'; // restricted to this site and the Picker API
  var APP_ID = '329227063549'; // Google Cloud project number
  var FOLDER = 'application/vnd.google-apps.folder';

  var params = new URLSearchParams(location.hash.slice(1));
  var mode = params.get('mode') === 'folder' ? 'folder' : 'join';
  var portuguese = /^pt/i.test(params.get('lang') || navigator.language || '');
  var preferShared = params.get('shared') === '1';

  var TEXT = portuguese ? {
    loading: 'Abrindo o Google Drive…',
    join: 'Escolha a página da equipe (arquivo .drivestudio.json)',
    folder: 'Escolha a pasta onde salvar a página da equipe',
    sharedDrives: 'Drives compartilhados',
    myDrive: 'Meu Drive',
    sharedWithMe: 'Compartilhados comigo',
    direct: 'Esta janela é aberta pela extensão Drive Studio. Use os botões "Compartilhar" ou "Entrar numa página da equipe" em Minhas páginas.',
    failed: 'Não foi possível abrir o Google Drive. Feche esta janela e tente de novo.',
    done: 'Pronto. Você pode fechar esta janela.',
  } : {
    loading: 'Opening Google Drive…',
    join: 'Choose the team page (.drivestudio.json file)',
    folder: 'Choose the folder to save the team page in',
    sharedDrives: 'Shared drives',
    myDrive: 'My Drive',
    sharedWithMe: 'Shared with me',
    direct: 'This window is opened by the Drive Studio extension. Use “Share” or “Join a team page” in My pages.',
    failed: 'Google Drive could not be opened. Close this window and try again.',
    done: 'Done. You can close this window.',
  };

  document.documentElement.lang = portuguese ? 'pt-BR' : 'en';
  var message = document.getElementById('message');
  message.textContent = TEXT.loading;

  var opener = window.opener;
  function post(data) {
    if (opener) opener.postMessage(data, EXTENSION_ORIGIN);
  }

  if (!opener) {
    message.textContent = TEXT.direct;
    return;
  }

  var started = false;
  // The account connected in Drive Studio. The Picker otherwise uses the
  // browser's first Google session, which may be another account.
  var account = '';
  window.addEventListener('message', function (event) {
    if (event.origin !== EXTENSION_ORIGIN || event.source !== opener) return;
    var data = event.data || {};
    if (data.type !== 'drivestudio:token' || typeof data.accessToken !== 'string' || started) return;
    started = true;
    account = typeof data.account === 'string' ? data.account : '';
    loadPicker(data.accessToken);
  });

  // Ask for the token until the extension answers (it may take a moment).
  var asks = 0;
  var asking = setInterval(function () {
    if (started || asks++ > 20) {
      clearInterval(asking);
      if (!started) message.textContent = TEXT.direct;
      return;
    }
    post({ type: 'drivestudio:ready' });
  }, 500);
  post({ type: 'drivestudio:ready' });

  function fail(error) {
    message.textContent = TEXT.failed;
    post({ type: 'drivestudio:error', error: String(error && error.message || error) });
  }

  function loadPicker(token) {
    var script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onerror = function () { fail('script'); };
    script.onload = function () {
      window.gapi.load('picker', { callback: function () { showPicker(token); }, onerror: function () { fail('picker'); } });
    };
    document.head.appendChild(script);
  }

  function folderView(label) {
    var view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER);
    if (view.setLabel) view.setLabel(label);
    return view;
  }

  // Google: setIncludeFolders must not be combined with setOwnedByMe, so the
  // "Shared with me" view lists files only.
  function fileView(label, folders) {
    var view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(folders !== false)
      .setMimeTypes('application/json');
    if (view.setLabel) view.setLabel(label);
    return view;
  }

  function showPicker(token) {
    try {
      var P = google.picker;
      var views;
      if (mode === 'folder') {
        var myDrive = folderView(TEXT.myDrive).setParent('root');
        var drives = folderView(TEXT.sharedDrives).setEnableDrives(true);
        views = preferShared ? [drives, myDrive] : [myDrive, drives];
      } else {
        var sharedWithMe = fileView(TEXT.sharedWithMe, false).setOwnedByMe(false);
        var sharedDrives = fileView(TEXT.sharedDrives).setEnableDrives(true);
        var mine = fileView(TEXT.myDrive).setParent('root');
        views = preferShared ? [sharedDrives, sharedWithMe, mine] : [sharedWithMe, sharedDrives, mine];
      }
      var builder = new P.PickerBuilder()
        .setAppId(APP_ID)
        .setDeveloperKey(API_KEY)
        .setOAuthToken(token)
        .setLocale(portuguese ? 'pt-BR' : 'en')
        .setTitle(mode === 'folder' ? TEXT.folder : TEXT.join)
        .setSize(Math.min(window.innerWidth - 16, 1051), Math.min(window.innerHeight - 16, 650))
        .setCallback(onPicked);
      views.forEach(function (view) { builder.addView(view); });
      // Undocumented in the reference, but part of Google's Picker: adds
      // authuser to the Picker's address (see useAccount below).
      if (account && typeof builder.setAuthUser === 'function') builder.setAuthUser(account);
      console.info('[Drive Studio] account:', account || '(none)', '· setAuthUser:', typeof builder.setAuthUser);
      useAccount();
      builder.build().setVisible(true);
    } catch (error) {
      fail(error);
    }
  }

  // The Picker has no option to choose the Google account: its frame uses
  // the browser's first signed-in account, and asks to sign in when that
  // isn't the token's account. Google pages accept authuser=<email> to pick
  // one of the signed-in accounts, so it is added to the frame's address
  // as soon as the Picker creates it.
  function useAccount() {
    if (!account) return;
    function fix(frame) {
      var src = frame.getAttribute('src') || '';
      var wanted = 'authuser=' + encodeURIComponent(account);
      if (src.indexOf('https://docs.google.com/picker') !== 0) return;
      if (src.indexOf(wanted) >= 0) {
        if (!frame.dataset.logged) { frame.dataset.logged = '1'; console.info('[Drive Studio] Picker frame already on', account); }
        return;
      }
      // Before any "#…" part, which the Picker uses for its own messages.
      var hash = src.indexOf('#');
      var base = (hash < 0 ? src : src.slice(0, hash)).replace(/([?&])authuser=[^&]*&?/, '$1').replace(/[?&]$/, '');
      var rest = hash < 0 ? '' : src.slice(hash);
      frame.setAttribute('src', base + (base.indexOf('?') < 0 ? '?' : '&') + wanted + rest);
      console.info('[Drive Studio] Picker frame:', frame.getAttribute('src').replace(/(developerKey|oauth_token|token)=[^&#]*/gi, '$1=…'));
    }
    function scan(root) {
      if (root.tagName === 'IFRAME') fix(root);
      if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('iframe'), fix);
    }
    new MutationObserver(function (changes) {
      changes.forEach(function (change) {
        if (change.type === 'attributes') fix(change.target);
        Array.prototype.forEach.call(change.addedNodes, function (node) { if (node.nodeType === 1) scan(node); });
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  function onPicked(data) {
    var P = google.picker;
    var action = data[P.Response.ACTION];
    if (action === P.Action.PICKED) {
      var docs = (data[P.Response.DOCUMENTS] || []).map(function (doc) {
        return { id: doc[P.Document.ID], name: doc[P.Document.NAME], mimeType: doc[P.Document.MIME_TYPE] };
      });
      post({ type: 'drivestudio:picked', docs: docs });
      message.textContent = TEXT.done;
      setTimeout(function () { window.close(); }, 200);
    } else if (action === P.Action.CANCEL) {
      post({ type: 'drivestudio:cancel' });
      message.textContent = TEXT.done;
      setTimeout(function () { window.close(); }, 200);
    }
  }
})();
