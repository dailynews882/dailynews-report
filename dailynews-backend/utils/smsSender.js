async function sendSmsOtp(phone, otpCode) {
  /*
    这里是短信验证码接口预留位置。

    目前基础版先打印到 VS Code 终端。
    后面可以接：
    1. Singtel Enterprise SMS API
    2. Twilio SMS API
    3. Vonage SMS API
    4. AWS SNS
  */

  console.log(`SMS OTP to ${phone}: ${otpCode}`);

  return true;
}

module.exports = {
  sendSmsOtp
};