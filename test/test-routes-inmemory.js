const assert = require('assert');
const http = require('http');
const { Readable } = require('stream');
const { app } = require('../server.js');

function callExpress(app, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const jsonBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = {
      'host': 'localhost',
      'content-type': 'application/json',
      ...headers
    };
    if (jsonBody) {
      reqHeaders['content-length'] = Buffer.byteLength(jsonBody);
    }

    // Create a mock IncomingMessage with stream
    const req = new http.IncomingMessage(null);
    req.method = method;
    req.url = url;
    req.headers = reqHeaders;

    const res = new http.ServerResponse(req);
    let chunks = [];

    res.write = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };

    res.end = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const resBody = Buffer.concat(chunks).toString('utf8');
      let data = null;
      try {
        data = JSON.parse(resBody);
      } catch (_) {}

      resolve({
        status: res.statusCode,
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: resBody,
        data
      });
    };

    // Route request through express
    app.handle(req, res, (err) => {
      if (err) return reject(err);
      resolve({ status: 404, statusCode: 404, body: 'Not Found', data: null });
    });

    // Send payload
    if (jsonBody) {
      req.push(jsonBody);
    }
    req.push(null);
  });
}

async function runRouteTests() {
  console.log('=== Testing Express Routes Directly in Memory ===\n');

  // 1. GET /api/health
  const health = await callExpress(app, { method: 'GET', url: '/api/health' });
  assert.strictEqual(health.status, 200);
  console.log('✓ GET /api/health returned 200');

  // 2. GET /api/civicsense/reports
  const allReports = await callExpress(app, { method: 'GET', url: '/api/civicsense/reports?admin=true' });
  assert.strictEqual(allReports.status, 200);
  assert.ok(allReports.data.success);
  assert.ok(Array.isArray(allReports.data.reports));
  console.log(`✓ GET /api/civicsense/reports?admin=true returned ${allReports.data.reports.length} reports`);

  // 3. POST /api/civicsense/report - validation error
  const invalid = await callExpress(app, {
    method: 'POST',
    url: '/api/civicsense/report',
    body: { incidentType: '' }
  });
  assert.strictEqual(invalid.status, 400);
  console.log('✓ POST /api/civicsense/report (empty) returned 400');

  // 4. POST /api/civicsense/report - valid submission
  const submit = await callExpress(app, {
    method: 'POST',
    url: '/api/civicsense/report',
    body: {
      userId: 5,
      userEmail: 'xyzs@gmail.com',
      userName: 'xyzs',
      incidentType: 'poor_lighting',
      description: 'Streetlight pole #42 flickering heavily.',
      latitude: 12.975,
      longitude: 77.605,
      address: 'MG Road Junction',
      isAnonymous: false,
      severity: 'medium'
    }
  });
  assert.strictEqual(submit.status, 201);
  assert.ok(submit.data.success);
  assert.ok(submit.data.report.reportId.startsWith('INC-'));
  assert.strictEqual(submit.data.report.status, 'Submitted');
  const reportId = submit.data.report.reportId;
  console.log(`✓ POST /api/civicsense/report created report ${reportId} with status "Submitted"`);

  // 5. GET /api/civicsense/my-reports - Unauthorized
  const unauth = await callExpress(app, { method: 'GET', url: '/api/civicsense/my-reports' });
  assert.strictEqual(unauth.status, 401);
  console.log('✓ GET /api/civicsense/my-reports blocked unauthorized request (401)');

  // 6. GET /api/civicsense/my-reports - Authorized for user
  const myReports = await callExpress(app, {
    method: 'GET',
    url: '/api/civicsense/my-reports?email=xyzs@gmail.com'
  });
  assert.strictEqual(myReports.status, 200);
  assert.ok(myReports.data.reports.some(r => r.reportId === reportId));
  console.log(`✓ GET /api/civicsense/my-reports returned user's private report`);

  // 7. Privacy check: Ensure another user cannot see this report in their "my-reports"
  const otherUserReports = await callExpress(app, {
    method: 'GET',
    url: '/api/civicsense/my-reports?email=poonamlalsuthar518@gmail.com'
  });
  assert.ok(!otherUserReports.data.reports.some(r => r.reportId === reportId));
  console.log('✓ Privacy verified: other users cannot see this report in My Reports');

  // 8. PUT /api/civicsense/reports/:id/status - Test all required lifecycle statuses
  const testStatuses = ['Pending', 'Under Review', 'Resolved', 'Rejected'];
  for (const st of testStatuses) {
    const updated = await callExpress(app, {
      method: 'PUT',
      url: `/api/civicsense/reports/${reportId}/status`,
      body: {
        status: st,
        adminRemarks: `Remarks updated by admin to ${st}`
      }
    });
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.data.report.status, st);
    assert.strictEqual(updated.data.report.adminRemarks, `Remarks updated by admin to ${st}`);
    console.log(`✓ Status successfully updated to "${st}" with remarks`);
  }

  // 9. PUT with invalid status returns 400
  const badStatus = await callExpress(app, {
    method: 'PUT',
    url: `/api/civicsense/reports/${reportId}/status`,
    body: { status: 'UnknownStatus123' }
  });
  assert.strictEqual(badStatus.status, 400);
  console.log('✓ Invalid status correctly rejected with 400');

  // 10. GET /api/civicsense/reports/:id
  const single = await callExpress(app, {
    method: 'GET',
    url: `/api/civicsense/reports/${reportId}`
  });
  assert.strictEqual(single.status, 200);
  assert.strictEqual(single.data.report.reportId, reportId);
  console.log(`✓ GET /api/civicsense/reports/:id fetched single report successfully`);

  // 11. DELETE /api/civicsense/reports/:id
  const deleted = await callExpress(app, {
    method: 'DELETE',
    url: `/api/civicsense/reports/${reportId}`
  });
  assert.strictEqual(deleted.status, 200);
  assert.ok(deleted.data.success);
  console.log(`✓ DELETE /api/civicsense/reports/:id deleted successfully`);

  // Verify it's gone
  const afterDelete = await callExpress(app, {
    method: 'GET',
    url: `/api/civicsense/reports/${reportId}`
  });
  assert.strictEqual(afterDelete.status, 404);
  console.log(`✓ Confirmed report is deleted (returned 404)`);

  console.log('\n======================================================');
  console.log('🎉 ALL EXPRESS ROUTE & LIFECYCLE TESTS PASSED! (11/11)');
  console.log('======================================================');
}

runRouteTests().catch(err => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});

