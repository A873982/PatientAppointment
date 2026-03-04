import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { DIST_DIR, PORT } from './config.js';
import { pool, withTransaction } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const DAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function toIsoDate(input) {
  if (!input) return new Date().toISOString().split('T')[0];
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  return date.toISOString().split('T')[0];
}

function parseAvailability(availability) {
  if (!availability) return null;
  const text = availability.toLowerCase().trim();
  if (text === 'mon-sun') return { start: 1, end: 0, all: true };

  const match = text.match(/^(sun|mon|tue|wed|thu|fri|sat)\s*-\s*(sun|mon|tue|wed|thu|fri|sat)$/);
  if (!match) return null;
  return { start: DAY_INDEX[match[1]], end: DAY_INDEX[match[2]], all: false };
}

function isDoctorAvailableOnDate(availability, dateStr) {
  const parsed = parseAvailability(availability);
  if (!parsed) return true;
  if (parsed.all) return true;
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  if (parsed.start <= parsed.end) {
    return day >= parsed.start && day <= parsed.end;
  }
  return day >= parsed.start || day <= parsed.end;
}

function generateSlotTimes() {
  const times = [];
  const addRange = (startHour, endHour) => {
    let currentMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    while (currentMinutes < endMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      const period = hour >= 12 ? 'PM' : 'AM';
      let displayHour = hour % 12;
      if (displayHour === 0) displayHour = 12;
      times.push(`${String(displayHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`);
      currentMinutes += 30;
    }
  };

  addRange(8, 12);
  addRange(13, 16);
  return times;
}

const DAILY_SLOT_TIMES = generateSlotTimes();

async function ensureSlotsForDate(db, doctorId, dateStr) {
  const holidayRes = await db.query(
    'SELECT reason FROM holidays WHERE doctor_id = $1 AND holiday_date = $2',
    [doctorId, dateStr],
  );
  if (holidayRes.rowCount > 0) {
    return { available: false, reason: holidayRes.rows[0].reason };
  }

  const doctorRes = await db.query('SELECT availability FROM doctors WHERE id = $1', [doctorId]);
  if (doctorRes.rowCount === 0) {
    return { available: false, reason: 'Doctor not found' };
  }

  if (!isDoctorAvailableOnDate(doctorRes.rows[0].availability, dateStr)) {
    return { available: false, reason: 'Off Duty (Weekly Schedule)' };
  }

  const slotCountRes = await db.query('SELECT COUNT(*)::int AS count FROM slots WHERE doctor_id = $1 AND date = $2', [
    doctorId,
    dateStr,
  ]);
  if (slotCountRes.rows[0].count === 0) {
    for (const time of DAILY_SLOT_TIMES) {
      await db.query(
        'INSERT INTO slots (doctor_id, date, time, is_booked, is_blocked) VALUES ($1, $2, $3, FALSE, FALSE) ON CONFLICT DO NOTHING',
        [doctorId, dateStr, time],
      );
    }
  }

  return { available: true };
}

function passwordHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    const result = await pool.query(
      'SELECT username, access FROM users WHERE username = $1 AND password_hash = $2',
      [username, passwordHash(password)],
    );
    if (!result.rowCount) return res.status(401).json(null);
    res.json({ username: result.rows[0].username, access: result.rows[0].access });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, pass, access } = req.body || {};
    if (!username || !pass || ![1, 2].includes(access)) {
      return res.status(400).json({ success: false });
    }
    await pool.query('INSERT INTO users (username, password_hash, access) VALUES ($1, $2, $3)', [
      username,
      passwordHash(pass),
      access,
    ]);
    res.json({ success: true });
  } catch (_err) {
    res.status(409).json({ success: false });
  }
});

app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query('SELECT username, access FROM users ORDER BY username ASC');
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch users' });
  }
});

app.get('/api/doctors', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, specialty, image, availability, room_no AS "roomNo", address FROM doctors ORDER BY name ASC',
    );
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch doctors' });
  }
});

app.put('/api/doctors/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    await pool.query(
      `INSERT INTO doctors (id, name, specialty, image, availability, room_no, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           specialty = EXCLUDED.specialty,
           image = EXCLUDED.image,
           availability = EXCLUDED.availability,
           room_no = EXCLUDED.room_no,
           address = EXCLUDED.address`,
      [
        req.params.id,
        payload.name,
        payload.specialty,
        payload.image,
        payload.availability,
        payload.roomNo,
        payload.address,
      ],
    );
    res.json({ success: true });
  } catch (_err) {
    res.status(400).json({ success: false });
  }
});

app.delete('/api/doctors/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM doctors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/ensure-slots', async (req, res) => {
  try {
    const doctorId = String(req.query.doctorId || '');
    const date = toIsoDate(String(req.query.date || ''));
    const result = await ensureSlotsForDate(pool, doctorId, date);
    res.json(result);
  } catch (_err) {
    res.status(400).json({ available: false, reason: 'Invalid request' });
  }
});

app.get('/api/schedules', async (req, res) => {
  try {
    const date = toIsoDate(String(req.query.date || ''));
    const doctorsRes = await pool.query(
      'SELECT id, name, specialty, image, availability, room_no AS "roomNo", address FROM doctors ORDER BY name ASC',
    );
    const schedules = {};

    for (const doc of doctorsRes.rows) {
      const availability = await ensureSlotsForDate(pool, doc.id, date);
      if (!availability.available) {
        schedules[doc.id] = {
          doctorId: doc.id,
          date,
          slots: [],
          isHoliday: true,
          holidayReason: availability.reason,
        };
        continue;
      }

      const slotsRes = await pool.query(
        `SELECT s.id, s.doctor_id AS "doctorId", s.date::text AS date, s.time, s.is_booked AS "isBooked",
                s.is_blocked AS "isBlocked", s.blocked_reason AS "blockedReason", s.patient_id AS "patientId",
                p.name AS "bookedBy", p.phone AS contact
         FROM slots s
         LEFT JOIN patients p ON p.id = s.patient_id
         WHERE s.doctor_id = $1 AND s.date = $2
         ORDER BY s.time ASC`,
        [doc.id, date],
      );
      schedules[doc.id] = {
        doctorId: doc.id,
        date,
        slots: slotsRes.rows.map((row) => ({ ...row, id: String(row.id) })),
        isHoliday: false,
      };
    }

    res.json(schedules);
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch schedules' });
  }
});

app.post('/api/appointments/book', async (req, res) => {
  const { doctorId, slotTime, patientName, patientPhone, patientDob, date } = req.body || {};
  if (!doctorId || !slotTime || !patientName || !patientPhone || !patientDob) {
    return res.status(400).json({ success: false, message: 'Missing booking fields.' });
  }

  try {
    const targetDate = toIsoDate(date);
    const result = await withTransaction(async (client) => {
      const availability = await ensureSlotsForDate(client, doctorId, targetDate);
      if (!availability.available) {
        return { success: false, message: `Unavailable: ${availability.reason}` };
      }

      const slotRes = await client.query(
        `SELECT id, is_booked AS "isBooked", is_blocked AS "isBlocked"
         FROM slots
         WHERE doctor_id = $1 AND date = $2 AND time = $3
         FOR UPDATE`,
        [doctorId, targetDate, slotTime],
      );

      if (!slotRes.rowCount) {
        return { success: false, message: 'Slot unavailable or already booked.' };
      }

      const slot = slotRes.rows[0];
      if (slot.isBooked || slot.isBlocked) {
        return { success: false, message: 'Slot unavailable or already booked.' };
      }

      const patientRes = await client.query(
        `INSERT INTO patients (name, dob, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, dob = EXCLUDED.dob
         RETURNING id`,
        [patientName, patientDob, patientPhone],
      );

      const patientId = patientRes.rows[0].id;
      await client.query('UPDATE slots SET is_booked = TRUE, patient_id = $1 WHERE id = $2', [patientId, slot.id]);

      return { success: true, message: 'Booked', slotId: slot.id };
    });

    res.json(result);
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Booking failed.' });
  }
});

app.post('/api/slots/:slotId/block', async (req, res) => {
  try {
    await pool.query(
      'UPDATE slots SET is_blocked = TRUE, blocked_reason = $1 WHERE id = $2 AND is_booked = FALSE',
      [req.body?.reason || 'Emergency', req.params.slotId],
    );
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/slots/:slotId/unblock', async (req, res) => {
  try {
    await pool.query('UPDATE slots SET is_blocked = FALSE, blocked_reason = NULL WHERE id = $1', [req.params.slotId]);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/holidays', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.doctor_id AS "doctorId", d.name AS "doctorName", h.holiday_date::text AS "holidayDate", h.reason
       FROM holidays h
       JOIN doctors d ON d.id = h.doctor_id
       ORDER BY h.holiday_date DESC`,
    );
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch holidays' });
  }
});

app.post('/api/holidays', async (req, res) => {
  try {
    const { doctorId, holidayDate, reason } = req.body || {};
    await pool.query('DELETE FROM slots WHERE doctor_id = $1 AND date = $2 AND is_booked = FALSE', [doctorId, holidayDate]);
    await pool.query('INSERT INTO holidays (doctor_id, holiday_date, reason) VALUES ($1, $2, $3)', [
      doctorId,
      holidayDate,
      reason || 'Vacation',
    ]);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.put('/api/holidays/:id', async (req, res) => {
  try {
    const { holidayDate, reason } = req.body || {};
    await pool.query('UPDATE holidays SET holiday_date = $1, reason = $2 WHERE id = $3', [
      holidayDate,
      reason || 'Vacation',
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.delete('/api/holidays/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM holidays WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/transcripts/upsert', async (req, res) => {
  try {
    const { slotId, patientName, transcript, existingFileName } = req.body || {};
    const fileName = existingFileName || `${Date.now()}_Transcript.txt`;
    const filePath = `Db/${fileName}`;
    await pool.query(
      `INSERT INTO transcripts (slot_id, patient_name, file_name, file_path, content)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_name) DO UPDATE
       SET slot_id = COALESCE(EXCLUDED.slot_id, transcripts.slot_id),
           patient_name = EXCLUDED.patient_name,
           content = EXCLUDED.content`,
      [slotId, patientName, fileName, filePath, transcript || ''],
    );
    res.json({ fileName });
  } catch (_err) {
    res.status(500).json({ error: 'Unable to save transcript' });
  }
});

app.get('/api/transcripts', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, slot_id AS "slotId", patient_name AS "patientName", file_name AS "fileName",
              file_path AS "filePath", created_at AS "createdAt"
       FROM transcripts
       ORDER BY created_at DESC`,
    );
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch transcripts' });
  }
});

app.get('/api/transcripts/:fileName/content', async (req, res) => {
  try {
    const result = await pool.query('SELECT content FROM transcripts WHERE file_name = $1', [req.params.fileName]);
    if (!result.rowCount) {
      return res.status(404).json({ content: 'Error: File content not found in storage.' });
    }
    res.json({ content: result.rows[0].content });
  } catch (_err) {
    res.status(500).json({ error: 'Unable to fetch transcript content' });
  }
});

app.post('/api/doctors/:id/reset-slots', async (req, res) => {
  try {
    await pool.query(
      'UPDATE slots SET is_booked = FALSE, is_blocked = FALSE, blocked_reason = NULL, patient_id = NULL WHERE doctor_id = $1',
      [req.params.id],
    );
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/admin/export-json', async (_req, res) => {
  try {
    const [users, doctors, patients, slots, holidays, transcripts] = await Promise.all([
      pool.query('SELECT username, access FROM users ORDER BY username'),
      pool.query('SELECT id, name, specialty, availability, room_no, address FROM doctors ORDER BY id'),
      pool.query('SELECT id, name, dob, phone FROM patients ORDER BY id'),
      pool.query('SELECT * FROM slots ORDER BY id'),
      pool.query('SELECT * FROM holidays ORDER BY id'),
      pool.query('SELECT id, slot_id, patient_name, file_name, file_path, created_at FROM transcripts ORDER BY id'),
    ]);
    res.json({
      exportedAt: new Date().toISOString(),
      users: users.rows,
      doctors: doctors.rows,
      patients: patients.rows,
      slots: slots.rows,
      holidays: holidays.rows,
      transcripts: transcripts.rows,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Unable to export data' });
  }
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false }));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const indexPath = path.join(DIST_DIR, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8').replace(/__GEMINI_API_KEY__/g, process.env.GEMINI_API_KEY || '');
    res.type('html').send(html);
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
