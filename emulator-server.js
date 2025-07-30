// emulator-server.js
const express = require('express');
const cors = require('cors');
const { EscPosEmulator } = require('escpos-emulator');
const { Buffer } = require('buffer'); // Ensure Buffer is available

const app = express();
const EMULATOR_PORT = 3001; // This is the port our emulator server will listen on

// Use CORS to allow your React app (running on a different port/domain) to fetch from here
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

let emulatorDisplay = ''; // Simple in-memory storage for emulator output

// Initialize the ESC/POS emulator
const emulator = new EscPosEmulator();

// Listen for data coming into the emulator
emulator.on('data', (data) => {
    emulatorDisplay += data.toString('utf8') + '\n';
    console.log('Emulator received data:', data.toString('utf8'));
});

// Endpoint for your React app to send commands to
app.post('/print-to-emulator', (req, res) => {
    const { commands } = req.body;

    if (!commands) {
        return res.status(400).send('No commands provided.');
    }

    console.log('Received commands for emulator:', commands);
    emulator.write(Buffer.from(commands, 'utf8'));

    res.status(200).send('Commands sent to emulator.');
});

// Endpoint to get the current emulator display content
app.get('/emulator-display', (req, res) => {
    res.status(200).send(emulatorDisplay);
});

// Simple reset endpoint for the emulator display
app.post('/emulator-reset', (req, res) => {
    emulatorDisplay = '';
    res.status(200).send('Emulator display reset.');
});

app.listen(EMULATOR_PORT, () => {
    console.log(`ESC/POS Emulator server listening on port ${EMULATOR_PORT}`);
    console.log(`Access at http://localhost:${EMULATOR_PORT}`);
});