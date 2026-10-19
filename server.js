const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());
/* La página (index.html, style.css) vive en la carpeta flota/ */
app.use(express.static(path.join(__dirname, 'flota')));

const db = new Database(path.join(__dirname, 'RefrescoJunin.db'));
db.pragma('foreign_keys = ON');

/* =====================================================================
   ESQUEMA
   Las tablas Checklists y ChecklistItems las creó León en la base.
   Acá solo nos aseguramos de que existan (para quien clone el repo sin
   la base) y le sumamos la columna "categoria" a ChecklistItems, que
   hace falta para la checklist agrupada por categorías.
   ===================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS Checklists (
    id_checklist INTEGER PRIMARY KEY AUTOINCREMENT,
    id_camion INTEGER NOT NULL,          -- apunta a Camiones
    dni_conductor TEXT NOT NULL,
    km INTEGER NOT NULL,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(id_camion) REFERENCES Camiones(id_camion)
  );

  CREATE TABLE IF NOT EXISTS ChecklistItems (
    id_item     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_checklist INTEGER NOT NULL,
    item TEXT NOT NULL,                  -- "Luces", "Frenos"...
    resultado TEXT NOT NULL CHECK(resultado IN ('Sí', 'No')),
    categoria TEXT,                      -- "Frenos", "Motor"... (agregada)
    FOREIGN KEY(id_checklist) REFERENCES Checklists(id_checklist) ON DELETE CASCADE
  );
`);
const columnasItems = db.prepare('PRAGMA table_info(ChecklistItems)').all();
if (!columnasItems.some(c => c.name === 'categoria')) {
  db.exec("ALTER TABLE ChecklistItems ADD COLUMN categoria TEXT");
  console.log('Se agregó la columna categoria a ChecklistItems');
}

/* =====================================================================
   AUTENTICACIÓN
   - Usuarios: dni + contraseña hasheada con scrypt (nunca en texto plano)
   - Sesiones: token aleatorio por pestaña, con vencimiento de 7 días
   ===================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS Usuarios (
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    dni TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'conductor' CHECK(rol IN ('conductor', 'admin')),
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS Sesiones (
    token TEXT PRIMARY KEY,
    id_usuario INTEGER NOT NULL,
    creada_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    expira_en TEXT NOT NULL,
    FOREIGN KEY(id_usuario) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
  );
`);
/* Sesiones vencidas no sirven para nada: se borran al arrancar */
db.prepare("DELETE FROM Sesiones WHERE expira_en <= datetime('now')").run();

/* hashear(pass) → "scrypt$salt$hash"; verificar() vuelve a hashear y compara */
function hashear(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verificar(pass, guardado) {
  const [, salt, hash] = String(guardado).split('$');
  const intento = crypto.scryptSync(pass, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(intento, 'hex'));
}

const crearSesion = db.prepare(`
  INSERT INTO Sesiones (token, id_usuario, expira_en)
  VALUES (?, ?, datetime('now', '+7 days'))
`);
function abrirSesion(idUsuario) {
  const token = crypto.randomBytes(32).toString('hex');
  crearSesion.run(token, idUsuario);
  return token;
}

/* Si todavía no hay ningún admin, se crea el inicial (dni: admin) */
if (!db.prepare("SELECT 1 FROM Usuarios WHERE rol = 'admin'").get()) {
  db.prepare("INSERT INTO Usuarios (dni, pass_hash, rol) VALUES (?, ?, 'admin')")
    .run('admin', hashear('admin123'));
  console.log("Usuario admin inicial creado → dni: admin, contraseña: admin123 (cambiala)");
}

/* Middleware: exige un token de sesión válido */
function requiereAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const sesion = db.prepare(`
    SELECT u.dni, u.rol
    FROM Sesiones s
    JOIN Usuarios u ON u.id_usuario = s.id_usuario
    WHERE s.token = ? AND s.expira_en > datetime('now')
  `).get(token);
  if (!sesion) return res.status(401).json({ error: 'No hay sesión iniciada o expiró' });
  req.usuario = sesion;
  next();
}
/* Middleware: además del token, pide rol admin */
function requiereAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Requiere rol administrador' });
  next();
}

/* ---------- NÓMINA DE EMPLEADOS ----------
   Los usuarios de conductor se atan al DNI de la tabla Empleados:
   solo puede tener cuenta quien figura como "chofer" en la nómina */
const buscarEmpleado = db.prepare('SELECT dni, nombre, apellido, cargo FROM Empleados WHERE dni = ?');
const buscarUsuario = db.prepare('SELECT * FROM Usuarios WHERE dni = ?');
function validarChofer(dni) {
  const e = buscarEmpleado.get(dni);
  if (!e) return { error: 'Ese DNI no figura en la nómina de empleados' };
  if (String(e.cargo || '').trim().toLowerCase() !== 'chofer') {
    return { error: 'Ese DNI no está registrado como chofer en la nómina' };
  }
  return { empleado: e };
}

app.post('/api/auth/registro', (req, res) => {
  const dni = String((req.body || {}).dni || '').trim();
  const pass = String((req.body || {}).pass || '');
  if (!/^\d{7,8}$/.test(dni)) {
    return res.status(400).json({ error: 'El DNI debe tener 7 u 8 dígitos' });
  }
  if (pass.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const { error } = validarChofer(dni);
  if (error) return res.status(403).json({ error });
  if (buscarUsuario.get(dni)) {
    return res.status(409).json({ error: 'Ese DNI ya está registrado' });
  }
  try {
    /* El rol nunca viene del cliente: te registrás como conductor */
    const { lastInsertRowid } = db.prepare('INSERT INTO Usuarios (dni, pass_hash) VALUES (?, ?)')
      .run(dni, hashear(pass));
    res.json({ token: abrirSesion(lastInsertRowid), dni, rol: 'conductor' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const dni = String((req.body || {}).dni || '').trim();
  const pass = String((req.body || {}).pass || '');
  const u = db.prepare('SELECT * FROM Usuarios WHERE dni = ?').get(dni);
  /* Mismo mensaje y mismo tiempo de respuesta si no existe el DNI o falla
     la contraseña: así no se adivina qué DNIs están registrados */
  if (!u || !verificar(pass, u.pass_hash)) {
    return res.status(401).json({ error: 'DNI o contraseña incorrectos' });
  }
  res.json({ token: abrirSesion(u.id_usuario), dni: u.dni, rol: u.rol });
});

app.get('/api/auth/me', requiereAuth, (req, res) => {
  res.json(req.usuario);
});

app.post('/api/auth/logout', requiereAuth, (req, res) => {
  db.prepare('DELETE FROM Sesiones WHERE token = ?')
    .run(String(req.headers.authorization || '').replace(/^Bearer /, ''));
  res.json({ ok: true });
});

/* ---------- GESTIÓN DE USUARIOS (solo admin) ---------- */
/* Usuarios registrados, con el nombre y cargo que salen de Empleados (por DNI) */
app.get('/api/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const filas = db.prepare(`
      SELECT u.dni, u.rol, u.creado_en, e.nombre, e.apellido, e.cargo
      FROM Usuarios u
      LEFT JOIN Empleados e ON e.dni = u.dni
      ORDER BY u.rol DESC, e.apellido, e.nombre
    `).all();
    res.json(filas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Alta de la cuenta de un chofer desde el panel de admin */
app.post('/api/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  const dni = String((req.body || {}).dni || '').trim();
  const pass = String((req.body || {}).pass || '');
  if (pass.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const { error } = validarChofer(dni);
  if (error) return res.status(403).json({ error });
  if (buscarUsuario.get(dni)) {
    return res.status(409).json({ error: 'Ese DNI ya tiene usuario' });
  }
  try {
    db.prepare('INSERT INTO Usuarios (dni, pass_hash) VALUES (?, ?)').run(dni, hashear(pass));
    res.json({ ok: true, dni, rol: 'conductor' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   CHECKLISTS: el historial de la web vive en la base, no en el navegador
   ===================================================================== */
const buscarCamion = db.prepare('SELECT id_camion FROM Camiones WHERE patente = ?');
const crearCamion = db.prepare('INSERT INTO Camiones (patente) VALUES (?)');
const insertChecklist = db.prepare(`
  INSERT INTO Checklists (id_camion, dni_conductor, km, fecha)
  VALUES (@id_camion, @dni_conductor, @km, @fecha)
`);
const insertItem = db.prepare(`
  INSERT INTO ChecklistItems (id_checklist, item, resultado, categoria)
  VALUES (?, ?, ?, ?)
`);
/* Guardar checklist + sus ítems en una sola transacción: o entra todo o no entra nada */
const guardarChecklist = db.transaction((c) => {
  /* La patente tiene que existir en Camiones. Si es nueva, la damos de alta
     con lo mínimo (patente); el resto de los datos se completan después */
  let camion = buscarCamion.get(c.patente);
  if (!camion) camion = { id_camion: crearCamion.run(c.patente).lastInsertRowid };
  const { lastInsertRowid } = insertChecklist.run({
    id_camion: camion.id_camion,
    dni_conductor: c.dni,
    km: c.km,
    fecha: c.fecha,
  });
  for (const it of c.items) {
    insertItem.run(lastInsertRowid, it.item, it.resultado, it.categoria || null);
  }
  return lastInsertRowid;
});

app.post('/api/checklists', requiereAuth, (req, res) => {
  const { patente, km, fecha, items } = req.body || {};
  /* El DNI no viene del formulario: sale de la sesión activa */
  const dni = req.usuario.dni;
  if (!dni || !patente || !km || !fecha) {
    return res.status(400).json({ error: 'Faltan datos del vehículo (DNI, patente, km o fecha)' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'La checklist no tiene ítems' });
  }
  for (const it of items) {
    if (!it.item || (it.resultado !== 'Sí' && it.resultado !== 'No')) {
      return res.status(400).json({ error: 'Ítem inválido: cada uno necesita item y resultado (Sí/No)' });
    }
  }
  try {
    const id = guardarChecklist({ dni, patente: String(patente).toUpperCase(), km, fecha, items });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/checklists', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const filas = db.prepare(`
      SELECT c.id_checklist, c.dni_conductor, c.km, c.fecha, cam.patente
      FROM Checklists c
      JOIN Camiones cam ON cam.id_camion = c.id_camion
      ORDER BY c.id_checklist
    `).all();
    const losItems = db.prepare(`
      SELECT item, categoria, resultado
      FROM ChecklistItems
      WHERE id_checklist = ?
      ORDER BY id_item
    `);
    for (const f of filas) f.items = losItems.all(f.id_checklist);
    res.json(filas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================================
   DATOS DE LA FLOTA (tablas que ya existían en la base)
   ===================================================================== */
app.get('/api/empleados', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM Empleados ORDER BY id_empleado').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/camiones', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM Camiones ORDER BY id_camion').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vtv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM VTV ORDER BY id_vtv').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/arreglos', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM Arreglos ORDER BY id_arreglo').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
