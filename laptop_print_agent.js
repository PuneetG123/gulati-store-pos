const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Target Cloud Application URL
const CLOUD_URL = process.env.CLOUD_URL || 'https://gulati-store-pos.onrender.com';
const POLL_INTERVAL_MS = 2000;

console.log("=======================================================");
console.log(" Gulati Store POS - Laptop Direct Print Agent");
console.log(` Target Cloud Server: ${CLOUD_URL}`);
console.log(" Listening for pending receipts from mobile checkouts...");
console.log("=======================================================");

function fetchUrl(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function pollQueue() {
  try {
    const jobs = await fetchUrl(`${CLOUD_URL}/api/print-queue`);
    if (Array.isArray(jobs) && jobs.length > 0) {
      for (const job of jobs) {
        console.log(`[PRINT AGENT] Processing print job #${job.id} for printer '${job.printer_name || 'Default'}'...`);
        
        const tempFile = path.join(__dirname, 'temp_agent_receipt.txt');
        const scriptFile = path.join(__dirname, 'raw_print.ps1');
        
        fs.writeFileSync(tempFile, job.receipt_text, 'utf8');
        const escapedPrinter = (job.printer_name || 'Default').replace(/"/g, '`"');
        const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptFile}" -PrinterName "${escapedPrinter}" -FilePath "${tempFile}"`;
        
        await new Promise((resolve) => {
          exec(cmd, (err, stdout, stderr) => {
            fs.unlink(tempFile, () => {});
            if (err) {
              console.error(`[PRINT AGENT] Printing failed for job #${job.id}:`, stderr);
            } else {
              console.log(`[PRINT AGENT] Receipt #${job.id} printed & cut successfully!`);
            }
            resolve();
          });
        });

        // Acknowledge job completion
        await fetchUrl(`${CLOUD_URL}/api/print-queue/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, { jobId: job.id });
      }
    }
  } catch (err) {
    // Silently continue polling
  }
  
  setTimeout(pollQueue, POLL_INTERVAL_MS);
}

pollQueue();
