const nodemailer = require("nodemailer");

async function sendEmailOtp(to, otpCode) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`Email OTP to ${to}: ${otpCode}`);
    return true;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: `"Daily News" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Daily News 会员注册验证码",
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Daily News 会员注册验证码</h2>
        <p>您的验证码是：</p>
        <h1 style="color:#0066ff;">${otpCode}</h1>
        <p>验证码 5 分钟内有效。</p>
        <p>如果不是您本人操作，请忽略此邮件。</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendEmailOtp
};