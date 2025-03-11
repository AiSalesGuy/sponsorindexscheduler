require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// More permissive CORS configuration
app.use(cors({
    origin: true, // Allow all origins temporarily
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Handle preflight requests
app.options('*', cors());

// Security headers for iframe embedding
app.use((req, res, next) => {
    // Allow embedding in Wix
    res.setHeader('X-Frame-Options', 'ALLOW-FROM https://www.sponsorindex.com');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.wix.com https://*.sponsorindex.com https://sponsorindex.com https://www.sponsorindex.com");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept, X-Requested-With');
    next();
});

// PostgreSQL connection configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Initialize database table
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS schedules (
                    id SERIAL PRIMARY KEY,
                    date VARCHAR(10) NOT NULL,
                    time VARCHAR(5) NOT NULL,
                    time_12_hour VARCHAR(8) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    budget INTEGER NOT NULL,
                    campaign_goals TEXT NOT NULL,
                    url_slug TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Database initialized successfully');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error initializing database:', error);
        // Don't exit the process, just log the error
    }
}

// Initialize database on startup
initializeDatabase().catch(console.error);

// API Routes
app.post('/api/schedule', async (req, res) => {
    console.log('Received scheduling request:', req.body);
    const client = await pool.connect();
    try {
        const {
            date,
            time,
            time12Hour,
            name,
            email,
            budget,
            campaignGoals,
            urlSlug
        } = req.body;

        // Validate required fields
        const requiredFields = { date, time, time12Hour, name, email, budget, campaignGoals };
        const missingFields = Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        const query = `
            INSERT INTO schedules 
            (date, time, time_12_hour, name, email, budget, campaign_goals, url_slug)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const values = [
            date,
            time,
            time12Hour,
            name,
            email,
            budget,
            campaignGoals,
            urlSlug || '' // Make urlSlug optional
        ];

        console.log('Executing query with values:', values);
        const result = await client.query(query, values);
        console.log('Query result:', result.rows[0]);

        res.status(201).json({
            success: true,
            message: 'Scheduling saved successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error saving scheduling:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error saving scheduling'
        });
    } finally {
        client.release();
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Serve the HTML file for all routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 