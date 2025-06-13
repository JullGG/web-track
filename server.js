const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const PORT = 3000;
app.use(express.static('public'));
app.use(express.json());

let dbPath = path.join(__dirname, 'db.json');
let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath)) : {};

function saveDB() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Generate tracking link
app.post('/generate', (req, res) => {
  const { url } = req.body;
  const id = crypto.randomBytes(4).toString('hex');
  db[id] = { url, logs: [] };
  saveDB();
  res.json({ trackUrl: `${req.protocol}://${req.get('host')}/track/${id}` });
});

// Saat link dilihat, simpan IP + redirect
app.get('/track/:id', async (req, res) => {
  const { id } = req.params;
  const info = db[id];
  if (!info) return res.status(404).send('Link tidak ditemukan');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'];
  let location = {};

  try {
    const locRes = await fetch(`http://ip-api.com/json/${ip}`);
    location = await locRes.json();
  } catch (e) {
    console.error('Gagal ambil lokasi:', e);
  }

  const log = {
    ip,
    ua,
    time: new Date().toISOString(),
    location: {
      country: location.country || 'N/A',
      city: location.city || 'N/A',
      lat: location.lat || null,
      lon: location.lon || null,
    }
  };

  info.logs.push(log);
  saveDB();

  res.redirect(info.url);
});

// Tampilkan log
app.get('/logs/:id', (req, res) => {
  const { id } = req.params;
  const info = db[id];
  if (!info) return res.status(404).send('Tracking ID tidak ditemukan');

  const logHtml = info.logs.map(log => `
    <div style="border-bottom:1px solid #ccc;padding:10px;margin-bottom:15px;">
      <b>IP:</b> ${log.ip}<br>
      <b>Browser:</b> ${log.ua}<br>
      <b>Waktu:</b> ${log.time}<br>
      <b>Lokasi:</b> ${log.location.city}, ${log.location.country}<br>
      <b>Koordinat:</b> ${log.location.lat}, ${log.location.lon}<br>
      <a href="https://www.google.com/maps?q=${log.location.lat},${log.location.lon}" target="_blank">📍 Lihat di Google Maps</a>
    </div>
  `).join('');

  res.send(`
    <html>
      <head><title>Hasil Tracking</title></head>
      <body style="font-family:sans-serif;padding:20px;">
        <h2>📊 Log Tracking ID: ${id}</h2>
        ${logHtml || '<i>Belum ada yang klik.</i>'}
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
