const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' })); // Supports base64 photo uploads
app.use(express.static(path.join(__dirname, 'public')));

// Database file path
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Seed Data (Matches your frontend)
const SEED_SPOTS = [
  {
    id: 'spot-1',
    title: 'Footpath Plastic & Food Dump',
    landmark: '100ft Road, near Corner House Ice Cream & 12th Main',
    ward: 'Ward 89 - Jogupalya / Indiranagar',
    zone: 'East Zone',
    coords: [12.9784, 77.6408],
    category: 'dry_plastic',
    status: 'pending',
    reportsCount: 3,
    threshold: 5,
    reporters: ['Priya N.', 'Rohan M.', 'Anand K.'],
    timestamp: '2 hours ago',
    photo: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=800&q=80',
    notes: 'Footpath completely blocked for pedestrians, spilling onto main road.',
    ticketId: null,
    cleanedData: null
  },
  {
    id: 'spot-2',
    title: 'Illegal Construction Debris (C&D) on 80ft Road',
    landmark: 'Koramangala 4th Block, opposite Maharaja Signal',
    ward: 'Ward 151 - Koramangala',
    zone: 'South Zone',
    coords: [12.9345, 77.6265],
    category: 'construction',
    status: 'pending',
    reportsCount: 4,
    threshold: 5,
    reporters: ['Karthik S.', 'Deepa R.', 'Venkatesh P.', 'Sneha G.'],
    timestamp: '45 mins ago',
    photo: 'https://images.unsplash.com/photo-1590496793929-36417d3117de?auto=format&fit=crop&w=800&q=80',
    notes: 'Night dumping of remodeling debris, causing two-wheeler skidding hazard.',
    ticketId: null,
    cleanedData: null
  },
  {
    id: 'spot-3',
    title: 'Overflowing Storm Drain Mixed Black Spot',
    landmark: 'HSR Layout Sector 2, 27th Main near Parangi Palya Lake road',
    ward: 'Ward 174 - HSR Layout',
    zone: 'Bommanahalli Zone',
    coords: [12.9116, 77.6476],
    category: 'mixed',
    status: 'verified',
    reportsCount: 7,
    threshold: 5,
    reporters: ['Arun V.', 'Divya C.', 'Nikhil M.', 'Sunita P.', 'BBMP Marshals'],
    timestamp: '1 hour ago',
    photo: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=800&q=80',
    notes: 'Stray dogs tearing plastic bags, pungent odor, risk of drain choking before monsoon.',
    ticketId: '#BBMP-BLR-8492',
    escalatedAt: '1 hour ago',
    dispatchUnit: 'Marshall Suresh Kumar (Zone 4) - Compact Truck KA-01-EA-8821 en route',
    priority: 'Urgent',
    cleanedData: null
  }
];

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ spots: SEED_SPOTS }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Haversine Formula: Calculate distance in meters between two GPS coordinates
function getDistanceMeters([lat1, lon1], [lat2, lon2]) {
  const R = 6371e3; // Earth radius in meters
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function evaluateConsensus(spot) {
  if (spot.reportsCount >= spot.threshold && spot.status === 'pending') {
    spot.status = 'verified';
    spot.ticketId = `#BBMP-BLR-${Math.floor(1000 + Math.random() * 9000)}`;
    spot.escalatedAt = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    spot.dispatchUnit = 'BBMP SWM Marshall Quick Response Unit Assigned';
    spot.priority = 'High';
  }
}

/* =========================================================================
 * API ROUTES
 * ========================================================================= */

// 1. Get all black spots
app.get('/api/spots', (req, res) => {
  const db = readDB();
  res.json(db.spots);
});

// 2. Submit a new report (Auto-merges if within 50m of an existing spot!)
app.post('/api/spots', (req, res) => {
  const db = readDB();
  const { title, landmark, ward, zone, coords, category, photo, notes, reporterName } = req.body;

  // Check 50-meter consensus radius
  const existingNearby = db.spots.find(
    (s) => s.status !== 'cleaned' && getDistanceMeters(s.coords, coords) <= 50
  );

  if (existingNearby) {
    existingNearby.reportsCount += 1;
    existingNearby.reporters.push(reporterName || 'Verified Citizen');
    evaluateConsensus(existingNearby);
    writeDB(db);
    return res.status(200).json({
      merged: true,
      message: 'Merged with existing report within 50m consensus radius!',
      spot: existingNearby
    });
  }

  const newSpot = {
    id: 'spot-' + Date.now(),
    title: title || `${landmark.split(',')[0]} Waste Spot`,
    landmark,
    ward,
    zone,
    coords,
    category: category || 'mixed',
    status: 'pending',
    reportsCount: 1,
    threshold: 5,
    reporters: [reporterName || 'Citizen Reporter'],
    timestamp: 'Just now',
    photo,
    notes: notes || 'Illegal dump site reported by resident.',
    ticketId: null,
    cleanedData: null
  };

  db.spots.unshift(newSpot);
  writeDB(db);
  res.status(201).json({ merged: false, spot: newSpot });
});

// 3. Upvote / Verify an existing spot (+1 or Bulk Simulation)
app.post('/api/spots/:id/verify', (req, res) => {
  const db = readDB();
  const spot = db.spots.find((s) => s.id === req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });

  const increment = req.body.increment || 1;
  spot.reportsCount += increment;
  evaluateConsensus(spot);

  writeDB(db);
  res.json(spot);
});

// 4. BBMP Marshall Resolve / Mark as Cleaned
app.post('/api/spots/:id/resolve', (req, res) => {
  const db = readDB();
  const spot = db.spots.find((s) => s.id === req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });

  const { afterPhoto, marshall, vehicle, actionNote } = req.body;
  spot.status = 'cleaned';
  spot.cleanedData = {
    cleanedAt: new Date().toLocaleString('en-IN'),
    afterPhoto,
    marshall: marshall || 'BBMP Marshall Unit',
    vehicle: vehicle || 'BBMP Compactor',
    actionNote: actionNote || 'Cleared and sanitized.'
  };

  writeDB(db);
  res.json(spot);
});

// 5. Reset Demo Data
app.post('/api/reset', (req, res) => {
  writeDB({ spots: JSON.parse(JSON.stringify(SEED_SPOTS)) });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Namma Clean Bengaluru server running on http://localhost:${PORT}`);
});
