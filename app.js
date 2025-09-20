const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Log all route registrations
const originalGet = app.get;
app.get = function (path, ...handlers) {
  console.log(`📌 Registering GET route: ${path}`);
  return originalGet.call(this, path, ...handlers);
};

const originalPost = app.post;
app.post = function (path, ...handlers) {
  console.log(`📌 Registering POST route: ${path}`);
  return originalPost.call(this, path, ...handlers);
};

const originalUse = app.use;
app.use = function (path, ...handlers) {
  if (typeof path === 'string' || path instanceof RegExp) {
    console.log(`📌 Registering USE route: ${path}`);
  } else {
    console.log(`📌 Registering USE middleware without path`);
  }
  return originalUse.call(this, path, ...handlers);
};

// Import route handlers
const exportHandler = require('./routes/export');
const importHandler = require('./routes/import');
const syncHandler = require('./routes/sync');


// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.zip', '.json', '.bson'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP, JSON, and BSON files are allowed.'));
    }
  }
});


app.use(express.static(path.join(__dirname, 'public')));

// Example route to serve an HTML file
// Routes
app.use('/api/export', exportHandler);
app.use('/api/import', upload.single('backupFile'), importHandler);
app.use('/api/sync', syncHandler);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await fs.mkdir("exports", { recursive: true });
  await fs.mkdir("uploads", { recursive: true });
});