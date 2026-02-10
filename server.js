const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS swimmers (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      share_number INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meters_log (
      id SERIAL PRIMARY KEY,
      swimmer_id INTEGER NOT NULL REFERENCES swimmers(id),
      meters INTEGER NOT NULL,
      session_date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

initDB().catch(err => {
  console.error('Error inicializando base de datos:', err);
  process.exit(1);
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === API Routes ===

// Get all swimmers
app.get('/api/swimmers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM swimmers ORDER BY last_name, first_name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener nadadores' });
  }
});

// Create a swimmer
app.post('/api/swimmers', async (req, res) => {
  const { first_name, last_name, share_number } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }
  if (share_number !== null && share_number !== undefined) {
    if (!Number.isInteger(share_number) || share_number < 1 || share_number > 999) {
      return res.status(400).json({ error: 'El número de acción debe ser entre 1 y 999' });
    }
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO swimmers (first_name, last_name, share_number) VALUES ($1, $2, $3) RETURNING *',
      [first_name, last_name, share_number || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar nadador' });
  }
});

// Log meters for a swimmer
app.post('/api/meters', async (req, res) => {
  const { swimmer_id, meters, session_date, notes } = req.body;
  if (!swimmer_id || !meters || !session_date) {
    return res.status(400).json({ error: 'Nadador, metros y fecha son requeridos' });
  }
  if (meters <= 0) {
    return res.status(400).json({ error: 'Los metros deben ser mayores a 0' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO meters_log (swimmer_id, meters, session_date, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [swimmer_id, meters, session_date, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar metros' });
  }
});

// Get meters log with swimmer names
app.get('/api/meters', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, s.first_name, s.last_name
      FROM meters_log m
      JOIN swimmers s ON m.swimmer_id = s.id
      ORDER BY m.session_date DESC, m.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

// Get total meters summary
app.get('/api/summary', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COALESCE(SUM(meters), 0) as total_meters FROM meters_log');
    const bySwimmerResult = await pool.query(`
      SELECT s.id, s.first_name, s.last_name, s.share_number,
             COALESCE(SUM(m.meters), 0) as total_meters,
             COUNT(m.id) as total_sessions
      FROM swimmers s
      LEFT JOIN meters_log m ON s.id = m.swimmer_id
      GROUP BY s.id, s.first_name, s.last_name, s.share_number
      ORDER BY total_meters DESC
    `);
    const countResult = await pool.query('SELECT COUNT(*) as count FROM swimmers');

    const totalMeters = parseInt(totalResult.rows[0].total_meters);
    res.json({
      goal: 1000000,
      total_meters: totalMeters,
      percentage: Math.min(((totalMeters / 1000000) * 100), 100).toFixed(2),
      swimmer_count: parseInt(countResult.rows[0].count),
      by_swimmer: bySwimmerResult.rows.map(s => ({
        ...s,
        total_meters: parseInt(s.total_meters),
        total_sessions: parseInt(s.total_sessions)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

// Serve the app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Un Millón de Metros - Servidor corriendo en puerto ${PORT}`);
});
