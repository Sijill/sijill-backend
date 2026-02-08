export function constructOtpPasswordResetTemplate(
	EXPIRE_TIME: string,
	OTP_CODE: string,
) {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset Your Sijill Password</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; line-height: 1.6; }
  .email-wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #2c3e50; padding: 40px 30px; text-align: center; }
  .header img { max-height: 50px; margin-bottom: 10px; }
  .header h1 { color: #fff; font-size: 26px; font-weight: 600; }
  .content { padding: 40px 30px; color: #333; font-size: 16px; }
  .otp-container { display: flex; justify-content: center; gap: 12px; margin: 30px 0; }
  .otp-digit { width: 55px; height: 65px; background: #fff; border: 2px solid #ddd; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #2c3e50; }
  .expiry { margin-top: 20px; font-size: 14px; color: #555; }
  .footer { background: #f8f9fa; text-align: center; padding: 25px 30px; font-size: 13px; color: #6b7280; }
</style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <img src="https://i.postimg.cc/R0BYRBkf/logo-light.png" alt="Sijill Logo"/>
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>We received a request to reset your password. Enter the OTP below to proceed:</p>
      <div class="otp-container">
        ${OTP_CODE.split('')
					.map((d) => `<div class="otp-digit">${d}</div>`)
					.join('')}
      </div>
      <p class="expiry">This OTP expires in ${EXPIRE_TIME}</p>
      <p style="margin-top: 20px; font-size: 14px; color: #555;">
  If you didn't request this, just ignore this email.
</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Sijill. Do not reply to this email.
    </div>
  </div>
</body>
</html>
  `;
}
