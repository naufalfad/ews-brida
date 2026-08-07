import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import ewsRoutes from './routes/ewsRoutes.js';
import districtRoutes from './routes/districtRoutes.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Log HTTP requests in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    message: 'BRIDA Mimika EWS Backend Foundation is running smoothly.',
    timestamp: new Date()
  });
});

// EWS Router Binding
app.use('/api/v1/ews', ewsRoutes);
app.use('/api/v1/ews/districts', districtRoutes);

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.url}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  
  if (statusCode >= 500) {
    console.error('Unhandled Server Error:', err);
  } else {
    console.warn(`Client Error [${statusCode}]: ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'An internal server error occurred.' : err.message,
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
