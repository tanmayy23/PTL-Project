const express = require('express');
const router = express.Router();
const pool = require('../db');

// Helper to get last 7 non-Sunday days in DD-MM-YY format, including today
const getLast7NonSundayDays = () => {
  const dates = [];
  let count = 0;
  let i = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (count < 7) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if (date.getDay() !== 0) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const formattedDate = `${day}-${month}-${year}`;
      dates.push(formattedDate);
      count++;
    }
    i++;
  }
  return dates.reverse();
};

/**
 * @route GET /api/dashboard/matrix
 * @desc Get matrix of pending materials (withReceiver) for handlers over last 7 non-Sunday days
 */
router.get('/matrix', async (req, res) => {
  try {
    // Fetch handlers from the database
    const handlerQuery = await pool.query('SELECT username FROM handlers ORDER BY username');
    const validHandlers = handlerQuery.rows.map(row => row.username);

    if (!validHandlers.length) {
      return res.status(500).json({ success: false, message: 'No handlers found in database' });
    }

    const dates = getLast7NonSundayDays();
    if (!dates || !dates.length) {
      return res.status(500).json({ success: false, message: 'Server error: Unable to generate date range' });
    }

    // Convert dates to PostgreSQL format (YYYY-MM-DD) for query
    const dateObjects = dates.map(date => {
      const [day, month, year] = date.split('-');
      return `20${year}-${month}-${day}`;
    });

    if (!dateObjects || !dateObjects.length) {
      return res.status(500).json({ success: false, message: 'Server error: Invalid date objects' });
    }

    // Query for counts of pending materials by handler and date
    const query = `
      SELECT 
        TRIM(handler) AS handler,
        TO_CHAR(date, 'DD-MM-YY') AS day,
        COUNT(*)::int AS count
      FROM public.materials_new
      WHERE LOWER(TRIM(status)) = 'withreceiver'
        AND date >= $1
        AND date <= $2
      GROUP BY TRIM(handler), date
      ORDER BY TRIM(handler), date DESC;
    `;
    const params = [dateObjects[0], dateObjects[dates.length - 1]];
    const result = await pool.query(query, params);

    // Build matrix
    const matrix = validHandlers.map(handler => {
      const displayName = handler.replace(/^\d{8}_/, '');
      const counts = new Array(dates.length).fill(0);
      const relevantRows = result.rows.filter(row => row.handler === handler);

      dates.forEach((date, index) => {
        const matchingRow = relevantRows.find(row => row.day === date);
        if (matchingRow) {
          counts[index] = matchingRow.count;
        }
      });

      const totalPending = counts.reduce((sum, count) => sum + count, 0);

      return { handler, displayName, counts, totalPending };
    });

    res.json({
      success: true,
      data: {
        handlers: validHandlers,
        dates,
        matrix
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

module.exports = router;