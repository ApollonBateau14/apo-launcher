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

function showMsAccount(account) {
  document.getElementById('ms-account-connected').hidden = !account;
  document.getElementById('ms-account-disconnected').hidden = !!account;
  if (account) document.getElementById('ms-account-name').textContent = account.name;
  if (typeof loadCurrentSkin === 'function') loadCurrentSkin();
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

// Le sondage crack/premium ouvre une vraie connexion (état "login") sur le
// serveur avec un faux pseudo, visible dans ses logs (déconnexion "not
// whitelisted") — le refaire à CHAQUE affichage de l'écran Play (l'appli
// revient dessus très souvent) spammait le serveur pour rien : le mode
// online/offline d'un serveur ne change quasiment jamais. Mis en cache 15
// minutes, pareil pour "Optimiser" (juste un appel API Modrinth, mais pas
// de raison de le refaire à chaque fois non plus).
const ONLINE_MODE_CACHE_MS = 15 * 60 * 1000;
const onlineModeCache = new Map(); // serverId -> { mode, ts }
async function getCachedOnlineMode(serverId) {
  const cached = onlineModeCache.get(serverId);
  if (cached && Date.now() - cached.ts < ONLINE_MODE_CACHE_MS) return cached.mode;
  const mode = await window.api.getServerOnlineMode(serverId);
  onlineModeCache.set(serverId, { mode, ts: Date.now() });
  return mode;
}
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
      getCachedOnlineMode(server.id).then((mode) => {
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

function closeModal() {
  if (closeOpenDropdown) closeOpenDropdown(); // dropdown custom attaché à <body>, pas à modalFields
  modalOverlay.classList.remove('active');
  modalFields.innerHTML = '';
  modalSaveBtn.onclick = null;
  // Remet le bouton dans son état par défaut — sinon un modal qui a
  // personnalisé son texte/visibilité (ex: le changelog, "Fermer" + Annuler
  // caché) "fuiterait" cet état vers le prochain modal ouvert (édition
  // serveur, ajout d'ami, etc.), qui a besoin du "Enregistrer" habituel.
  modalSaveBtn.textContent = window.i18n.t('modal.save');
  modalCancelBtn.hidden = false;
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

// iconUrl optionnelle (logo Modrinth du mod/shader) — voir addons.js.
function addAddonIcon(row, iconUrl) {
  if (!iconUrl) return;
  const img = document.createElement('img');
  img.className = 'addon-icon';
  img.src = iconUrl;
  img.alt = '';
  row.appendChild(img);
}

function addModalCheckbox(container, labelText, checked, iconUrl) {
  const row = document.createElement('label');
  row.className = 'checkbox-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  row.appendChild(input);
  addAddonIcon(row, iconUrl);
  const span = document.createElement('span');
  span.textContent = labelText;
  row.appendChild(span);
  container.appendChild(row);
  return input;
}

// Pour des addons mutuellement exclusifs (ex: Fabulously Optimized vs Fresh
// Animations, incompatibles ensemble) — pas des radios natifs (rond bleu
// de l'OS, hors thème), un vrai switch segmenté maison à la place.
// `items`: [{ id, label, iconUrl, checked }]. Renvoie une Map id -> objet
// avec un getter .checked, pour rester compatible avec le code appelant
// (même contrat qu'un <input>.checked).
function addModalSegmentedGroup(container, items) {
  const row = document.createElement('div');
  row.className = 'segmented-switch';

  let activeId = (items.find((i) => i.checked) || items[0])?.id;
  const buttons = new Map();
  const proxies = new Map();

  function refresh() {
    buttons.forEach((btn, id) => btn.classList.toggle('active', id === activeId));
  }

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-switch-btn';
    addAddonIcon(btn, item.iconUrl);
    const span = document.createElement('span');
    span.textContent = item.label;
    btn.appendChild(span);
    btn.addEventListener('click', () => {
      activeId = item.id;
      refresh();
    });
    buttons.set(item.id, btn);
    row.appendChild(btn);
    proxies.set(item.id, { get checked() { return activeId === item.id; } });
  });

  refresh();
  container.appendChild(row);
  return proxies;
}

// Rend une liste d'addons (mods/shaders/texture packs) dans un conteneur
// donné — switch segmenté pour les addons groupés (mutuellement exclusifs),
// case à cocher simple pour le reste. Renvoie les controls créés, pour que
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
    controls.push({ item, input: addModalCheckbox(container, item.name, enabledIds.has(item.id), item.iconUrl) });
  });
  return controls;
}

// --- Écran Mods/Shaders/Texture packs (onglet dédié, pas un popup) ---
const addonsSaveBtn = document.getElementById('addons-save-btn');
const addonsSaveStatus = document.getElementById('addons-save-status');
let addonsAllControls = [];

async function renderAddonsScreen() {
  const [catalog, settings] = await Promise.all([window.api.getAddonCatalog(), window.api.getSettings()]);
  const enabledIds = new Set(settings.enabledAddons || []);

  addonsSaveStatus.textContent = '';
  addonsAllControls = [
    ...renderAddonList(document.getElementById('addons-mods-list'), catalog.mods, enabledIds),
    ...renderAddonList(document.getElementById('addons-shaders-list'), catalog.shaders, enabledIds),
    ...renderAddonList(document.getElementById('addons-texturepacks-list'), catalog.texturepacks, enabledIds)
  ];
}

addonsSaveBtn.addEventListener('click', async () => {
  const ids = addonsAllControls.filter((c) => c.input.checked).map((c) => c.item.id);
  await window.api.setEnabledAddons(ids);
  addonsSaveStatus.textContent = window.i18n.t('addons.saved');
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
  modalFields.appendChild(deleteBtn);
  modalFields.appendChild(deleteErrorEl);

  modalSaveBtn.onclick = async () => {
    if (!ipInput.value.trim()) return;
    const { ip, port } = parseIpPort(ipInput.value);
    await window.api.updateServer(server.id, {
      name: nameInput.value.trim(),
      ip,
      port,
      loader: loaderSelect.value,
      mcVersion: versionSelect.value
    });
    // IP/loader/version potentiellement changés : le cache crack-premium et
    // "Optimiser" de ce serveur ne vaut plus rien.
    onlineModeCache.delete(server.id);
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
// (interactive, sert aussi à l'aperçu recherche/galeries), et une petite
// en permanence dans le coin bas-gauche (l'icône "joueur" elle-même) —
// jamais interactive, juste un reflet en direct de l'autre.
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
const skinViewerMini = makeSkinViewer('skin-mini-canvas', 40, 56);
skinViewerMini.controls.enabled = false; // décoratif seulement, pas de drag sur l'icône

function loadSkinEverywhere(url) {
  skinViewer.loadSkin(url);
  skinViewerMini.loadSkin(url);
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
  const result = await window.api.applySkin(foundSkin.skinUrl);
  if (!result.success) {
    statusEl.textContent = window.i18n.t('skin.error', { message: result.error });
    return;
  }
  const account = document.getElementById('ms-account-connected').hidden ? null : true;
  statusEl.textContent = window.i18n.t(account ? 'skin.applied' : 'skin.appliedOfflineNote');
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
document.getElementById('skin-fab').addEventListener('click', () => {
  skinEditorOverlay.classList.add('active');
  loadSkinFavorites();
});
document.getElementById('skin-editor-close').addEventListener('click', () => {
  skinEditorOverlay.classList.remove('active');
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
const namemcBackBtn = document.getElementById('namemc-back');
const namemcForwardBtn = document.getElementById('namemc-forward');
function updateNamemcNavButtons() {
  namemcBackBtn.disabled = !namemcWebview.canGoBack();
  namemcForwardBtn.disabled = !namemcWebview.canGoForward();
}
namemcBackBtn.addEventListener('click', () => {
  if (namemcWebview.canGoBack()) namemcWebview.goBack();
});
namemcForwardBtn.addEventListener('click', () => {
  if (namemcWebview.canGoForward()) namemcWebview.goForward();
});
namemcWebview.addEventListener('did-navigate', updateNamemcNavButtons);
namemcWebview.addEventListener('did-navigate-in-page', updateNamemcNavButtons);
namemcWebview.addEventListener('before-input-event', (event, input) => {
  if (input.type !== 'keyDown' || !input.alt) return;
  if (input.key === 'ArrowLeft' && namemcWebview.canGoBack()) namemcWebview.goBack();
  else if (input.key === 'ArrowRight' && namemcWebview.canGoForward()) namemcWebview.goForward();
});

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
