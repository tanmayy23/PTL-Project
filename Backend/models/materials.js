// models/material.js
const pool = require('../db');

async function createMaterial(data) {
  const {
    gate_pass, po_no, po_available, invoice_no, docket_no,
    vendor, courier, uom, odc, section, handler, parcel_count, otp1
  } = data;

  const query = `
    INSERT INTO materials (
      gate_pass, po_no, po_available, invoice_no, docket_no,
      vendor, courier, uom, odc, section, handler, parcel_count,
      otp1, status, timestamp_a
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11, $12,
      $13, 'withHandler', NOW()
    ) RETURNING *;
  `;

  const values = [
    gate_pass, po_no, po_available, invoice_no, docket_no,
    vendor, courier, uom, odc, section, handler, parcel_count, otp1
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

module.exports = {
  createMaterial
};
