/**
 * Mock License API Server for Development
 * 
 * Usage:
 *   node scripts/dev/mock-license-server.js
 * 
 * Or via npm script:
 *   pnpm dev:license-server
 * 
 * Test license key: NEKO-TEST-1234-5678
 */

const http = require('http');

const PORT = 8787;

// In-memory license database
const licenses = {
  'NEKO-TEST-1234-5678': {
    devices: [],
    maxDevices: 5,
    activated_at: Math.floor(Date.now() / 1000)
  },
  'NEKO-DEMO-AAAA-BBBB': {
    devices: [],
    maxDevices: 5,
    activated_at: Math.floor(Date.now() / 1000)
  }
};

function log(method, url, status, message = '') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${url} -> ${status} ${message}`);
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const { license_key, device_id } = data;

      if (req.url === '/activate') {
        const license = licenses[license_key];
        
        if (!license) {
          log(req.method, req.url, 400, 'INVALID_KEY');
          res.end(JSON.stringify({ success: false, error_code: 'INVALID_KEY' }));
          return;
        }

        if (license.devices.length >= license.maxDevices && !license.devices.includes(device_id)) {
          log(req.method, req.url, 400, 'DEVICE_LIMIT_REACHED');
          res.end(JSON.stringify({ success: false, error_code: 'DEVICE_LIMIT_REACHED' }));
          return;
        }

        if (!license.devices.includes(device_id)) {
          license.devices.push(device_id);
        }

        log(req.method, req.url, 200, `device=${device_id.substring(0, 8)}...`);
        res.end(JSON.stringify({ success: true, activated_at: license.activated_at }));
      }
      else if (req.url === '/deactivate') {
        const license = licenses[license_key];
        if (license) {
          license.devices = license.devices.filter(d => d !== device_id);
        }
        log(req.method, req.url, 200, `device=${device_id?.substring(0, 8)}...`);
        res.end(JSON.stringify({ success: true }));
      }
      else if (req.url === '/validate') {
        const license = licenses[license_key];
        if (license && license.devices.includes(device_id)) {
          log(req.method, req.url, 200, 'valid');
          res.end(JSON.stringify({ success: true }));
        } else {
          log(req.method, req.url, 400, 'INVALID_KEY');
          res.end(JSON.stringify({ success: false, error_code: 'INVALID_KEY' }));
        }
      }
      else {
        log(req.method, req.url, 404, 'Not found');
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      log(req.method, req.url, 500, err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Mock License API Server');
  console.log('='.repeat(50));
  console.log(`  Running on: http://localhost:${PORT}`);
  console.log('');
  console.log('  Test license keys:');
  console.log('    - NEKO-TEST-1234-5678');
  console.log('    - NEKO-DEMO-AAAA-BBBB');
  console.log('');
  console.log('  Endpoints:');
  console.log('    POST /activate   - Activate license');
  console.log('    POST /deactivate - Deactivate license');
  console.log('    POST /validate   - Validate license');
  console.log('='.repeat(50));
  console.log('');
});
