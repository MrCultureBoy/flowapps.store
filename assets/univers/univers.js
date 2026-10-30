/* flowapps.store — l'accueil (30/10/2026). Aucune bibliothèque.
   Une seule toile derrière la page : chaque app y est une tuile, tenue par un ressort.
   En haut, les tuiles forment le mot FLOW ; plus bas, l'univers qu'on lit se forme en fleur ;
   entre les deux, elles redeviennent une poussière discrète ; au catalogue, elles s'effacent.
   La toile s'arrête quand rien ne bouge, baisse sa finesse si la machine peine, et se fige
   avec le réglage « mouvement réduit » ou le bouton Pause. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const banc = /[?&]banc\b/.test(location.search);
  const calmeSysteme = matchMedia('(prefers-reduced-motion: reduce)');
  let calme = calmeSysteme.matches || /[?&]calme\b/.test(location.search);
  const finPointeur = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (banc) doc.classList.add('banc');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ── Ce qui monte quand on arrive : un décalage par voisin, borné à 5. ── */
  const vus = new IntersectionObserver((entrees) => {
    for (const e of entrees) if (e.isIntersecting) { e.target.classList.add('vu'); vus.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  const parents = new Map();
  for (const el of $$('.revele')) {
    const p = el.parentElement, k = parents.get(p) || 0;
    parents.set(p, k + 1);
    el.style.setProperty('--rang', Math.min(k, 5));
    if (banc || calme) el.classList.add('vu'); else vus.observe(el);
  }
  // Les démonstrations ne tournent que visibles : elles s'arrêtent hors de l'écran.
  const demos = new IntersectionObserver((entrees) => {
    for (const e of entrees) e.target.classList.toggle('joue', e.isIntersecting);
  }, { threshold: 0.2 });
  $$('.case').forEach((c) => demos.observe(c));
  $$('.d-jours i').forEach((i, k) => i.style.setProperty('--i', k));

  /* ── La barre : son trait, l'avancement de la lecture. ── */
  const barre = $('#barre'), avance = $('#avance');
  let attenteDefil = false;
  function surDefil() {
    attenteDefil = false;
    const max = doc.scrollHeight - innerHeight;
    avance.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    barre.classList.toggle('posee', scrollY > 8);
  }
  addEventListener('scroll', () => { if (!attenteDefil) { attenteDefil = true; requestAnimationFrame(surDefil); } reveiller(); }, { passive: true });
  surDefil();

  /* ── Le menu des petits écrans. ── */
  const menu = $('#menu'), bouton = $('#ouvrirMenu');
  function menuOuvert(oui) {
    menu.hidden = !oui; bouton.setAttribute('aria-expanded', oui);
    document.body.style.overflow = oui ? 'hidden' : '';
  }
  bouton.addEventListener('click', () => menuOuvert(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) menuOuvert(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) menuOuvert(false); });

  /* ── Les chiffres se comptent une fois, en 900 ms, courbe de sortie. ── */
  const comptes = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      comptes.unobserve(e.target);
      const el = e.target, fin = +el.dataset.compte, t0 = performance.now();
      if (calme || banc) continue;
      const pas = (t) => {
        const x = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(fin * (1 - Math.pow(1 - x, 4)));
        if (x < 1) requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    }
  }, { threshold: 0.6 });
  $$('[data-compte]').forEach((el) => comptes.observe(el));

  /* ── Les 21 langues des apps, et le français d'où elles partent. ── */
  const bonjours = ['Bonjour', 'Hello', '你好', 'नमस्ते', 'Hola', 'مرحبا', 'নমস্কার', 'Olá', 'Привет', 'ہیلو', 'Halo',
    'Hallo', 'こんにちは', 'नमस्कार', 'హలో', 'Merhaba', 'வணக்கம்', 'Xin chào', '안녕하세요', 'Ciao', 'สวัสดี', 'سلام'];
  const motLangue = $('#motLangue');
  if (motLangue && !calme) {
    let k = 0;
    setInterval(() => {
      if (document.hidden || !motLangue.closest('.case').classList.contains('joue') || doc.classList.contains('calme')) return;
      motLangue.classList.add('sort');
      setTimeout(() => {
        k = (k + 1) % bonjours.length;
        motLangue.textContent = bonjours[k];
        motLangue.classList.remove('sort'); motLangue.classList.add('entre');
        void motLangue.offsetWidth;
        motLangue.classList.remove('entre');
      }, 260);
    }, 1700);
  }

  /* ── Les nouvelles venues penchent vers le pointeur, 4° au plus. ── */
  if (finPointeur && !calme) {
    for (const nv of $$('.nv')) {
      const d = nv.firstElementChild;
      nv.addEventListener('pointermove', (e) => {
        const r = nv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        d.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg'); d.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
        d.style.setProperty('--gx', (x * 60).toFixed(0) + 'px'); d.style.setProperty('--gy', (y * 60).toFixed(0) + 'px');
      });
      nv.addEventListener('pointerleave', () => { for (const p of ['--rx', '--ry', '--gx', '--gy']) d.style.removeProperty(p); });
    }
  }

  /* ── Le catalogue : recherche, puces d'univers, touche « / ». ── */
  const recherche = $('#recherche'), vide = $('#vide'), groupes = $$('.groupe'), puces = $$('.puce');
  const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sansEspaces = /^(zh|ja|ko)/.test(doc.lang);
  let filtre = '';
  function filtrer() {
    const q = sansAccent(recherche.value.trim()).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const g of groupes) {
      let m = 0;
      const dansFiltre = !filtre || g.dataset.id === filtre;
      for (const li of g.querySelectorAll('.cartes > li')) {
        const cle = li.firstElementChild.dataset.nom;
        const ok = dansFiltre && q.every((mot) => sansEspaces ? cle.includes(mot) : cle.includes('-' + mot));
        li.hidden = !ok; if (ok) m++;
      }
      g.hidden = m === 0; n += m;
    }
    vide.hidden = n > 0;
  }
  function choisir(id) {
    filtre = id;
    for (const p of puces) p.classList.toggle('actif', p.dataset.id === id);
    filtrer();
  }
  recherche.addEventListener('input', filtrer);
  puces.forEach((p) => p.addEventListener('click', () => choisir(p.dataset.id)));
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); recherche.focus(); }
  });
  for (const a of $$('.u-lien')) a.addEventListener('click', () => { recherche.value = ''; choisir(''); });

  function allerVers(app) {
    recherche.value = ''; choisir('');
    const g = groupes[app.u];
    const carte = g && [...g.querySelectorAll('.carte')].find((c) => c.querySelector('.carte-nom').firstChild.textContent.trim() === app.n);
    const cible = carte || g;
    if (!cible) return;
    cible.scrollIntoView({ block: 'center', behavior: calme ? 'auto' : 'smooth' });
    if (carte) { carte.classList.remove('eclair'); void carte.offsetWidth; carte.classList.add('eclair'); }
  }

  /* ── La scène. ─────────────────────────────────────────────────────── */
  const toile = $('#scene'), etiquette = $('#etiquette');
  const ctx = toile.getContext && toile.getContext('2d');
  const D = JSON.parse($('#donnees').textContent);
  const placeMot = $('#placeMot'), placeUnivers = $('#placeUnivers'), uNom = $('#uNom');
  const secHaut = $('#haut'), secUnivers = $('#univers'), secApps = $('#apps');
  const COLS = +getComputedStyle(doc).getPropertyValue('--cols') || 16;
  const RANGS = +getComputedStyle(doc).getPropertyValue('--rangs') || 13;
  const N = D.a.length;
  let L = 0, H = 0, dpr = 1, dprMax = Math.min(2, devicePixelRatio || 1);

  const hasard = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const T = D.a.map(([n, x, y, c, u, nv], i) => ({
    n, x, y, c, u, nv, i, img: null, base: null,
    px: hasard(i, 1) * innerWidth, py: hasard(i, 2) * innerHeight, vx: 0, vy: 0, s: 1, a: 0,
    tx: 0, ty: 0, ts: 0, ta: 0, ox: 0, oy: 0,            // la cible, et son ancre (relative à une boîte de la page)
    nx: 0, ny: 0, ns: 0, na: 0, quand: 0,                  // la prochaine cible, qui attend son tour
    k: 110 * (0.82 + 0.36 * hasard(i, 3)), survol: 0,
  }));
  for (const t of T) { t.ox = t.px; t.oy = t.py; }    // avant la première forme, chaque tuile attend où elle est née

  // Les icônes : une petite toile arrondie par app, découpée une fois dans la planche commune.
  const planche = new Image();
  planche.decoding = 'async';
  planche.onload = () => {
    const cw = planche.naturalWidth / COLS, ch = planche.naturalHeight / RANGS, c = 64;
    for (const t of T) {
      if (t.x < 0) continue;
      const o = document.createElement('canvas'); o.width = o.height = c;
      const g = o.getContext('2d');
      g.beginPath(); (g.roundRect ? g.roundRect(0, 0, c, c, 14) : g.rect(0, 0, c, c)); g.clip();
      g.drawImage(planche, t.x * cw, t.y * ch, cw, ch, 0, 0, c, c);
      t.img = o;
    }
    reveiller();
  };
  planche.src = '/assets/univers/icones.jpg';

  /* Les formes. Chacune donne à chaque tuile une place relative à une boîte de la page. */
  let etat = '', actif = 0, formes = {};

  function formeMot(r) {
    // Le mot est échantillonné sur une grille dont le pas est cherché pour tenir ~82 % des apps.
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    const o = document.createElement('canvas'); o.width = Math.ceil(w); o.height = Math.ceil(h);
    const g = o.getContext('2d');
    let taille = h * 0.92;
    g.font = `800 ${taille}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
    taille *= Math.min(1, (w * 0.98) / g.measureText('FLOW').width);
    g.font = `800 ${taille}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FLOW', w / 2, h / 2 + taille * 0.04);
    const px = g.getImageData(0, 0, o.width, o.height).data;
    const cases = (pas) => {
      const l = [];
      for (let y = pas / 2; y < h; y += pas) for (let x = pas / 2; x < w; x += pas)
        if (px[(Math.floor(y) * o.width + Math.floor(x)) * 4 + 3] > 140) l.push([x, y]);
      return l;
    };
    const voulu = Math.round(N * 0.82);
    let bas = 3, haut = 120, l = cases(20), pas = 20;
    for (let k = 0; k < 18; k++) { pas = (bas + haut) / 2; l = cases(pas); if (l.length > voulu) bas = pas; else haut = pas; }
    pas = bas; l = cases(pas);
    l.sort((p, q) => (p[0] + p[1] * 0.35) - (q[0] + q[1] * 0.35));
    const garde = l.length > voulu ? l.filter((_, k) => Math.floor(k * voulu / l.length) !== Math.floor((k + 1) * voulu / l.length)) : l;
    const places = [];
    T.forEach((t, k) => {
      if (k < garde.length) places.push([garde[k][0], garde[k][1], pas * 0.84, 1]);
      else {                                           // le reste fait un halo de poussière autour du mot
        const ang = hasard(k, 4) * Math.PI * 2, rr = 0.56 + hasard(k, 5) * 0.32;
        places.push([w / 2 + Math.cos(ang) * w * rr, h / 2 + Math.sin(ang) * h * rr * 0.9, Math.max(3, pas * 0.32), 0.55]);
      }
    });
    return places;
  }

  function formeUnivers(r, choisi) {
    const w = r.width, h = r.height, cx = w / 2, cy = h * 0.47;
    const membres = T.filter((t) => t.u === choisi), n = membres.length;
    const rayon = Math.min(w, h) * 0.35, pasF = rayon / Math.sqrt(Math.max(1, n));
    const places = new Array(N);
    membres.forEach((t, k) => {                        // la fleur : l'angle d'or, comme les graines d'un tournesol
      const a = k * 2.39996, d = pasF * Math.sqrt(k + 0.6);
      places[t.i] = [cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.min(64, pasF * 1.46), 1];
    });
    const autres = D.u.map((_, k) => k).filter((k) => k !== choisi);
    autres.forEach((u, j) => {                         // les autres univers attendent en petites grappes, sur une ellipse
      const ang = -Math.PI / 2 + (j + 0.5) * (Math.PI * 2 / autres.length);
      const gx = cx + Math.cos(ang) * w * 0.43, gy = cy + Math.sin(ang) * h * 0.41;
      T.filter((t) => t.u === u).forEach((t, k) => {
        const a = k * 2.39996, d = 4.2 * Math.sqrt(k + 0.5);
        places[t.i] = [gx + Math.cos(a) * d, gy + Math.sin(a) * d, 5.5, 0.6];
      });
    });
    return places;
  }

  const formePoussiere = (alpha) => T.map((t) => [hasard(t.i, 6) * L, hasard(t.i, 7) * H, 4 + hasard(t.i, 8) * 3, alpha]);

  function recalculer() {
    formes = {};
    const r1 = placeMot.getBoundingClientRect();
    formes.mot = formeMot(r1);
  }

  function boite(nom) {
    if (nom === 'mot') return placeMot.getBoundingClientRect();
    if (nom === 'univers') return placeUnivers.getBoundingClientRect();
    return { left: 0, top: 0, width: L, height: H };
  }

  function choisirEtat() {
    const vh = H, rH = secHaut.getBoundingClientRect(), rU = secUnivers.getBoundingClientRect(), rA = secApps.getBoundingClientRect();
    const uVisible = placeUnivers.offsetParent !== null && placeUnivers.getBoundingClientRect().height > 0;
    if (rH.bottom > vh * 0.42) return 'mot';
    if (uVisible && rU.top < vh * 0.55 && rU.bottom > vh * 0.6) return 'univers';
    if (rA.top > vh * 0.6) return 'poussiere';
    return 'vide';
  }

  function viser(nom, maintenant) {
    // Chaque tuile part à son tour : une onde qui naît au centre de la forme visée.
    let places;
    if (nom === 'mot') places = formes.mot || (recalculer(), formes.mot);
    else if (nom === 'univers') places = formeUnivers(boite('univers'), actif);
    else places = formePoussiere(nom === 'poussiere' ? (L < 760 ? 0.09 : 0.16) : 0);   // sur un téléphone, la poussière passe sous le texte : plus discrète
    const b = boite(nom), cx = b.width / 2, cy = b.height / 2, diag = Math.hypot(b.width, b.height) / 2 || 1;
    T.forEach((t, k) => {
      const [x, y, s, a] = places[k];
      t.nx = x; t.ny = y; t.ns = s; t.na = a; t.nb = nom;
      const onde = Math.hypot(x - cx, y - cy) / diag;
      t.quand = maintenant + (calme || banc ? 0 : onde * 380 + hasard(k, 9) * 140);
    });
  }

  /* Le pointeur : les tuiles s'écartent, on lit le nom de celle qu'on survole. */
  let mx = -1e4, my = -1e4, survolee = null;
  if (finPointeur) {
    addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; reveiller(); }, { passive: true });
    document.addEventListener('pointerleave', () => { mx = my = -1e4; });
    addEventListener('click', (e) => {
      if (survolee && !e.target.closest('a, button, input, summary, label, .nv, .case, .carte')) allerVers(survolee);
    });
  }

  function trouverSurvol() {
    let meilleure = null;
    if (etat === 'mot' || etat === 'univers') {
      for (const t of T) {
        if (t.a < 0.5 || t.s < 12) continue;
        if (Math.abs(mx - t.px) < t.s / 2 && Math.abs(my - t.py) < t.s / 2) meilleure = t;
      }
    }
    if (meilleure !== survolee) {
      survolee = meilleure;
      document.body.style.cursor = meilleure ? 'pointer' : '';
      if (meilleure) etiquette.textContent = meilleure.n;
      etiquette.classList.toggle('vue', !!meilleure);
    }
    if (survolee) etiquette.style.translate = `${survolee.px}px ${survolee.py - survolee.s / 2}px`;
  }

  /* La boucle. */
  let vivant = false, avant = 0, moyenne = 16, mesures = 0, temps = 0;
  function reveiller() { if (!vivant && ctx) { vivant = true; avant = performance.now(); requestAnimationFrame(image); } }

  function taille() {
    L = innerWidth; H = innerHeight; dpr = Math.min(dprMax, devicePixelRatio || 1);
    toile.width = Math.round(L * dpr); toile.height = Math.round(H * dpr);
    toile.style.width = L + 'px'; toile.style.height = H + 'px';
  }

  function pas(dt, maintenant) {
    const nouvel = choisirEtat();
    if (nouvel !== etat) { etat = nouvel; viser(etat, maintenant); }
    const b = { mot: boite('mot'), univers: etat === 'univers' ? boite('univers') : null };
    let enMouvement = false;
    const amort = 1 - Math.exp(-dt * 9), vague = maintenant / 1000;
    for (const t of T) {
      if (maintenant >= t.quand && t.quand !== Infinity) {   // son tour est venu : la cible change
        t.ox = t.nx; t.oy = t.ny; t.ts = t.ns; t.ta = t.na; t.base = t.nb; t.quand = Infinity;
      }
      const ancre = t.base === 'mot' ? b.mot : t.base === 'univers' ? (b.univers || boite('univers')) : null;
      const respire = calme ? 0 : (t.base === 'poussiere' ? 14 : 1.4);
      t.tx = (ancre ? ancre.left : 0) + t.ox + Math.sin(vague * 0.5 + t.i * 1.7) * respire;
      t.ty = (ancre ? ancre.top : 0) + t.oy + Math.cos(vague * 0.4 + t.i * 2.3) * respire;
      if (calme) { t.px = t.tx; t.py = t.ty; t.s = t.ts; t.a = t.ta; t.vx = t.vy = 0; continue; }
      const c = 2 * 0.8 * Math.sqrt(t.k);                 // un peu moins que l'amortissement critique : ça vit, sans osciller
      let ax = t.k * (t.tx - t.px) - c * t.vx, ay = t.k * (t.ty - t.py) - c * t.vy;
      const dx = t.px - mx, dy = t.py - my, d2 = dx * dx + dy * dy, R = 110;
      if (d2 < R * R && (t.base === 'mot' || t.base === 'univers')) {
        const d = Math.sqrt(d2) || 1, f = 5200 * Math.pow(1 - d / R, 2);
        ax += dx / d * f; ay += dy / d * f;
      }
      t.vx += ax * dt; t.vy += ay * dt; t.px += t.vx * dt; t.py += t.vy * dt;
      t.survol += ((t === survolee ? 1 : 0) - t.survol) * amort;
      t.s += (t.ts - t.s) * amort; t.a += (t.ta - t.a) * amort;
      if (Math.abs(t.vx) + Math.abs(t.vy) > 2 || Math.abs(t.ts - t.s) > 0.05 || Math.abs(t.ta - t.a) > 0.004 || t.quand !== Infinity) enMouvement = true;
    }
    if (etat === 'univers') {
      const u = D.u[actif];
      uNom.textContent = u[1]; placeUnivers.style.setProperty('--uc', u[2]);
    }
    return enMouvement || (etat !== 'vide' && !calme);
  }

  function dessiner() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L, H);
    let derniere = null;
    for (const t of T) {
      if (t.a < 0.01) continue;
      const s = t.s * (1 + t.survol * 0.22);
      if (t.px < -s || t.py < -s || t.px > L + s || t.py > H + s) continue;
      if (t === survolee) { derniere = t; continue; }
      tuile(t, s);
    }
    if (derniere) tuile(derniere, derniere.s * (1 + derniere.survol * 0.22), true);
    ctx.globalAlpha = 1;
  }

  function tuile(t, s, haut) {
    ctx.globalAlpha = Math.min(1, t.a);
    const x = t.px - s / 2, y = t.py - s / 2;
    if (t.img && s >= 9) {
      if (haut) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; }
      ctx.drawImage(t.img, x, y, s, s);
      if (haut) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
    } else {
      ctx.fillStyle = t.c;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, s, s, s * 0.24); else ctx.rect(x, y, s, s);
      ctx.fill();
    }
  }

  function image(maintenant) {
    if (document.hidden) { vivant = false; return; }
    const brut = maintenant - avant, dt = Math.min(1 / 30, Math.max(0, brut / 1000));
    avant = maintenant; temps += dt;
    // La finesse suit la machine : si les images tardent, la toile passe à 1 pixel par point.
    // Un trou de plus de 100 ms (onglet en arrière-plan, défilement de l'OS) ne compte pas.
    if (brut < 100) moyenne += (brut - moyenne) * 0.05; else mesures = 0;
    if (++mesures > 90 && moyenne > 24 && dprMax > 1) { dprMax = 1; taille(); recalculer(); viser(etat, maintenant); }
    const encore = pas(dt, maintenant);
    trouverSurvol();
    dessiner();
    if (encore && !calme) requestAnimationFrame(image); else vivant = false;
  }

  if (ctx) {
    taille();
    recalculer();
    let attente;
    addEventListener('resize', () => {
      clearTimeout(attente);
      attente = setTimeout(() => { taille(); recalculer(); etat = ''; reveiller(); }, 120);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reveiller(); });
    // L'univers lu : celui dont la ligne croise le milieu de l'écran.
    const lignes = $$('.u-ligne');
    const milieu = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        const k = +e.target.dataset.i;
        lignes.forEach((l) => l.classList.toggle('actif', l === e.target));
        if (k !== actif) { actif = k; if (etat === 'univers') viser('univers', performance.now()); reveiller(); }
      }
    }, { rootMargin: '-46% 0px -46% 0px' });
    lignes.forEach((l) => milieu.observe(l));
    if (lignes[0]) lignes[0].classList.add('actif');
    reveiller();
  }

  /* Le bouton Pause : la toile se fige à sa place, les démonstrations s'arrêtent. */
  const pause = $('#pause');
  function appliquerCalme(oui) {
    calme = oui;
    doc.classList.toggle('calme', oui);
    pause.setAttribute('aria-pressed', oui);
    pause.textContent = oui ? pause.dataset.reprendre : pause.dataset.pause;
    etat = ''; reveiller();
  }
  pause.addEventListener('click', () => appliquerCalme(!calme));
  if (calme) appliquerCalme(true);
  calmeSysteme.addEventListener && calmeSysteme.addEventListener('change', (e) => appliquerCalme(e.matches));
  // En mouvement réduit, la boucle s'arrête après une image : le défilement la relance.

  /* La porte d'essai : ?banc coupe les transitions et laisse avancer le temps à la main. */
  if (banc) {
    window.flowBanc = {
      etat: () => ({ etat, actif, univers: D.u[actif] && D.u[actif][1], apps: N, icones: T.filter((t) => t.img).length,
        visibles: T.filter((t) => t.a > 0.3).length, dpr, moyenne: +moyenne.toFixed(1), calme, vivant }),
      avancer: (n = 60) => { let m = performance.now(); for (let k = 0; k < n; k++) { m += 1000 / 60; pas(1 / 60, m); } dessiner(); return window.flowBanc.etat(); },
      tuiles: () => T.map((t) => ({ n: t.n, x: Math.round(t.px), y: Math.round(t.py), s: +t.s.toFixed(1), a: +t.a.toFixed(2) })),
      viser: (x, y) => { mx = x; my = y; trouverSurvol(); return survolee && survolee.n; },
    };
  }
})();
