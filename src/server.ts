import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import databaseRoutes from './api/routes/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Increase timeout for Render (30 seconds)
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    console.log('Request has timed out.');
    res.status(504).json({ 
      success: false, 
      message: 'Request timeout' 
    });
  });
  next();
});

// Allow ALL origins for CORS
const corsOptions = {
  origin: '*', // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'Origin',
    'X-Requested-With',
    'X-Access-Token',
    'X-API-Key'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours cache
  preflightContinue: false
};

// Apply CORS middleware BEFORE any routes
app.use(cors(corsOptions));

// Add universal CORS headers for every response
app.use((req, res, next) => {
  // Allow all origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Methods', 
    'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD'
  );
  res.header(
    'Access-Control-Allow-Headers', 
    'Content-Type, Authorization, Accept, Origin, X-Requested-With, X-Access-Token, X-API-Key'
  );
  res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Handle preflight requests for all routes
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Methods', 
    'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD'
  );
  res.header(
    'Access-Control-Allow-Headers', 
    'Content-Type, Authorization, Accept, Origin, X-Requested-With, X-Access-Token, X-API-Key'
  );
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/db', databaseRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  // Set CORS headers explicitly
  res.header('Access-Control-Allow-Origin', '*');
  
  res.json({ 
    status: 'ok', 
    message: 'Pesapal RDBMS Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    },
    cors: {
      enabled: true,
      origin: 'ALL (*)'
    }
  });
});

// Test endpoint to verify CORS
app.get('/test-cors', (req, res) => {
  // Set CORS headers explicitly
  res.header('Access-Control-Allow-Origin', '*');
  
  res.json({
    message: 'CORS is working! All origins allowed.',
    origin: req.headers.origin || 'No origin header',
    allowed: true,
    timestamp: new Date().toISOString(),
    yourFrontendUrl: 'https://pesapalrdbms.netlify.app',
    corsHeaders: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
});

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  
  // Set CORS headers even on errors
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    cors: {
      enabled: true,
      origin: 'ALL (*)'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  // Set CORS headers for 404
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    cors: {
      enabled: true,
      origin: 'ALL (*)'
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
    🚀 Server running on port ${PORT}
    📊 Database API: /api/db
    🩺 Health check: /health
    🔍 CORS test: /test-cors
    ⏱️  Timeout: 30 seconds
    🔗 CORS: ALL ORIGINS ALLOWED (*)
    
    🌐 Test URLs:
        Health: http://localhost:${PORT}/health
        CORS Test: http://localhost:${PORT}/test-cors
        Tables: http://localhost:${PORT}/api/db/tables
  `);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});