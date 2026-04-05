const prisma = require('../lib/prisma');

// ─── In-memory cache ──────────────────────────────────────────────────────────
let cache = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── GET /api/platform/stats ──────────────────────────────────────────────────
// Public endpoint — returns live platform-wide stats for the landing page.
// Cached in memory for 5 minutes to avoid hammering the DB on every page load.
// ─────────────────────────────────────────────────────────────────────────────
const getPlatformStats = async (req, res) => {
    try {
        const now = Date.now();

        // Return cached result if still fresh
        if (cache && now < cacheExpiresAt) {
            return res.json({ ...cache, cached: true });
        }

        // Run all counts in parallel
        const [
            totalHospitals,
            totalPatients,
            totalStaff,
            totalAppointments,
        ] = await Promise.all([
            // Only count APPROVED hospitals (adjust status value to match your schema)
            prisma.hospital.count({
                where: { status: 'approved' },
            }),

            // All patients across all hospitals
            prisma.patient.count(),

            // All staff members (doctors, nurses, pharmacists, etc.)
            prisma.hospitalStaff.count(),

            // Total appointments ever booked
            prisma.appointment.count(),
        ]);

        const stats = {
            totalHospitals,
            totalPatients,
            totalDoctors: totalStaff,   // renamed to match Home.jsx expectation
            totalAppointments,
            uptimePercent: 99.9,        // static until you have infra monitoring
            averageRating: 4.9,         // static until you have a ratings table
            timestamp: new Date().toISOString(),
            cached: false,
        };

        // Store in cache
        cache = stats;
        cacheExpiresAt = now + CACHE_TTL_MS;

        return res.json(stats);

    } catch (err) {
        console.error('[platform-stats] Error:', err);

        // If DB fails, return last cached result if available, else 500
        if (cache) {
            console.warn('[platform-stats] DB error — serving stale cache');
            return res.json({ ...cache, cached: true, stale: true });
        }

        return res.status(500).json({ message: 'Could not fetch platform statistics.' });
    }
};

module.exports = { getPlatformStats };