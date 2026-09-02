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

function goToScreen(screenName) {
  navItems.forEach((b) => b.classList.remove('active'));
  screens.forEach((s) => s.classList.remove('active'));
  document.querySelector(`.nav-item[data-screen="${screenName}"]`).classList.add('active');
  document.getElementById(`screen-${screenName}`).classList.add('active');

  if (screenName === 'play') {
    loadServerList();
    refreshServerStatus();
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

async function loadSettings() {
  const settings = await window.api.getSettings();

  window.i18n.setLang(settings.language || 'en');
  setActiveLangButton(window.i18n.getLang());
  muteBtn.title = window.i18n.t(music.muted ? 'mute.unmute' : 'mute.mute');

  document.getElementById('username-input').value = settings.username || '';
  document.getElementById('ram-slider').value = settings.ramMb;
  document.getElementById('ram-value').textContent = `${(settings.ramMb / 1024).toFixed(1)} Go`;

  const volume = settings.musicVolume ?? 10;
  document.getElementById('volume-slider').value = volume;
  document.getElementById('volume-value').textContent = `${volume} %`;
  currentMusicVolume = volume / 100;
  music.volume = currentMusicVolume;

  document.getElementById('app-version').textContent = settings.appVersion ? `v${settings.appVersion}` : '';

  // Pseudo déjà défini lors d'un lancement précédent : direct sur Play.
  if (settings.username) goToScreen('play');
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
}
modalCancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
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

  const checkboxes = items.map((item) => ({ item, input: addModalCheckbox(item.name, enabled.has(item.id)) }));

  modalSaveBtn.onclick = async () => {
    const otherKind = kind === 'mods' ? catalog.shaders : catalog.mods;
    const keptIds = (settings.enabledAddons || []).filter((id) => otherKind.some((i) => i.id === id));
    const newIds = checkboxes.filter((c) => c.input.checked).map((c) => c.item.id);
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

document.getElementById('check-updates-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('update-status');
  statusEl.textContent = window.i18n.t('update.checking');
  const result = await window.api.checkForUpdates();
  if (result.error) {
    statusEl.textContent = result.error;
  } else if (result.upToDate) {
    statusEl.textContent = window.i18n.t('update.upToDate', { version: result.current });
  } else {
    statusEl.textContent = window.i18n.t('update.newVersion', { latest: result.latest, current: result.current });
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

document.getElementById('play-btn').addEventListener('click', async () => {
  launchProgressEl.textContent = window.i18n.t('launch.starting');
  const result = await window.api.launchGame();
  if (!result.success) {
    launchProgressEl.textContent = window.i18n.t('launch.error', { error: result.error });
  } else {
    fadeOutMusic();
  }
});
