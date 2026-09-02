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
    // Pas de sens à proposer plus que ce que la machine a physiquement —
    // le max fixe de 16 Go dans le HTML n'a aucune idée de la vraie RAM.
    ramSliderEl.max = Math.max(2048, Math.round(settings.systemRamMb / 512) * 512);
  }
  ramSliderEl.value = settings.ramMb;
  document.getElementById('ram-value').textContent = `${(settings.ramMb / 1024).toFixed(1)} Go`;

  if (settings.systemRamMb) {
    // Règle simple : ~50% de la RAM totale, jamais moins de 2 Go ni plus
    // que (total - 2 Go) pour laisser de quoi tourner l'OS à côté.
    const raw = Math.round(settings.systemRamMb * 0.5 / 512) * 512;
    const recommended = Math.min(Math.max(raw, 2048), Math.max(2048, settings.systemRamMb - 2048));
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
    const nameEl = document.createElement('span');
    nameEl.className = 'server-name';
    nameEl.textContent = server.name;
    const descEl = document.createElement('span');
    descEl.className = 'server-desc';
    descEl.textContent = server.description || '';
    main.appendChild(nameEl);
    main.appendChild(descEl);

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

function addModalSelect(labelText, options, selected) {
  const row = document.createElement('div');
  row.className = 'modal-field-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const select = document.createElement('select');
  select.className = 'field';
  options.forEach((opt) => {
    const optionEl = document.createElement('option');
    optionEl.value = opt;
    optionEl.textContent = opt;
    if (opt === selected) optionEl.selected = true;
    select.appendChild(optionEl);
  });
  row.appendChild(label);
  row.appendChild(select);
  modalFields.appendChild(row);
  return select;
}

function addModalCheckbox(labelText, checked) {
  const row = document.createElement('label');
  row.className = 'checkbox-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  row.appendChild(input);
  row.appendChild(span);
  modalFields.appendChild(row);
  return input;
}

// Comme addModalCheckbox, mais en radio (un seul choix par `groupName`) —
// pour des addons mutuellement exclusifs (ex: Fabulously Optimized vs
// Fresh Animations, incompatibles ensemble).
function addModalRadio(labelText, groupName, checked) {
  const row = document.createElement('label');
  row.className = 'checkbox-row';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = `addon-group-${groupName}`;
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  row.appendChild(input);
  row.appendChild(span);
  modalFields.appendChild(row);
  return input;
}

// Modal à cases à cocher pour les mods/shaders optionnels (kind: 'mods' ou
// 'shaders') — activés côté joueur, en plus du modpack du serveur.
async function openAddonModal(kind) {
  const [catalog, settings] = await Promise.all([window.api.getAddonCatalog(), window.api.getSettings()]);
  const items = catalog[kind];
  const enabled = new Set(settings.enabledAddons || []);

  modalTitle.textContent = window.i18n.t(kind === 'mods' ? 'addons.modsTitle' : 'addons.shadersTitle');
  modalFields.innerHTML = '';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.marginBottom = '8px';
  hint.textContent = window.i18n.t('addons.hint');
  modalFields.appendChild(hint);

  // Les addons qui partagent un `group` (ex: Fabulously Optimized / Fresh
  // Animations, incompatibles ensemble) s'affichent en radio — un seul
  // choix possible — le reste en cases à cocher indépendantes.
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
    groupItems.forEach((item) => {
      controls.push({ item, input: addModalRadio(item.name, item.group, enabled.has(item.id)) });
    });
  }
  standalone.forEach((item) => {
    controls.push({ item, input: addModalCheckbox(item.name, enabled.has(item.id)) });
  });

  modalSaveBtn.onclick = async () => {
    const otherKind = kind === 'mods' ? catalog.shaders : catalog.mods;
    const keptIds = (settings.enabledAddons || []).filter((id) => otherKind.some((i) => i.id === id));
    const newIds = controls.filter((c) => c.input.checked).map((c) => c.item.id);
    await window.api.setEnabledAddons([...keptIds, ...newIds]);
    closeModal();
  };
  modalOverlay.classList.add('active');
}

document.getElementById('mods-btn').addEventListener('click', () => openAddonModal('mods'));
document.getElementById('shaders-btn').addEventListener('click', () => openAddonModal('shaders'));

function openEditServerModal(server) {
  modalTitle.textContent = window.i18n.t('modal.editTitle', { name: server.name });
  modalFields.innerHTML = '';
  const nameInput = addModalField(window.i18n.t('field.name'), { value: server.name, placeholder: 'Mon serveur' });
  const ipInput = addModalField(window.i18n.t('field.ip'), { value: server.ip, placeholder: 'play.exemple.fr' });
  const portInput = addModalField(window.i18n.t('field.port'), { type: 'number', value: server.port || 25565 });
  const loaderSelect = addModalSelect(window.i18n.t('field.loader'), ['vanilla', 'fabric', 'forge', 'neoforge'], server.loader);
  const versionInput = addModalField(window.i18n.t('field.mcVersion'), { value: server.mcVersion, placeholder: '1.21.1' });
  const iconInput = addModalField(window.i18n.t('field.icon'), { value: server.icon || '', placeholder: 'https://.../icone.png' });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'modal-delete-btn';
  deleteBtn.textContent = window.i18n.t('server.deleteButton');
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(window.i18n.t('server.deleteConfirm', { name: server.name }))) return;
    const result = await window.api.removeServer(server.id);
    if (!result.success) {
      alert(result.error);
      return;
    }
    closeModal();
    await loadServerList();
    refreshServerStatus();
  });
  modalFields.appendChild(deleteBtn);

  modalSaveBtn.onclick = async () => {
    const ip = ipInput.value.trim();
    if (!ip) return;
    const port = Number(portInput.value) || 25565;
    await window.api.updateServer(server.id, {
      name: nameInput.value.trim(),
      ip,
      port,
      loader: loaderSelect.value,
      mcVersion: versionInput.value.trim(),
      icon: iconInput.value.trim()
    });
    closeModal();
    await loadServerList();
    refreshServerStatus();
  };
  modalOverlay.classList.add('active');
}

function openAddServerModal() {
  modalTitle.textContent = window.i18n.t('modal.addTitle');
  modalFields.innerHTML = '';
  const nameInput = addModalField(window.i18n.t('field.name'), { placeholder: 'Mon serveur' });
  const descInput = addModalField(window.i18n.t('field.description'), { placeholder: 'Fabric 1.21 — Survie' });
  const ipInput = addModalField(window.i18n.t('field.ip'), { placeholder: 'play.exemple.fr' });
  const portInput = addModalField(window.i18n.t('field.port'), { type: 'number', value: 25565 });
  const loaderSelect = addModalSelect(window.i18n.t('field.loader'), ['vanilla', 'fabric', 'forge', 'neoforge'], 'fabric');
  const versionInput = addModalField(window.i18n.t('field.mcVersion'), { placeholder: '1.21.1' });
  const manifestInput = addModalField(window.i18n.t('field.manifestUrl'), { placeholder: 'fabulously-optimized, .mrpack, ou manifest.json' });
  const iconInput = addModalField(window.i18n.t('field.icon'), { placeholder: 'https://.../icone.png' });

  modalSaveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    const ip = ipInput.value.trim();
    if (!name || !ip) return;
    await window.api.addServer({
      name,
      description: descInput.value.trim(),
      ip,
      port: Number(portInput.value) || 25565,
      loader: loaderSelect.value,
      mcVersion: versionInput.value.trim(),
      loaderVersion: '',
      manifestUrl: manifestInput.value.trim(),
      icon: iconInput.value.trim()
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
  viewer.zoom = 0.75;
  viewer.controls.enableZoom = false;
  viewer.controls.enablePan = false;
  viewer.controls.minPolarAngle = Math.PI / 2;
  viewer.controls.maxPolarAngle = Math.PI / 2;
  return viewer;
}
const skinViewer = makeSkinViewer('skin-3d-canvas', 320, 440);
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

document.getElementById('skin-search-btn').addEventListener('click', async () => {
  const username = document.getElementById('skin-search-input').value.trim();
  const statusEl = document.getElementById('skin-status');
  const applyBtn = document.getElementById('skin-apply-btn');
  if (!username) return;

  applyBtn.hidden = true;
  foundSkin = null;
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
  }
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

// --- Galeries de streamers (curées à la main, voir skinCategories.js) ---
function renderSkinGallery(containerEl, players) {
  containerEl.innerHTML = '';
  players.forEach((player) => {
    const item = document.createElement('div');
    item.className = 'skin-gallery-item';
    item.title = player.name;

    const img = document.createElement('img');
    img.src = player.skinUrl;
    img.alt = player.name;
    item.appendChild(img);

    item.addEventListener('click', () => {
      foundSkin = player;
      loadSkinEverywhere(player.skinUrl);
      document.getElementById('skin-apply-btn').hidden = false;
      document.getElementById('skin-status').textContent = '';
    });

    containerEl.appendChild(item);
  });
}

async function loadStreamerGalleries() {
  const { en, fr } = await window.api.getStreamerSkins();
  renderSkinGallery(document.getElementById('skin-gallery-fr'), fr);
  renderSkinGallery(document.getElementById('skin-gallery-en'), en);
}
loadStreamerGalleries();

// --- Éditeur de skin plein écran : ouverture/fermeture ---
const skinEditorOverlay = document.getElementById('skin-editor-overlay');
document.getElementById('skin-fab').addEventListener('click', () => {
  skinEditorOverlay.classList.add('active');
  loadStreamerGalleries(); // toujours à jour (skin actuel des streamers) à l'ouverture
});
document.getElementById('skin-editor-close').addEventListener('click', () => {
  skinEditorOverlay.classList.remove('active');
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
