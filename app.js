// const express = require('express');
// const cors = require('cors');
// const multer = require('multer');
// const fs = require('fs-extra');
// require('dotenv').config();

// const app = express();
// const PORT = process.env.PORT || 6969;

// // Import route handlers
// const exportHandler = require('./routes/export');
// const importHandler = require('./routes/import');

// // Middleware
// app.use(cors());
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// // Log incoming requests (for reference, though not needed for startup error)
// app.use((req, res, next) => {
//   console.log(`📡 Incoming request: ${req.method} ${req.originalUrl}`);
//   next();
// });

// // Create necessary directories
// const createDirectories = async () => {
//   try {
//     await fs.ensureDir('./uploads');
//     await fs.ensureDir('./exports');
//     await fs.ensureDir('./temp');
//     console.log('✅ Directories created successfully');
//   } catch (error) {
//     console.error('❌ Error creating directories:', error);
//   }
// };

// // File upload configuration
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, './uploads/');
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + file.originalname.split('.')[0];
//     cb(null, uniqueName);
//   }
// });

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 100 * 1024 * 1024 // 100MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = ['.zip', '.json', '.bson'];
//     const fileExt = file.originalname.toLowerCase().slice(path.extname(file.originalname).length * -1);

//     if (allowedTypes.includes(fileExt)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid file type. Only ZIP, JSON, and BSON files are allowed.'));
//     }
//   }
// });

// // // Routes
// // app.use('/api/export', exportHandler);
// // app.use('/api/import', upload.single('backupFile'), importHandler);

// // Serve static files (our frontend)
// app.use(express.static('public'));

// // Serve the main HTML file on root route
// app.get('/', (req, res) => {
//   res.sendFile(__dirname + '/public/index.html');
// });

// // Health check endpoint
// app.get('/api/health', (req, res) => {
//   res.json({
//     status: 'OK',
//     timestamp: new Date().toISOString(),
//     version: '1.0.0'
//   });
// });

// // Error handling middleware
// app.use((error, req, res, next) => {
//   console.error('❌ Error:', error);
  
//   if (error instanceof multer.MulterError) {
//     if (error.code === 'LIMIT_FILE_SIZE') {
//       return res.status(400).json({
//         success: false,
//         error: 'File size too large. Maximum size is 100MB.'
//       });
//     }
//   }
  
//   res.status(500).json({
//     success: false,
//     error: error.message || 'Internal server error'
//   });
// });

// // 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     error: 'Endpoint not found'
//   });
// });

// // Start server
// const startServer = async () => {
//   await createDirectories();
  
//   app.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`);
//     console.log(`📊 API Documentation:`);
//     console.log(`   POST /api/export - Export database`);
//     console.log(`   POST /api/import - Import database`);
//     console.log(`   GET  /api/health - Health check`);
//   });
// };

// startServer().catch(console.error);

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 6969;

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
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});