// --- Fenêtre custom ---
document.getElementById('minimize-btn').addEventListener('click', () => window.api.minimize());
document.getElementById('close-btn').addEventListener('click', () => window.api.close());

// --- Musique de fond (démarrage au premier clic, contrainte des navigateurs) ---
const music = document.getElementById('bg-music');
const muteBtn = document.getElementById('mute-btn');
let musicStarted = false;
let currentMusicVolume = 0.1; // écrasé par loadSettings() avec la valeur sauvegardée

function startMusicOnce() {
  if (musicStarted) return;
  musicStarted = true;
  music.volume = currentMusicVolume;
  music.play().catch(() => {}); // ignore si le fichier n'existe pas encore
  document.removeEventListener('click', startMusicOnce);
}
document.addEventListener('click', startMusicOnce);

muteBtn.addEventListener('click', () => {
  music.muted = !music.muted;
  muteBtn.title = window.i18n.t(music.muted ? 'mute.unmute' : 'mute.mute');
  muteBtn.classList.toggle('muted', music.muted);
});

// --- Navigation entre écrans ---
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');

// Rafraîchit le statut serveur tout seul pendant que Play est affiché —
// sans ça, un statut "en ligne" resterait affiché même si le serveur
// tombe entre-temps, tant qu'on ne change pas d'écran/de serveur à la main.
let statusRefreshInterval = null;
const STATUS_REFRESH_MS = 25000;

function goToScreen(screenName) {
  navItems.forEach((b) => b.classList.remove('active'));
  screens.forEach((s) => s.classList.remove('active'));
  document.querySelector(`.nav-item[data-screen="${screenName}"]`).classList.add('active');
  document.getElementById(`screen-${screenName}`).classList.add('active');

  clearInterval(statusRefreshInterval);
  if (screenName === 'play') {
    loadServerList();
    refreshServerStatus();
    statusRefreshInterval = setInterval(refreshServerStatus, STATUS_REFRESH_MS);
  } else if (screenName === 'addons') {
    renderAddonsScreen();
  }
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
});

// --- Chargement des réglages sauvegardés ---
function setActiveLangButton(lang) {
  document.querySelectorAll('.lang-flag-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

// Pseudo affiché comme un nametag au-dessus de la tête dans l'aperçu du
// menu principal — celui du compte Microsoft si connecté, sinon le pseudo
// offline tapé à la connexion.
async function updateHomeNametag() {
  const settings = await window.api.getSettings();
  document.getElementById('home-skin-nametag').textContent = settings.msAccount?.name || settings.username || '';
}

function showMsAccount(account) {
  document.getElementById('ms-account-connected').hidden = !account;
  document.getElementById('ms-account-disconnected').hidden = !!account;
  if (account) document.getElementById('ms-account-name').textContent = account.name;
  if (typeof loadCurrentSkin === 'function') loadCurrentSkin();
  updateHomeNametag();
}

async function loadSettings() {
  const settings = await window.api.getSettings();

  window.i18n.setLang(settings.language || 'en');
  setActiveLangButton(window.i18n.getLang());
  muteBtn.title = window.i18n.t(music.muted ? 'mute.unmute' : 'mute.mute');

  document.getElementById('username-input').value = settings.username || '';

  const ramSliderEl = document.getElementById('ram-slider');
  if (settings.systemRamMb) {
    // Plafonné à 12 Go même sur une machine qui en a beaucoup plus : au-delà,
    // ça n'aide plus Minecraft (le ramasse-miettes met plus de temps à
    // parcourir un gros tas) — allouer toute la RAM dispo dégraderait plus
    // qu'autre chose. Reste aussi borné par la RAM réelle si elle est plus
    // petite que 12 Go, pas de sens à proposer plus que ce qui existe.
    const MAX_REASONABLE_RAM_MB = 12288;
    ramSliderEl.max = Math.min(MAX_REASONABLE_RAM_MB, Math.max(2048, Math.round(settings.systemRamMb / 512) * 512));
  }
  ramSliderEl.value = settings.ramMb;
  document.getElementById('ram-value').textContent = `${(settings.ramMb / 1024).toFixed(1)} Go`;

  if (settings.systemRamMb) {
    // 6 Go couvre large la plupart des modpacks avec optimisation
    // (Fabulously Optimized + shaders inclus) — pas la peine de suggérer
    // plus juste parce que la machine a beaucoup de RAM, ça n'accélère rien
    // au-delà d'un certain point. Reste borné par (total - 2 Go) pour
    // laisser de quoi tourner l'OS sur une machine plus modeste.
    const IDEAL_RAM_MB = 6144;
    const recommended = Math.max(2048, Math.min(IDEAL_RAM_MB, Math.round((settings.systemRamMb - 2048) / 512) * 512));
    const suggestionEl = document.getElementById('ram-suggestion');
    suggestionEl.textContent = window.i18n.t('settings.ramSuggested', { value: (recommended / 1024).toFixed(1) });
    suggestionEl.style.cursor = 'pointer';
    suggestionEl.onclick = () => {
      ramSliderEl.value = recommended;
      document.getElementById('ram-value').textContent = `${(recommended / 1024).toFixed(1)} Go`;
    };
  }

  const volume = settings.musicVolume ?? 10;
  document.getElementById('volume-slider').value = volume;
  document.getElementById('volume-value').textContent = `${volume} %`;
  currentMusicVolume = volume / 100;
  music.volume = currentMusicVolume;

  document.getElementById('app-version').textContent = settings.appVersion ? `v${settings.appVersion}` : '';

  showMsAccount(settings.msAccount);

  // Déjà connecté (pseudo ou Microsoft) lors d'un lancement précédent : direct sur Play.
  if (settings.username || settings.msAccount) goToScreen('play');

  // Tentative de reconnexion silencieuse Microsoft (refresh token
  // sauvegardé) — en tâche de fond, ne bloque pas l'affichage initial. Ne
  // fait rien si aucun compte n'a jamais été connecté.
  if (settings.msAccount) {
    const account = await window.api.msSilentLogin();
    showMsAccount(account);
  }
}
loadSettings();

document.querySelectorAll('.lang-flag-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const lang = btn.dataset.lang;
    window.i18n.setLang(lang);
    setActiveLangButton(lang);
    await window.api.setLanguage(lang);
    muteBtn.title = window.i18n.t(music.muted ? 'mute.unmute' : 'mute.mute');
    // Réapplique la traduction au contenu généré dynamiquement (liste de
    // serveurs, statut) si l'écran Play est actuellement affiché.
    if (document.getElementById('screen-play').classList.contains('active')) {
      loadServerList();
      refreshServerStatus();
    }
  });
});

// --- Écran Paramètres : volume musique (aperçu en direct pendant le drag) ---
const volumeSlider = document.getElementById('volume-slider');
volumeSlider.addEventListener('input', () => {
  document.getElementById('volume-value').textContent = `${volumeSlider.value} %`;
  currentMusicVolume = Number(volumeSlider.value) / 100;
  music.volume = currentMusicVolume;
});

// Icône du serveur si définie (server.icon), sinon avatar avec l'initiale
// du nom — cohérent visuellement même sans image fournie.
function createServerIconEl(server) {
  if (server.icon) {
    const img = document.createElement('img');
    img.className = 'server-icon';
    img.src = server.icon;
    img.alt = '';
    img.onerror = () => {
      img.replaceWith(createServerIconEl({ ...server, icon: '' }));
    };
    return img;
  }

  const fallback = document.createElement('div');
  fallback.className = 'server-icon server-icon-fallback';
  fallback.textContent = (server.name || '?').trim().charAt(0).toUpperCase();
  return fallback;
}

function loaderLabel(loader) {
  if (!loader || loader === 'vanilla') return 'Vanilla';
  if (loader === 'neoforge') return 'NeoForge';
  return loader.charAt(0).toUpperCase() + loader.slice(1); // fabric -> Fabric, forge -> Forge
}

// Le cache du sondage crack/premium (ouvre une vraie connexion "login",
// visible dans les logs du serveur) vit maintenant côté main process, sur
// disque — voir main.js#get-server-online-mode. Pas besoin d'un 2e cache
// ici, juste appeler l'IPC directement suffit.
// "Optimiser" reste en mémoire ici (juste un appel Modrinth, pas de risque
// à le refaire, mais pas de raison non plus).
const optimizedCache = new Map(); // serverId -> bool
async function getCachedOptimized(serverId) {
  if (optimizedCache.has(serverId)) return optimizedCache.get(serverId);
  const optimized = await window.api.getServerOptimized(serverId);
  optimizedCache.set(serverId, optimized);
  return optimized;
}

// --- Écran Play : liste des serveurs ---
async function loadServerList() {
  const servers = await window.api.getServers();
  const settings = await window.api.getSettings();
  const listEl = document.getElementById('server-list');
  listEl.innerHTML = '';

  servers.forEach((server) => {
    const card = document.createElement('div');
    card.className = 'server-card' + (server.id === settings.selectedServerId ? ' selected' : '');
    card.draggable = true;
    card.dataset.serverId = server.id;

    // Glisser-déposer pour réordonner : on déplace la carte dans le DOM en
    // direct pendant le survol (retour visuel immédiat), puis on persiste
    // l'ordre final une fois relâché.
    card.addEventListener('dragstart', () => {
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', async () => {
      card.classList.remove('dragging');
      const orderedIds = Array.from(listEl.children).map((c) => c.dataset.serverId);
      await window.api.reorderServers(orderedIds);
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault(); // requis pour autoriser le drop
      const dragging = listEl.querySelector('.dragging');
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      listEl.insertBefore(dragging, before ? card : card.nextSibling);
    });

    const iconEl = createServerIconEl(server);
    card.appendChild(iconEl);

    // Pas d'icône fixée à la main : on va chercher celle du serveur lui-même
    // (favicon renvoyé par le ping Minecraft) en tâche de fond, sans bloquer
    // l'affichage — la carte garde l'initiale en attendant.
    if (!server.icon && server.ip) {
      window.api.getServerFavicon(server.id).then((favicon) => {
        if (!favicon) return;
        const current = card.querySelector('.server-icon');
        if (current) current.replaceWith(createServerIconEl({ ...server, icon: favicon }));
      });
    }

    const main = document.createElement('div');
    main.className = 'server-card-main';
    const nameRow = document.createElement('div');
    nameRow.className = 'server-name-row';
    const nameEl = document.createElement('span');
    nameEl.className = 'server-name';
    nameEl.textContent = server.name;
    nameRow.appendChild(nameEl);
    // Description auto-générée (loader + version) plutôt que saisie à la
    // main — sinon un serveur ajouté sans y penser reste vide (ex: OneBlock).
    // Suffixe "— Optimiser" si Fabulously Optimized est compatible, vérifié
    // en tâche de fond (appel API Modrinth) comme le favicon/badge crack.
    const descEl = document.createElement('span');
    descEl.className = 'server-desc';
    descEl.textContent = [loaderLabel(server.loader), server.mcVersion].filter(Boolean).join(' ');
    main.appendChild(nameRow);
    main.appendChild(descEl);

    if (server.loader && server.mcVersion) {
      getCachedOptimized(server.id).then((optimized) => {
        if (optimized) descEl.textContent += ' — Optimiser';
      });
    }

    // Crack (offline-mode) / Premium (online-mode) — pas dans le ping
    // standard, sonde à part (voir src/lib/serverPing.js) donc en tâche de
    // fond comme le favicon, sans bloquer l'affichage de la carte.
    if (server.ip) {
      window.api.getServerOnlineMode(server.id).then((mode) => {
        if (!mode) return; // indéterminé (timeout, offline...) : pas de badge plutôt qu'un badge faux
        const badge = document.createElement('span');
        badge.className = `server-mode-badge server-mode-${mode}`;
        badge.textContent = mode === 'online' ? window.i18n.t('server.premium') : window.i18n.t('server.crack');
        badge.title = mode === 'online' ? window.i18n.t('server.premiumHint') : window.i18n.t('server.crackHint');
        nameRow.appendChild(badge);
      });
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'server-edit-btn';
    editBtn.title = window.i18n.t('server.editTitle');
    editBtn.textContent = '⚙';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditServerModal(server);
    });

    card.appendChild(main);
    card.appendChild(editBtn);

    card.addEventListener('click', async () => {
      await window.api.setSelectedServer(server.id);
      document.querySelectorAll('.server-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      refreshServerStatus();
    });
    listEl.appendChild(card);
  });
}

// --- Modal générique (édition IP / ajout de serveur) ---
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalFields = document.getElementById('modal-fields');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalBtnRow = document.getElementById('modal-btn-row');

function closeModal() {
  if (closeOpenDropdown) closeOpenDropdown(); // dropdown custom attaché à <body>, pas à modalFields
  modalOverlay.classList.remove('active');
  modalFields.innerHTML = '';
  modalSaveBtn.onclick = null;
  // Remet le bouton dans son état par défaut — sinon un modal qui a
  // personnalisé son texte/visibilité/position (ex: le changelog, "Fermer"
  // + Annuler caché ; l'édition serveur, Enregistrer déplacé à côté de
  // Supprimer) "fuiterait" cet état vers le prochain modal ouvert, qui a
  // besoin du "Enregistrer" habituel à sa place habituelle.
  modalSaveBtn.textContent = window.i18n.t('modal.save');
  modalCancelBtn.hidden = false;
  modalBtnRow.appendChild(modalSaveBtn); // au cas où déplacé dans modal-fields (édition serveur)
}
modalCancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Changelog affiché une fois après un auto-update (jamais à la toute
// première installation, jamais deux fois pour la même version) — voir
// autoUpdate.js:getChangelogIfNew().
function openChangelogModal(changelog) {
  modalTitle.textContent = window.i18n.t('changelog.title', { version: changelog.version });
  modalFields.innerHTML = '';
  const notes = document.createElement('p');
  notes.className = 'hint';
  notes.style.whiteSpace = 'pre-wrap';
  notes.textContent = changelog.notes || window.i18n.t('changelog.noNotes');
  modalFields.appendChild(notes);

  modalCancelBtn.hidden = true;
  modalSaveBtn.textContent = window.i18n.t('changelog.close');
  modalSaveBtn.onclick = closeModal; // closeModal remet déjà tout dans son état par défaut
  modalOverlay.classList.add('active');
}

window.api.getChangelogIfNew().then((changelog) => {
  if (changelog) openChangelogModal(changelog);
});

function addModalField(labelText, { type = 'text', value = '', placeholder = '' } = {}) {
  const row = document.createElement('div');
  row.className = 'modal-field-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.className = 'field';
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  row.appendChild(label);
  row.appendChild(input);
  modalFields.appendChild(row);
  return input;
}

// Dropdown maison plutôt qu'un <select> natif : sa popup est dessinée par
// l'OS, ignore complètement le thème (fond blanc) et — pire — déborde de la
// fenêtre (fenêtre sans bordure, petite taille) au lieu d'y rester contenue.
// position:fixed + calcul manuel de la position = reste toujours dans la
// fenêtre, avec le bon habillage (voir .dropdown-list dans le CSS).
let closeOpenDropdown = null;

function addModalSelect(labelText, options, selected) {
  const row = document.createElement('div');
  row.className = 'modal-field-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  row.appendChild(label);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'field dropdown-trigger';
  const state = { value: selected ?? options[0] ?? '' };
  trigger.textContent = state.value;
  row.appendChild(trigger);
  modalFields.appendChild(row);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (closeOpenDropdown) { closeOpenDropdown(); return; } // un 2e clic referme

    const list = document.createElement('div');
    list.className = 'dropdown-list';
    const rect = trigger.getBoundingClientRect();
    list.style.width = `${rect.width}px`;
    list.style.left = `${rect.left}px`;
    // Vers le bas par défaut (quitte à scroller dans la liste plutôt que de
    // s'ouvrir vers le haut) — seulement vers le haut si vraiment plus assez
    // de place en dessous (ex: champ tout en bas du modal).
    const minSpaceBelow = 100;
    if (window.innerHeight - rect.bottom < minSpaceBelow) {
      list.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      list.style.top = `${rect.bottom + 4}px`;
    }

    options.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item' + (opt === state.value ? ' selected' : '');
      item.textContent = opt;
      item.addEventListener('click', () => {
        state.value = opt;
        trigger.textContent = opt;
        close();
      });
      list.appendChild(item);
    });
    document.body.appendChild(list);

    function close() {
      list.remove();
      document.removeEventListener('click', onOutsideClick);
      closeOpenDropdown = null;
    }
    function onOutsideClick(ev) {
      if (!list.contains(ev.target)) close();
    }
    setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
    closeOpenDropdown = close;
  });

  return { get value() { return state.value; } };
}

// Vignette icône seule (logo Modrinth), sans case ni texte visible — juste
// le logo en plus grand, l'état actif se voit au halo doré autour. Le nom
// reste en attribut title (tooltip au survol) pour savoir ce que c'est.
function createAddonTileEl(labelText, iconUrl) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'addon-tile';
  tile.title = labelText;
  if (iconUrl) {
    const img = document.createElement('img');
    img.className = 'addon-tile-icon';
    img.src = iconUrl;
    img.alt = labelText;
    tile.appendChild(img);
  } else {
    // Pas d'icône Modrinth trouvée (rare) — repli sur 2 lettres plutôt
    // qu'une vignette vide, en pratique incliquable au bon endroit.
    const span = document.createElement('span');
    span.className = 'addon-tile-fallback';
    span.textContent = labelText.slice(0, 2).toUpperCase();
    tile.appendChild(span);
  }
  return tile;
}

// Remplace l'ancienne case à cocher — même contrat .checked (get/set) que
// celle-ci, pour rester compatible avec le code appelant (saveEnabledAddons).
function addAddonTile(container, labelText, checked, iconUrl) {
  const tile = createAddonTileEl(labelText, iconUrl);
  let state = checked;
  tile.classList.toggle('active', state);
  tile.addEventListener('click', () => {
    state = !state;
    tile.classList.toggle('active', state);
  });
  container.appendChild(tile);
  return { get checked() { return state; }, set checked(v) { state = v; tile.classList.toggle('active', v); } };
}

// Pour des addons mutuellement exclusifs (ex: Fabulously Optimized vs Fresh
// Animations, incompatibles ensemble) — pas des radios natifs (rond bleu
// de l'OS, hors thème), les mêmes vignettes qu'au-dessus, groupées.
// `items`: [{ id, label, iconUrl, checked }]. Renvoie une Map id -> objet
// avec un getter/setter .checked, pour rester compatible avec le code
// appelant (même contrat qu'une vignette normale).
function addModalSegmentedGroup(container, items) {
  const row = document.createElement('div');
  row.className = 'segmented-switch';

  // Pas de repli sur items[0] : si rien n'est coché (ex: après "Tout
  // désactiver"), le groupe doit rester réellement sur "aucun" plutôt que
  // de retomber sur le premier choix — sinon ça avait l'air de se
  // réactiver tout seul en rouvrant l'onglet, sans avoir vraiment été coché.
  let activeId = items.find((i) => i.checked)?.id ?? null;
  const tiles = new Map();
  const proxies = new Map();

  function refresh() {
    tiles.forEach((tile, id) => tile.classList.toggle('active', id === activeId));
  }
  function setActive(id) {
    activeId = id;
    refresh();
  }

  items.forEach((item) => {
    const tile = createAddonTileEl(item.label, item.iconUrl);
    tile.addEventListener('click', () => setActive(item.id));
    tiles.set(item.id, tile);
    row.appendChild(tile);
    // Un setter en plus du getter — active/désactive tout le groupe (id
    // null = aucun choisi), pour que "Tout désactiver" traite ce switch
    // exactement comme une vignette normale, même contrat partout.
    proxies.set(item.id, {
      get checked() { return activeId === item.id; },
      set checked(value) { setActive(value ? item.id : null); }
    });
  });

  refresh();
  container.appendChild(row);
  return proxies;
}

// Rend une liste d'addons (mods/shaders/texture packs) dans un conteneur
// donné — switch segmenté pour les addons groupés (mutuellement exclusifs),
// vignette icône seule pour le reste. Renvoie les controls créés, pour que
// l'appelant puisse relire lesquels sont cochés au moment d'enregistrer.
function renderAddonList(container, items, enabledIds) {
  container.innerHTML = '';
  const groups = new Map();
  const standalone = [];
  for (const item of items) {
    if (item.group) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    } else {
      standalone.push(item);
    }
  }

  const controls = [];
  for (const groupItems of groups.values()) {
    const proxies = addModalSegmentedGroup(container, groupItems.map((item) => ({
      id: item.id,
      label: item.name,
      iconUrl: item.iconUrl,
      checked: enabledIds.has(item.id)
    })));
    groupItems.forEach((item) => controls.push({ item, input: proxies.get(item.id) }));
  }
  standalone.forEach((item) => {
    controls.push({ item, input: addAddonTile(container, item.name, enabledIds.has(item.id), item.iconUrl) });
  });
  return controls;
}

// --- Écran Mods/Shaders/Texture packs (onglet dédié, pas un popup) ---
// Sauvegarde automatique à chaque coche/switch — pas de bouton "Enregistrer"
// à penser à cliquer (source de confusion : ça avait l'air de "se décocher
// tout seul" en rouvrant l'onglet alors que rien n'avait juste été sauvé).
let addonsAllControls = [];

async function renderAddonsScreen() {
  const [catalog, settings] = await Promise.all([window.api.getAddonCatalog(), window.api.getSettings()]);
  const enabledIds = new Set(settings.enabledAddons || []);

  clearTimeout(addonsSaveStatusTimer);
  document.getElementById('addons-save-status').textContent = '';
  addonsAllControls = [
    ...renderAddonList(document.getElementById('addons-mods-list'), catalog.mods, enabledIds),
    ...renderAddonList(document.getElementById('addons-shaders-list'), catalog.shaders, enabledIds),
    ...renderAddonList(document.getElementById('addons-texturepacks-list'), catalog.texturepacks, enabledIds)
  ];
}

document.getElementById('addons-disable-all-btn').addEventListener('click', () => {
  // CustomSkinLoader n'est même plus dans la liste affichée — toujours
  // installé, plus rien à préserver ici (voir ALWAYS_ON_ADDONS côté main).
  addonsAllControls.forEach((c) => { c.input.checked = false; });
  saveEnabledAddons();
});

let addonsSaveStatusTimer = null;
function saveEnabledAddons() {
  const ids = addonsAllControls.filter((c) => c.input.checked).map((c) => c.item.id);
  window.api.setEnabledAddons(ids);

  // Petite confirmation qui s'efface toute seule — sauvegarde automatique
  // donc pas de bouton pour la déclencher, mais un retour visuel reste utile
  // pour être sûr que le clic a bien été pris en compte.
  const statusEl = document.getElementById('addons-save-status');
  statusEl.textContent = window.i18n.t('addons.saved');
  clearTimeout(addonsSaveStatusTimer);
  addonsSaveStatusTimer = setTimeout(() => { statusEl.textContent = ''; }, 1500);
}

// Délégation sur l'écran entier plutôt que sur chaque vignette : les listes
// sont reconstruites (innerHTML) à chaque ouverture de l'onglet, mais
// l'écran lui-même ne l'est jamais, donc un seul attachement suffit pour
// toute sa durée de vie. Vignettes = des <button>, pas des <input>, donc
// "click" plutôt que "change" pour déclencher la sauvegarde.
const screenAddonsEl = document.getElementById('screen-addons');
screenAddonsEl.addEventListener('click', (e) => {
  if (e.target.closest('.addon-tile')) saveEnabledAddons();
});

// Un seul champ pour IP+port, comme la "connexion rapide" de Minecraft :
// "play.exemple.fr" (port par défaut) ou "play.exemple.fr:25566" (port
// custom). On ne coupe que si ce qui suit le dernier ":" est un port valide
// — une IPv6 littérale sans port (plusieurs ":") reste donc intacte.
function parseIpPort(input, defaultPort = 25565) {
  const trimmed = input.trim();
  const idx = trimmed.lastIndexOf(':');
  if (idx > 0) {
    const portPart = trimmed.slice(idx + 1);
    const port = Number(portPart);
    if (/^\d+$/.test(portPart) && port > 0 && port < 65536) {
      return { ip: trimmed.slice(0, idx), port };
    }
  }
  return { ip: trimmed, port: defaultPort };
}

function ipPortValue(server) {
  const defaultPort = 25565;
  return server.port && server.port !== defaultPort ? `${server.ip}:${server.port}` : (server.ip || '');
}

// Mise en cache — même liste tant que l'appli tourne, pas besoin de la
// retélécharger (~centaines de Ko) à chaque ouverture d'un modal serveur.
let mcVersionsCache = null;
async function getMcVersionsCached() {
  if (!mcVersionsCache) mcVersionsCache = await window.api.getMcVersions();
  return mcVersionsCache;
}

async function openEditServerModal(server) {
  const versions = await getMcVersionsCached();
  modalTitle.textContent = window.i18n.t('modal.editTitle', { name: server.name });
  modalFields.innerHTML = '';
  const nameInput = addModalField(window.i18n.t('field.name'), { value: server.name, placeholder: 'Mon serveur' });
  const ipInput = addModalField(window.i18n.t('field.ip'), { value: ipPortValue(server), placeholder: 'play.exemple.fr ou play.exemple.fr:25566' });
  // Version avant loader (pas l'inverse) : sa liste est bien plus longue
  // (100+ entrées) — la laisser plus haut dans le modal lui donne plus de
  // place pour s'ouvrir vers le bas.
  const versionSelect = addModalSelect(window.i18n.t('field.mcVersion'), versions, server.mcVersion);
  const loaderSelect = addModalSelect(window.i18n.t('field.loader'), ['vanilla', 'fabric', 'forge', 'neoforge'], server.loader);
  const manifestInput = addModalField(window.i18n.t('field.manifestUrl'), { value: server.manifestUrl || '', placeholder: 'fabulously-optimized, .mrpack, ou manifest.json' });

  // Pas de popup système (confirm()) — le bouton lui-même se transforme en
  // décompte de 3s avant de devenir cliquable pour de vrai, façon "tiens le
  // bouton enfoncé" mais sans dépendre d'un maintien de clic précis.
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'modal-delete-btn';
  deleteBtn.textContent = window.i18n.t('server.deleteButton');
  const deleteErrorEl = document.createElement('p');
  deleteErrorEl.className = 'hint';

  let armed = false;
  deleteBtn.addEventListener('click', async () => {
    if (!armed) {
      deleteBtn.disabled = true;
      let remaining = 3;
      deleteBtn.textContent = window.i18n.t('server.deleteWait', { seconds: remaining });
      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(interval);
          armed = true;
          deleteBtn.disabled = false;
          deleteBtn.textContent = window.i18n.t('server.deleteConfirmBtn');
        } else {
          deleteBtn.textContent = window.i18n.t('server.deleteWait', { seconds: remaining });
        }
      }, 1000);
      return;
    }

    const result = await window.api.removeServer(server.id);
    if (!result.success) {
      deleteErrorEl.textContent = result.error;
      return;
    }
    closeModal();
    await loadServerList();
    refreshServerStatus();
  });
  // Pas de bouton Annuler ici (cliquer en dehors du modal ferme déjà tout
  // pareil) — Enregistrer déplacé à côté de Supprimer plutôt que tout seul
  // en bas, remis à sa place habituelle par closeModal() en repartant.
  modalCancelBtn.hidden = true;
  const deleteSaveRow = document.createElement('div');
  deleteSaveRow.className = 'btn-row';
  deleteSaveRow.appendChild(deleteBtn);
  deleteSaveRow.appendChild(modalSaveBtn);
  modalFields.appendChild(deleteSaveRow);
  modalFields.appendChild(deleteErrorEl);

  modalSaveBtn.onclick = async () => {
    if (!ipInput.value.trim()) return;
    const { ip, port } = parseIpPort(ipInput.value);
    await window.api.updateServer(server.id, {
      name: nameInput.value.trim(),
      ip,
      port,
      loader: loaderSelect.value,
      mcVersion: versionSelect.value,
      manifestUrl: manifestInput.value.trim()
    });
    // Loader/version potentiellement changés : le cache "Optimiser" de ce
    // serveur ne vaut plus rien (le cache crack/premium, lui, est côté main
    // process et clé par ip:port — une IP modifiée redevient naturellement
    // "jamais sondée" sans rien à invalider ici).
    optimizedCache.delete(server.id);
    closeModal();
    await loadServerList();
    refreshServerStatus();
  };
  modalOverlay.classList.add('active');
}

async function openAddServerModal() {
  const versions = await getMcVersionsCached();
  modalTitle.textContent = window.i18n.t('modal.addTitle');
  modalFields.innerHTML = '';
  const ipInput = addModalField(window.i18n.t('field.ip'), { placeholder: 'play.exemple.fr ou play.exemple.fr:25566' });
  const versionSelect = addModalSelect(window.i18n.t('field.mcVersion'), versions, versions[0]);
  const loaderSelect = addModalSelect(window.i18n.t('field.loader'), ['vanilla', 'fabric', 'forge', 'neoforge'], 'fabric');
  const manifestInput = addModalField(window.i18n.t('field.manifestUrl'), { placeholder: 'fabulously-optimized, .mrpack, ou manifest.json' });

  modalSaveBtn.onclick = async () => {
    if (!ipInput.value.trim()) return;
    const { ip, port } = parseIpPort(ipInput.value);
    await window.api.addServer({
      ip,
      port,
      loader: loaderSelect.value,
      mcVersion: versionSelect.value,
      loaderVersion: '',
      manifestUrl: manifestInput.value.trim()
    });
    closeModal();
    await loadServerList();
  };
  modalOverlay.classList.add('active');
}

document.getElementById('add-server-btn').addEventListener('click', openAddServerModal);

// --- Écran Connexion ---
document.getElementById('save-username-btn').addEventListener('click', async () => {
  const value = document.getElementById('username-input').value.trim();
  if (!value) return;
  await window.api.setUsername(value);
  updateHomeNametag();
  goToScreen('play');
});

document.getElementById('ms-continue-btn').addEventListener('click', () => goToScreen('play'));

document.getElementById('ms-login-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('ms-login-status');
  const btn = document.getElementById('ms-login-btn');
  btn.disabled = true;
  statusEl.textContent = window.i18n.t('connexion.msLoggingIn');
  const result = await window.api.msLogin();
  btn.disabled = false;
  if (result.success) {
    statusEl.textContent = '';
    showMsAccount(result.account);
  } else {
    statusEl.textContent = result.error;
  }
});

document.getElementById('ms-logout-btn').addEventListener('click', async () => {
  await window.api.msLogout();
  showMsAccount(null);
});

// --- Skin (recherche par pseudo Minecraft réel + aperçu/application 3D) ---
// skinview3d (Three.js) — même style de rendu que le menu de
// personnalisation du jeu. Face à l'écran par défaut (pas de rotation
// auto), tourné seulement à la souris — et uniquement gauche/droite (pas
// d'inclinaison verticale ni de zoom molette, juste l'azimut).
//
// Deux instances synchronisées : la grande dans l'éditeur plein écran
// (interactive, sert aussi à l'aperçu recherche/galeries), et celle
// affichée en permanence dans le menu principal (jamais interactive —
// le clic ouvre l'éditeur plutôt que de faire tourner le perso sur place).
function makeSkinViewer(canvasId, width, height) {
  const viewer = new skinview3d.SkinViewer({
    canvas: document.getElementById(canvasId),
    width,
    height,
    pixelRatio: Math.max(window.devicePixelRatio || 1, 2) // plus net, canvas petit sinon flou
  });
  viewer.animation = new skinview3d.IdleAnimation();
  viewer.zoom = 0.85; // personnage plus grand, remplit la hauteur du cadre
  viewer.controls.enableZoom = false;
  viewer.controls.enablePan = false;
  viewer.controls.minPolarAngle = Math.PI / 2;
  viewer.controls.maxPolarAngle = Math.PI / 2;
  // Vue 3/4 par défaut (comme le menu de perso du jeu) plutôt que pile de
  // face — tourne le PERSONNAGE, pas la caméra, donc le drag à la souris
  // continue de fonctionner normalement à partir de cet angle de départ.
  viewer.playerObject.rotation.y = Math.PI / 5.5;
  return viewer;
}
const skinViewer = makeSkinViewer('skin-3d-canvas', 240, 330);
const skinViewerHome = makeSkinViewer('home-skin-canvas', 200, 320);
skinViewerHome.controls.enabled = false; // décoratif, pas de drag — le clic ouvre l'éditeur

function loadSkinEverywhere(url) {
  skinViewer.loadSkin(url);
  skinViewerHome.loadSkin(url);
}

async function loadCurrentSkin() {
  const { skinUrl } = await window.api.getCurrentSkin();
  loadSkinEverywhere(skinUrl || null);
}
loadCurrentSkin();

let foundSkin = null;
let favoritedNames = new Set();

function updateFavoriteButtonState() {
  const favBtn = document.getElementById('skin-favorite-btn');
  if (!foundSkin?.name) {
    favBtn.hidden = true;
    return;
  }
  favBtn.hidden = false;
  favBtn.classList.toggle('active', favoritedNames.has(foundSkin.name.toLowerCase()));
}

async function runSkinSearch() {
  const username = document.getElementById('skin-search-input').value.trim();
  const statusEl = document.getElementById('skin-status');
  const applyBtn = document.getElementById('skin-apply-btn');
  if (!username) return;

  applyBtn.hidden = true;
  foundSkin = null;
  updateFavoriteButtonState();
  statusEl.textContent = window.i18n.t('skin.searching');

  const result = await window.api.lookupSkin(username);
  if (result.error) {
    statusEl.textContent = window.i18n.t('skin.error', { message: result.error });
  } else if (!result.uuid) {
    statusEl.textContent = window.i18n.t('skin.notFound');
  } else {
    statusEl.textContent = '';
    foundSkin = result;
    loadSkinEverywhere(result.skinUrl); // aperçu 3D immédiat, avant même d'appliquer
    applyBtn.hidden = false;
    updateFavoriteButtonState();
  }
}

// Entrée dans le champ = recherche, plus besoin d'un bouton "Chercher" séparé.
document.getElementById('skin-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSkinSearch();
});

document.getElementById('skin-apply-btn').addEventListener('click', async () => {
  if (!foundSkin?.skinUrl) return;
  const statusEl = document.getElementById('skin-status');
  const result = await window.api.applySkin(foundSkin.skinUrl, skinApplyMode || undefined);
  if (!result.success) {
    statusEl.textContent = window.i18n.t('skin.error', { message: result.error });
    return;
  }
  if (result.visibility === 'littleskin-manual') {
    // Pas d'upload par API côté LittleSkin (voir apply-skin dans main.js) —
    // le fichier est prêt, reste à finir l'envoi sur leur page intégrée.
    statusEl.textContent = window.i18n.t('skin.appliedLittleskinManual');
    openLittleskinOverlay('/skinlib/upload');
    return;
  }
  statusEl.textContent = window.i18n.t('skin.applied');
});

document.getElementById('skin-favorite-btn').addEventListener('click', async () => {
  if (!foundSkin?.name) return;
  const result = await window.api.toggleSkinFavorite(foundSkin.name);
  if (result.favorited) favoritedNames.add(foundSkin.name.toLowerCase());
  else favoritedNames.delete(foundSkin.name.toLowerCase());
  updateFavoriteButtonState();
  loadSkinFavorites();
});

// --- Favoris (recherches sauvegardées par le joueur lui-même) ---
async function loadSkinFavorites() {
  const grid = document.getElementById('skin-favorites-grid');
  grid.innerHTML = '';
  const favorites = await window.api.getSkinFavorites();
  favoritedNames = new Set(favorites.map((f) => f.name.toLowerCase()));

  favorites.forEach((fav) => {
    const item = document.createElement('div');
    item.className = 'skin-gallery-item';
    item.title = fav.name;

    const imgBase = document.createElement('img');
    imgBase.className = 'skin-gallery-face-base';
    imgBase.src = fav.skinUrl;
    imgBase.alt = fav.name;
    item.appendChild(imgBase);

    const imgHat = document.createElement('img');
    imgHat.className = 'skin-gallery-face-hat';
    imgHat.src = fav.skinUrl;
    imgHat.alt = '';
    item.appendChild(imgHat);

    item.addEventListener('click', () => {
      foundSkin = fav;
      loadSkinEverywhere(fav.skinUrl);
      document.getElementById('skin-apply-btn').hidden = false;
      document.getElementById('skin-status').textContent = '';
      updateFavoriteButtonState();
    });

    grid.appendChild(item);
  });
  updateFavoriteButtonState();
}
loadSkinFavorites();

// --- Éditeur de skin plein écran : ouverture/fermeture ---
const skinEditorOverlay = document.getElementById('skin-editor-overlay');
function openSkinEditor() {
  skinEditorOverlay.classList.add('active');
  loadSkinFavorites();
  refreshSkinModeSwitch();
  loadCurrentSkin(); // reflète ce qui est vraiment équipé (LittleSkin inclus)
}
document.getElementById('home-skin-preview').addEventListener('click', openSkinEditor);
document.getElementById('skin-editor-close').addEventListener('click', () => {
  skinEditorOverlay.classList.remove('active');
});

// --- Switch Premium/Crack : n'a de sens que si un compte Microsoft est
// connecté (choix entre "vraiment premium" et "tester le rendu crack") —
// sinon Crack est le seul mode utile, pas de switch à afficher (voir
// apply-skin dans main.js pour la résolution par défaut).
let skinApplyMode = null;
const skinModeSwitchEl = document.getElementById('skin-mode-switch');
const skinModeMsBtn = document.getElementById('skin-mode-microsoft');
const skinModeLsBtn = document.getElementById('skin-mode-littleskin');

async function refreshSkinModeSwitch() {
  const settings = await window.api.getSettings();
  const hasMs = !!settings.msAccount;

  if (!hasMs) {
    skinModeSwitchEl.hidden = true;
    skinApplyMode = null;
    return;
  }

  skinModeSwitchEl.hidden = false;
  skinApplyMode = settings.skinApplyMode === 'littleskin' ? 'littleskin' : 'microsoft';
  skinModeMsBtn.classList.toggle('active', skinApplyMode === 'microsoft');
  skinModeLsBtn.classList.toggle('active', skinApplyMode === 'littleskin');
}

skinModeMsBtn.addEventListener('click', () => {
  skinApplyMode = 'microsoft';
  skinModeMsBtn.classList.add('active');
  skinModeLsBtn.classList.remove('active');
});
skinModeLsBtn.addEventListener('click', () => {
  skinApplyMode = 'littleskin';
  skinModeLsBtn.classList.add('active');
  skinModeMsBtn.classList.remove('active');
});

// --- Page LittleSkin intégrée — connexion/inscription (leur propre page
// gère ça nativement, pas besoin qu'on gère un login nous-mêmes) et fin de
// l'envoi manuel d'un skin en mode Crack. Même principe que le navigateur
// NameMC : on affiche leur site tel quel dans un <webview>. ?lang=en car
// LittleSkin est en chinois par défaut (site basé en Chine), pas de version
// française, mais l'anglais est dispo via ce paramètre.
const littleskinOverlay = document.getElementById('littleskin-overlay');
const littleskinWebview = document.getElementById('littleskin-webview');
function openLittleskinOverlay(urlPath) {
  littleskinWebview.src = `https://littleskin.cn${urlPath}${urlPath.includes('?') ? '&' : '?'}lang=en`;
  littleskinOverlay.classList.add('active');
}
setupWebviewNav(littleskinWebview, document.getElementById('littleskin-back'), document.getElementById('littleskin-forward'));
// Bibliothèque triée par likes plutôt que la page d'upload — pratique pour
// parcourir et prendre direct un skin déjà fait par quelqu'un d'autre.
document.getElementById('littleskin-open-btn').addEventListener('click', () => {
  openLittleskinOverlay('/skinlib?filter=skin&sort=likes&page=1');
});
// Le closet du compte : skins déjà uploadés/ajoutés, avec l'aperçu 3D et le
// bouton "Apply" pour équiper direct sur le personnage — le vrai raccourci
// pour rééquiper un skin déjà prêt, sans repasser par la bibliothèque.
document.getElementById('littleskin-closet-btn').addEventListener('click', () => {
  openLittleskinOverlay('/user/closet');
});
document.getElementById('littleskin-webview-close').addEventListener('click', () => {
  littleskinOverlay.classList.remove('active');
  loadCurrentSkin(); // au cas où le skin ait été changé pendant la visite
});

// --- Navigateur NameMC intégré (juste pour parcourir/copier un pseudo
// soi-même, on n'affiche que leur site tel quel dans un <webview>) ---
const namemcOverlay = document.getElementById('namemc-overlay');
const namemcWebview = document.getElementById('namemc-webview');
document.getElementById('skin-namemc-btn').addEventListener('click', () => {
  // Chargé seulement au premier clic (laisse le temps à uBlock Origin de
  // se charger côté main process avant la toute première visite).
  if (!namemcWebview.src) namemcWebview.src = 'https://fr.namemc.com/minecraft-skins';
  namemcOverlay.classList.add('active');
});
document.getElementById('namemc-close').addEventListener('click', () => {
  namemcOverlay.classList.remove('active');
});

// Navigation précédent/suivant — boutons + raccourci Alt+Flèches (celui du
// vrai navigateur ne marche pas ici : le <webview> tourne dans son propre
// processus invité, il faut écouter ses propres événements clavier).
// Factorisé : même besoin pour NameMC et LittleSkin.
function setupWebviewNav(webview, backBtn, forwardBtn) {
  function update() {
    backBtn.disabled = !webview.canGoBack();
    forwardBtn.disabled = !webview.canGoForward();
  }
  backBtn.addEventListener('click', () => { if (webview.canGoBack()) webview.goBack(); });
  forwardBtn.addEventListener('click', () => { if (webview.canGoForward()) webview.goForward(); });
  webview.addEventListener('did-navigate', update);
  webview.addEventListener('did-navigate-in-page', update);
  webview.addEventListener('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.alt) return;
    if (input.key === 'ArrowLeft' && webview.canGoBack()) webview.goBack();
    else if (input.key === 'ArrowRight' && webview.canGoForward()) webview.goForward();
  });
}
setupWebviewNav(namemcWebview, document.getElementById('namemc-back'), document.getElementById('namemc-forward'));

// --- Écran Paramètres ---
const ramSlider = document.getElementById('ram-slider');
ramSlider.addEventListener('input', () => {
  document.getElementById('ram-value').textContent = `${(ramSlider.value / 1024).toFixed(1)} Go`;
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  await window.api.setRam(Number(ramSlider.value));
  await window.api.setMusicVolume(Number(volumeSlider.value));
});

document.getElementById('open-folder-btn').addEventListener('click', () => {
  window.api.openGameFolder();
});

document.getElementById('copy-logs-btn').addEventListener('click', async () => {
  await window.api.copyLogs();
  const statusEl = document.getElementById('copy-logs-status');
  statusEl.textContent = window.i18n.t('settings.copyLogsDone');
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
});

// Auto-update réel (electron-updater côté main, voir src/lib/autoUpdate.js).
// En build packagé, la progression complète (checking → available → downloading
// → downloaded) arrive via l'event 'update-status' géré plus bas ; le retour
// direct de checkForUpdates() ne sert alors qu'à savoir si ça a bien démarré.
// En dev (app pas packagée), pas d'event : le retour direct contient déjà
// tout (simple comparaison de version via l'API GitHub, pas de vrai téléchargement).
const updateStatusEl = document.getElementById('update-status');
const updateActionBtn = document.getElementById('update-action-btn');
let updateActionMode = null; // 'download' | 'install' | null

updateActionBtn.addEventListener('click', async () => {
  if (updateActionMode === 'download') {
    updateActionBtn.hidden = true;
    await window.api.downloadUpdate();
  } else if (updateActionMode === 'install') {
    window.api.installUpdate();
  }
});

document.getElementById('check-updates-btn').addEventListener('click', async () => {
  updateActionBtn.hidden = true;
  updateStatusEl.textContent = window.i18n.t('update.checking');
  const result = await window.api.checkForUpdates();
  if (result.error) {
    updateStatusEl.textContent = result.error;
  } else if (result.dev) {
    updateStatusEl.textContent = result.upToDate
      ? window.i18n.t('update.upToDate', { version: result.current })
      : window.i18n.t('update.newVersion', { latest: result.latest, current: result.current });
  }
  // sinon (build packagé) : les events 'update-status' prennent le relais.
});

window.api.onUpdateStatus((status) => {
  if (status.state === 'checking') {
    updateStatusEl.textContent = window.i18n.t('update.checking');
    updateActionBtn.hidden = true;
  } else if (status.state === 'available') {
    updateStatusEl.textContent = window.i18n.t('update.available', { version: status.version });
    updateActionBtn.textContent = window.i18n.t('update.downloadBtn');
    updateActionMode = 'download';
    updateActionBtn.hidden = false;
  } else if (status.state === 'not-available') {
    updateStatusEl.textContent = window.i18n.t('update.notAvailable', { version: status.current });
    updateActionBtn.hidden = true;
  } else if (status.state === 'downloading') {
    updateStatusEl.textContent = window.i18n.t('update.downloading', { percent: status.percent });
  } else if (status.state === 'downloaded') {
    updateStatusEl.textContent = window.i18n.t('update.downloaded');
    updateActionBtn.textContent = window.i18n.t('update.installBtn');
    updateActionMode = 'install';
    updateActionBtn.hidden = false;
  } else if (status.state === 'error') {
    updateStatusEl.textContent = window.i18n.t('update.error', { message: status.message });
    updateActionBtn.hidden = true;
  }
});

// --- Écran Play : statut serveur ---
async function refreshServerStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const details = document.getElementById('status-details');

  dot.className = 'status-dot';
  text.textContent = window.i18n.t('status.checking');
  details.textContent = '';

  const result = await window.api.pingServer();

  if (result.online) {
    dot.classList.add('online');
    text.textContent = window.i18n.t('status.online');
    details.textContent = window.i18n.t('status.details', {
      online: result.playersOnline,
      max: result.playersMax,
      ping: result.ping
    });
  } else {
    dot.classList.add('offline');
    text.textContent = window.i18n.t('status.offline');
    details.textContent = result.error || '';
  }
}

// --- Écran Play : lancer le jeu ---
const launchProgressEl = document.getElementById('launch-progress');

window.api.onLaunchProgress((progress) => {
  if (progress.task === 'java-download-start') {
    launchProgressEl.textContent = window.i18n.t('launch.javaDownloadStart', { version: progress.majorVersion });
  } else if (progress.task === 'java-download-progress') {
    launchProgressEl.textContent = window.i18n.t('launch.javaDownloadProgress', {
      version: progress.majorVersion,
      percent: Math.round(progress.ratio * 100)
    });
  } else if (progress.task === 'java-download-done') {
    launchProgressEl.textContent = window.i18n.t('launch.javaReady');
  } else if (progress.task === 'loader-check') {
    launchProgressEl.textContent = progress.loader && progress.loader !== 'vanilla'
      ? window.i18n.t('launch.loaderPrep', { loader: progress.loader })
      : window.i18n.t('launch.gamePrep');
  } else if (progress.task === 'mc-download') {
    launchProgressEl.textContent = window.i18n.t('launch.mcDownload', { type: progress.type });
  } else if (progress.task === 'modpack-check') {
    launchProgressEl.textContent = window.i18n.t('launch.modpackCheck');
  } else if (progress.task === 'modpack-download') {
    launchProgressEl.textContent = window.i18n.t('launch.modpackDownload', { file: progress.file });
  } else if (progress.task === 'addon-check') {
    launchProgressEl.textContent = window.i18n.t('launch.addonCheck', { name: progress.name });
  } else if (progress.task === 'addon-download') {
    launchProgressEl.textContent = window.i18n.t('launch.addonDownload', { name: progress.name });
  } else if (progress.task === 'launched') {
    // Le jeu tourne vraiment (process Java démarré) : plus rien à afficher,
    // sinon le dernier message de téléchargement reste bloqué à l'écran.
    launchProgressEl.textContent = '';
  }
});

// Baisse doucement le volume puis coupe — appelé une fois le jeu
// effectivement lancé, pas au clic (le lancement peut encore échouer).
function fadeOutMusic(durationMs = 2000) {
  if (music.paused || music.volume <= 0) return;
  const startVolume = music.volume;
  const steps = 30;
  const stepDelay = durationMs / steps;
  let step = 0;
  const fade = setInterval(() => {
    step++;
    music.volume = Math.max(0, startVolume * (1 - step / steps));
    if (step >= steps) {
      clearInterval(fade);
      music.pause();
    }
  }, stepDelay);
}

const retryLaunchBtn = document.getElementById('retry-launch-btn');

async function attemptLaunch() {
  retryLaunchBtn.hidden = true;
  launchProgressEl.textContent = window.i18n.t('launch.starting');
  const result = await window.api.launchGame();
  if (!result.success) {
    launchProgressEl.textContent = window.i18n.t('launch.error', { error: result.error });
    retryLaunchBtn.hidden = false;
  } else {
    fadeOutMusic();
  }
}

document.getElementById('play-btn').addEventListener('click', attemptLaunch);
retryLaunchBtn.addEventListener('click', attemptLaunch);

// --- Écran Connexion : ticker actualités Minecraft ---
// Même flux JSON public que le vrai launcher officiel Mojang (celui qui
// alimente son propre panneau "actualités") — rien à héberger, 100% légitime.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadNewsTicker() {
  const track = document.getElementById('news-ticker-track');
  if (!track) return;
  try {
    const res = await fetch('https://launchercontent.mojang.com/news.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.entries || []).slice(0, 8);
    if (!items.length) return;

    const buildItems = () => items.map((entry) => `
      <div class="news-ticker-item" data-url="${escapeHtml(entry.readMoreLink || '')}">
        <div class="news-title">${escapeHtml(entry.title)}</div>
        <div class="news-text">${escapeHtml(entry.text)}</div>
      </div>
    `).join('');

    // Contenu dupliqué x2 : boucle infinie sans à-coup (voir @keyframes news-scroll)
    track.innerHTML = buildItems() + buildItems();

    track.querySelectorAll('.news-ticker-item').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.url) window.api.openExternal(el.dataset.url);
      });
    });
  } catch {
    // Pas de connexion / API Mojang indisponible : zone laissée vide, rien de critique.
  }
}
loadNewsTicker();
