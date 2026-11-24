const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname))); 

app.use('/api', async (req, res) => {
    try {
        const response = await fetch(`http://localhost:3001/api${req.url}`, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (e) {
        console.log("❌ Bot neodpovídá.");
        res.status(503).json({ error: 'Bot je offline' });
    }
});

app.listen(3000, () => console.log('🌐 WEB BĚŽÍ NA: http://localhost:3000'));
