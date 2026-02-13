export function constructRejectionEmailTemplate(
	userRole: string,
	rejectionReason: string,
	userName?: string,
) {
	// Format role for display
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
<title>Application Update - Sijill</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; line-height: 1.6; }
  .email-wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #2c3e50; padding: 40px 30px; text-align: center; }
  .header img { max-height: 50px; margin-bottom: 10px; }
  .header h1 { color: #fff; font-size: 26px; font-weight: 600; }
  .content { padding: 40px 30px; color: #333; font-size: 16px; }
  .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
  .reason-box { background: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; margin: 20px 0; border-radius: 6px; }
  .info-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
  .contact-button { display: inline-block; background: #2c3e50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { background: #f8f9fa; text-align: center; padding: 25px 30px; font-size: 13px; color: #6b7280; }
</style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <img src="https://i.postimg.cc/R0BYRBkf/logo-light.png" alt="Sijill Logo"/>
      <h1>Application Status Update</h1>
    </div>
    <div class="content">
      <p>${greeting},</p>
      
      <p>Thank you for your applying to join Sijill as a <strong>${roleDisplay}</strong>.</p>
      
      <div class="warning-box">
        <strong>Application Decision</strong><br/>
        After careful review, we are unable to approve your application at this time.
      </div>
      
      <p><strong>Reason for Decision:</strong></p>
      <div class="reason-box">
        ${rejectionReason}
      </div>
      
      <div class="info-box">
        <strong>What Can You Do?</strong><br/>
        • Review the reason above and address any issues<br/>
        • You may submit a new application after resolving the mentioned concerns<br/>
        • Contact our support team if you have questions or need clarification
      </div>
      
      <div style="text-align: center;">
        <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@sijill.com'}" class="contact-button">
          Contact Support
        </a>
      </div>
      
      <p style="margin-top: 30px; font-size: 14px; color: #555;">
        We appreciate your understanding. If you believe this decision was made in error or have additional information to provide, please don't hesitate to reach out.
      </p>
      
      <p style="margin-top: 20px; font-size: 14px; color: #555;">
        Best regards,<br/>
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
