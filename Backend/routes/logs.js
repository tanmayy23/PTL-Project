const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Parser } = require('json2csv');
const PDFDocument = require('jspdf');
require('jspdf-autotable');

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------- EXPORT ----------------
router.get('/export', async (req, res) => {
  try {
    const { format, start_date, end_date, handler, status } = req.query;

    let query = `
      SELECT date, po_available, po_no, import_material, free_of_cost, country_of_origin, cha,
             material_type, invoice_no, docket_no, gate_pass, vendor, courier, uom, odc,
             section, handler, parcel_count, otp1, otp1_verified, otp2, otp2_verified, end_user, status,
             timestamp_a, timestamp_b, timestamp_c, acceptance_status
      FROM materials_new WHERE 1=1`;
    const params = [];

    if (start_date) {
      params.push(start_date);
      query += ` AND DATE(timestamp_a) >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND DATE(timestamp_a) <= $${params.length}`;
    }
    if (handler) {
      params.push(handler);
      query += ` AND handler = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY timestamp_a DESC';

    const result = await pool.query(query, params);
    const data = result.rows;

    if (format === 'csv') {
      const fields = [
        'date', 'po_available', 'po_no', 'import_material', 'free_of_cost', 'country_of_origin', 'cha',
        'material_type', 'invoice_no', 'docket_no', 'gate_pass', 'vendor', 'courier', 'uom', 'odc',
        'section', 'handler', 'parcel_count', 'otp1', 'otp1_verified', 'otp2', 'otp2_verified', 'end_user', 'status',
        'timestamp_a', 'timestamp_b', 'timestamp_c', 'acceptance_status'
      ];

      const formattedData = data.map(row => ({
        ...row,
        date: formatDate(row.date),
        po_available: formatValue(row.po_available),
        import_material: formatValue(row.import_material),
        free_of_cost: formatValue(row.free_of_cost),
        odc: formatValue(row.odc),
        otp1_verified: formatValue(row.otp1_verified),
        otp2_verified: formatValue(row.otp2_verified),
        timestamp_a: formatDate(row.timestamp_a),
        timestamp_b: formatDate(row.timestamp_b),
        timestamp_c: formatDate(row.timestamp_c),
        acceptance_status: formatValue(row.acceptance_status)
      }));

      const json2csv = new Parser({ fields });
      const csv = json2csv.parse(formattedData);
      res.header('Content-Type', 'text/csv');
      res.attachment('logs.csv');
      return res.send(csv);

    } else if (format === 'pdf') {
      const doc = new PDFDocument();
      const tableColumn = [
        'Date', 'PO Available', 'PO No', 'Import Material', 'Free of Cost', 'Country of Origin', 'CHA',
        'Material Type', 'Invoice No', 'Docket No', 'Gate Pass', 'Vendor', 'Courier', 'UOM', 'ODC',
        'Section', 'Handler', 'Parcel Count', 'OTP1', 'OTP1 Verified', 'OTP2', 'OTP2 Verified', 'End User', 'Status',
        'Timestamp A', 'Timestamp B', 'Timestamp C', 'Acceptance Status'
      ];

      const tableRows = data.map(row => [
        formatDate(row.date),
        formatValue(row.po_available),
        formatValue(row.po_no),
        formatValue(row.import_material),
        formatValue(row.free_of_cost),
        formatValue(row.country_of_origin),
        formatValue(row.cha),
        formatValue(row.material_type),
        formatValue(row.invoice_no),
        formatValue(row.docket_no),
        formatValue(row.gate_pass),
        formatValue(row.vendor),
        formatValue(row.courier),
        formatValue(row.uom),
        formatValue(row.odc),
        formatValue(row.section),
        formatValue(row.handler),
        formatValue(row.parcel_count),
        formatValue(row.otp1),
        formatValue(row.otp1_verified),
        formatValue(row.otp2),
        formatValue(row.otp2_verified),
        formatValue(row.end_user),
        formatValue(row.status),
        formatDate(row.timestamp_a),
        formatDate(row.timestamp_b),
        formatDate(row.timestamp_c),
        formatValue(row.acceptance_status)
      ]);

      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        styles: { fontSize: 8 }
      });

      const pdfOutput = doc.output();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfOutput, 'binary'));
    } else {
      return res.status(400).json({ success: false, message: 'Invalid format' });
    }
  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({ success: false, message: 'Server error during export' });
  }
});

// ---------------- LATEST ----------------
router.get('/latest', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const { start, end } = req.query;

    let query = `
      SELECT date, po_available, po_no, import_material, free_of_cost, country_of_origin, cha,
             material_type, invoice_no, docket_no, gate_pass, vendor, courier, uom, odc,
             section, handler, parcel_count, otp1, otp1_verified, otp2, otp2_verified, end_user, status,
             timestamp_a, timestamp_b, timestamp_c, acceptance_status
      FROM materials_new WHERE 1=1`;
    const params = [];

    if (start) {
      params.push(start);
      query += ` AND DATE(timestamp_a) >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      query += ` AND DATE(timestamp_a) <= $${params.length}`;
    }

    query += ` ORDER BY id DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error('❌ /latest error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---------------- DASHBOARD ----------------
router.get('/dashboard', async (req, res) => {
  try {
    const { start, end } = req.query;
    let filter = '';
    const params = [];

    if (start) {
      params.push(start);
      filter += ` AND DATE(timestamp_a) >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      filter += ` AND DATE(timestamp_a) <= $${params.length}`;
    }

    // Counts
    const countsQuery = `
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (
          WHERE otp1 IS NOT NULL AND otp1_verified = false
        )::INT AS with_receiver,
        COUNT(*) FILTER (
          WHERE otp1_verified = true AND otp2_verified = false
        )::INT AS with_handler,
        COUNT(*) FILTER (
          WHERE otp2 IS NOT NULL AND otp2_verified = false
        )::INT AS with_enduser,
        COUNT(*) FILTER (WHERE status = 'delivered')::INT AS delivered
      FROM materials_new
      WHERE 1=1 ${filter};
    `;

    const countsRes = await pool.query(countsQuery, params);
    const counts = countsRes.rows[0];

    // Deliveries
    const deliveriesQuery = `
      SELECT TO_CHAR(DATE(timestamp_a), 'YYYY-MM-DD') AS day,
             COUNT(*)::INT AS count
      FROM materials_new
      WHERE status = 'delivered' ${filter}
      GROUP BY day
      ORDER BY day;
    `;
    const deliveriesRes = await pool.query(deliveriesQuery, params);

    res.json({
      success: true,
      data: {
        counts,
        deliveries: deliveriesRes.rows
      }
    });

  } catch (err) {
    console.error('❌ /dashboard error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;