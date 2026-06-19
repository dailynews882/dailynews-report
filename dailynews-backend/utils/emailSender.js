const { Resend } = require("resend");

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return new Resend(apiKey);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || "").trim()
  );
}

async function sendVerificationEmail(to, code) {
  const normalizedEmail = String(to || "")
    .trim()
    .toLowerCase();

  const normalizedCode = String(code || "").trim();

  if (!isValidEmail(normalizedEmail)) {
    throw new Error("Invalid recipient email address");
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error(
      "Verification code must be a 6-digit number"
    );
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const resend = getResendClient();

  const textContent =
    "Daily News 邮箱验证\n\n" +
    "您好，\n\n" +
    "您正在注册 Daily News 账户，本次验证码为：" +
    normalizedCode +
    "\n\n验证码将在 5 分钟后失效，请勿将验证码告诉他人。\n\n" +
    "如果这不是您的操作，请忽略此邮件。\n\n" +
    "Daily News\nhttps://www.dailynews.report";

  const htmlContent =
    "<!DOCTYPE html>" +
    '<html lang="zh-CN">' +
    "<head>" +
    '<meta charset="UTF-8">' +
    "<title>Daily News 注册验证码</title>" +
    "</head>" +
    '<body style="font-family:Arial,Microsoft YaHei,sans-serif;background:#f5f7fa;padding:30px;">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">' +
    "<h2>Daily News 邮箱验证</h2>" +
    "<p>您好，</p>" +
    "<p>您正在注册 Daily News 账户，本次验证码为：</p>" +
    '<div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:22px;background:#f3f5f7;border-radius:10px;">' +
    normalizedCode +
    "</div>" +
    "<p>验证码将在 5 分钟后失效，请勿将验证码告诉他人。</p>" +
    "<p>如果这不是您的操作，请忽略此邮件。</p>" +
    '<p><a href="https://www.dailynews.report">www.dailynews.report</a></p>' +
    "</div>" +
    "</body>" +
    "</html>";

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [normalizedEmail],
    subject: "Daily News 注册验证码",
    text: textContent,
    html: htmlContent
  });

  if (result.error) {
    console.error("Resend email error:", result.error);

    throw new Error(
      result.error.message ||
        "Failed to send verification email"
    );
  }

  console.log(
    "Verification email sent successfully to " +
      normalizedEmail
  );

  return result.data;
}

async function sendEmailOtp(to, code) {
  return sendVerificationEmail(to, code);
}

module.exports = {
  sendVerificationEmail,
  sendEmailOtp
};
