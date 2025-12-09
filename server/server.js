const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

let latestFrame = null;

app.get('/frame', (req, res) => {
  if (!latestFrame) return res.sendStatus(204);
  res.contentType('image/jpeg');
  res.send(latestFrame);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Handle server-level errors (e.g., EADDRINUSE)
server.on('error', (err) => {
  console.error('HTTP server error:', err && err.message);
  // If port in use or other fatal error, exit with non-zero code
  // allow process managers to restart if desired
  process.exitCode = 1;
});

// Handle WebSocket server errors
wss.on('error', (err) => {
  console.error('WebSocket server error:', err && err.message);
});

wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`WebSocket client connected: ${clientAddr}`);

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary || Buffer.isBuffer(data)) {
        latestFrame = Buffer.from(data);
        return;
      }

      // If message is text, try to parse JSON with base64 frame
      const text = data.toString();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        // not JSON, ignore
        return;
      }

      if (parsed && parsed.type === 'frame' && parsed.data) {
        // parsed.data is expected to be a base64 string
        latestFrame = Buffer.from(parsed.data, 'base64');
      }
    } catch (err) {
      console.error('Error handling message:', err && err.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket client disconnected: ${clientAddr} (code=${code})`);
  });

  ws.on('error', (err) => {
    console.log(`WebSocket error from ${clientAddr}: ${err && err.message}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP and WebSocket server listening on port ${PORT}`);
});

// Global handlers to avoid uncaught crashes during development
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.stack || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

module.exports = { app, server, wss };
