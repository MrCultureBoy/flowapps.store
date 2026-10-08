/* FLOW — l'accueil « univers » de flowapps.store : la scène en volume, le
   défilement qui la pilote, le fond coloré, le son. Aucune bibliothèque.

   Le principe : la scène est FIXE derrière le texte. Chaque section de la page
   déclare une pose (data-scene) ; la position du défilement donne deux poses
   voisines et un dosage entre elles, et chaque image rapproche doucement la
   scène de ce mélange. Rien n'est « joué » : tout se déduit de l'endroit où
   l'on est, donc on peut remonter, s'arrêter, repartir. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const racine = document.documentElement;
  // « ?calme » : la porte d'essai du mode sans mouvement (sinon réglé par le système).
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('calme');
  if (calme) racine.classList.add('calme');
  // Porte d'essai (« ?banc ») : une page cachée ne reçoit presque plus d'images,
  // ni transitions, ni guetteur. Le banc coupe donc les transitions, montre
  // tout de suite ce qui devait monter, et avance le temps à la main (flowBanc).
  const banc = location.search.includes('banc');
  if (banc) racine.classList.add('banc');

  const borne = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const mel = (a, b, t) => a + (b - a) * t;
  const lisse = t => t * t * (3 - 2 * t);
  const modulo = (i, n) => ((i % n) + n) % n;
  const hexa = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  // Mêmes règles que `cle_recherche` dans construire.py : sans accent, en minuscules.
  const sansAccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase();
  const sansEspaces = /[\u3040-\u30ff\u3400-\u9fff]/;                    // chinois, japonais : pas d'espace entre les mots
  const ideogrammes = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;     // … et le coréen, pour la recherche

  // La couleur du fond : le pigment ramené à une même clarté, pour que l'ivoire
  // du texte s'y lise toujours (4,5:1 au moins), que l'univers soit Encre ou Céladon.
  const versLineaire = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const versEcran = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  function pourLeFond(c) {
    const l = c.map(versLineaire);
    const clarte = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    const k = Math.min(3.2, 0.07 / Math.max(clarte, 1e-4));
    return l.map(v => versEcran(Math.min(1, v * k)));
  }

  // ── Le texte découpé en mots ──────────────────────────────
  function decouper(el) {
    const texte = el.textContent.trim();
    el.setAttribute('aria-label', texte);
    el.textContent = '';
    morceaux(texte).forEach(([mot, espace], i) => {
      const boite = document.createElement('span');
      boite.className = 'mot';
      boite.setAttribute('aria-hidden', 'true');
      const dedans = document.createElement('span');
      dedans.style.setProperty('--i', i);
      dedans.textContent = mot;
      boite.append(dedans);
      el.append(boite, espace ? ' ' : '');
    });
  }
  // Les mots d'un titre, et s'il faut une espace après chacun. Le chinois et le
  // japonais n'en mettent pas : on demande les mots au navigateur, et la
  // ponctuation reste collée au mot qu'elle ferme (ou qu'elle ouvre).
  function morceaux(texte) {
    if (!sansEspaces.test(texte)) return texte.split(/[ \n\t]+/).map(m => [m, true]);
    const parts = 'Segmenter' in Intl
      ? [...new Intl.Segmenter(document.documentElement.lang, { granularity: 'word' }).segment(texte)]
          .map(p => ({ t: p.segment, mot: p.isWordLike }))
      : [...texte].map(c => ({ t: c, mot: /[\p{L}\p{N}]/u.test(c) }));
    const sortie = [];
    let avant = '';
    parts.forEach(p => {
      if (/^\s+$/.test(p.t)) { if (sortie.length) sortie[sortie.length - 1][1] = true; }
      else if (p.mot) { sortie.push([avant + p.t, false]); avant = ''; }
      else if (/^[「『（《〈“‘(\[]+$/.test(p.t) || !sortie.length) avant += p.t;
      else sortie[sortie.length - 1][0] += p.t;
    });
    if (avant && sortie.length) sortie[sortie.length - 1][0] += avant;
    return sortie.length ? sortie : [[texte, false]];
  }
  // Un mot ne se coupe pas : s'il déborde de sa colonne (« SEGUIMIENTO »,
  // « KONZENTRATION »), c'est tout le titre qui rétrécit pour qu'il y tienne.
  function ajuster(el) {
    el.style.fontSize = '';
    const place = el.clientWidth;
    const large = Math.max(0, ...$$('.mot', el).map(m => m.getBoundingClientRect().width));
    if (place && large > place) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * place / large * 0.98 + 'px';
  }
  $$('.decoupe').forEach(decouper);

  // ── Les univers ───────────────────────────────────────────
  const tuiles = $$('.tuile');
  const N = tuiles.length;
  const F = tuiles.map(el => ({
    el, id: el.dataset.id, nom: el.dataset.nom, texte: el.dataset.texte,
    n: +el.dataset.n, c: hexa(el.dataset.c), fond: pourLeFond(hexa(el.dataset.c)),
  }));
  F.forEach(f => { $('.dos-n', f.el).textContent = f.n; });
  const minis = JSON.parse($('#minis').textContent);

  let choix = 0;      // l'univers choisi (0 … N-1)
  let cible = 0;      // où l'anneau doit arriver (peut dépasser N : il tourne sans fin)
  let pos = 0;        // où il en est

  const nomEl = $('#nomFamille'), gliss = $('#glissiere');
  const pNom = $('#pNom'), pTexte = $('#pTexte'), pN = $('#pN'), pMinis = $('#pMinis');
  gliss.max = N - 1;

  function afficherFamille(premier) {
    const f = F[choix];
    nomEl.textContent = f.nom;
    decouper(nomEl);
    const montrer = () => $$('.mot', nomEl).forEach(m => m.classList.add('vu'));
    if (banc) montrer(); else requestAnimationFrame(() => requestAnimationFrame(montrer));
    gliss.value = choix;
    gliss.setAttribute('aria-valuetext', f.nom);
    pNom.textContent = f.nom;
    decouper(pNom);
    ajuster(nomEl); ajuster(pNom);
    pTexte.textContent = f.texte;
    pN.textContent = f.n;
    pMinis.replaceChildren(...minis[f.id].map(m => {
      const li = document.createElement('li');
      const case_ = document.createElement('span');           // une case de la planche d'icônes
      case_.style.setProperty('--x', m.x);
      case_.style.setProperty('--y', m.y);
      case_.title = m.n;
      li.append(case_);
      return li;
    }));
    if (!premier) tic(choix);
  }

  function choisir(i) {
    const but = modulo(i, N);
    let d = but - modulo(Math.round(cible), N);
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    cible = Math.round(cible) + d;          // par le plus court chemin
    if (but !== choix) { choix = but; afficherFamille(); }
  }

  // ── Les étapes du défilement ──────────────────────────────
  const etapes = $$('[data-scene]').map(el => ({ el, scene: el.dataset.scene, k: +(el.dataset.k || 0), y: 0 }));
  let W = innerWidth, H = innerHeight, T = 200, total = 1, petit = false;

  function mesurer() {
    W = innerWidth; H = innerHeight; petit = W < 760;
    T = parseFloat(getComputedStyle(tuiles[0]).width) || 200;
    etapes.forEach(e => { e.y = e.el.getBoundingClientRect().top + scrollY; });
    $$('.decoupe, #nomFamille').forEach(ajuster);
    etapes.forEach(e => { e.y = e.el.getBoundingClientRect().top + scrollY; });
    total = Math.max(1, racine.scrollHeight - H);
    tailleFond();
  }

  // La pose de la scène à une étape. « f » : la tuile choisie quitte l'anneau.
  function pose(e) {
    const x = petit ? 0 : W * 0.2, y = petit ? -H * 0.17 : 0, g = petit ? 1.12 : 1.72;
    const base = { f: 0, x: 0, y: 0, s: 1, ry: 0, rz: -7, rx: 5, ecart: 1, autres: 1, haut: -H * 0.05, taille: 1, plat: 0, scene: 1, socle: 1 };
    switch (e.scene) {
      case 'gamme': return base;
      case 'retour': return { ...base, ry: 720 };
      case 'profil': return { ...base, f: 1, x, y, s: g, ry: -26, rz: 9, rx: 7, ecart: 2.4, autres: 0, socle: 0 };
      case 'principe': return { ...base, f: 1, x, y, s: g * 0.92, ry: -26 + 180 * (e.k + 1), rz: e.k % 2 ? 8 : -8, ecart: 2.4, autres: 0, socle: 0 };
      case 'argument': return petit
        ? { ...base, ry: 720, rz: 0, rx: 0, ecart: 1.05, haut: -H * 0.27, taille: 0.62, socle: 0 }
        : { ...base, ry: 720, rz: 0, rx: 0, haut: -H * 0.335, taille: Math.min(0.46, W / (N * T * 1.3)), plat: 1, socle: 0 };
      default: return { ...base, ry: 720, rz: 0, rx: 0, ecart: 1.6, autres: 0, haut: -H * 0.5, taille: 0.4, scene: 0, socle: 0 };
    }
  }

  function etat() {
    if (calme) return { a: etapes[0], b: etapes[0], t: 0 };
    const s = scrollY;
    let k = 0;
    while (k < etapes.length - 1 && s >= etapes[k + 1].y) k++;
    const a = etapes[k], b = etapes[Math.min(k + 1, etapes.length - 1)];
    const t = a === b ? 0 : lisse(borne(((s - a.y) / (b.y - a.y) - 0.18) / 0.82));
    return { a, b, t };
  }

  // ── Le fond : une brume colorée, dessinée par la carte graphique ──
  const fond = $('#fond');
  let gl = null, uni = null;
  const ECHELLE = 0.5;                        // la brume est floue : demi-résolution
  function tailleFond() {
    if (!gl) return;
    const l = Math.max(160, Math.round(W * ECHELLE)), h = Math.max(160, Math.round(H * ECHELLE));
    if (fond.width !== l || fond.height !== h) { fond.width = l; fond.height = h; gl.viewport(0, 0, l, h); }
  }
  (function preparerFond() {
    try { gl = fond.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (_) { gl = null; }
    if (!gl) { fond.hidden = true; return; }
    const sommets = `#version 300 es
      in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
    const pixels = `#version 300 es
      precision highp float;
      uniform vec2 r; uniform float t; uniform vec3 c; uniform float f; uniform vec2 m;
      out vec4 o;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), q = fract(p); q = q*q*(3.-2.*q);
        return mix(mix(h(i), h(i+vec2(1,0)), q.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), q.x), q.y); }
      float brume(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a*n(p); p = p*2.02 + 11.3; a *= .5; } return s; }
      void main(){
        vec2 uv = gl_FragCoord.xy / r;
        vec2 p = (gl_FragCoord.xy - .5*r) / r.y;
        float n1 = brume(p*1.3 + vec2(t*.025, -t*.018));
        float n2 = brume(p*2.1 + n1*1.6 + vec2(-t*.02, t*.03));
        float sol = smoothstep(1.02, -.12, uv.y + (n2 - .5)*.42);
        float halo = exp(-2.4 * length((p - vec2(m.x*.05, -.03 + m.y*.03)) * vec2(1., 1.25)));
        vec3 nuit = vec3(.090, .075, .059);
        vec3 vif = c + .015;
        vec3 col = nuit*(1. - .5*f) + vif*sol*(.5 + .7*n1)*f + mix(vif, vec3(1.), .12)*halo*.3*f;
        vec2 v = p*vec2(.72, 1.);
        col *= 1. - .6*dot(v, v);
        col = max(col, nuit*.5);
        col += (h(gl_FragCoord.xy + fract(t)*91.7) - .5)*.03;
        o = vec4(col, 1.);
      }`;
    const compiler = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, compiler(gl.VERTEX_SHADER, sommets));
      gl.attachShader(prog, compiler(gl.FRAGMENT_SHADER, pixels));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const lieu = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(lieu);
      gl.vertexAttribPointer(lieu, 2, gl.FLOAT, false, 0, 0);
      uni = Object.fromEntries(['r', 't', 'c', 'f', 'm'].map(u => [u, gl.getUniformLocation(prog, u)]));
    } catch (erreur) {
      console.warn('FLOW : fond en dégradé simple —', erreur.message);
      gl = null; fond.hidden = true;       // le dégradé CSS de .scene prend le relais
    }
  })();

  // ── Le son : une nappe douce et un tintement par univers, fabriqués ici ──
  const boutonSon = $('#son'), etatSon = $('#sonEtat');
  let audio = null, maitre = null, sonActif = false;
  function allumerSon() {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio = new Ctx();
      maitre = audio.createGain(); maitre.gain.value = 0; maitre.connect(audio.destination);
      const filtre = audio.createBiquadFilter(); filtre.type = 'lowpass'; filtre.frequency.value = 520; filtre.Q.value = 0.6;
      filtre.connect(maitre);
      [110, 164.81, 220.6, 329.63].forEach((hz, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = hz; o.detune.value = (i - 1.5) * 5;
        g.gain.value = [0.5, 0.3, 0.22, 0.1][i];
        o.connect(g); g.connect(filtre); o.start();
      });
      const lent = audio.createOscillator(), ampleur = audio.createGain();
      lent.frequency.value = 0.07; ampleur.gain.value = 180;
      lent.connect(ampleur); ampleur.connect(filtre.frequency); lent.start();
    }
    audio.resume();
    maitre.gain.cancelScheduledValues(audio.currentTime);
    maitre.gain.linearRampToValueAtTime(0.085, audio.currentTime + 1.6);
    return true;
  }
  function tic(i) {
    if (!sonActif || !audio) return;
    const gamme = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];
    const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime;
    o.type = 'sine'; o.frequency.value = gamme[i % gamme.length];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + 0.6);
  }
  boutonSon.addEventListener('click', () => {
    sonActif = !sonActif;
    if (sonActif) sonActif = allumerSon();
    else if (maitre) maitre.gain.linearRampToValueAtTime(0, audio.currentTime + 0.5);
    boutonSon.setAttribute('aria-pressed', sonActif);
    etatSon.textContent = sonActif ? boutonSon.dataset.actif : boutonSon.dataset.coupe;
    if (sonActif) tic(choix);
  });

  // ── Le menu ───────────────────────────────────────────────
  const menu = $('#menu'), ouvrirMenu = $('#ouvrirMenu');
  function basculerMenu(ouvert) {
    if (ouvert) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('ouvert')));
      $('#fermerMenu').focus({ preventScroll: true });
    } else {
      menu.classList.remove('ouvert');
      setTimeout(() => { menu.hidden = true; }, 700);
      ouvrirMenu.focus({ preventScroll: true });
    }
    ouvrirMenu.setAttribute('aria-expanded', ouvert);
    document.body.style.overflow = ouvert ? 'hidden' : '';
  }
  ouvrirMenu.addEventListener('click', () => basculerMenu(true));
  $('#fermerMenu').addEventListener('click', () => basculerMenu(false));
  $$('a', menu).forEach(a => a.addEventListener('click', () => basculerMenu(false)));

  // ── Choisir un univers : flèches, glissière, clavier, glisser ──
  $('#prec').addEventListener('click', () => choisir(choix - 1));
  $('#suiv').addEventListener('click', () => choisir(choix + 1));
  gliss.addEventListener('input', () => choisir(+gliss.value));
  addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !menu.hidden) { basculerMenu(false); return; }
    const origine = ev.target instanceof Element ? ev.target : null;
    if (!menu.hidden || (origine && origine.closest('input, textarea, summary'))) return;
    if (ev.key === 'ArrowLeft') choisir(choix - 1);
    if (ev.key === 'ArrowRight') choisir(choix + 1);
  });

  const gamme = $('.s-gamme');
  let saisie = null;
  gamme.addEventListener('pointerdown', ev => {
    if (!(ev.target instanceof Element) || ev.target.closest('button, input, a, label')) return;
    saisie = { x: ev.clientX, depart: cible, bouge: false };
    gamme.classList.add('saisi');
  });
  addEventListener('pointermove', ev => {
    souris.x = (ev.clientX / W - 0.5) * 2; souris.y = (ev.clientY / H - 0.5) * 2;
    if (!saisie) return;
    const dx = ev.clientX - saisie.x;
    if (Math.abs(dx) > 6) saisie.bouge = true;
    cible = saisie.depart - dx / (T * 1.3);
    const proche = modulo(Math.round(cible), N);
    if (proche !== choix) { choix = proche; afficherFamille(); }
  }, { passive: true });
  function lacher(ev) {
    if (!saisie) return;
    const { bouge } = saisie;
    saisie = null;
    gamme.classList.remove('saisi');
    cible = Math.round(cible);
    if (!bouge && ev && ev.type === 'pointerup') {       // un simple clic sur un côté : l'univers voisin
      const part = ev.clientX / W;
      if (part < 0.36) choisir(choix - 1); else if (part > 0.64) choisir(choix + 1);
    }
  }
  addEventListener('pointerup', lacher);
  addEventListener('pointercancel', lacher);
  let roule = 0;
  gamme.addEventListener('wheel', ev => {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;   // le défilement vertical reste au navigateur
    ev.preventDefault();
    roule += ev.deltaX;
    if (Math.abs(roule) > 70) { choisir(choix + Math.sign(roule)); roule = 0; }
  }, { passive: false });

  // ── Les repères des principes ─────────────────────────────
  const reperes = $$('#reperes button');
  const principes = etapes.filter(e => e.scene === 'principe');
  reperes.forEach(b => b.addEventListener('click', () => {
    const e = principes[+b.dataset.k];
    scrollTo({ top: e.y + H * 0.25, behavior: calme ? 'auto' : 'smooth' });
  }));

  // ── Toute la gamme : familles et recherche ────────────────
  const groupes = $$('.groupe'), puces = $$('.puce'), champ = $('#recherche');
  let filtre = '';
  function filtrer() {
    const mots = sansAccent(champ.value).split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
      .map(m => ideogrammes.test(m) ? m : '-' + m);       // un mot latin se cherche par son début
    let vus = 0;
    groupes.forEach(g => {
      const bonne = !filtre || g.dataset.id === filtre;
      let n = 0;
      $$('.carte', g).forEach(c => {
        const garde = bonne && mots.every(m => c.dataset.nom.includes(m));
        c.parentElement.classList.toggle('cache', !garde);
        if (garde) n++;
      });
      g.classList.toggle('cache', n === 0);
      vus += n;
    });
    $('#vide').hidden = vus > 0;
    puces.forEach(p => p.classList.toggle('actif', p.dataset.id === filtre));
    mesurer();
  }
  puces.forEach(p => p.addEventListener('click', () => {
    filtre = p.dataset.id;
    filtrer();
    const haut = $('#apps').getBoundingClientRect().top + scrollY;
    if (scrollY > haut + 200) scrollTo({ top: haut + 120, behavior: calme ? 'auto' : 'smooth' });
  }));
  champ.addEventListener('input', filtrer);
  $('#pLien').addEventListener('click', () => { filtre = F[choix].id; champ.value = ''; filtrer(); });
  // ── L'invitation à lire dans sa langue ────────────────────
  // Jamais de redirection : on propose, le visiteur décide. Un refus tient
  // le temps de la visite.
  (function inviter() {
    const invite = $('#invite'), ici = document.documentElement.lang.slice(0, 2);
    const liens = $$('.menu-langues a');
    let refuse = false;
    try { refuse = sessionStorage.getItem('flow-langue') === 'non'; } catch (_) { /* stockage fermé */ }
    if (!invite || refuse) return;
    for (const voulue of navigator.languages || [navigator.language || '']) {
      const code = voulue.slice(0, 2).toLowerCase();
      if (code === ici) return;                              // la page est déjà dans une de ses langues
      const lien = liens.find(a => a.dataset.code === code);
      if (!lien) continue;
      invite.href = lien.href;
      invite.lang = lien.lang;
      invite.textContent = lien.dataset.invite;
      const fermer = document.createElement('button');
      fermer.type = 'button';
      fermer.textContent = '×';
      fermer.setAttribute('aria-label', $('#fermerMenu').textContent);
      fermer.addEventListener('click', ev => {
        ev.preventDefault();
        invite.hidden = true;
        try { sessionStorage.setItem('flow-langue', 'non'); } catch (_) { /* stockage fermé */ }
      });
      invite.append(fermer);
      invite.hidden = false;
      // Elle ne suit pas la lecture : passé le premier écran, elle s'efface.
      const loin = () => invite.classList.toggle('loin', scrollY > innerHeight * 0.6);
      addEventListener('scroll', loin, { passive: true });
      loin();
      return;
    }
  })();

  // La lueur qui suit le pointeur sur une carte.
  $('#apps').addEventListener('pointermove', ev => {
    const c = ev.target.closest('.carte');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    c.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }, { passive: true });

  // ── Le chargement ─────────────────────────────────────────
  const chargement = $('#chargement'), pctEl = $('#pct'), motPlein = $('#motPlein');
  let pct = 0, butPct = 6, pret = false, intro = 0;
  const faces = $$('.face');
  let arrivees = 0;
  faces.forEach(img => {
    const fait = () => { arrivees++; butPct = 6 + 94 * arrivees / faces.length; };
    if (img.complete) fait();
    else { img.addEventListener('load', fait, { once: true }); img.addEventListener('error', fait, { once: true }); }
  });
  setTimeout(() => { butPct = 100; }, 7000);            // garde-fou : on n'attend jamais plus
  function ouvrirLaPage() {
    pret = true;
    chargement.classList.add('fini');
    setTimeout(() => chargement.remove(), 1200);
    if (banc) voir.forEach(el => el.classList.add('vu'));
    else voir.forEach(el => guetteur.observe(el));
  }

  // Une section « vue » laisse monter ses mots.
  const voir = $$('main section');
  const guetteur = new IntersectionObserver(entrees => {
    entrees.forEach(en => { if (en.isIntersecting) en.target.classList.add('vu'); });
  }, { rootMargin: '0px 0px -28% 0px' });

  // ── L'image : tout ce qui bouge, une fois par rafraîchissement ──
  const monde = $('#monde'), lettres = $$('#lettres span');
  const souris = { x: 0, y: 0 }, regard = { x: 0, y: 0 };
  const cur = { ...pose(etapes[0]), ecart: 1, autres: 1 };
  const pas = (Math.PI * 2) / N;
  let avant = 0, temps = 0, couleurPosee = '', repereActif = -2;

  function image(ts) {
    const dt = avant ? borne((ts - avant) / 1000, 0, 0.05) : 0.016;   // jamais négatif : l'horloge peut reculer au banc
    avant = ts;
    if (!calme) temps += dt;

    if (!pret) {
      pct = Math.min(butPct, pct + dt * 80);
      pctEl.textContent = Math.round(pct);
      motPlein.style.setProperty('--pct', pct.toFixed(1));
      if (pct >= 100 || calme) ouvrirLaPage();
    } else if (intro < 1) {
      intro = calme ? 1 : Math.min(1, intro + dt / 1.7);
    }

    const { a, b, t } = etat();
    const pa = pose(a), pb = pose(b);
    const suivi = calme ? 1 : 1 - Math.exp(-dt * 7);
    for (const cle in cur) cur[cle] = mel(cur[cle], mel(pa[cle], pb[cle], t), suivi);
    pos = mel(pos, cible, calme ? 1 : 1 - Math.exp(-dt * 6.5));
    regard.x = mel(regard.x, calme ? 0 : souris.x, 0.06);
    regard.y = mel(regard.y, calme ? 0 : souris.y, 0.06);

    // La couleur de l'univers, mêlée à sa voisine pendant que l'anneau tourne.
    const bas = Math.floor(pos), part = pos - bas;
    const f0 = F[modulo(bas, N)], f1 = F[modulo(bas + 1, N)];
    const c = [0, 1, 2].map(i => mel(f0.c[i], f1.c[i], part));
    const brume = [0, 1, 2].map(i => mel(f0.fond[i], f1.fond[i], part));
    const couleur = `rgb(${c.map(v => Math.round(v * 255)).join(' ')})`;
    if (couleur !== couleurPosee) { couleurPosee = couleur; racine.style.setProperty('--c', couleur); }

    const p = borne(scrollY / total);
    racine.style.setProperty('--p', p.toFixed(4));
    racine.style.setProperty('--scene', cur.scene.toFixed(3));
    const entree = lisse(intro);
    racine.style.setProperty('--socle', (cur.socle * entree).toFixed(3));
    const lettre = Math.min(3, Math.floor(p * 4));
    lettres.forEach((l, i) => l.classList.toggle('actif', i === lettre));

    // Les repères ne se montrent que pendant les principes.
    let k = -1;
    if (a.scene === 'principe' && (t < 0.5 || b.scene === 'principe')) k = t < 0.5 ? a.k : b.k;
    else if (b.scene === 'principe' && t >= 0.5) k = b.k;
    if (k !== repereActif) {
      repereActif = k;
      document.body.classList.toggle('principes-actifs', k >= 0);
      reperes.forEach((r, i) => r.classList.toggle('actif', i === k));
    }

    if (cur.scene < 0.01) return;             // la scène est cachée : rien à dessiner

    // Les tuiles.
    const R = (T * (petit ? 1.12 : 1.7)) / pas;
    const tour = cur.ry - 360 * Math.round(cur.ry / 360);     // 720° et 0° sont la même pose
    monde.style.transform = `rotateY(${(regard.x * 2.4).toFixed(2)}deg) rotateX(${(-regard.y * 1.6).toFixed(2)}deg)`;
    for (let i = 0; i < N; i++) {
      let d = i - pos;
      d -= N * Math.round(d / N);                              // l'écart à la tuile du centre, de -N/2 à N/2
      const angle = d * pas;
      const bosse = Math.max(0, 1 - Math.abs(d));              // 1 au centre, 0 dès la voisine
      const w = cur.f * lisse(bosse);                          // la part de « pose choisie »
      const rayon = R * cur.ecart * mel(2.6, 1, entree);
      const flotte = Math.sin(temps * 0.8 + i * 1.7) * T * 0.035;

      let x = mel(Math.sin(angle) * rayon, d * T * cur.taille * 1.18, cur.plat);
      let z = mel((Math.cos(angle) - 1) * rayon * 0.9, 0, cur.plat);
      let y = cur.haut + flotte + (1 - Math.cos(angle)) * T * 0.1 * (1 - cur.plat);
      let ry = mel(angle * (180 / Math.PI) * 0.62, 0, cur.plat);
      let rz = mel(-7 + Math.sin(angle) * 14 + Math.sin(temps * 0.5 + i) * 2, 0, cur.plat);
      let rx = mel(5, 0, cur.plat);
      let s = cur.taille * mel(0.86, 1, bosse);

      x = mel(x, cur.x, w);
      y = mel(y, cur.y + Math.sin(temps * 0.8) * T * 0.03, w);
      z = mel(z, 60, w);
      ry = mel(ry, tour + regard.x * 9, w);
      rz = mel(rz, cur.rz, w);
      rx = mel(rx, cur.rx - regard.y * 7, w);
      s = mel(s, cur.s, w);

      const fuite = mel(borne((Math.cos(angle) + 0.35) / 0.6), 1, cur.plat);   // l'arrière de l'anneau s'efface
      const o = mel(cur.autres, 1, lisse(bosse)) * fuite * entree;
      const el = F[i].el;
      if (o < 0.01) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = '';
      el.style.setProperty('--o', o.toFixed(3));
      el.style.setProperty('--r', (ry * 0.9).toFixed(1));
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(3)})`;
    }

    if (gl) {
      gl.uniform2f(uni.r, fond.width, fond.height);
      gl.uniform1f(uni.t, temps);
      gl.uniform3f(uni.c, brume[0], brume[1], brume[2]);
      gl.uniform1f(uni.f, mel(0.25, 1, entree));
      gl.uniform2f(uni.m, regard.x, -regard.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  // ── La boucle : arrivé en bas, on est revenu en haut ──────
  addEventListener('scroll', () => {
    if (calme || !pret || menu.hidden === false) return;
    if (scrollY >= total - 1) {
      cur.ry -= 720;                           // même pose : aucun tour à refaire
      scrollTo({ top: 0, behavior: 'instant' });
    }
  }, { passive: true });

  addEventListener('resize', mesurer);
  new ResizeObserver(mesurer).observe(document.body);    // une question dépliée change la hauteur
  mesurer();
  afficherFamille(true);
  (function boucle(ts) { requestAnimationFrame(boucle); image(ts); })(0);

  if (banc) {
    window.flowBanc = {
      avancer(n = 60) { let ts = avant; for (let i = 0; i < n; i++) { ts += 16.7; image(ts); } return this.etat(); },
      etat: () => ({ choix, pos: +pos.toFixed(3), cible, pret, intro: +intro.toFixed(3), pct: Math.round(pct), scene: +cur.scene.toFixed(2), f: +cur.f.toFixed(2) }),
    };
  }
})();
