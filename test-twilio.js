// test-twilio.js
import dotenv from 'dotenv';
dotenv.config();
import Twilio from 'twilio';
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  try {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    const to = `whatsapp:${process.env.MANAGER_WHATSAPP.replace(/\D/g,'') ? '+' + process.env.MANAGER_WHATSAPP.replace(/\D/g,'') : ''}`;
    console.log('From', from, 'To', to);
    const msg = await client.messages.create({
      from,
      to,
      body: 'Test message from backend (Twilio sandbox test)'
    });
    console.log('Sent ok', msg.sid);
  } catch (err) {
    console.error('Send failed', err);
  }
})();
