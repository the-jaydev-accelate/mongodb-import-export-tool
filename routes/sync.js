const express = require('express');
const { MongoClient } = require('mongodb');

const router = express.Router();

// Log router registrations
const originalRouterPost = router.post;
router.post = function (path, ...handlers) {
  console.log(`📌 Registering router POST route: ${path}`);
  return originalRouterPost.call(this, path, ...handlers);
};

// Sync databases endpoint
router.post('/', async (req, res) => {
  let sourceClient;
  let targetClient;
  const startTime = Date.now();

  try {
    const { 
      sourceConnectionString, 
      targetConnectionString, 
      sourceDatabaseName, 
      targetDatabaseName, 
      syncMode = 'merge', 
      collections 
    } = req.body;

    if (!sourceConnectionString || !targetConnectionString || !sourceDatabaseName || !targetDatabaseName) {
      return res.status(400).json({
        success: false,
        error: 'Source and target connection strings and database names are required'
      });
    }

    console.log(`🔄 Starting sync from ${sourceDatabaseName} to ${targetDatabaseName}`);
    console.log(`🔄 Sync mode: ${syncMode}`);

    sourceClient = new MongoClient(sourceConnectionString);
    await sourceClient.connect();
    console.log('✅ Connected to source MongoDB');

    const sourceDb = sourceClient.db(sourceDatabaseName);

    targetClient = new MongoClient(targetConnectionString);
    await targetClient.connect();
    console.log('✅ Connected to target MongoDB');

    const targetDb = targetClient.db(targetDatabaseName);

    let collectionsToSync = [];
    if (collections && collections.length > 0) {
      collectionsToSync = collections
    } else {
      const collectionList = await sourceDb.listCollections().toArray();
      collectionsToSync = collectionList.map(c => c.name);
    }

    if (collectionsToSync.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No collections found to sync'
      });
    }

    console.log(`📋 Collections to sync: ${collectionsToSync.join(', ')}`);

    let syncStats = {};
    let totalSynced = 0;
    let totalErrors = 0;

    for (const collectionName of collectionsToSync) {
      try {
        console.log(`🔄 Syncing collection: ${collectionName}`);

        const sourceCollection = sourceDb.collection(collectionName);
        const documents = await sourceCollection.find({}).toArray();

        const targetCollection = targetDb.collection(collectionName);
        let processedDocs = 0;
        let skippedDocs = 0;

        if (syncMode === 'replace') {
          try {
            await targetCollection.drop();
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
            if (syncMode === 'replace' || syncMode === 'merge') {
              if (syncMode === 'replace') {
                const result = await targetCollection.insertMany(batch, { ordered: false });
                processedDocs += result.insertedCount;
              } else {
                for (const doc of batch) {
                  try {
                    if (doc._id) {
                      await targetCollection.replaceOne(
                        { _id: doc._id }, 
                        doc, 
                        { upsert: true }
                      );
                    } else {
                      await targetCollection.insertOne(doc);
                    }
                    processedDocs++;
                  } catch (docError) {
                    console.warn(`⚠️  Warning processing document:`, docError.message);
                    skippedDocs++;
                  }
                }
              }
            } else if (syncMode === 'append') {
              const results = await targetCollection.insertMany(batch, { 
                ordered: false,
                writeConcern: { w: 1 }
              }).catch(async (error) => {
                if (error.code === 11000) {
                  for (const doc of batch) {
                    try {
                      await targetCollection.insertOne(doc);
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

        // Sync indexes
        const indexes = await sourceCollection.indexes();
        const indexesToCreate = indexes.filter(idx => idx.name !== '_id_');
        
        if (indexesToCreate.length > 0) {
          await targetCollection.createIndexes(indexesToCreate.map(idx => ({
            key: idx.key,
            name: idx.name,
            ...idx
          })));
          console.log(`📊 Synced ${indexesToCreate.length} indexes for ${collectionName}`);
        }

        syncStats[collectionName] = {
          processed: processedDocs,
          skipped: skippedDocs,
          total: documents.length
        };

        totalSynced += processedDocs;
        console.log(`✅ Collection ${collectionName}: ${processedDocs} processed, ${skippedDocs} skipped`);

      } catch (collectionError) {
        console.error(`❌ Error syncing ${collectionName}:`, collectionError.message);
        syncStats[collectionName] = {
          error: collectionError.message,
          processed: 0,
          skipped: 0
        };
        totalErrors++;
      }
    }

    console.log(`✅ Sync completed`);
    console.log(`📊 Total synced: ${totalSynced} documents`);
    console.log(`⏱️  Duration: ${(Date.now() - startTime) / 1000}s`);

    res.json({
      success: true,
      message: 'Databases synced successfully',
      data: {
        source_database: sourceDatabaseName,
        target_database: targetDatabaseName,
        sync_mode: syncMode,
        total_documents_processed: totalSynced,
        total_collections: Object.keys(syncStats).length,
        total_errors: totalErrors,
        sync_duration: Date.now() - startTime,
        sync_stats: syncStats
      }
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Sync failed'
    });
  } finally {
    if (sourceClient) {
      await sourceClient.close();
    }
    if (targetClient) {
      await targetClient.close();
    }
  }
});

module.exports = router;