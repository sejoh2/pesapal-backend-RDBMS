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

// Configure CORS
const corsOptions = {
  origin: [
    'https://pesapalrdbms.netlify.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://*.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/db', databaseRoutes);

// Health check with performance metrics
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({ 
    status: 'ok', 
    message: 'Pesapal RDBMS Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    }
  });
});

// Test endpoint to verify CORS
app.get('/test-cors', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
    🚀 Server running on http://localhost:${PORT}
    📊 Database API available at http://localhost:${PORT}/api/db
    🩺 Health check at http://localhost:${PORT}/health
    ⏱️  Timeout: 30 seconds
    🔗 CORS enabled for: localhost:3001, Netlify, Render
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