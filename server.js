require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    // We'll update this with the Wix domain once deployed
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Security headers for iframe embedding
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'ALLOW-FROM *');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    next();
});

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize database table
async function initializeDatabase() {
    try {
        await pool.query(`
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
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

initializeDatabase();

// API Routes
app.post('/api/schedule', async (req, res) => {
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
            urlSlug
        ];

        await pool.query(query, values);

        res.status(201).json({
            success: true,
            message: 'Scheduling saved successfully'
        });
    } catch (error) {
        console.error('Error saving scheduling:', error);
        res.status(500).json({
            success: false,
            error: 'Error saving scheduling'
        });
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Serve the HTML file
app.get('/', (req, res) => {
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