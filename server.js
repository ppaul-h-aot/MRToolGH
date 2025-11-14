const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security configuration
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'trace2024!';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';
const ENABLE_IP_WHITELIST = process.env.ENABLE_IP_WHITELIST === 'true';

// IP Whitelist middleware
const ipWhitelist = (req, res, next) => {
  if (!ENABLE_IP_WHITELIST || ALLOWED_IPS.length === 0) {
    return next();
  }
  
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const forwardedIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  const realIP = forwardedIP ? forwardedIP.split(',')[0].trim() : clientIP;
  
  // Allow localhost for development
  if (realIP === '127.0.0.1' || realIP === '::1' || realIP === '::ffff:127.0.0.1') {
    return next();
  }
  
  // Check if IP is in whitelist
  const isAllowed = ALLOWED_IPS.some(allowedIP => {
    if (allowedIP.includes('/')) {
      // CIDR notation support
      return isIPInCIDR(realIP, allowedIP);
    }
    return realIP === allowedIP;
  });
  
  if (!isAllowed) {
    console.log(`Blocked access from IP: ${realIP}`);
    return res.status(403).json({ 
      error: 'Access denied', 
      message: 'Your IP address is not authorized to access this service' 
    });
  }
  
  next();
};

// Basic CIDR check function
function isIPInCIDR(ip, cidr) {
  try {
    const [network, prefixLength] = cidr.split('/');
    const ipNum = ipToNumber(ip);
    const networkNum = ipToNumber(network);
    const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
    return (ipNum & mask) === (networkNum & mask);
  } catch (e) {
    return false;
  }
}

function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Trust proxy for accurate IP detection
app.set('trust proxy', true);

// Apply IP whitelist
app.use(ipWhitelist);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Basic Authentication middleware
const authMiddleware = (req, res, next) => {
  if (!ENABLE_AUTH) {
    return next();
  }
  
  return basicAuth({
    users: { [AUTH_USER]: AUTH_PASS },
    challenge: true,
    realm: 'Langfuse Trace Analyzer'
  })(req, res, next);
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    security: {
      authEnabled: ENABLE_AUTH,
      ipWhitelistEnabled: ENABLE_IP_WHITELIST,
      allowedIPs: ENABLE_IP_WHITELIST ? ALLOWED_IPS.length : 'unlimited'
    }
  });
});

// Apply authentication to all routes except health check
app.use(authMiddleware);

// File upload endpoint
app.post('/api/upload', upload.single('traceFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const traceData = JSON.parse(req.file.buffer.toString());
    
    // Basic validation
    if (!Array.isArray(traceData) && typeof traceData !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: traceData,
      fileSize: req.file.size,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({ 
      error: 'Invalid JSON file', 
      details: error.message 
    });
  }
});

// Analysis endpoint
app.post('/api/analyze', (req, res) => {
  try {
    const { traces } = req.body;
    
    if (!traces || !Array.isArray(traces)) {
      return res.status(400).json({ error: 'Invalid traces data' });
    }

    // Basic analysis
    const analysis = {
      totalTraces: traces.length,
      timestamp: new Date().toISOString(),
      summary: {
        avgLatency: 0,
        errorRate: 0,
        totalTokens: 0
      }
    };

    // Calculate basic metrics
    let totalLatency = 0;
    let errorCount = 0;
    let totalTokens = 0;

    traces.forEach(trace => {
      if (trace.duration) totalLatency += trace.duration;
      if (trace.status === 'error' || trace.status === 'failed') errorCount++;
      if (trace.tokens) totalTokens += trace.tokens;
    });

    analysis.summary.avgLatency = traces.length > 0 ? totalLatency / traces.length : 0;
    analysis.summary.errorRate = traces.length > 0 ? (errorCount / traces.length) * 100 : 0;
    analysis.summary.totalTokens = totalTokens;

    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error.message 
    });
  }
});

// API endpoint to get list of repositories
app.get('/api/repos', (req, res) => {
  try {
    const fetcher = new (require('./data-fetcher'))();
    const repos = fetcher.getRepositoriesToMonitor();
    res.json({ success: true, repos: repos });
  } catch (error) {
    console.error('Error getting repositories:', error);
    res.json({ success: false, error: error.message });
  }
});

// API endpoint to get cached data
app.get('/api/cached-data', (req, res) => {
  try {
    const fetcher = new (require('./data-fetcher'))();
    const data = fetcher.loadCachedData();
    res.json({ success: true, data: data });
  } catch (error) {
    console.error('Error getting cached data:', error);
    res.json({ success: false, error: error.message });
  }
});

// API endpoint to refresh specific repository
app.post('/api/repos/:owner/:repo/refresh', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    console.log(`🔄 Refreshing repository: ${owner}/${repo}`);

    const fetcher = new (require('./data-fetcher'))();

    // Refresh data for this specific repository
    const data = await fetcher.fetchAllData();

    res.json({
      success: true,
      message: `Repository ${owner}/${repo} refreshed successfully`,
      data: data
    });
  } catch (error) {
    console.error('Error refreshing repository:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to trigger full data refresh
app.post('/api/fetch-data', async (req, res) => {
  try {
    console.log('🔄 Triggering full data refresh...');

    const fetcher = new (require('./data-fetcher'))();
    const data = await fetcher.fetchAllData();

    res.json({
      success: true,
      message: 'All data refreshed successfully',
      data: data
    });
  } catch (error) {
    console.error('Error refreshing all data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve the GitHub PR tool page
app.get('/github-pr-tool', (req, res) => {
  res.sendFile(path.join(__dirname, 'github-pr-tool.html'));
});

// Serve the main analyzer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'github-pr-tool.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Langfuse Trace Analyzer running on port ${PORT}`);
  console.log(`📊 Access at: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
