require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Simple CORS configuration
app.use(cors());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Security headers for iframe embedding
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    next();
});

// PostgreSQL connection configuration
console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('Postgres URL:', process.env.POSTGRES_URL ? 'Set' : 'Not set');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error('No database connection string provided!');
    process.exit(1);
}

console.log('Using connection string:', connectionString.replace(/:[^:@]+@/, ':****@')); // Log URL with password hidden

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false,
        sslmode: 'require'
    },
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000 // Return an error after 10 seconds if connection could not be established
});

// Add more detailed connection logging
pool.on('connect', (client) => {
    console.log('New client connected to PostgreSQL database');
    client.on('error', (err) => {
        console.error('Database client error:', err);
    });
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    if (client) {
        client.release(true); // Force release with error
    }
});

pool.on('acquire', () => {
    console.log('Client acquired from pool');
});

pool.on('remove', () => {
    console.log('Client removed from pool');
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
    console.log('Received scheduling request with body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);

    if (!req.body || Object.keys(req.body).length === 0) {
        console.error('Empty request body received');
        return res.status(400).json({
            success: false,
            error: 'Empty request body'
        });
    }

    let client;
    try {
        client = await pool.connect();
        console.log('Database connection established');

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
            parseInt(budget, 10), // Ensure budget is an integer
            campaignGoals,
            urlSlug || '' // Make urlSlug optional
        ];

        console.log('Executing query with values:', JSON.stringify(values, null, 2));
        const result = await client.query(query, values);
        console.log('Query executed successfully. Result:', JSON.stringify(result.rows[0], null, 2));

        const response = {
            success: true,
            message: 'Scheduling saved successfully',
            data: result.rows[0]
        };
        console.log('Sending response:', JSON.stringify(response, null, 2));
        res.status(201).json(response);
    } catch (error) {
        console.error('Error in /api/schedule:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Error saving scheduling',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (client) {
            console.log('Releasing database connection');
            client.release();
        }
    }
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        res.json({
            success: true,
            message: 'Database connection successful',
            timestamp: result.rows[0].now,
            database_url: process.env.DATABASE_URL ? 'Set' : 'Not set',
            postgres_url: process.env.POSTGRES_URL ? 'Set' : 'Not set'
        });
    } catch (error) {
        console.error('Database connection test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            database_url: process.env.DATABASE_URL ? 'Set' : 'Not set',
            postgres_url: process.env.POSTGRES_URL ? 'Set' : 'Not set'
        });
    } finally {
        if (client) client.release();
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        environment: process.env.NODE_ENV,
        database_url: process.env.DATABASE_URL ? 'Set' : 'Not set',
        postgres_url: process.env.POSTGRES_URL ? 'Set' : 'Not set'
    });
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