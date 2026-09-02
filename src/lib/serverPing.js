// Implémentation du protocole "Server List Ping" de Minecraft.
// Envoie un handshake + status request en brut TCP, sans dépendance externe.
// Doc du protocole : wiki.vg/Server_List_Ping

const net = require('net');
const dns = require('dns').promises;

/**
 * Le client Minecraft officiel résout un enregistrement DNS SRV
 * (_minecraft._tcp.<host>) quand on rentre juste un nom de domaine, pour
 * trouver le vrai host:port du serveur (souvent différent du port par
 * défaut 25565, ex: derrière un proxy Velocity/BungeeCord). Sans ça, on
 * tape sur le mauvais port et le serveur paraît injoignable alors qu'il
 * tourne bien. Ignoré silencieusement si pas de SRV (IP littérale, ou
 * domaine sans SRV configuré) : on garde alors host/port tels quels.
 */
async function resolveServerAddress(host, port) {
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records && records.length > 0) {
      records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return { host: records[0].name, port: records[0].port };
    }
  } catch {
    // pas de SRV pour ce host (ou IP littérale) : on garde tel quel
  }
  return { host, port };
}

function writeVarInt(value) {
  const bytes = [];
  do {
    let temp = value & 0b01111111;
    value >>>= 7;
    if (value !== 0) temp |= 0b10000000;
    bytes.push(temp);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
  let value = 0;
  let length = 0;
  let currentByte;
  do {
    currentByte = buffer[offset + length];
    value |= (currentByte & 0b01111111) << (7 * length);
    length++;
    if (length > 5) throw new Error('VarInt trop long');
  } while ((currentByte & 0b10000000) !== 0);
  return { value, length };
}

function buildHandshakePacket(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const payload = Buffer.concat([
    writeVarInt(0x00), // packet id: handshake
    writeVarInt(770), // protocol version (1.21.x) — purement indicatif pour le ping
    writeVarInt(hostBuf.length),
    hostBuf,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1) // next state: status
  ]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function buildStatusRequestPacket() {
  const payload = writeVarInt(0x00);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

/**
 * Ping un serveur Minecraft et retourne son statut.
 * @returns {Promise<{online: boolean, motd?: string, playersOnline?: number, playersMax?: number, ping?: number, sample?: Array}>}
 */
async function pingServer(host, port, timeoutMs = 4000) {
  const resolved = await resolveServerAddress(host, port);
  return pingResolved(resolved.host, resolved.port, timeoutMs);
}

function pingResolved(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    const startTime = Date.now();
    let handshakeSent = false;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timeout: serveur injoignable'));
    }, timeoutMs);

    socket.connect(port, host, () => {
      const handshake = buildHandshakePacket(host, port);
      const statusReq = buildStatusRequestPacket();
      socket.write(Buffer.concat([handshake, statusReq]));
      handshakeSent = true;
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const { value: packetLength, length: lenBytes } = readVarInt(buffer, 0);
        if (buffer.length < lenBytes + packetLength) return; // attendre le reste

        let offset = lenBytes;
        const { length: idBytes } = readVarInt(buffer, offset);
        offset += idBytes;
        const { value: strLength, length: strLenBytes } = readVarInt(buffer, offset);
        offset += strLenBytes;
        const jsonStr = buffer.slice(offset, offset + strLength).toString('utf8');

        const data = JSON.parse(jsonStr);
        const ping = Date.now() - startTime;

        clearTimeout(timer);
        socket.destroy();

        resolve({
          online: true,
          motd: typeof data.description === 'string'
            ? data.description
            : (data.description?.text || ''),
          playersOnline: data.players?.online ?? 0,
          playersMax: data.players?.max ?? 0,
          sample: data.players?.sample || [], // [{name, id (uuid)}]
          favicon: data.favicon || null, // data:image/png;base64,... (icône 64x64 du serveur)
          ping
        });
      } catch (err) {
        // paquet incomplet, on attend la suite des données
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on('close', () => {
      if (!handshakeSent) {
        clearTimeout(timer);
        reject(new Error('Connexion fermée avant le handshake'));
      }
    });
  });
}

module.exports = { pingServer, resolveServerAddress };
