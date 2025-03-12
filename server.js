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
const databaseUrl = process.env.DATABASE_URL;
const postgresUrl = process.env.POSTGRES_URL;

console.log('Environment variables check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL present:', !!databaseUrl);
console.log('POSTGRES_URL present:', !!postgresUrl);

if (!databaseUrl && !postgresUrl) {
    console.error('Critical Error: No database connection string provided!');
    console.error('Please ensure either DATABASE_URL or POSTGRES_URL is set in environment variables.');
    console.error('Current environment variables:', Object.keys(process.env));
    process.exit(1);
}

const connectionString = databaseUrl || postgresUrl;
console.log('Using connection string:', connectionString.replace(/:[^:@]+@/, ':****@')); // Log URL with password hidden

// Create the connection pool
const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Add connection event handlers
pool.on('connect', (client) => {
    console.log('New client connected to PostgreSQL database');
    client.on('error', (err) => {
        console.error('Database client error:', err);
    });
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client:', err);
    if (client) {
        client.release(true);
    }
});

// Initialize database table
async function initializeDatabase() {
    let client;
    try {
        client = await pool.connect();
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
    } catch (error) {
        console.error('Error initializing database:', error);
        if (error.code === '3D000') { // Database does not exist
            console.error('Database does not exist. Please create it first.');
        }
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Test the connection and initialize database
(async () => {
    try {
        const client = await pool.connect();
        console.log('Initial connection test successful');
        client.release();
        await initializeDatabase();
    } catch (err) {
        console.error('Initial connection test failed:', err);
    }
})();

// API Routes
app.get('/api/schedules', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM schedules ORDER BY created_at DESC');
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/schedule', async (req, res) => {
    console.log('Received scheduling request with body:', JSON.stringify(req.body, null, 2));

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

        // Extract newsletter name and ensure it's not a full URL
        let newsletterName = urlSlug || 'direct_access';
        
        // If it's a URL, extract just the last path segment
        if (newsletterName.includes('://')) {
            try {
                const url = new URL(newsletterName);
                const pathSegments = url.pathname.split('/').filter(Boolean);
                newsletterName = pathSegments[pathSegments.length - 1] || 'direct_access';
            } catch (e) {
                console.error('Error parsing URL:', e);
            }
        }

        // Remove any remaining slashes or URL artifacts
        newsletterName = newsletterName.replace(/[\/\\]/g, '');
        
        console.log('Final newsletter name:', newsletterName);

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
            parseInt(budget, 10),
            campaignGoals,
            newsletterName // Use the cleaned newsletter name
        ];

        const result = await client.query(query, values);
        
        const response = {
            success: true,
            message: 'Scheduling saved successfully',
            data: result.rows[0]
        };
        res.status(201).json(response);
    } catch (error) {
        console.error('Error in /api/schedule:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error saving scheduling',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (client) {
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!'
    });
});

// Serve the HTML file for all routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 