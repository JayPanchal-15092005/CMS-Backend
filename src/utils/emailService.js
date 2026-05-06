import nodemailer from "nodemailer";

// Create reusable transporter object
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Helper Function: Send Email
export const sendEmail = async (to, subject, htmlContent, attachments = []) => {
  try {
    const info = await transporter.sendMail({
      from: `"CMS System" <${process.env.EMAIL_ADDRESS}>`, 
      to: to,
      subject: subject,
      html: htmlContent, 
      attachments: attachments,
    });
    console.log("📧 Email sent: %s", info.messageId);
  } catch (error) {
    console.error("❌ Email Error:", error);
    throw error; // Throwing error so the route knows if it failed
  }
};
