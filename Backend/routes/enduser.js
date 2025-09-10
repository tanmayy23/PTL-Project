const express = require('express');
const router = express.Router();
const pool = require('../db');

// Session check middleware
const checkSession = (req, res, next) => {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
  }
  next();
};

// List all end users
router.get('/list-endusers', async (req, res) => {
  try {
    const result = await pool.query('SELECT username FROM end_users ORDER BY username');
    res.json({ success: true, endusers: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const result = await pool.query('SELECT * FROM end_users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!req.session) {
      return res.status(500).json({ success: false, message: 'Server error: Session not initialized' });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });

    req.session.username = username;
    res.json({ success: true, username });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Check session
router.get('/check-session', async (req, res) => {
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
router.post('/logout', async (req, res) => {
  try {
    if (!req.session) {
      return res.json({ success: true });
    }
    await new Promise((resolve, reject) => {
      req.session.destroy(err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Fetch materials for End User
router.post('/fetch-materials', checkSession, async (req, res) => {
  try {
    const { end_user } = req.body;

    if (!end_user) {
      return res.status(400).json({ success: false, message: 'End User is required' });
    }
    if (end_user !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: End User does not match session' });
    }

    const query = `
      SELECT 
        m.id, m.date, m.po_available, m.po_no, m.import_material, m.free_of_cost, 
        m.country_of_origin, m.cha, m.material_type, m.invoice_no, m.docket_no, 
        m.gate_pass, m.vendor, m.courier, m.uom, m.odc, m.section, m.handler, 
        m.parcel_count, m.status, m.timestamp_c, m.otp2, m.end_user, m.acceptance_status,
        COALESCE(
          ARRAY_AGG(
            JSON_BUILD_OBJECT(
              'material_id', mi.material_id,
              'material_description', mi.material_description,
              'quantity_received', mi.quantity_received
            )
          ) FILTER (WHERE mi.id IS NOT NULL),
          '{}'
        ) AS items
      FROM materials_new m
      LEFT JOIN material_items mi ON m.end_user = mi.end_user
        AND (m.po_no = mi.identifier_value OR m.invoice_no = mi.identifier_value 
             OR m.docket_no = mi.identifier_value OR m.gate_pass = mi.identifier_value)
        AND mi.identifier_type IN ('po_no', 'invoice_no', 'docket_no', 'gate_pass')
      WHERE m.end_user = $1 
      AND m.status IN ('withHandler', 'withEndUser')
      GROUP BY m.id
    `;
    const result = await pool.query(query, [end_user]);

    res.json({ success: true, materials: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Fetch pending materials for approval
router.post('/pending-materials', checkSession, async (req, res) => {
  try {
    const { end_user } = req.body;

    if (!end_user) {
      return res.status(400).json({ success: false, message: 'End User is required' });
    }
    if (end_user !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: End User does not match session' });
    }

    const query = `
      SELECT 
        id, po_no, docket_no, invoice_no, gate_pass, timestamp_c,
        CASE
          WHEN po_no IS NOT NULL THEN po_no
          WHEN docket_no IS NOT NULL THEN docket_no
          WHEN invoice_no IS NOT NULL THEN invoice_no
          WHEN gate_pass IS NOT NULL THEN gate_pass
          ELSE NULL
        END AS identifier,
        CASE
          WHEN po_no IS NOT NULL THEN 'po_no'
          WHEN docket_no IS NOT NULL THEN 'docket_no'
          WHEN invoice_no IS NOT NULL THEN 'invoice_no'
          WHEN gate_pass IS NOT NULL THEN 'gate_pass'
          ELSE NULL
        END AS identifier_type
      FROM materials_new
      WHERE end_user = $1
        AND status = 'withEndUser'
        AND otp2_verified = true
        AND (acceptance_status IS NULL OR acceptance_status = '')
      ORDER BY timestamp_c DESC
    `;
    const result = await pool.query(query, [end_user]);

    res.json({ success: true, materials: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Fetch pending materials for approval by identifier type
router.post('/pending-materials-by-identifier', checkSession, async (req, res) => {
  try {
    const { end_user, identifier_type, identifier_value } = req.body;

    if (!end_user || !identifier_type || !identifier_value) {
      return res.status(400).json({ success: false, message: 'End User, Identifier Type, and Identifier Value are required' });
    }
    if (!['po_no', 'docket_no', 'invoice_no', 'gate_pass'].includes(identifier_type)) {
      return res.status(400).json({ success: false, message: 'Invalid Identifier Type. Must be po_no, docket_no, invoice_no, or gate_pass' });
    }
    if (end_user !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: End User does not match session' });
    }

    console.log(`Fetching materials for end_user: ${end_user}, identifier_type: ${identifier_type}, identifier_value: ${identifier_value}`);

    const query = `
      SELECT 
        mi.id, mi.material_id, mi.material_description, mi.quantity_received,
        mi.identifier_type, mi.identifier_value, m.timestamp_c
      FROM material_items mi
      JOIN materials_new m ON mi.identifier_value = m.${identifier_type}
        AND mi.identifier_type = $2
        AND m.end_user = mi.end_user
      WHERE mi.end_user = $1 
        AND mi.identifier_type = $2
        AND mi.identifier_value = $3
        AND m.status = 'withEndUser'
        AND m.otp2_verified = true
        AND (mi.acceptance_status IS NULL OR mi.acceptance_status = '')
    `;
    const result = await pool.query(query, [end_user, identifier_type, identifier_value]);

    console.log(`Query result: ${JSON.stringify(result.rows)}`);

    if (result.rows.length === 0) {
      return res.json({ success: true, materials: [], message: 'No pending materials found for this identifier' });
    }

    res.json({ success: true, materials: result.rows });
  } catch (error) {
    console.error(`Error in /pending-materials-by-identifier: ${error.message}`);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Approve or Reject material item
router.post('/approve-material', checkSession, async (req, res) => {
  try {
    const { end_user, identifier_type, identifier_value, action, comment, material_id } = req.body;

    if (!end_user || !identifier_type || !identifier_value || !action) {
      return res.status(400).json({ success: false, message: 'End User, Identifier Type, Identifier Value, and Action are required' });
    }
    if (!['po_no', 'docket_no', 'invoice_no', 'gate_pass'].includes(identifier_type)) {
      return res.status(400).json({ success: false, message: 'Invalid Identifier Type. Must be po_no, docket_no, invoice_no, or gate_pass' });
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid Action. Must be approve or reject' });
    }
    if (action === 'reject' && (!comment || comment.trim() === '')) {
      return res.status(400).json({ success: false, message: 'Comment is required for rejection' });
    }
    if (end_user !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: End User does not match session' });
    }

    console.log(`Processing ${action} for end_user: ${end_user}, material_id: ${material_id}, identifier_type: ${identifier_type}, identifier_value: ${identifier_value}`);

    let updateResult;
    if (material_id) {
      // Per-item approval
      const findQuery = `
        SELECT mi.id
        FROM material_items mi
        JOIN materials_new m ON mi.identifier_value = m.${identifier_type}
          AND mi.identifier_type = $2
          AND m.end_user = mi.end_user
        WHERE mi.end_user = $1
          AND mi.material_id = $3
          AND mi.identifier_type = $2
          AND mi.identifier_value = $4
          AND m.status = 'withEndUser'
          AND m.otp2_verified = true
          AND (mi.acceptance_status IS NULL OR mi.acceptance_status = '')
      `;
      const findResult = await pool.query(findQuery, [end_user, identifier_type, material_id, identifier_value]);

      if (findResult.rows.length === 0) {
        console.log(`Material item not found or already processed for material_id: ${material_id}`);
        return res.status(400).json({ success: false, message: 'Material item not found, not in withEndUser status, or already approved/rejected' });
      }

      const item_id = findResult.rows[0].id;
      const acceptanceStatus = action === 'approve' ? 'accepted' : 'rejected';

      const updateQuery = `
        UPDATE material_items
        SET acceptance_status = $1, approval_comment = $2
        WHERE id = $3
        RETURNING id
      `;
      updateResult = await pool.query(updateQuery, [acceptanceStatus, comment || null, item_id]);
      console.log(`Updated material_items: id=${item_id}, acceptance_status=${acceptanceStatus}, comment=${comment || 'null'}`);
    } else {
      // Legacy approval for entire material
      const findQuery = `
        SELECT id
        FROM materials_new
        WHERE end_user = $1
        AND ${identifier_type} = $2
        AND status = 'withEndUser'
        AND otp2_verified = true
        AND (acceptance_status IS NULL OR acceptance_status = '')
      `;
      const findResult = await pool.query(findQuery, [end_user, identifier_value]);

      if (findResult.rows.length === 0) {
        console.log(`Material not found or already processed for ${identifier_type}=${identifier_value}`);
        return res.status(400).json({ success: false, message: 'Material not found, not in withEndUser status, or already approved/rejected' });
      }

      const material_id = findResult.rows[0].id;
      const newStatus = action === 'approve' ? 'delivered' : 'rejected';
      const acceptanceStatus = action === 'approve' ? 'accepted' : 'rejected';

      const updateQuery = `
        UPDATE materials_new
        SET status = $1, acceptance_status = $2, approval_comment = $3
        WHERE id = $4
        RETURNING id
      `;
      updateResult = await pool.query(updateQuery, [newStatus, acceptanceStatus, comment || null, material_id]);
      console.log(`Updated materials_new: id=${material_id}, status=${newStatus}, acceptance_status=${acceptanceStatus}`);

      // Update all related material_items
      const updateItemsQuery = `
        UPDATE material_items
        SET acceptance_status = $1, approval_comment = $2
        WHERE identifier_type = $3
        AND identifier_value = $4
        AND end_user = $5
        AND (acceptance_status IS NULL OR acceptance_status = '')
      `;
      const itemsUpdateResult = await pool.query(updateItemsQuery, [acceptanceStatus, comment || null, identifier_type, identifier_value, end_user]);
      console.log(`Updated ${itemsUpdateResult.rowCount} material_items for ${identifier_type}=${identifier_value}`);
    }

    if (updateResult.rowCount === 0) {
      console.log(`Failed to update material for ${identifier_type}=${identifier_value}`);
      return res.status(400).json({ success: false, message: 'Failed to update material status' });
    }

    // Check if all items for this material are processed
    const checkAllItemsQuery = `
      SELECT id
      FROM material_items
      WHERE identifier_type = $1
        AND identifier_value = $2
        AND end_user = $3
        AND (acceptance_status IS NULL OR acceptance_status = '')
    `;
    const checkAllItemsResult = await pool.query(checkAllItemsQuery, [identifier_type, identifier_value, end_user]);
    console.log(`Pending items for ${identifier_type}=${identifier_value}: ${checkAllItemsResult.rows.length}`);

    if (checkAllItemsResult.rows.length === 0 && !material_id) {
      const newStatus = action === 'approve' ? 'delivered' : 'rejected';
      const acceptanceStatus = action === 'approve' ? 'accepted' : 'rejected';
      const materialUpdateQuery = `
        UPDATE materials_new
        SET status = $1, acceptance_status = $2, approval_comment = $3
        WHERE ${identifier_type} = $4
        AND end_user = $5
        RETURNING id
      `;
      const materialUpdateResult = await pool.query(materialUpdateQuery, [newStatus, acceptanceStatus, comment || null, identifier_value, end_user]);
      console.log(`Updated materials_new after all items processed: id=${materialUpdateResult.rows[0]?.id}, status=${newStatus}`);
    } else if (checkAllItemsResult.rows.length === 0) {
      // Update materials_new when all items are processed, even for per-item approval
      const newStatus = action === 'approve' ? 'delivered' : 'rejected';
      const acceptanceStatus = action === 'approve' ? 'accepted' : 'rejected';
      const materialUpdateQuery = `
        UPDATE materials_new
        SET status = $1, acceptance_status = $2, approval_comment = $3
        WHERE ${identifier_type} = $4
        AND end_user = $5
        AND status = 'withEndUser'
        AND otp2_verified = true
        AND (acceptance_status IS NULL OR acceptance_status = '')
        RETURNING id
      `;
      const materialUpdateResult = await pool.query(materialUpdateQuery, [newStatus, acceptanceStatus, comment || null, identifier_value, end_user]);
      console.log(`Updated materials_new after all items processed (per-item): id=${materialUpdateResult.rows[0]?.id}, status=${newStatus}`);
    }

    res.json({ success: true, message: `Material ${action}ed successfully` });
  } catch (error) {
    console.error(`Error in /approve-material: ${error.message}`);
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

    const result = await pool.query('SELECT * FROM end_users WHERE username = $1 AND password = $2', [username, old_password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid old password' });
    }

    const updateQuery = 'UPDATE end_users SET password = $1 WHERE username = $2 RETURNING username';
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