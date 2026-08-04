import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import ewsRoutes from './routes/ewsRoutes.js';

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

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.url}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
