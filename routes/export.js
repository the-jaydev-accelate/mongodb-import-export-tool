const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');

const router = express.Router();

// Log router registrations
const originalRouterGet = router.get;
router.get = function (path, ...handlers) {
  console.log(`📌 Registering router GET route: ${path}`);
  return originalRouterGet.call(this, path, ...handlers);
};

const originalRouterPost = router.post;
router.post = function (path, ...handlers) {
  console.log(`📌 Registering router POST route: ${path}`);
  return originalRouterPost.call(this, path, ...handlers);
};

// Export database endpoint
router.post('/', async (req, res) => {
  let client;
  const startTime = Date.now();

  try {
    const { connectionString, databaseName, collections } = req.body;

    if (!connectionString || !databaseName) {
      return res.status(400).json({
        success: false,
        error: 'Connection string and database name are required'
      });
    }

    console.log(`📤 Starting export for database: ${databaseName}`);

    client = new MongoClient(connectionString);
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(databaseName);

    let collectionsToExport = [];
    if (collections && collections.length > 0) {
      collectionsToExport = collections.split(',').map(c => c.trim()).filter(c => c.length > 0);
    } else {
      const collectionList = await db.listCollections().toArray();
      collectionsToExport = collectionList.map(c => c.name);
    }

    if (collectionsToExport.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No collections found to export'
      });
    }

    console.log(`📋 Collections to export: ${collectionsToExport.join(', ')}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join('./exports', `${databaseName}_${timestamp}`);
    await fs.ensureDir(exportDir);

    const metadata = {
      database: databaseName,
      exported_at: new Date().toISOString(),
      collections: collectionsToExport,
      total_collections: collectionsToExport.length,
      mongodb_version: (await db.admin().serverStatus()).version
    };

    try {
      await fs.writeJson(path.join(exportDir, 'metadata.json'), metadata, { spaces: 2 });
      console.log('✅ Wrote metadata.json');
    } catch (writeError) {
      console.error('❌ Error writing metadata.json:', writeError);
      throw writeError; // Re-throw to be caught by outer try-catch
    }

    let totalDocuments = 0;
    const exportStats = {};

    for (const collectionName of collectionsToExport) {
      try {
        console.log(`🔄 Exporting collection: ${collectionName}`);

        const collection = db.collection(collectionName);
        const stats = await collection.estimatedDocumentCount();
        const documents = await collection.find({}).toArray();

        const collectionFile = path.join(exportDir, `${collectionName}.json`);
        await fs.writeJson(collectionFile, {
          collection: collectionName,
          count: documents.length,
          documents: documents
        }, { spaces: 2 });

        const indexes = await collection.indexes();
        const indexFile = path.join(exportDir, `${collectionName}_indexes.json`);
        await fs.writeJson(indexFile, indexes, { spaces: 2 });

        exportStats[collectionName] = {
          documents: documents.length,
          estimated_count: stats,
          file_size: (await fs.stat(collectionFile)).size
        };

        totalDocuments += documents.length;
        console.log(`✅ Exported ${documents.length} documents from ${collectionName}`);

      } catch (collectionError) {
        console.error(`❌ Error exporting collection ${collectionName}:`, collectionError);
        exportStats[collectionName] = {
          error: collectionError.message,
          documents: 0
        };
      }
    }

    metadata.total_documents = totalDocuments;
    metadata.export_stats = exportStats;
    metadata.export_duration = Date.now() - startTime;
    await fs.writeJson(path.join(exportDir, 'metadata.json'), metadata, { spaces: 2 });

    const zipFileName = `${databaseName}_backup_${timestamp}.zip`;
    const zipFilePath = path.join('./exports', zipFileName);

    await createZipFile(exportDir, zipFilePath);

    await fs.remove(exportDir);

    const fileStats = await fs.stat(zipFilePath);

    console.log(`✅ Export completed successfully`);
    console.log(`📁 File: ${zipFileName} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`⏱️  Duration: ${(Date.now() - startTime) / 1000}s`);

    res.json({
      success: true,
      message: 'Database exported successfully',
      data: {
        filename: zipFileName,
        database: databaseName,
        collections: collectionsToExport.length,
        total_documents: totalDocuments,
        file_size: fileStats.size,
        export_duration: Date.now() - startTime,
        download_url: `/api/export/download/${zipFileName}`
      }
    });

  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Export failed'
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Download exported file
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`📥 Download route hit with filename: "${filename}"`);
    if (!filename || filename.includes(':') || !filename.match(/^[a-zA-Z0-9_-]+\.(zip|json)$/)) {
      console.error(`❌ Invalid filename requested: "${filename}"`);
      return res.status(400).json({
        success: false,
        error: 'Invalid filename. Must be a ZIP or JSON file.'
      });
    }

    const filePath = path.join('./exports', filename);
    console.log(`📂 Attempting to access file: ${filePath}`);

    if (!(await fs.pathExists(filePath))) {
      console.error(`❌ File not found: ${filePath}`);
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log(`📥 File downloaded successfully: ${filename}`);
    });

  } catch (error) {
    console.error(`❌ Download error for filename "${req.params.filename}":`, error);
    res.status(500).json({
      success: false,
      error: 'Download failed'
    });
  }
});

// Helper function to create ZIP file
function createZipFile(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 ZIP created: ${archive.pointer()} total bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

module.exports = router;