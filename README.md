# MongoDB Import/Export Tool

A complete web-based solution for importing and exporting MongoDB databases with a modern UI and robust backend API.

## 🚀 Features

### Export Functionality
- ✅ Connect to any MongoDB instance
- ✅ Export entire database or specific collections
- ✅ Automatic ZIP compression
- ✅ Metadata preservation (indexes, stats)
- ✅ Progress tracking with real-time updates
- ✅ Direct download of backup files

### Import Functionality  
- ✅ Upload ZIP or JSON backup files
- ✅ Multiple import modes (merge, replace, append)
- ✅ Drag & drop file upload
- ✅ Automatic index restoration
- ✅ Conflict resolution strategies
- ✅ Detailed import statistics

### UI/UX
- 🎨 Modern, responsive design
- 📱 Mobile-friendly interface
- 🔄 Real-time progress indicators
- ⚡ Intuitive drag & drop
- 🎯 Clear error messaging

## 📁 Project Structure

```
mongodb-import-export/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env.example          # Environment variables template
├── routes/
│   ├── export.js         # Export API endpoints
│   └── import.js         # Import API endpoints
├── public/
│   └── index.html        # Frontend UI
├── uploads/              # Temporary upload storage
├── exports/              # Generated export files  
└── temp/                 # Temporary extraction folder
```

## 🛠️ Installation & Setup

### 1. Clone or Create Project
```bash
mkdir mongodb-import-export
cd mongodb-import-export
```

### 2. Initialize Project
```bash
npm init -y
```

### 3. Install Dependencies
```bash
npm install express mongodb multer cors fs-extra archiver unzipper path dotenv
npm install --save-dev nodemon
```

### 4. Create Directory Structure
```bash
mkdir routes public uploads exports temp
```

### 5. Environment Setup
```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 6. Add Frontend
- Copy the HTML file to `public/index.html`

### 7. Start Server
```bash
# Development mode
npm run dev

# Production mode  
npm start
```

## 🔌 API Endpoints

### Export Database
```bash
POST /api/export
Content-Type: application/json

{
  "connectionString": "mongodb://localhost:27017",
  "databaseName": "mydatabase", 
  "collections": "users,products" // Optional: specific collections
}
```

### Download Export File
```bash
GET /api/export/download/:filename
```

### Import Database
```bash
POST /api/import
Content-Type: multipart/form-data

connectionString: mongodb://localhost:27017
databaseName: mydatabase
importMode: merge|replace|append
backupFile: <file upload>
```

### Health Check
```bash
GET /api/health
```

## 💡 Usage Examples

### Export Example
```bash
curl -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{
    "connectionString": "mongodb://localhost:27017",
    "databaseName": "myapp",
    "collections": "users,products"
  }'
```

### Import Example
```bash
curl -X POST http://localhost:3000/api/import \
  -F "connectionString=mongodb://localhost:27017" \
  -F "databaseName=myapp_restored" \
  -F "importMode=merge" \
  -F "backupFile=@backup.zip"
```

## ⚙️ Configuration

### Environment Variables (.env)
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017
MAX_FILE_SIZE=104857600
EXPORT_CLEANUP_AFTER=3600000
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=info
```

### Import Modes
- **merge**: Update existing documents, insert new ones
- **replace**: Drop collections and recreate
- **append**: Insert only, skip duplicates

## 🔒 Security Considerations

1. **Connection Strings**: Never hardcode credentials
2. **File Validation**: Only allows ZIP/JSON uploads
3. **Size Limits**: Configurable file size restrictions
4. **CORS**: Configurable origin restrictions
5. **Input Validation**: Comprehensive request validation

## 📊 Monitoring & Logging

- Real-time progress updates
- Comprehensive error logging  
- Export/import statistics
- Performance metrics
- File operation tracking

## 🐛 Troubleshooting

### Common Issues

**Connection Failed**
- Verify MongoDB is running
- Check connection string format
- Ensure network connectivity

**File Upload Issues**
- Check file size limits
- Verify file format (ZIP/JSON)
- Ensure sufficient disk space

**Import Errors**
- Validate backup file integrity
- Check target database permissions
- Review import mode selection

### Debug Mode
```bash
DEBUG=* npm start
```

## 🚦 Testing

### Manual Testing
1. Start MongoDB: `mongod`
2. Start server: `npm start`
3. Open browser: `http://localhost:3000`
4. Test export/import flows

### API Testing
```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test with sample data
# (Ensure you have a test database with sample collections)
```

## 📈 Performance Tips

1. **Large Datasets**: Use streaming for files >100MB
2. **Network**: Use compression for slow connections  
3. **Memory**: Monitor RAM usage during operations
4. **Indexes**: Import data first, then rebuild indexes
5. **Batching**: Process documents in configurable batches

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

## 📝 License

MIT License - Feel free to use in commercial projects.

## 🆘 Support

For issues and questions:
1. Check troubleshooting guide
2. Review server logs
3. Test with sample data
4. Create detailed issue reports

---

**Ready to use!** 🎉

Visit `http://localhost:6969` after starting the server to access the web interface.