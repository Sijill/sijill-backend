export function constructApprovalEmailTemplate(
	userRole: string,
	userName?: string,
) {
	const roleDisplay = userRole
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');

	const greeting = userName ? `Hi ${userName}` : 'Hi';

	return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Approved - Sijill</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; line-height: 1.6; }
  .email-wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #2c3e50; padding: 40px 30px; text-align: center; }
  .header img { max-height: 50px; margin-bottom: 10px; }
  .header h1 { color: #fff; font-size: 26px; font-weight: 600; }
  .content { padding: 40px 30px; color: #333; font-size: 16px; }
  .success-badge { background: #10b981; color: white; display: inline-block; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 18px; margin: 20px 0; }
  .info-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
  .cta-button { display: inline-block; background: #2c3e50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { background: #f8f9fa; text-align: center; padding: 25px 30px; font-size: 13px; color: #6b7280; }
</style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <img src="https://i.postimg.cc/R0BYRBkf/logo-light.png" alt="Sijill Logo"/>
      <h1>Application Approved!</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>
      
      <div style="text-align: center;">
        <div class="success-badge">✓ Account Verified</div>
      </div>
      
      <p>Great news! Your application as a <strong>${roleDisplay}</strong> has been reviewed and approved by our team.</p>
      
      <div class="info-box">
        <strong>What's Next?</strong><br/>
        You can now log in to your account and start using Sijill's full features. Your account is fully activated and ready to go.
      </div>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL || 'https://sijill.com'}/login" class="cta-button">
          Log In to Your Account
        </a>
      </div>
      
      <p style="margin-top: 30px; font-size: 14px; color: #555;">
        If you have any questions or need assistance, feel free to reach out to our support team.
      </p>
      
      <p style="margin-top: 20px; font-size: 14px; color: #555;">
        Welcome to Sijill!<br/>
        <strong>The Sijill Team</strong>
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Sijill. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}
