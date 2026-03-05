// utils/sendEmail.js
const nodemailer = require('nodemailer');

const sendVerifyEmail = async (email, token) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Or your SMTP provider
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const url = `http://localhost:3000/verify-email?token=${token}`;

    await transporter.sendMail({
        to: email,
        subject: 'Verify your ApexHMS Account',
        html: `<h3>Welcome to ApexHMS!</h3>
               <p>Please click the link below to verify your account:</p>
               <a href="${url}">Verify Email</a>`
    });
};