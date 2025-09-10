const express = require('express');
const router = express.Router();
const pool = require('../db');
const nodemailer = require('nodemailer');
// Uncomment the line below if using SendGrid
// const sgMail = require('@sendgrid/mail');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Initialize nodemailer transporter for Outlook
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: 'noreply_itsupport@banasdairy.coop', // Replace with your actual @banasdairy.coop email
    pass: 'Banas@2025' // Replace with your Outlook password or app-specific password
  },
  tls: {
    ciphers: 'SSLv3', // Allow SSLv3 ciphers
    rejectUnauthorized: false // Allow self-signed certificates (if applicable)
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Nodemailer configuration error:', {
      message: error.message,
      code: error.code,
      response: error.response,
      responseCode: error.responseCode
    });
  } else {
    console.log('✅ Nodemailer ready to send emails');
  }
});

/* Alternative SendGrid configuration (uncomment to use)
// Set SendGrid API key
sgMail.setApiKey('your-sendgrid-api-key'); // Replace with your SendGrid API key

const transporter = {
  sendMail: (mailOptions, callback) => {
    const msg = {
      to: mailOptions.to,
      from: 'yourusername@banasdairy.coop', // Replace with your verified @banasdairy.coop email
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.text.replace(/\n/g, '<br>')
    };
    sgMail.send(msg)
      .then(() => callback(null, { response: 'Email sent via SendGrid' }))
      .catch(error => callback(error, null));
  },
  verify: callback => {
    if ('your-sendgrid-api-key' && 'yourusername@banasdairy.coop') {
      console.log('✅ SendGrid transporter ready');
      callback(null, true);
    } else {
      const error = new Error('Missing SendGrid API key or sender email');
      console.error('❌ SendGrid configuration error:', error.message);
      callback(error);
    }
  }
};

// Verify SendGrid configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SendGrid configuration error:', error.message);
  } else {
    console.log('✅ SendGrid ready to send emails');
  }
});
*/

// Fetch end users by section (no session check required)
router.get('/list-endusers-by-section', async (req, res) => {
  try {
    const { section } = req.query;
    if (!section) {
      return res.status(400).json({ success: false, message: 'Section is required' });
    }

    const query = 'SELECT username FROM end_users WHERE section = $1 ORDER BY username';
    const result = await pool.query(query, [section]);

    res.json({ success: true, endusers: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Session check middleware
const checkSession = async (req, res, next) => {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
  }
  try {
    const handlerCheck = await pool.query('SELECT username FROM handlers WHERE username = $1', [req.session.username]);
    if (handlerCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Session username is not a valid handler' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (!req.session) {
      return res.status(500).json({ success: false, message: 'Server error: Session not initialized' });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const result = await pool.query('SELECT * FROM handlers WHERE username = $1 AND password = $2', [username, password]);
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
router.get('/check-session', async (req, res) => {
  if (req.session && req.session.username) {
    try {
      const handlerCheck = await pool.query('SELECT username FROM handlers WHERE username = $1', [req.session.username]);
      if (handlerCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Session username is not a valid handler' });
      }
      res.json({ success: true, username: req.session.username });
    } catch (error) {
      res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
  } else {
    res.json({ success: false });
  }
});

// Logout
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Server error during logout' });
    }
    res.json({ success: true });
  });
});

// Fetch all materials for handler
router.post('/fetch-materials', checkSession, async (req, res) => {
  try {
    const handler = req.session.username;

    const query = `
      SELECT 
        m.po_no, m.invoice_no, m.docket_no, m.gate_pass, m.vendor, 
        m.section, m.handler, m.otp1, m.status, m.timestamp_a,
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
      LEFT JOIN material_items mi ON m.handler = mi.handler 
        AND (m.po_no = mi.identifier_value OR m.invoice_no = mi.identifier_value 
             OR m.docket_no = mi.identifier_value OR m.gate_pass = mi.identifier_value)
        AND mi.identifier_type IN ('po_no', 'invoice_no', 'docket_no', 'gate_pass')
      WHERE m.handler = $1
        AND m.status IN ('withReceiver', 'withHandler', 'withEndUser')
      GROUP BY m.id, m.po_no, m.invoice_no, m.docket_no, m.gate_pass, 
               m.vendor, m.section, m.handler, m.otp1, m.status, m.timestamp_a
    `;
    const result = await pool.query(query, [handler]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No materials found for this handler' });
    }

    res.json({ success: true, materials: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Fetch UAT status for handler
router.post('/uat-status', checkSession, async (req, res) => {
  try {
    const handler = req.session.username;

    const query = `
      SELECT 
        mi.material_id, mi.quantity_received, 
        mi.acceptance_status, mi.approval_comment, mi.end_user, 
        m.section, m.po_no, m.invoice_no, m.gate_pass
      FROM material_items mi
      JOIN materials_new m ON mi.identifier_value = m.po_no
        AND mi.identifier_type = 'po_no'
        AND mi.end_user = m.end_user
      WHERE mi.handler = $1
        AND mi.acceptance_status IN ('accepted', 'rejected')
      ORDER BY mi.id DESC
    `;
    const result = await pool.query(query, [handler]);

    res.json({ success: true, items: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Submit to End User
router.post('/submit-to-enduser', checkSession, async (req, res) => {
  try {
    const { handler, identifier_type, identifier_value, section, end_user, items } = req.body;

    if (!handler || !identifier_type || !identifier_value || !section || !end_user || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Handler, Identifier Type, Identifier Value, Section, End User, and at least one item are required' });
    }
    if (!['po_no', 'docket_no', 'invoice_no', 'gate_pass'].includes(identifier_type)) {
      return res.status(400).json({ success: false, message: 'Invalid Identifier Type. Must be po_no, docket_no, invoice_no, or gate_pass' });
    }
    if (handler !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Handler does not match session' });
    }

    // Validate items
    for (const item of items) {
      if (!item.material_id || !item.material_description || !item.quantity_received || item.quantity_received < 1) {
        return res.status(400).json({ success: false, message: 'All items must have material ID, description, and valid quantity received' });
      }
    }

    const handlerCheck = await pool.query('SELECT username FROM handlers WHERE username = $1', [handler]);
    if (handlerCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid Handler' });
    }

    const endUserCheck = await pool.query('SELECT username, email FROM end_users WHERE username = $1 AND section = $2', [end_user, section]);
    if (endUserCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid End User or End User not in selected section' });
    }

    // Verify material exists in materials_new
    const materialCheckQuery = `
      SELECT id FROM materials_new 
      WHERE ${identifier_type} = $1 
      AND status IN ('withReceiver', 'withHandler')
    `;
    const materialCheckResult = await pool.query(materialCheckQuery, [identifier_value]);
    if (materialCheckResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Material not found or not in valid status' });
    }

    // Update materials_new with end_user, status, and otp2
    const otp2 = generateOTP();
    const updateMaterialQuery = `
      UPDATE materials_new
      SET end_user = $1, status = 'withHandler', otp2 = $2, timestamp_c = NOW()
      WHERE ${identifier_type} = $3
      AND status IN ('withReceiver', 'withHandler')
      RETURNING id
    `;
    const updateMaterialResult = await pool.query(updateMaterialQuery, [end_user, otp2, identifier_value]);
    if (updateMaterialResult.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'Failed to update material status' });
    }

    // Insert each item into material_items
    for (const item of items) {
      const insertQuery = `
        INSERT INTO material_items (
          identifier_type, identifier_value, material_id, material_description, 
          quantity_received, end_user, handler
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      const insertResult = await pool.query(insertQuery, [
        identifier_type,
        identifier_value,
        item.material_id,
        item.material_description,
        item.quantity_received,
        end_user,
        handler
      ]);

      if (insertResult.rowCount === 0) {
        return res.status(400).json({ success: false, message: 'Failed to insert material item' });
      }
    }

    // Log the submission in user_logs
    const logQuery = `
      INSERT INTO user_logs (username, action, details)
      VALUES ($1, $2, $3)
    `;
    await pool.query(logQuery, [
      handler,
      'submit_to_enduser',
      `Assigned materials to ${end_user} with ${identifier_type}: ${identifier_value}`
    ]);

    // Send email to end user
    const endUserEmail = endUserCheck.rows[0].email;
    const itemsList = items.map(item => 
      `Material ID: ${item.material_id}, Description: ${item.material_description}, Quantity: ${item.quantity_received}`
    ).join('\n');
    const emailContent = `
      Dear ${end_user},

      Materials have been assigned to you by handler ${handler.replace(/^\d{8}_/, '')}. Please find the details below:

      Identifier Type: ${identifier_type}
      Identifier Value: ${identifier_value}
      Section: ${section}
      Items:
      ${itemsList}
      OTP for Verification: ${otp2}

      Please use the OTP to verify receipt in the End User Portal.

      Regards,
      Material Flow System
    `;

    const mailOptions = {
      from: 'yourusername@banasdairy.coop', // Replace with your actual @banasdairy.coop email
      to: endUserEmail,
      subject: 'Material Assignment Notification',
      text: emailContent
    };

    // Send email (non-blocking)
    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.error(`❌ Error sending email to ${endUserEmail}:`, {
          message: error.message,
          code: error.code,
          response: error.response,
          responseCode: error.responseCode
        });
        // Log email failure in user_logs
        await pool.query(logQuery, [
          handler,
          'email_failure',
          `Failed to send email to ${endUserEmail}: ${error.message}`
        ]);
      } else {
        console.log(`✅ Email sent to ${endUserEmail}: ${info.response}`);
        // Log email success in user_logs
        await pool.query(logQuery, [
          handler,
          'email_sent',
          `Sent email to ${endUserEmail} for material assignment with ${identifier_type}: ${identifier_value}`
        ]);
      }
    });

    res.json({ success: true, message: `Materials submitted successfully to End User ${end_user}. Notification email sent.` });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Verify OTP2 from End User
router.post('/verify-otp2', checkSession, async (req, res) => {
  try {
    const { handler, identifier_type, identifier_value, section, end_user, otp2 } = req.body;

    if (!handler || !identifier_type || !identifier_value || !section || !end_user || !otp2) {
      return res.status(400).json({ success: false, message: 'Handler, Identifier Type, Identifier Value, Section, End User, and OTP are required' });
    }
    if (!['po_no', 'docket_no', 'invoice_no', 'gate_pass'].includes(identifier_type)) {
      return res.status(400).json({ success: false, message: 'Invalid Identifier Type. Must be po_no, docket_no, invoice_no, or gate_pass' });
    }
    if (handler !== req.session.username) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Handler does not match session' });
    }

    const handlerCheck = await pool.query('SELECT username FROM handlers WHERE username = $1', [handler]);
    if (handlerCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid Handler' });
    }

    const endUserCheck = await pool.query('SELECT username FROM end_users WHERE username = $1 AND section = $2', [end_user, section]);
    if (endUserCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid End User or End User not in selected section' });
    }

    const findQuery = `
      SELECT id, otp2, end_user
      FROM materials_new
      WHERE handler = $1
      AND LOWER(${identifier_type}) = LOWER($2)
      AND end_user = $3
      AND status = 'withHandler'
      AND otp2_verified = false
    `;
    const findResult = await pool.query(findQuery, [handler, identifier_value, end_user]);
    if (findResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Material not found, not in withHandler status, or already verified' });
    }

    const material = findResult.rows[0];
    if (material.otp2 !== otp2) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const updateQuery = `
      UPDATE materials_new
      SET status = 'withEndUser', otp2_verified = true, timestamp_c = NOW()
      WHERE id = $1
      RETURNING id
    `;
    const updateResult = await pool.query(updateQuery, [material.id]);

    if (updateResult.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'Failed to verify OTP' });
    }

    res.json({ success: true, message: `OTP verified successfully. Material is now with End User.` });
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
    const result = await pool.query('SELECT * FROM handlers WHERE username = $1 AND password = $2', [username, old_password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid old password' });
    }
    const updateQuery = 'UPDATE handlers SET password = $1 WHERE username = $2 RETURNING username';
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