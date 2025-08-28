const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs-extra');
const unzipper = require('unzipper');
const path = require('path');

const router = express.Router();

// Log router registrations
const originalRouterPost = router.post;
router.post = function (path, ...handlers) {
  console.log(`📌 Registering router POST route: ${path}`);
  return originalRouterPost.call(this, path, ...handlers);
};

// Import database endpoint
router.post('/', async (req, res) => {
  let client;
  const startTime = Date.now();
  let tempDir;
  
  try {
    const { connectionString, databaseName, importMode = 'merge' } = req.body;
    const backupFile = req.file;
    
    if (!connectionString || !databaseName) {
      return res.status(400).json({
        success: false,
        error: 'Connection string and database name are required'
      });
    }
    
    if (!backupFile) {
      return res.status(400).json({
        success: false,
        error: 'Backup file is required'
      });
    }
    
    console.log(`📥 Starting import to database: ${databaseName}`);
    console.log(`📄 File: ${backupFile.originalname} (${(backupFile.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`🔄 Import mode: ${importMode}`);
    
    client = new MongoClient(connectionString);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(databaseName);
    
    tempDir = path.join('./temp', `import_${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    let extractedFiles = [];
    
    if (path.extname(backupFile.originalname).toLowerCase() === '.zip') {
      console.log('📦 Extracting ZIP file...');
      extractedFiles = await extractZipFile(backupFile.path, tempDir);
    } else if (path.extname(backupFile.originalname).toLowerCase() === '.json') {
      const targetPath = path.join(tempDir, backupFile.originalname);
      await fs.copy(backupFile.path, targetPath);
      extractedFiles = [backupFile.originalname];
    }
    
    console.log(`📋 Extracted ${extractedFiles.length} files`);
    
    let metadata = null;
    const metadataPath = path.join(tempDir, 'metadata.json');
    if (await fs.pathExists(metadataPath)) {
      metadata = await fs.readJson(metadataPath);
      console.log(`📊 Metadata found: ${metadata.total_collections} collections, ${metadata.total_documents} documents`);
    }
    
    let importStats = {};
    let totalImported = 0;
    let totalErrors = 0;
    
    const collectionFiles = extractedFiles.filter(file => 
      file.endsWith('.json') && 
      !file.includes('_indexes.json') && 
      file !== 'metadata.json'
    );
    
    console.log(`🔄 Processing ${collectionFiles.length} collections...`);
    
    for (const collectionFile of collectionFiles) {
      try {
        const filePath = path.join(tempDir, collectionFile);
        const collectionData = await fs.readJson(filePath);
        
        const collectionName = collectionData.collection || path.basename(collectionFile, '.json');
        const documents = collectionData.documents || collectionData;
        
        if (!Array.isArray(documents)) {
          throw new Error(`Invalid data format in ${collectionFile}`);
        }
        
        console.log(`🔄 Processing collection: ${collectionName} (${documents.length} documents)`);
        
        const collection = db.collection(collectionName);
        let processedDocs = 0;
        let skippedDocs = 0;
        
        if (importMode === 'replace') {
          try {
            await collection.drop();
            console.log(`🗑️  Dropped existing collection: ${collectionName}`);
          } catch (dropError) {
            if (!dropError.message.includes('ns not found')) {
              console.warn(`⚠️  Warning dropping collection ${collectionName}:`, dropError.message);
            }
          }
        }
        
        const batchSize = 100;
        for (let i = 0; i < documents.length; i += batchSize) {
          const batch = documents.slice(i, i + batchSize);
          
          try {
            if (importMode === 'replace' || importMode === 'merge') {
              if (importMode === 'replace') {
                const result = await collection.insertMany(batch, { ordered: false });
                processedDocs += result.insertedCount;
              } else {
                for (const doc of batch) {
                  try {
                    if (doc._id) {
                      await collection.replaceOne(
                        { _id: doc._id }, 
                        doc, 
                        { upsert: true }
                      );
                    } else {
                      await collection.insertOne(doc);
                    }
                    processedDocs++;
                  } catch (docError) {
                    console.warn(`⚠️  Warning processing document:`, docError.message);
                    skippedDocs++;
                  }
                }
              }
            } else if (importMode === 'append') {
              const results = await collection.insertMany(batch, { 
                ordered: false,
                writeConcern: { w: 1 }
              }).catch(async (error) => {
                if (error.code === 11000) {
                  for (const doc of batch) {
                    try {
                      await collection.insertOne(doc);
                      processedDocs++;
                    } catch (dupError) {
                      if (dupError.code === 11000) {
                        skippedDocs++;
                      } else {
                        throw dupError;
                      }
                    }
                  }
                } else {
                  throw error;
                }
              });
              
              if (results && results.insertedCount) {
                processedDocs += results.insertedCount;
              }
            }
          } catch (batchError) {
            console.error(`❌ Error processing batch in ${collectionName}:`, batchError.message);
            totalErrors++;
          }
        }
        
        const indexFile = path.join(tempDir, `${collectionName}_indexes.json`);
        if (await fs.pathExists(indexFile)) {
          try {
            const indexes = await fs.readJson(indexFile);
            const indexesToCreate = indexes.filter(idx => idx.name !== '_id_');
            
            if (indexesToCreate.length > 0) {
              await collection.createIndexes(indexesToCreate.map(idx => ({
                key: idx.key,
                name: idx.name,
                ...idx
              })));
              console.log(`📊 Restored ${indexesToCreate.length} indexes for ${collectionName}`);
            }
          } catch (indexError) {
            console.warn(`⚠️  Warning restoring indexes for ${collectionName}:`, indexError.message);
          }
        }
        
        importStats[collectionName] = {
          processed: processedDocs,
          skipped: skippedDocs,
          total: documents.length
        };
        
        totalImported += processedDocs;
        console.log(`✅ Collection ${collectionName}: ${processedDocs} processed, ${skippedDocs} skipped`);
        
      } catch (collectionError) {
        console.error(`❌ Error processing ${collectionFile}:`, collectionError.message);
        importStats[collectionFile] = {
          error: collectionError.message,
          processed: 0,
          skipped: 0
        };
        totalErrors++;
      }
    }
    
    console.log(`✅ Import completed`);
    console.log(`📊 Total imported: ${totalImported} documents`);
    console.log(`⏱️  Duration: ${(Date.now() - startTime) / 1000}s`);
    
    res.json({
      success: true,
      message: 'Database imported successfully',
      data: {
        database: databaseName,
        import_mode: importMode,
        total_documents_processed: totalImported,
        total_collections: Object.keys(importStats).length,
        total_errors: totalErrors,
        import_duration: Date.now() - startTime,
        import_stats: importStats,
        original_file: backupFile.originalname
      }
    });
    
  } catch (error) {
    console.error('❌ Import error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Import failed'
    });
  } finally {
    if (client) {
      await client.close();
    }
    
    if (req.file) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        console.warn(`⚠️  Warning cleaning up uploaded file:", cleanupError.message`);
      }
    }
    
    if (tempDir) {
      try {
        await fs.remove(tempDir);
      } catch (cleanupError) {
        console.warn(`⚠️  Warning cleaning up temp directory:", cleanupError.message`);
      }
    }
  }
});

// Helper function to extract ZIP file
function extractZipFile(zipPath, outputDir) {
  return new Promise((resolve, reject) => {
    const extractedFiles = [];
    
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const fileName = entry.path;
        const type = entry.type;
        
        if (type === 'File') {
          extractedFiles.push(fileName);
          entry.pipe(fs.createWriteStream(path.join(outputDir, fileName)));
        } else {
          entry.autodrain();
        }
      })
      .on('close', () => {
        resolve(extractedFiles);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

module.exports = router;