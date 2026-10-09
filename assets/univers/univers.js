/* FLOW — l’accueil « univers » de flowapps.store : la scène en volume, le
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
    tailleCourant();
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

  // ── Le courant : les 165 apps en volume, derrière les tuiles ──────
  // Une seconde toile, dessinée par la carte graphique. Chaque app est un
  // carré tiré de la planche d'icônes ; sa place se déduit, comme le reste, de
  // l'endroit où l'on est dans la page. Trois dispositions, mêlées en douceur :
  //   « ciel »  (le carrousel)  les apps de l'univers choisi tournent sur le
  //                             socle, les autres attendent au loin, par nuées ;
  //   « vol »   (les principes) on traverse les 165 apps, à la vitesse du défilement ;
  //   « nappe » (la règle)      elles se posent en un sol qui ondule jusqu'à l'horizon.
  // Autour, une poussière que la vitesse étire en traits.
  const P = 1500;                              // la même perspective que les tuiles (.monde)
  const hasard = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const A = [];                                // les apps, dans l'ordre du catalogue
  $$('.groupe').forEach(g => {
    const fam = F.findIndex(f => f.id === g.dataset.id);
    const cartes = $$('.carte', g);
    cartes.forEach((c, j) => {
      const ico = $('.ico', c), nom = $('.carte-nom', c);
      if (fam < 0 || !ico || ico.classList.contains('sans')) return;
      const i = A.length;
      A.push({
        fam, j, n: cartes.length, el: c,
        u: +ico.style.getPropertyValue('--x'), v: +ico.style.getPropertyValue('--y'),
        nom: (nom.querySelector('[lang]') || nom).firstChild.textContent.trim(),
        h: [hasard(i, 1), hasard(i, 2), hasard(i, 3), hasard(i, 4)],
        x: 0, y: 0, z: 0, t: 0, o: 0, e: 0, sx: 0, sy: 0, st: 0, survol: 0,
      });
    });
  });
  const courant = document.createElement('canvas');
  courant.id = 'courant';
  fond.after(courant);
  const etiquette = document.createElement('div');
  etiquette.className = 'etiquette';
  etiquette.setAttribute('aria-hidden', 'true');
  document.body.append(etiquette);
  const NP = innerWidth < 760 ? 900 : 2200;    // les grains de poussière
  let g2 = null, K = null, dpr = 1, survole = -1, etiquetee = -1;
  const poids = { ciel: 1, vol: 0, nappe: 0 };
  const sorte = s => (s === 'gamme' || s === 'retour' ? 'ciel' : s === 'profil' || s === 'principe' ? 'vol' : 'nappe');
  let vol = 0, defileAvant = 0, vitesse = 0;
  // Une machine qui peine reçoit une toile moins fine, jamais une page qui saccade.
  let finesse = 1, lenteur = 0, mesures = 0;
  function jauger(ecart) {
    if (banc || document.hidden || ecart > 0.25) return;              // un onglet qui revient n'est pas une machine lente
    lenteur = mel(lenteur, ecart, 0.05);
    if (++mesures > 90 && lenteur > 0.03 && finesse > 0.5) {
      finesse = Math.max(0.5, finesse * 0.75); mesures = 0; lenteur = 0.016;
      tailleCourant();
    }
  }

  function tailleCourant() {
    if (!g2) return;
    dpr = Math.min(devicePixelRatio || 1, petit ? 1.5 : 2) * finesse;
    const l = Math.round(W * dpr), h = Math.round(H * dpr);
    if (courant.width !== l || courant.height !== h) { courant.width = l; courant.height = h; g2.viewport(0, 0, l, h); }
  }
  (function preparerCourant() {
    if (!A.length) return;
    try { g2 = courant.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (_) { g2 = null; }
    if (!g2) { courant.hidden = true; return; }
    const prog = (sommets, pixels) => {
      const faire = (type, source) => {
        const s = g2.createShader(type);
        g2.shaderSource(s, '#version 300 es\nprecision highp float;\n' + source); g2.compileShader(s);
        if (!g2.getShaderParameter(s, g2.COMPILE_STATUS)) throw new Error(g2.getShaderInfoLog(s));
        return s;
      };
      const p = g2.createProgram();
      g2.attachShader(p, faire(g2.VERTEX_SHADER, sommets)); g2.attachShader(p, faire(g2.FRAGMENT_SHADER, pixels));
      g2.linkProgram(p);
      if (!g2.getProgramParameter(p, g2.LINK_STATUS)) throw new Error(g2.getProgramInfoLog(p));
      return p;
    };
    try {
      // Les icônes : un carré par app, toujours face à nous. Le calcul des
      // places est fait ici, en JavaScript (il sert aussi au tri et au survol).
      const icones = prog(`
        in vec2 q; in vec4 a; in vec4 b; in vec3 c;
        uniform vec2 pr;
        out vec2 vq; out vec2 vcase; out float valpha, veclat, vprof; out vec3 vc;
        void main(){
          vq = q * 1.5; vcase = b.xy; valpha = b.z; veclat = b.w; vc = c; vprof = -a.z;
          float w = -a.z;
          gl_Position = vec4((a.xy + q * a.w * .75) * pr + vec2(0., .08) * w, 0., w);   // point de fuite à 46 % de la hauteur, comme .monde
        }`, `
        in vec2 vq; in vec2 vcase; in float valpha, veclat, vprof; in vec3 vc;
        uniform sampler2D tx; uniform vec2 grille; uniform vec3 brume; uniform float P;
        out vec4 o;
        void main(){
          vec2 p = abs(vq);
          float r = .45, d = length(max(p - (1. - r), 0.)) - r;          // le carré aux coins ronds des icônes
          float bord = fwidth(d) * 1.2;
          float dans = smoothstep(bord, -bord, d);
          float pres = smoothstep(P * .62, P * .2, vprof);               // tout près : flou
          vec2 uv = (vcase + clamp(vec2(vq.x, -vq.y) * mix(.5, .44, pres) + .5, .01, .99)) / grille;
          vec3 col = texture(tx, uv, pres * 3.2).rgb;
          col *= 1. + .12 * smoothstep(-.2, 1., vq.y) - .1 * smoothstep(.2, -1., vq.y);   // un jour venu d'en haut
          float loin = clamp((vprof - P * 1.3) / (P * 3.6), 0., 1.);
          col = mix(col, brume * 1.5, loin * .72);
          float halo = exp(-max(d, 0.) * 5.5) * (1. - dans) * (.16 + .5 * veclat);
          vec3 lueur = mix(vc, vec3(1., .96, .88), .35);
          float al = (dans + halo * .9) * valpha;
          o = vec4((col * dans + lueur * halo) * valpha, al);
        }`);
      // La poussière : sa place est calculée par la carte graphique, à partir
      // d'une graine. Deux sommets par grain : la tête, et une queue que la
      // vitesse éloigne. Dessinée en points (les têtes) puis en traits.
      const poussiere = prog(`
        in vec4 s; in float bout;
        uniform vec2 pr; uniform vec3 boite; uniform float t, vol, etire, P, taille; uniform vec2 regard, decale;
        out float va;
        void main(){
          vec3 p = vec3((s.x - .5) * boite.x, (s.y - .5) * boite.y, 0.);
          p.x += sin(t * .11 + s.w * 40.) * 46.; p.y += cos(t * .09 + s.z * 31.) * 38. + t * 5. * (s.w - .3);
          p.y = (fract(p.y / boite.y + .5) - .5) * boite.y;
          float z = fract(s.z + vol / boite.z);
          p.z = P * .55 - (1. - z) * boite.z - bout * etire;
          p.xy += regard * (p.z - P * .2) * .018;
          float w = P - p.z;
          va = smoothstep(0., .08, z) * smoothstep(1., .86, z) * (.35 + .65 * s.w);
          gl_Position = vec4(p.xy * pr + (vec2(0., .08) + decale) * w, 0., w);
          gl_PointSize = taille * (1.2 + 2.6 * s.w) * P / w;
        }`, `
        in float va; uniform vec3 c; uniform float force, rond;
        out vec4 o;
        void main(){
          float m = 1.;
          if (rond > .5) { vec2 d = gl_PointCoord - .5; m = smoothstep(.5, .05, length(d)); }
          o = vec4(c * va * m * force, 0.);       // lumière ajoutée : rien n'est caché derrière
        }`);
      // Le fil qui relie les apps de l'univers choisi, sur le socle.
      const fil = prog(`
        in vec4 a; uniform vec2 pr; out float va;
        void main(){ va = a.w; float w = -a.z; gl_Position = vec4(a.xy * pr + vec2(0., .08) * w, 0., w); }`, `
        in float va; uniform vec3 c; out vec4 o;
        void main(){ o = vec4(c * va, 0.); }`);

      const tx = g2.createTexture();
      g2.bindTexture(g2.TEXTURE_2D, tx);
      g2.texImage2D(g2.TEXTURE_2D, 0, g2.RGBA, 1, 1, 0, g2.RGBA, g2.UNSIGNED_BYTE, new Uint8Array([23, 19, 15, 255]));
      const planche = new Image();
      planche.onload = () => {
        g2.bindTexture(g2.TEXTURE_2D, tx);
        g2.pixelStorei(g2.UNPACK_FLIP_Y_WEBGL, false);
        g2.texImage2D(g2.TEXTURE_2D, 0, g2.RGBA, g2.RGBA, g2.UNSIGNED_BYTE, planche);
        g2.generateMipmap(g2.TEXTURE_2D);
        g2.texParameteri(g2.TEXTURE_2D, g2.TEXTURE_MIN_FILTER, g2.LINEAR_MIPMAP_LINEAR);
        g2.texParameteri(g2.TEXTURE_2D, g2.TEXTURE_MAG_FILTER, g2.LINEAR);
        g2.texParameteri(g2.TEXTURE_2D, g2.TEXTURE_MAX_LOD, 4);
        g2.texParameteri(g2.TEXTURE_2D, g2.TEXTURE_WRAP_S, g2.CLAMP_TO_EDGE);
        g2.texParameteri(g2.TEXTURE_2D, g2.TEXTURE_WRAP_T, g2.CLAMP_TO_EDGE);
        K.planche = true;
      };
      // La planche est celle des cartes : même adresse, donc déjà en mémoire.
      const adresse = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(A[0].el.querySelector('.ico')).backgroundImage);
      planche.src = adresse ? adresse[1] : '/assets/univers/icones.jpg';

      const vao = g2.createVertexArray();
      g2.bindVertexArray(vao);
      const carre = g2.createBuffer();
      g2.bindBuffer(g2.ARRAY_BUFFER, carre);
      g2.bufferData(g2.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g2.STATIC_DRAW);
      const lq = g2.getAttribLocation(icones, 'q');
      g2.enableVertexAttribArray(lq); g2.vertexAttribPointer(lq, 2, g2.FLOAT, false, 0, 0);
      const donnees = new Float32Array(A.length * 11), tampon = g2.createBuffer();
      g2.bindBuffer(g2.ARRAY_BUFFER, tampon);
      g2.bufferData(g2.ARRAY_BUFFER, donnees.byteLength, g2.DYNAMIC_DRAW);
      [['a', 4, 0], ['b', 4, 16], ['c', 3, 32]].forEach(([nom, n, decalage]) => {
        const l = g2.getAttribLocation(icones, nom);
        g2.enableVertexAttribArray(l); g2.vertexAttribPointer(l, n, g2.FLOAT, false, 44, decalage);
        g2.vertexAttribDivisor(l, 1);
      });

      const vaoP = g2.createVertexArray();
      g2.bindVertexArray(vaoP);
      const graines = new Float32Array(NP * 2 * 5);
      for (let i = 0; i < NP; i++) for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 5;
        for (let m = 0; m < 4; m++) graines[o + m] = hasard(i + 1000, m + 7);
        graines[o + 4] = k;
      }
      g2.bindBuffer(g2.ARRAY_BUFFER, g2.createBuffer());
      g2.bufferData(g2.ARRAY_BUFFER, graines, g2.STATIC_DRAW);
      const ls = g2.getAttribLocation(poussiere, 's'), lb = g2.getAttribLocation(poussiere, 'bout');
      g2.enableVertexAttribArray(ls); g2.vertexAttribPointer(ls, 4, g2.FLOAT, false, 20, 0);
      g2.enableVertexAttribArray(lb); g2.vertexAttribPointer(lb, 1, g2.FLOAT, false, 20, 16);

      const vaoF = g2.createVertexArray();
      g2.bindVertexArray(vaoF);
      const points = new Float32Array(64 * 4), tamponF = g2.createBuffer();
      g2.bindBuffer(g2.ARRAY_BUFFER, tamponF);
      g2.bufferData(g2.ARRAY_BUFFER, points.byteLength, g2.DYNAMIC_DRAW);
      const la = g2.getAttribLocation(fil, 'a');
      g2.enableVertexAttribArray(la); g2.vertexAttribPointer(la, 4, g2.FLOAT, false, 0, 0);
      g2.bindVertexArray(null);

      const lieux = (p, noms) => Object.fromEntries(noms.map(n => [n, g2.getUniformLocation(p, n)]));
      K = {
        icones, poussiere, fil, tx, vao, vaoP, vaoF, donnees, tampon, points, tamponF, planche: false,
        ui: lieux(icones, ['pr', 'tx', 'grille', 'brume', 'P']),
        up: lieux(poussiere, ['pr', 'boite', 't', 'vol', 'etire', 'P', 'taille', 'regard', 'decale', 'c', 'force', 'rond']),
        uf: lieux(fil, ['pr', 'c']),
        ordre: A.map((_, i) => i),
      };
      g2.enable(g2.BLEND);
      g2.blendFunc(g2.ONE, g2.ONE_MINUS_SRC_ALPHA);      // couleurs déjà multipliées par leur opacité
      g2.clearColor(0, 0, 0, 0);
    } catch (erreur) {
      console.warn('FLOW : pas de scène en volume —', erreur.message);
      g2 = null; K = null; courant.hidden = true;
    }
  })();

  // La place d'une app dans chacune des trois dispositions, puis leur mélange.
  function placer(dt, entree, brume) {
    const s = scrollY, saut = Math.abs(s - defileAvant) > H * 3;      // la boucle de la page n'est pas une vitesse
    const avance = (saut ? 0 : (s - defileAvant) * 1.5) + (calme ? 0 : dt * 26);
    defileAvant = s;
    vol += avance;
    vitesse = mel(vitesse, dt > 0 ? avance / dt : 0, 1 - Math.exp(-dt * 6));
    const { a, b, t } = etat();
    const but = { ciel: 0, vol: 0, nappe: 0 };
    but[sorte(a.scene)] += 1 - t; but[sorte(b.scene)] += t;
    const suivi = calme ? 1 : 1 - Math.exp(-dt * 4.2);
    for (const cle in poids) poids[cle] = mel(poids[cle], but[cle], suivi);

    const cosx = Math.cos(regard.y * 0.02), sinx = Math.sin(regard.y * 0.02);
    const cosy = Math.cos(regard.x * 0.03), siny = Math.sin(regard.x * 0.03);
    const socleY = -(cur.haut + T * 0.62), rayon = T * (petit ? 1.2 : 1.78), penche = 0.2;
    const L = 5400, large = Math.max(W, H * 1.25);
    const colonnes = 15, pasX = Math.max(132, W / 8.2), pasZ = 330;
    // Là où un texte se lit, les apps s'effacent : deux zones, en parts de l'écran.
    const zoneVol = petit ? [0, 1, 0.5, 1] : [0.02, 0.5, 0.2, 0.84];
    const zoneNappe = petit ? [0, 1, 0.3, 0.8] : [0.08, 0.92, 0.3, 0.8];
    const dansZone = (z, x, y) => {
      const dx = Math.max(z[0] * W - x, x - z[1] * W, 0), dy = Math.max(z[2] * H - y, y - z[3] * H, 0);
      return 1 - borne(Math.hypot(dx, dy) / 110);
    };
    for (let i = 0; i < A.length; i++) {
      const p = A[i], h = p.h;
      let d = p.fam - pos;
      d -= N * Math.round(d / N);
      const choisie = lisse(Math.max(0, 1 - Math.abs(d)));
      // « ciel » — au loin : une nuée par univers, rangées comme un grand carrousel.
      const an = d * pas * 0.82;
      let x1 = Math.sin(an) * 3300 + (h[0] - 0.5) * 1500;
      let y1 = (h[1] - 0.5) * H * 2.2 + H * 0.1 + Math.sin(temps * 0.25 + i) * 22;
      let z1 = -900 - Math.cos(an) * 2500 - h[2] * 1500 - (1 - Math.cos(an)) * 700;
      let t1 = 96, o1 = 0.72 * borne((Math.cos(an) + 0.55) / 0.9);
      // … et sur le socle : les apps de l'univers choisi tournent autour de la tuile.
      const tour = (p.j / p.n) * Math.PI * 2 + temps * 0.16 + p.fam;
      const xs = Math.sin(tour) * rayon, zs = Math.cos(tour) * rayon;
      const ys = socleY - zs * Math.sin(penche) + Math.sin(temps * 1.1 + i * 1.3) * 5;
      x1 = mel(x1, xs, choisie); y1 = mel(y1, ys, choisie); z1 = mel(z1, zs * Math.cos(penche), choisie);
      t1 = mel(t1, T * (petit ? 0.2 : 0.215), choisie); o1 = mel(o1, 1, choisie);
      const eclos = mel(0.2, 1, entree);                         // à l'ouverture, tout part du centre
      x1 *= eclos; y1 = mel(socleY, y1, eclos); o1 *= entree;
      // « vol » — un couloir de 165 apps que le défilement fait défiler vers nous.
      const ang = h[0] * Math.PI * 2 + Math.sin(temps * 0.13 + i) * 0.1;
      const rad = (0.52 + 0.62 * h[1]) * large;
      const zz = ((h[2] * L + vol) % L + L) % L / L;                 // 0 au loin, 1 passé derrière nous
      const x2 = Math.cos(ang) * rad, y2 = Math.sin(ang) * rad * 0.74, z2 = P * 0.5 - (1 - zz) * L;
      const o2 = 0.66 * borne(zz / 0.12) * borne((1 - zz) / 0.1);
      // « nappe » — un sol de 15 par 11 qui ondule et fuit vers l'horizon.
      const col = i % colonnes, rang = Math.floor(i / colonnes);
      const x3 = (col - (colonnes - 1) / 2) * pasX + (rang % 2 ? pasX * 0.5 : 0);
      const z3 = (petit ? -120 : 360) - rang * pasZ;
      const y3 = -H * 0.41 + Math.sin(x3 * 0.0045 + temps * 0.8 + rang * 0.55) * 24 + Math.cos(rang * 0.7 - temps * 0.6) * 12;
      const o3 = 0.9 * Math.pow(borne(1.06 - rang / 11), 1.5);

      const k1 = poids.ciel, k2 = poids.vol, k3 = poids.nappe, somme = k1 + k2 + k3 || 1;
      const x = (x1 * k1 + x2 * k2 + x3 * k3) / somme, y = (y1 * k1 + y2 * k2 + y3 * k3) / somme, z = (z1 * k1 + z2 * k2 + z3 * k3) / somme;
      p.survol = mel(p.survol, i === survole ? 1 : 0, 0.2);
      p.t = ((t1 * k1 + (petit ? 78 : 92) * k2 + (petit ? 84 : 98) * k3) / somme) * (1 + 0.28 * p.survol);
      p.o = borne((o1 * k1 + o2 * k2 + o3 * k3) / somme + p.survol * 0.3) * cur.scene;
      p.e = choisie * k1 / somme;
      // Le regard : la scène pivote un peu avec le pointeur, autour de l'écran.
      const xr = x * cosy + z * siny, zr = -x * siny + z * cosy;
      p.x = xr; p.y = y * cosx - zr * sinx; p.z = y * sinx + zr * cosx - P;      // repère de l'œil : il regarde vers -z
      const prof = -p.z;
      if (prof < P * 0.12) p.o = 0;                                // trop près : il nous traverserait
      else if (prof < P * 0.5) p.o *= (prof - P * 0.12) / (P * 0.38);
      const ech = P / prof;
      p.sx = W / 2 + p.x * ech; p.sy = H * 0.46 - p.y * ech; p.st = p.t * ech;
      if (k2 + k3 > 0.02) p.o *= 1 - (0.8 * dansZone(zoneVol, p.sx, p.sy) * k2 + 0.86 * dansZone(zoneNappe, p.sx, p.sy) * k3) / somme;
    }
  }

  function dessinerCourant(dt, entree, brume, c) {
    if (!g2 || !K) return;
    placer(dt, entree, brume);
    g2.clear(g2.COLOR_BUFFER_BIT);
    if (cur.scene < 0.01) return;
    const prx = P / (W / 2), pry = P / (H / 2);

    // 1. La poussière, derrière tout.
    const lumiere = [mel(c[0], 0.95, 0.5), mel(c[1], 0.92, 0.5), mel(c[2], 0.86, 0.5)];
    const etire = calme ? 0 : borne(vitesse * 0.075, -620, 620);
    g2.useProgram(K.poussiere);
    g2.bindVertexArray(K.vaoP);
    g2.uniform2f(K.up.pr, prx, pry);
    g2.uniform3f(K.up.boite, Math.max(W, 900) * 3.4, H * 2.8, 6200);
    g2.uniform1f(K.up.t, temps); g2.uniform1f(K.up.vol, vol); g2.uniform1f(K.up.P, P);
    g2.uniform1f(K.up.taille, dpr);
    g2.uniform2f(K.up.regard, regard.x, -regard.y);
    g2.uniform3f(K.up.c, lumiere[0], lumiere[1], lumiere[2]);
    const force = cur.scene * mel(0.25, 1, entree);
    g2.uniform2f(K.up.decale, 0, 0);
    g2.uniform1f(K.up.etire, 0); g2.uniform1f(K.up.rond, 1); g2.uniform1f(K.up.force, force * 0.8);
    g2.drawArrays(g2.POINTS, 0, NP * 2);
    if (Math.abs(etire) > 6) {
      // Un trait ne fait jamais qu'un pixel : on le tire trois fois, décalé d'un pixel, pour qu'il se voie.
      g2.uniform1f(K.up.etire, etire); g2.uniform1f(K.up.rond, 0);
      g2.uniform1f(K.up.force, force * borne(Math.abs(etire) / 220) * 0.7);
      [[0, 0], [2 / courant.width, 0], [0, 2 / courant.height]].forEach(([dx, dy]) => {
        g2.uniform2f(K.up.decale, dx, dy);
        g2.drawArrays(g2.LINES, 0, NP * 2);
      });
    }

    // 2. Le fil de l'univers choisi, sur le socle.
    if (poids.ciel > 0.05) {
      const liees = A.filter(p => p.e > 0.5 && p.o > 0.05).sort((p, q) => p.j - q.j);
      if (liees.length > 2) {
        let n = 0;
        [...liees, liees[0]].slice(0, 64).forEach(p => {
          K.points[n++] = p.x; K.points[n++] = p.y; K.points[n++] = p.z; K.points[n++] = 0.2 * p.e * p.o * poids.ciel;
        });
        g2.useProgram(K.fil);
        g2.bindVertexArray(K.vaoF);
        g2.bindBuffer(g2.ARRAY_BUFFER, K.tamponF);
        g2.bufferSubData(g2.ARRAY_BUFFER, 0, K.points.subarray(0, n));
        g2.uniform2f(K.uf.pr, prx, pry);
        g2.uniform3f(K.uf.c, lumiere[0], lumiere[1], lumiere[2]);
        g2.drawArrays(g2.LINE_STRIP, 0, n / 4);
      }
    }

    // 3. Les icônes, de la plus lointaine à la plus proche.
    if (!K.planche) return;
    K.ordre.sort((i, j) => A[i].z - A[j].z);
    let n = 0, compte = 0;
    for (const i of K.ordre) {
      const p = A[i];
      if (p.o < 0.012) continue;
      const f = F[p.fam].c, d = K.donnees;
      d[n++] = p.x; d[n++] = p.y; d[n++] = p.z; d[n++] = p.t;
      d[n++] = p.u; d[n++] = p.v; d[n++] = p.o; d[n++] = Math.max(p.e, p.survol);
      d[n++] = f[0]; d[n++] = f[1]; d[n++] = f[2];
      compte++;
    }
    g2.useProgram(K.icones);
    g2.bindVertexArray(K.vao);
    g2.bindBuffer(g2.ARRAY_BUFFER, K.tampon);
    g2.bufferSubData(g2.ARRAY_BUFFER, 0, K.donnees.subarray(0, n));
    g2.activeTexture(g2.TEXTURE0); g2.bindTexture(g2.TEXTURE_2D, K.tx);
    g2.uniform1i(K.ui.tx, 0);
    g2.uniform2f(K.ui.pr, prx, pry);
    g2.uniform2f(K.ui.grille, colsPlanche, rangsPlanche);
    g2.uniform3f(K.ui.brume, brume[0], brume[1], brume[2]);
    g2.uniform1f(K.ui.P, P);
    g2.drawArraysInstanced(g2.TRIANGLE_STRIP, 0, 4, compte);
  }
  const styleRacine = getComputedStyle(racine);
  const colsPlanche = +styleRacine.getPropertyValue('--cols') || 15, rangsPlanche = +styleRacine.getPropertyValue('--rangs') || 11;

  // Le survol : quelle app est sous le pointeur ? (seulement sur le carrousel)
  function viser(cx, cy) {
    let trouve = -1, prof = 1e9;
    if (g2 && poids.ciel > 0.85 && cur.scene > 0.9 && !saisie) {
      for (let i = 0; i < A.length; i++) {
        const p = A[i], demi = Math.max(14, p.st * 0.5);
        if (p.o < 0.3 || p.e < 0.5) continue;                       // seules les apps du socle répondent
        if (Math.abs(cx - p.sx) < demi && Math.abs(cy - p.sy) < demi && -p.z < prof) { trouve = i; prof = -p.z; }
      }
    }
    survole = trouve;
    if (trouve !== etiquetee) {
      etiquetee = trouve;
      etiquette.classList.toggle('vue', trouve >= 0);
      if (trouve >= 0) etiquette.textContent = A[trouve].nom;
      document.body.classList.toggle('vise', trouve >= 0);
    }
    if (trouve >= 0) etiquette.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -150%)`;
    return trouve;
  }
  // Un clic sur une app du socle : sa carte, dans le catalogue.
  function ouvrirApp(i) {
    const p = A[i];
    filtre = ''; champ.value = p.nom; filtrer();
    survole = -1; viser(-1, -1);
    scrollTo({ top: $('#apps').getBoundingClientRect().top + scrollY + 40, behavior: calme || banc ? 'auto' : 'smooth' });
    p.el.classList.add('designee');
    setTimeout(() => p.el.classList.remove('designee'), 2600);
  }

  // ── Le son : une nappe douce et un tintement par univers, fabriqués ici ──
  const boutonSon = $('#son'), etatSon = $('#sonEtat');
  let audio = null, maitre = null, sonActif = false, souffle = null;
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
      // Le souffle : un bruit doux, que la vitesse du défilement fait monter.
      const grains = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate), d = grains.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const bruit = audio.createBufferSource(); bruit.buffer = grains; bruit.loop = true;
      souffle = { passe: audio.createBiquadFilter(), gain: audio.createGain() };
      souffle.passe.type = 'bandpass'; souffle.passe.frequency.value = 500; souffle.passe.Q.value = 0.8;
      souffle.gain.gain.value = 0;
      bruit.connect(souffle.passe); souffle.passe.connect(souffle.gain); souffle.gain.connect(audio.destination);
      bruit.start();
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
    if (ev.pointerType === 'mouse') viser(ev.clientX, ev.clientY);
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
      const visee = viser(ev.clientX, ev.clientY);       // … ou sur une app du socle : sa carte
      if (visee >= 0) { ouvrirApp(visee); return; }
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
    if (ev.pointerType === 'mouse' && !calme) {                    // la carte penche vers le pointeur
      c.style.setProperty('--ty', `${(((ev.clientX - r.left) / r.width - 0.5) * 7).toFixed(2)}deg`);
      c.style.setProperty('--tx', `${((0.5 - (ev.clientY - r.top) / r.height) * 7).toFixed(2)}deg`);
    }
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
    if (avant && g2) jauger((ts - avant) / 1000);
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

    dessinerCourant(dt, entree, brume, c);
    if (souffle) {
      const elan = sonActif && !calme ? borne(Math.abs(vitesse) / 9000) : 0;
      souffle.gain.gain.setTargetAtTime(elan * 0.05, audio.currentTime, 0.12);
      souffle.passe.frequency.setTargetAtTime(380 + elan * 1900, audio.currentTime, 0.12);
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
      // La scène en volume : ce qui est dessiné, et où (pour vérifier sans regarder).
      courant: () => ({
        actif: !!g2, planche: !!(K && K.planche), apps: A.length, poids: Object.fromEntries(Object.entries(poids).map(([k, v]) => [k, +v.toFixed(2)])),
        visibles: A.filter(p => p.o > 0.012).length, socle: A.filter(p => p.e > 0.5).map(p => p.nom), vitesse: Math.round(vitesse), survole: survole >= 0 ? A[survole].nom : null,
        erreur: g2 ? g2.getError() : null, finesse, souffle: !!souffle,
      }),
      apps: () => A.map(p => ({ nom: p.nom, x: Math.round(p.sx), y: Math.round(p.sy), t: Math.round(p.st), o: +p.o.toFixed(2), e: +p.e.toFixed(2) })),
      viser, ouvrirApp,
    };
  }
})();
