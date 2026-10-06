const net = require('net');

const HOST = '100.22.29.28';
const PORT = 6061;

const email = `demo${Date.now()}@test.com`;

const socket = net.createConnection(PORT, HOST, () => {
  console.log(`Conectado al servidor TCP en ${HOST}:${PORT}`);
  socket.write(`{insert:{"nombre":"Demo","email":"${email}"}}\n`);
});

socket.setEncoding('utf8');
socket.on('data', (d) => console.log('Respuesta:', d.trim()));
socket.on('error', (e) => console.log('ERROR:', e.message));

setTimeout(() => socket.end(), 2000);
