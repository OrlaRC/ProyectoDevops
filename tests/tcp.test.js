// Pruebas del servidor TCP personalizado (protocolo {insert:<json>} / {get:<id>}).
// El servidor se levanta en un puerto efímero (0) solo para esta suite,
// aislado de la base de datos real y de los demás archivos de prueba.

const fs = require('fs');
const path = require('path');
const net = require('net');

const TCP_TEST_DB_PATH = path.join(__dirname, 'test-database-tcp.db');
if (fs.existsSync(TCP_TEST_DB_PATH)) fs.unlinkSync(TCP_TEST_DB_PATH);
process.env.DB_PATH = TCP_TEST_DB_PATH;

const { db, tcpServer } = require('../index');

let port;

beforeAll((done) => {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )`,
      () => {
        tcpServer.listen(0, () => {
          port = tcpServer.address().port;
          done();
        });
      }
    );
  });
});

afterAll((done) => {
  tcpServer.close(() => {
    db.close(() => {
      if (fs.existsSync(TCP_TEST_DB_PATH)) fs.unlinkSync(TCP_TEST_DB_PATH);
      done();
    });
  });
});

// Envía una lista de comandos sobre una misma conexión y devuelve las
// respuestas (una por línea) ya parseadas como JSON.
function sendCommands(commands) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1', () => {
      commands.forEach((cmd) => socket.write(cmd + '\n'));
    });
    socket.setEncoding('utf8');
    let buffer = '';
    const responses = [];
    const timeout = setTimeout(() => {
      socket.end();
      reject(new Error('Timeout esperando respuestas del servidor TCP'));
    }, 3000);

    socket.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        responses.push(JSON.parse(buffer.slice(0, idx)));
        buffer = buffer.slice(idx + 1);
      }
      if (responses.length === commands.length) {
        clearTimeout(timeout);
        socket.end();
        resolve(responses);
      }
    });
    socket.on('error', reject);
  });
}

describe('Servidor TCP: comando insert', () => {
  test('inserta un usuario válido y responde 200 con el id asignado', async () => {
    const [res] = await sendCommands([
      '{insert:{"nombre":"TCP User","email":"tcp.user@example.com"}}',
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.data).toMatchObject({ nombre: 'TCP User', email: 'tcp.user@example.com' });
    expect(res.data).toHaveProperty('id');
  });

  test('escenario de fallo: JSON inválido en el payload', async () => {
    const [res] = await sendCommands(['{insert:{nombre sin comillas}}']);
    expect(res.statusCode).toBe(400);
    expect(res.data).toMatch(/JSON inválido/);
  });

  test('escenario de fallo: faltan nombre o email', async () => {
    const [res] = await sendCommands(['{insert:{"nombre":"Sin Email"}}']);
    expect(res.statusCode).toBe(400);
    expect(res.data).toMatch(/nombre y email/);
  });

  test('escenario de fallo: email duplicado', async () => {
    const [res] = await sendCommands([
      '{insert:{"nombre":"Duplicado","email":"tcp.user@example.com"}}',
    ]);
    expect(res.statusCode).toBe(400);
  });
});

describe('Servidor TCP: comando get', () => {
  let usuarioId;

  beforeAll(async () => {
    const [res] = await sendCommands([
      '{insert:{"nombre":"Get Target","email":"get.target@example.com"}}',
    ]);
    usuarioId = res.data.id;
  });

  test('consulta un usuario existente por id', async () => {
    const [res] = await sendCommands([`{get:${usuarioId}}`]);
    expect(res.statusCode).toBe(200);
    expect(res.data.email).toBe('get.target@example.com');
  });

  test('escenario de fallo: id que no existe devuelve data null', async () => {
    const [res] = await sendCommands(['{get:999999}']);
    expect(res.statusCode).toBe(200);
    expect(res.data).toBeNull();
  });

  test('escenario de fallo: id no numérico', async () => {
    const [res] = await sendCommands(['{get:abc}']);
    expect(res.statusCode).toBe(400);
    expect(res.data).toMatch(/id inválido/);
  });
});

describe('Servidor TCP: comandos combinados y protocolo', () => {
  test('insert y luego get recuperan exactamente el mismo registro', async () => {
    const [insertRes] = await sendCommands([
      '{insert:{"nombre":"Combo","email":"combo@example.com"}}',
    ]);
    expect(insertRes.statusCode).toBe(200);

    const [getRes] = await sendCommands([`{get:${insertRes.data.id}}`]);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.data.email).toBe('combo@example.com');
  });

  test('escenario de fallo: comando no reconocido', async () => {
    const [res] = await sendCommands(['{update:1}']);
    expect(res.statusCode).toBe(400);
    expect(res.data).toMatch(/Comando no reconocido/);
  });

  test('escenario de fallo: línea que no respeta el formato {accion:payload}', async () => {
    const [res] = await sendCommands(['esto no es un comando valido']);
    expect(res.statusCode).toBe(400);
  });
});
