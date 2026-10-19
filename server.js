const express = require('express');
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

app.post('/api/checklists', (req, res) => {
  const { dni, patente, km, fecha, items } = req.body || {};
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

app.get('/api/checklists', (req, res) => {
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
