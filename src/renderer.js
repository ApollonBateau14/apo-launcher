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
  muteBtn.title = music.muted ? 'Remettre le son' : 'Couper le son';
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
async function loadSettings() {
  const settings = await window.api.getSettings();
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
    editBtn.title = "Modifier l'IP";
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

function openEditServerModal(server) {
  modalTitle.textContent = `Modifier ${server.name}`;
  modalFields.innerHTML = '';
  const ipInput = addModalField('Adresse IP', { value: server.ip, placeholder: 'play.exemple.fr' });
  const portInput = addModalField('Port', { type: 'number', value: server.port || 25565 });
  const loaderSelect = addModalSelect('Loader', ['vanilla', 'fabric', 'forge', 'neoforge'], server.loader);
  const versionInput = addModalField('Version Minecraft', { value: server.mcVersion, placeholder: '1.21.1' });
  const iconInput = addModalField('URL icône (optionnel)', { value: server.icon || '', placeholder: 'https://.../icone.png' });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'modal-delete-btn';
  deleteBtn.textContent = 'Supprimer ce serveur';
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Supprimer ${server.name} ? Cette action est définitive.`)) return;
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
  modalTitle.textContent = 'Ajouter un serveur';
  modalFields.innerHTML = '';
  const nameInput = addModalField('Nom', { placeholder: 'Mon serveur' });
  const descInput = addModalField('Description', { placeholder: 'Fabric 1.21 — Survie' });
  const ipInput = addModalField('Adresse IP', { placeholder: 'play.exemple.fr' });
  const portInput = addModalField('Port', { type: 'number', value: 25565 });
  const loaderSelect = addModalSelect('Loader', ['vanilla', 'fabric', 'forge', 'neoforge'], 'fabric');
  const versionInput = addModalField('Version Minecraft', { placeholder: '1.21.1' });
  const manifestInput = addModalField('URL manifest modpack (optionnel)', { placeholder: 'https://raw.githubusercontent.com/...' });
  const iconInput = addModalField('URL icône (optionnel)', { placeholder: 'https://.../icone.png' });

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
  statusEl.textContent = 'Vérification…';
  const result = await window.api.checkForUpdates();
  if (result.error) {
    statusEl.textContent = result.error;
  } else if (result.upToDate) {
    statusEl.textContent = `À jour (v${result.current}).`;
  } else {
    statusEl.textContent = `Nouvelle version disponible : v${result.latest} (actuelle : v${result.current}).`;
  }
});

// --- Écran Play : statut serveur ---
async function refreshServerStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const details = document.getElementById('status-details');

  dot.className = 'status-dot';
  text.textContent = 'Vérification du serveur…';
  details.textContent = '';

  const result = await window.api.pingServer();

  if (result.online) {
    dot.classList.add('online');
    text.textContent = 'Serveur en ligne';
    details.textContent = `${result.playersOnline}/${result.playersMax} joueurs · ${result.ping} ms`;
  } else {
    dot.classList.add('offline');
    text.textContent = 'Serveur injoignable';
    details.textContent = result.error || '';
  }
}

// --- Écran Play : lancer le jeu ---
const launchProgressEl = document.getElementById('launch-progress');

window.api.onLaunchProgress((progress) => {
  if (progress.task === 'java-download-start') {
    launchProgressEl.textContent = `Téléchargement de Java ${progress.majorVersion}…`;
  } else if (progress.task === 'java-download-progress') {
    launchProgressEl.textContent = `Téléchargement de Java ${progress.majorVersion}… ${Math.round(progress.ratio * 100)}%`;
  } else if (progress.task === 'java-download-done') {
    launchProgressEl.textContent = 'Java prêt, préparation du jeu…';
  } else if (progress.task === 'loader-check') {
    launchProgressEl.textContent = progress.loader && progress.loader !== 'vanilla'
      ? `Préparation du loader (${progress.loader})…`
      : 'Préparation du jeu…';
  } else if (progress.task === 'mc-download') {
    launchProgressEl.textContent = `Téléchargement de Minecraft (${progress.type})…`;
  } else if (progress.task === 'modpack-check') {
    launchProgressEl.textContent = 'Vérification du modpack…';
  } else if (progress.task === 'modpack-download') {
    launchProgressEl.textContent = `Téléchargement des mods… (${progress.file})`;
  }
});

document.getElementById('play-btn').addEventListener('click', async () => {
  launchProgressEl.textContent = 'Lancement en cours…';
  const result = await window.api.launchGame();
  if (!result.success) {
    launchProgressEl.textContent = `Erreur : ${result.error}`;
  }
});
