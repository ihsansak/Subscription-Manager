const configured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

async function sendOtp(to, code, purpose) {
  if (!configured()) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and MAIL_FROM.",
    );
  }

  const action =
    purpose == "register" ? "verify your email" : "reset your password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: "Brightloop email verification code",
      text: `Your Brightloop code to ${action} is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.message || body.name || "";
    } catch (e) {}
    throw new Error(`Resend rejected the email${detail ? `: ${detail}` : "."}`);
  }
}

module.exports = { sendOtp };
