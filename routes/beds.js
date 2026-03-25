const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');

async function withRetry(fn, retries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isConnectionErr =
                err.message?.includes('connect') ||
                err.message?.includes('timeout') ||
                err.message?.includes('Server has closed') ||
                err.errorCode === 'P1001' ||
                err.errorCode === 'P1008' ||
                err.errorCode === 'P1017';
            if (isConnectionErr && attempt < retries) {
                console.warn(`[beds] DB retry (${attempt}/${retries})...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else throw err;
        }
    }
}

// ── GET /api/beds/:hospitalId ─────────────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { status, ward } = req.query;

        const beds = await withRetry(() =>
            prisma.bed.findMany({
                where: {
                    hospitalId,
                    ...(status && { status }),
                    ...(ward && { ward: { contains: ward, mode: 'insensitive' } }),
                },
                orderBy: [{ ward: 'asc' }, { bedNumber: 'asc' }],
            })
        );

        return res.json({ beds });
    } catch (err) {
        console.error('[GET /beds]', err);
        return res.status(500).json({ error: 'Failed to fetch beds' });
    }
});

// ── POST /api/beds/:hospitalId ────────────────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { bedNumber, ward, status } = req.body;

        if (!bedNumber || !ward) {
            return res.status(400).json({ error: 'bedNumber and ward are required' });
        }

        const bed = await withRetry(() =>
            prisma.bed.create({
                data: {
                    hospitalId,
                    bedNumber,
                    ward,
                    status: status || 'available',
                },
            })
        );

        return res.status(201).json({ message: 'Bed created successfully', bed });
    } catch (err) {
        console.error('[POST /beds]', err);
        if (err.code === 'P2002') return res.status(409).json({ error: 'Bed number already exists in this hospital' });
        return res.status(500).json({ error: 'Failed to create bed' });
    }
});

// ── PATCH /api/beds/:id/status ────────────────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        const bed = await withRetry(() =>
            prisma.bed.update({ where: { id }, data: { status } })
        );

        return res.json({ message: 'Bed status updated', bed });
    } catch (err) {
        console.error('[PATCH /beds/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Bed not found' });
        return res.status(500).json({ error: 'Failed to update bed status' });
    }
});

module.exports = router;