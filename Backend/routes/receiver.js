const express = require('express');
const router = express.Router();
const pool = require('../db');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Session check middleware
const checkSession = (req, res, next) => {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
  }
  next();
};

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const result = await pool.query('SELECT * FROM receivers WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    req.session.username = username;
    res.json({ success: true, username });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Check session
router.get('/check-session', (req, res) => {
  try {
    if (req.session && req.session.username) {
      res.json({ success: true, username: req.session.username });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Logout
router.post('/logout', (req, res) => {
  try {
    if (!req.session) {
      return res.json({ success: true });
    }
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ success: false, message: `Server error: ${err.message}` });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Submit Material
router.post('/submit', checkSession, async (req, res) => {
  try {
    const {
      date, po_available, po_no, import_material, free_of_cost, boe_no, country_of_origin, cha,
      material_type, invoice_no, docket_no, gate_pass, vendor, courier, uom, odc,
      section, handler, parcel_count
    } = req.body;

    const poAvailableBool = po_available === 'true';
    const importMaterialBool = import_material === 'true';
    const freeOfCostBool = free_of_cost === 'true';
    const odcBool = odc === 'true';

    // Validate required fields
    if (!date || !vendor || !courier || !uom || !section || !handler || !parcel_count) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }
    if (poAvailableBool && !po_no) {
      return res.status(400).json({ success: false, message: 'PO Number is required when PO Available is Yes.' });
    }
    if (importMaterialBool && (!boe_no || !country_of_origin || !cha)) {
      return res.status(400).json({ success: false, message: 'BOE Number, Country of Origin, and CHA are required when Import Material is Yes.' });
    }
    if (material_type === 'new' && (!invoice_no || !docket_no)) {
      return res.status(400).json({ success: false, message: 'Invoice No. and Docket No. are required for New Material Order.' });
    }
    if (material_type === 'returnable' && !gate_pass) {
      return res.status(400).json({ success: false, message: 'Gate Pass Number is required for Returnable Material Order.' });
    }

    // Check for duplicate po_no
    if (po_no) {
      const poCheck = await pool.query('SELECT id FROM materials_new WHERE po_no = $1', [po_no]);
      if (poCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'PO No already exists' });
      }
    }

    // Check for duplicate docket_no
    if (docket_no) {
      const docketCheck = await pool.query('SELECT id FROM materials_new WHERE docket_no = $1', [docket_no]);
      if (docketCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Docket No already exists' });
      }
    }

    // Check for duplicate invoice_no
    if (invoice_no) {
      const invoiceCheck = await pool.query('SELECT id FROM materials_new WHERE invoice_no = $1', [invoice_no]);
      if (invoiceCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Invoice No already exists' });
      }
    }

    // Check for duplicate gate_pass
    if (gate_pass) {
      const gatePassCheck = await pool.query('SELECT id FROM materials_new WHERE gate_pass = $1', [gate_pass]);
      if (gatePassCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Gate Pass already exists' });
      }
    }

    // Validate handler
    if (handler !== 'Other') {
      const handlerCheck = await pool.query('SELECT username FROM users WHERE username = $1', [handler]);
      if (handlerCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid Material Handler.' });
      }
    }

    const otp1 = generateOTP();

    const query = `
      INSERT INTO materials_new (
        date, po_available, po_no, import_material, free_of_cost, boe_no, country_of_origin, cha,
        material_type, invoice_no, docket_no, gate_pass, vendor, courier, uom, odc,
        section, handler, parcel_count, otp1, otp1_verified, status, timestamp_a, acceptance_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      )
      RETURNING id, date, po_available, po_no, import_material, free_of_cost, boe_no, country_of_origin, cha,
                material_type, invoice_no, docket_no, gate_pass, vendor, courier, uom, odc,
                section, handler, parcel_count, status, timestamp_a
    `;
    const values = [
      date || null,
      poAvailableBool,
      poAvailableBool ? po_no : null,
      importMaterialBool,
      importMaterialBool ? freeOfCostBool : null,
      importMaterialBool ? boe_no : null,
      importMaterialBool ? country_of_origin : null,
      importMaterialBool ? cha : null,
      material_type || null,
      material_type === 'new' ? invoice_no : null,
      material_type === 'new' ? docket_no : null,
      material_type === 'returnable' ? gate_pass : null,
      vendor || null,
      courier || null,
      uom || null,
      odcBool,
      section || null,
      handler || null,
      parseInt(parcel_count, 10) || 1,
      otp1,
      false,
      'withReceiver',
      new Date(),
      null
    ];

    const result = await pool.query(query, values);

    // Filter sensitive fields from the response
    const { otp1: _, otp1_verified: __, ...filteredEntry } = result.rows[0];

    res.status(201).json({
      success: true,
      message: `Material submitted successfully and assigned to Handler ${handler}.`,
      entry: filteredEntry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Verify OTP1 from Handler
router.post('/verify-otp1', checkSession, async (req, res) => {
  try {
    const { handler, identifier_type, identifier, otp1 } = req.body;

    if (!handler || !identifier_type || !identifier || !otp1) {
      return res.status(400).json({ success: false, message: 'Handler, Identifier Type, Identifier, and OTP are required' });
    }
    if (!['po_no', 'docket_no', 'invoice_no', 'gate_pass'].includes(identifier_type)) {
      return res.status(400).json({ success: false, message: 'Invalid Identifier Type. Must be po_no, docket_no, invoice_no, or gate_pass' });
    }
    if (handler !== 'Other') {
      const handlerCheck = await pool.query('SELECT username FROM users WHERE username = $1', [handler]);
      if (handlerCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid Handler' });
      }
    }

    const findQuery = `
      SELECT id, otp1, otp1_verified, status
      FROM materials_new
      WHERE LOWER(${identifier_type}) = LOWER($1)
      AND otp1 = $2
      AND handler = $3
      AND status = 'withReceiver'
      AND otp1_verified = false
    `;
    const findResult = await pool.query(findQuery, [identifier, otp1, handler]);
    if (findResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Material not found, OTP1 invalid, already verified, or not in withReceiver status' });
    }

    const material_id = findResult.rows[0].id;
    const updateQuery = `
      UPDATE materials_new
      SET otp1_verified = true, status = 'withHandler', timestamp_b = NOW()
      WHERE id = $1
      RETURNING id
    `;
    const updateResult = await pool.query(updateQuery, [material_id]);

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'Failed to verify OTP1' });
    }

    res.json({ success: true, message: 'OTP1 verified successfully. Material is now with Handler.' });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Change Password
router.post('/change-password', checkSession, async (req, res) => {
  try {
    const { username, old_password, new_password } = req.body;

    if (!username || !old_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Username, old password, and new password are required' });
    }
    if (username !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Cannot change password for another user' });
    }

    const result = await pool.query('SELECT * FROM receivers WHERE username = $1 AND password = $2', [username, old_password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid old password' });
    }

    const updateQuery = 'UPDATE receivers SET password = $1 WHERE username = $2 RETURNING username';
    const updateResult = await pool.query(updateQuery, [new_password, username]);
    if (updateResult.rowCount === 0) {
      return res.status(500).json({ success: false, message: 'Failed to update password' });
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

module.exports = router;