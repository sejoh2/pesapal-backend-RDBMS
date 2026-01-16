import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import databaseRoutes from './api/routes/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/db', databaseRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Pesapal RDBMS Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
    🚀 Server running on http://localhost:${PORT}
    📊 Database API available at http://localhost:${PORT}/api/db
    🩺 Health check at http://localhost:${PORT}/health
  `);
});