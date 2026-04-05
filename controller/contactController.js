const prisma = require('../lib/prisma');
const { sendContactEmail } = require('../lib/mailer');

// POST /api/contact
exports.submitContact = async (req, res) => {
    try {
        const { hospitalName, administratorName, email, phone, hospitalType, message } = req.body;

        const errors = {};
        if (!hospitalName?.trim() || hospitalName.trim().length < 2)
            errors.hospitalName = 'Hospital name must be at least 2 characters.';
        if (!administratorName?.trim() || administratorName.trim().length < 2)
            errors.administratorName = 'Administrator name is required.';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            errors.email = 'A valid email address is required.';
        if (!phone || !/^\+?[\d\s\-().]{7,}$/.test(phone))
            errors.phone = 'A valid phone number is required.';
        if (!hospitalType?.trim())
            errors.hospitalType = 'Hospital type is required.';
        if (!message?.trim() || message.trim().length < 10)
            errors.message = 'Message must be at least 10 characters.';

        if (Object.keys(errors).length > 0)
            return res.status(422).json({ message: 'Validation failed.', errors });

        const contact = await prisma.contactSubmission.create({
            data: {
                hospitalName:      hospitalName.trim(),
                administratorName: administratorName.trim(),
                email:             email.trim().toLowerCase(),
                phone:             phone.trim(),
                hospitalType:      hospitalType.trim(),
                message:           message.trim(),
            },
        });

        sendContactEmail(contact).catch(err =>
            console.error('[contact] Email send failed:', err.message)
        );

        return res.status(201).json({
            message: 'Your message has been received. We will get back to you within 24 hours.',
            id: contact.id,
        });
    } catch (err) {
        console.error('[contact] Error:', err);
        return res.status(500).json({ message: 'Internal server error. Please try again.' });
    }
};

// GET /api/contact
exports.getContactSubmissions = async (req, res) => {
    try {
        const submissions = await prisma.contactSubmission.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ submissions });
    } catch (err) {
        console.error('[contact] Fetch error:', err);
        return res.status(500).json({ message: 'Internal server error.' });
    }
};