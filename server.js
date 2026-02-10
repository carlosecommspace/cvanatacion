const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Database setup
const db = new Database(path.join(dataDir, 'swimming.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS swimmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    share_number INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meters_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    swimmer_id INTEGER NOT NULL,
    meters INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
  );
`);

// Migrate: rename category to share_number if needed
const columns = db.prepare("PRAGMA table_info(swimmers)").all();
const hasCategory = columns.some(c => c.name === 'category');
const hasShareNumber = columns.some(c => c.name === 'share_number');
if (hasCategory && !hasShareNumber) {
  db.exec('ALTER TABLE swimmers RENAME COLUMN category TO share_number');
  db.exec('UPDATE swimmers SET share_number = NULL');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === API Routes ===

// Get all swimmers
app.get('/api/swimmers', (req, res) => {
  const swimmers = db.prepare('SELECT * FROM swimmers ORDER BY last_name, first_name').all();
  res.json(swimmers);
});

// Create a swimmer
app.post('/api/swimmers', (req, res) => {
  const { first_name, last_name, share_number } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }
  if (share_number !== null && share_number !== undefined) {
    if (!Number.isInteger(share_number) || share_number < 1 || share_number > 999) {
      return res.status(400).json({ error: 'El número de acción debe ser entre 1 y 999' });
    }
  }
  const result = db.prepare(
    'INSERT INTO swimmers (first_name, last_name, share_number) VALUES (?, ?, ?)'
  ).run(first_name, last_name, share_number || null);
  const swimmer = db.prepare('SELECT * FROM swimmers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(swimmer);
});

// Log meters for a swimmer
app.post('/api/meters', (req, res) => {
  const { swimmer_id, meters, session_date, notes } = req.body;
  if (!swimmer_id || !meters || !session_date) {
    return res.status(400).json({ error: 'Nadador, metros y fecha son requeridos' });
  }
  if (meters <= 0) {
    return res.status(400).json({ error: 'Los metros deben ser mayores a 0' });
  }
  const result = db.prepare(
    'INSERT INTO meters_log (swimmer_id, meters, session_date, notes) VALUES (?, ?, ?, ?)'
  ).run(swimmer_id, meters, session_date, notes || null);
  const entry = db.prepare('SELECT * FROM meters_log WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

// Get meters log with swimmer names
app.get('/api/meters', (req, res) => {
  const logs = db.prepare(`
    SELECT m.*, s.first_name, s.last_name
    FROM meters_log m
    JOIN swimmers s ON m.swimmer_id = s.id
    ORDER BY m.session_date DESC, m.created_at DESC
  `).all();
  res.json(logs);
});

// Get total meters summary
app.get('/api/summary', (req, res) => {
  const total = db.prepare('SELECT COALESCE(SUM(meters), 0) as total_meters FROM meters_log').get();
  const bySwimmer = db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.share_number,
           COALESCE(SUM(m.meters), 0) as total_meters,
           COUNT(m.id) as total_sessions
    FROM swimmers s
    LEFT JOIN meters_log m ON s.id = m.swimmer_id
    GROUP BY s.id
    ORDER BY total_meters DESC
  `).all();
  const swimmerCount = db.prepare('SELECT COUNT(*) as count FROM swimmers').get();
  res.json({
    goal: 1000000,
    total_meters: total.total_meters,
    percentage: Math.min(((total.total_meters / 1000000) * 100), 100).toFixed(2),
    swimmer_count: swimmerCount.count,
    by_swimmer: bySwimmer
  });
});

// Serve the app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Un Millón de Metros - Servidor corriendo en puerto ${PORT}`);
});
