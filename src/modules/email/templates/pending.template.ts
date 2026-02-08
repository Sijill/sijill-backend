export function constructPendingTemplate(email: string): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Sijill</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; background-color: #2c3e50;">
                            <!-- Logo -->
                            <img 
                                src="https://i.postimg.cc/R0BYRBkf/logo-light.png" 
                                alt="Sijill Logo" 
                                style="display: block; margin: 0 auto 10px auto; max-height: 50px;"
                            >
                            <!-- Heading -->
                            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 600;">
                                Welcome to Sijill
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 22px; font-weight: 600;">
                                Application Submitted Successfully
                            </h2>
                            
                            <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Thank you for choosing Sijill as your trusted healthcare information management platform.
                            </p>
                            
                            <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Your registration application for <strong>${email}</strong> has been received and is currently under review by our verification team.
                            </p>
                            
                            <div style="background-color: #f8f9fa; border-left: 4px solid #2c3e50; padding: 15px; margin: 25px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">
                                    <strong>What happens next?</strong><br>
                                    Our administrative team will carefully review your submitted documents and information. This process typically takes 1-3 hours. You will receive an email notification once your application has been reviewed.
                                </p>
                            </div>
                            
                            <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                If you have any questions or concerns during the review process, please don't hesitate to contact our support team.
                            </p>
                            
                            <p style="margin: 30px 0 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Best regards,<br>
                                <strong>The Sijill Team</strong>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 25px 30px; background-color: #f8f9fa; text-align: center;">
                            <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                                This is an automated message. Please do not reply to this email.
                            </p>
                            <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 13px;">
                                &copy; ${new Date().getFullYear()} Sijill. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
}
