// --- Fenêtre custom ---
document.getElementById('minimize-btn').addEventListener('click', () => window.api.minimize());
document.getElementById('close-btn').addEventListener('click', () => window.api.close());

// --- Musique de fond (démarrage au premier clic, contrainte des navigateurs) ---
const music = document.getElementById('bg-music');
const muteBtn = document.getElementById('mute-btn');
let musicStarted = false;

function startMusicOnce() {
  if (musicStarted) return;
  musicStarted = true;
  music.volume = 0.4;
  music.play().catch(() => {}); // ignore si le fichier n'existe pas encore
  document.removeEventListener('click', startMusicOnce);
}
document.addEventListener('click', startMusicOnce);

muteBtn.addEventListener('click', () => {
  music.muted = !music.muted;
  muteBtn.textContent = music.muted ? '🔇' : '🔊';
});

// --- Navigation entre écrans ---
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    navItems.forEach((b) => b.classList.remove('active'));
    screens.forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`screen-${btn.dataset.screen}`).classList.add('active');

    if (btn.dataset.screen === 'play') {
      loadServerList();
      refreshServerStatus();
    }
  });
});

// --- Chargement des réglages sauvegardés ---
async function loadSettings() {
  const settings = await window.api.getSettings();
  document.getElementById('username-input').value = settings.username || '';
  document.getElementById('username-settings-input').placeholder = settings.username || 'Nouveau pseudo';
  document.getElementById('ram-slider').value = settings.ramMb;
  document.getElementById('ram-value').textContent = `${(settings.ramMb / 1024).toFixed(1)} Go`;
}
loadSettings();

// --- Écran Play : liste des serveurs ---
async function loadServerList() {
  const servers = await window.api.getServers();
  const settings = await window.api.getSettings();
  const listEl = document.getElementById('server-list');
  listEl.innerHTML = '';

  servers.forEach((server) => {
    const card = document.createElement('div');
    card.className = 'server-card' + (server.id === settings.selectedServerId ? ' selected' : '');
    card.innerHTML = `
      <span class="server-name">${server.name}</span>
      <span class="server-desc">${server.description}</span>
    `;
    card.addEventListener('click', async () => {
      await window.api.setSelectedServer(server.id);
      document.querySelectorAll('.server-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      refreshServerStatus();
    });
    listEl.appendChild(card);
  });
}

// --- Écran Connexion ---
document.getElementById('save-username-btn').addEventListener('click', async () => {
  const value = document.getElementById('username-input').value.trim();
  if (!value) return;
  await window.api.setUsername(value);
});

// --- Écran Paramètres ---
const ramSlider = document.getElementById('ram-slider');
ramSlider.addEventListener('input', () => {
  document.getElementById('ram-value').textContent = `${(ramSlider.value / 1024).toFixed(1)} Go`;
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  await window.api.setRam(Number(ramSlider.value));
  const newUsername = document.getElementById('username-settings-input').value.trim();
  if (newUsername) {
    await window.api.setUsername(newUsername);
    document.getElementById('username-input').value = newUsername;
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
document.getElementById('play-btn').addEventListener('click', async () => {
  const progressEl = document.getElementById('launch-progress');
  progressEl.textContent = 'Lancement en cours…';
  const result = await window.api.launchGame();
  if (!result.success) {
    progressEl.textContent = `Erreur : ${result.error}`;
  }
});
