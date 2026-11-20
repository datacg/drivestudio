// Team page invitations for the Drive Studio extension.
//
// The invitation email sent by Drive Studio links here with the page's file
// and the invited account (?file=…&account=…). This page hands both to the
// extension, which asks the person whether to add the page, connecting the
// invited account if needed. Without the extension, it asks to install it
// first and then continues.
//
// Only the Drive Studio extension accepts these messages, and only from this
// site (externally_connectable). Nothing is stored or sent anywhere else.

(function () {
  'use strict';

  var EXTENSION_ID = 'jkdkipflekoipmflbpnbihfbenjplnpo';
  var INSTALL_URL = 'https://datacg.github.io/drivestudio/';

  var params = new URLSearchParams(location.search);
  var fileId = params.get('file') || '';
  var account = params.get('account') || '';
  var portuguese = /^pt/i.test(navigator.language || '');

  var TEXT = portuguese ? {
    title: 'Convite para uma página da equipe',
    bad: 'Este link de convite está incompleto. Peça a quem compartilhou que envie o convite de novo.',
    opening: 'Abrindo o Drive Studio…',
    done: 'Pronto: o convite foi aberto no Drive Studio, numa nova aba. Você pode fechar esta.',
    failed: 'O Drive Studio não respondeu. Atualize esta página para tentar de novo.',
    needInstall: 'Para ver esta página da equipe, você precisa da extensão Drive Studio (gratuita) no Chrome ou no Edge.',
    steps: ['Instale o Drive Studio.', 'Volte a esta aba e clique em "Já instalei".', 'Entre com a sua conta Google e confirme a inclusão da página.'],
    install: 'Instalar o Drive Studio',
    installed: 'Já instalei',
    notChrome: 'O Drive Studio funciona no Google Chrome e no Microsoft Edge. Abra este link num desses navegadores.',
  } : {
    title: 'Team page invitation',
    bad: 'This invitation link is incomplete. Ask the person who shared it to send the invitation again.',
    opening: 'Opening Drive Studio…',
    done: 'Done: the invitation opened in Drive Studio, in a new tab. You can close this one.',
    failed: 'Drive Studio didn’t answer. Refresh this page to try again.',
    needInstall: 'To see this team page, you need the Drive Studio extension (free) for Chrome or Edge.',
    steps: ['Install Drive Studio.', 'Come back to this tab and click “I installed it”.', 'Sign in with your Google account and confirm adding the page.'],
    install: 'Install Drive Studio',
    installed: 'I installed it',
    notChrome: 'Drive Studio works in Google Chrome and Microsoft Edge. Open this link in one of those browsers.',
  };

  document.documentElement.lang = portuguese ? 'pt-BR' : 'en';
  document.title = 'Drive Studio — ' + TEXT.title;
  var title = document.getElementById('title');
  var message = document.getElementById('message');
  var steps = document.getElementById('steps');
  var actions = document.getElementById('actions');
  title.textContent = TEXT.title;

  function button(label, primary, onclick, href) {
    var el = document.createElement(href ? 'a' : 'button');
    el.textContent = label;
    el.className = (href ? 'button' : '') + (primary ? ' primary' : '');
    if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
    if (onclick) el.addEventListener('click', onclick);
    return el;
  }

  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    message.textContent = TEXT.bad;
    return;
  }

  // chrome.runtime.sendMessage only exists here when an installed extension
  // accepts messages from this site, i.e. when Drive Studio is installed.
  function send(data, callback) {
    var runtime = window.chrome && window.chrome.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function') { callback(null); return; }
    try {
      runtime.sendMessage(EXTENSION_ID, data, function (response) {
        void runtime.lastError; // not installed or disabled
        callback(response || null);
      });
    } catch (error) {
      callback(null);
    }
  }

  function needInstall() {
    var chromium = /Chrome\/|Edg\//.test(navigator.userAgent);
    if (!chromium) { message.textContent = TEXT.notChrome; return; }
    message.textContent = TEXT.needInstall;
    steps.replaceChildren();
    TEXT.steps.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      steps.appendChild(li);
    });
    steps.hidden = false;
    actions.replaceChildren(
      button(TEXT.install, true, null, INSTALL_URL),
      button(TEXT.installed, false, function () { location.reload(); })
    );
  }

  function start() {
    message.textContent = TEXT.opening;
    send({ type: 'drivestudio:hello' }, function (hello) {
      if (!hello || !hello.ok) { needInstall(); return; }
      send({ type: 'drivestudio:invite', fileId: fileId, account: account }, function (response) {
        steps.hidden = true;
        actions.replaceChildren();
        message.textContent = response && response.ok ? TEXT.done : TEXT.failed;
      });
    });
  }

  start();
})();
