/* flowapps.store — le choix du thème (06/11/2026).
   Chargé dans le <head> de chaque page, AVANT l'affichage : le thème est posé tout de
   suite (pas d'éclair blanc ni noir). Le jour est le thème par défaut ; « Auto » suit
   l'appareil. Le choix reste dans le navigateur du visiteur (localStorage), rien d'autre.
   Les couleurs sont dans les feuilles de style : html[data-theme="…"]. */
(function () {
  var CLE = 'flowapps-theme';
  var THEMES = ['jour', 'sable', 'sauge', 'nuit', 'graphite', 'auto'];
  // Pastilles du menu : fond, encre, laiton.
  var PASTILLES = {
    jour: ['#F2EDE3', '#1B1A17', '#A27C44'],
    sable: ['#EDE3D1', '#231C14', '#9A6F35'],
    sauge: ['#E7EBE2', '#18201A', '#8C7440'],
    nuit: ['#141311', '#F1ECE2', '#CDA56A'],
    graphite: ['#18191B', '#ECECEA', '#CDA56A'],
    auto: ['#F2EDE3', '#141311', '#A27C44']
  };
  var MOTS = {
    fr: ['Thème', 'Jour', 'Sable', 'Sauge', 'Nuit', 'Graphite', 'Auto (comme l’appareil)'],
    en: ['Theme', 'Day', 'Sand', 'Sage', 'Night', 'Graphite', 'Auto (match device)'],
    es: ['Tema', 'Día', 'Arena', 'Salvia', 'Noche', 'Grafito', 'Auto (como el dispositivo)'],
    de: ['Design', 'Tag', 'Sand', 'Salbei', 'Nacht', 'Graphit', 'Automatisch (wie das Gerät)'],
    zh: ['主题', '日间', '沙色', '鼠尾草', '夜间', '石墨', '自动（跟随设备）'],
    ja: ['テーマ', 'ライト', 'サンド', 'セージ', 'ナイト', 'グラファイト', '自動（端末に合わせる）'],
    ko: ['테마', '주간', '샌드', '세이지', '야간', '그래파이트', '자동(기기 설정)']
  };
  var doc = document.documentElement;

  function lu() {
    try { var t = localStorage.getItem(CLE); return THEMES.indexOf(t) >= 0 ? t : 'jour'; } catch (e) { return 'jour'; }
  }
  function poser(t) {
    if (t === 'jour') doc.removeAttribute('data-theme'); else doc.setAttribute('data-theme', t);
    // La barre du navigateur (Safari iOS) prend la couleur du fond.
    if (document.body) {
      var fond = getComputedStyle(document.body).backgroundColor;
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', fond);
    }
  }
  poser(lu());

  function construire() {
    var hote = document.querySelector('.barre-dedans') || document.querySelector('.top .wrap');
    if (!hote || document.getElementById('choixTheme')) return;
    var langue = (doc.lang || 'fr').slice(0, 2).toLowerCase();
    var m = MOTS[langue] || MOTS.fr;

    var style = document.createElement('style');
    style.textContent =
      '.choix-theme{position:relative;flex:none;margin-left:8px}' +
      '.top .choix-theme{margin-left:14px}' +
      '.choix-theme>button{display:grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid var(--trait-fort,var(--trait));border-radius:10px;background:transparent;color:var(--encre);cursor:pointer}' +
      '.choix-theme>button:hover{background:var(--trait)}' +
      '.choix-theme>button svg{width:18px;height:18px}' +
      '.choix-theme ul{position:absolute;right:0;top:calc(100% + 8px);z-index:60;min-width:236px;margin:0;padding:6px;list-style:none;border:1px solid var(--trait-fort,var(--trait));border-radius:14px;background:var(--carte,var(--papier));color:var(--encre);box-shadow:0 18px 40px -18px rgba(0,0,0,.45);font:500 14px/1.3 var(--texte,var(--sans))}' +
      '.choix-theme ul[hidden]{display:none}' +
      '.choix-theme li button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;white-space:nowrap;cursor:pointer}' +
      '.choix-theme li button:hover,.choix-theme li button:focus-visible{background:var(--trait);outline:0}' +
      '.choix-theme .pastille{flex:none;width:20px;height:20px;border-radius:50%;box-shadow:0 0 0 1px var(--trait-fort,var(--trait))}' +
      '.choix-theme .coche{margin-left:auto;color:var(--laiton);visibility:hidden}' +
      '.choix-theme [aria-checked="true"] .coche{visibility:visible}' +
      '@media (max-width:760px){.barre-dedans .choix-theme{margin-left:auto}.choix-theme~.ouvrir-menu{margin-left:4px}}';
    document.head.appendChild(style);

    var boite = document.createElement('div');
    boite.className = 'choix-theme';
    boite.id = 'choixTheme';
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.setAttribute('aria-haspopup', 'menu');
    bouton.setAttribute('aria-expanded', 'false');
    bouton.setAttribute('aria-label', m[0]);
    bouton.title = m[0];
    bouton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>';
    var liste = document.createElement('ul');
    liste.setAttribute('role', 'menu');
    liste.setAttribute('aria-label', m[0]);
    liste.hidden = true;
    THEMES.forEach(function (t, i) {
      var p = PASTILLES[t];
      var li = document.createElement('li');
      li.setAttribute('role', 'none');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.dataset.theme = t;
      var fondPastille = t === 'auto'
        ? 'linear-gradient(135deg,' + p[0] + ' 50%,' + p[1] + ' 50%)'
        : 'radial-gradient(circle at 70% 70%,' + p[2] + ' 0 22%,transparent 23%),linear-gradient(135deg,' + p[0] + ' 55%,' + p[1] + ' 55%)';
      b.innerHTML = '<span class="pastille" style="background:' + fondPastille + '"></span><span>' + m[i + 1] + '</span><span class="coche" aria-hidden="true">✓</span>';
      li.appendChild(b);
      liste.appendChild(li);
    });
    boite.appendChild(bouton);
    boite.appendChild(liste);

    var segment = hote.querySelector('.segment');
    if (segment) segment.insertAdjacentElement('afterend', boite); else hote.appendChild(boite);

    function cocher() {
      var actuel = lu();
      liste.querySelectorAll('[role="menuitemradio"]').forEach(function (b) {
        b.setAttribute('aria-checked', b.dataset.theme === actuel ? 'true' : 'false');
      });
    }
    function ouvrir(oui) {
      liste.hidden = !oui;
      bouton.setAttribute('aria-expanded', oui ? 'true' : 'false');
      if (oui) { cocher(); var c = liste.querySelector('[aria-checked="true"]'); if (c) c.focus(); }
    }
    bouton.addEventListener('click', function () { ouvrir(liste.hidden); });
    liste.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme]');
      if (!b) return;
      try { localStorage.setItem(CLE, b.dataset.theme); } catch (err) {}
      poser(b.dataset.theme);
      cocher();
      ouvrir(false);
      bouton.focus();
    });
    liste.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(liste.querySelectorAll('[data-theme]'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !liste.hidden) { ouvrir(false); bouton.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!liste.hidden && !boite.contains(e.target)) ouvrir(false);
    });
    // Mode Auto : suivre l'appareil s'il change pendant la visite.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (lu() === 'auto') poser('auto'); });
    poser(lu());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construire); else construire();
})();
