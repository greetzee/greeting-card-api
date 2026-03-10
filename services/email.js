const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.EMAIL_API_KEY);

async function sendMagicLink(email, link) {
  await sgMail.send({
    to: email,
    from: "noreply@greetzee.com",
    subject: "Your magic link ✨",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#fff8f8;border-radius:12px;border:1px solid #fde8e8;">
        <h1 style="color:#e11d48;font-size:24px;margin-bottom:8px;">💌 Greetzee</h1>
        <p style="color:#555;font-size:16px;">Hi! Your magic link is ready. Click the button below to create your personalized video greeting card.</p>
        <a href__="${link}" style="display:inline-block;margin:24px 0;background:#e11d48;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:16px;">Create my card ✨</a>
        <p style="color:#aaa;font-size:12px;"><a href__="${link}">This link</a> expires after use. If you didn't request this, ignore this email.</p>
        <p style="color:#aaa;font-size:12px;">© Greetzee · greetzee.com</p>
      </div>
    `
  });
}

module.exports = { sendMagicLink };