export function constructOtpTemplate(EXPIRE_TIME: string, OTP_CODE: string) {
	return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Account</title>
      <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background: #f5f5f5;
              padding: 20px;
              line-height: 1.6;
          }
          .email-wrapper { 
              max-width: 600px; 
              margin: 40px auto; 
              background: #ffffff; 
              border-radius: 8px; 
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
              background: #2c3e50;
              padding: 40px 30px;
              text-align: center;
          }
          .header h1 {
              color: #ffffff;
              font-size: 28px;
              font-weight: 600;
              margin-bottom: 8px;
          }
          .header p {
              color: rgba(255, 255, 255, 0.85);
              font-size: 14px;
          }
          .content { 
              padding: 40px 30px; 
          }
          .content p {
              color: #333333;
              font-size: 16px;
              margin-bottom: 24px;
          }
          .otp-container {
              display: flex;
              justify-content: center;
              gap: 12px;
              margin: 35px 0;
              padding: 20px 0;
          }
          .otp-digit {
              width: 55px;
              height: 65px;
              background: #ffffff;
              border: 2px solid #dddddd;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              font-weight: 700;
              color: #2c3e50;
          }
          .expiry-notice {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 16px 20px;
              border-radius: 4px;
              margin: 25px 0;
          }
          .expiry-notice p {
              color: #856404;
              font-size: 14px;
              margin: 0;
              font-weight: 500;
          }
          .security-notice {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 6px;
              margin-top: 30px;
              border: 1px solid #e9ecef;
          }
          .security-notice h3 {
              color: #2c3e50;
              font-size: 15px;
              font-weight: 600;
              margin-bottom: 12px;
          }
          .security-notice ul {
              list-style: none;
              padding-left: 0;
          }
          .security-notice li {
              color: #555555;
              font-size: 14px;
              margin-bottom: 8px;
              padding-left: 20px;
              position: relative;
          }
          .security-notice li:before {
              content: "•";
              position: absolute;
              left: 8px;
              color: #2c3e50;
          }
          .footer {
              background: #f8f9fa;
              padding: 25px 30px;
              text-align: center;
              border-top: 1px solid #e9ecef;
          }
          .footer p {
              color: #6c757d;
              font-size: 13px;
              margin: 5px 0;
          }
          /* Mobile responsive */
          @media only screen and (max-width: 600px) {
              .email-wrapper { margin: 20px 10px; }
              .header { padding: 30px 20px; }
              .content { padding: 30px 20px; }
              .otp-digit { width: 45px; height: 55px; font-size: 26px; gap: 8px; }
              .header h1 { font-size: 24px; }
          }
      </style>
  </head>
  <body>
      <div class="email-wrapper">
          <div class="header">
              <h1>Account Verification</h1>
              <p>Secure access to your account</p>
          </div>
          
          <div class="content">
              <p>Hello,</p>
              <p>You've requested to verify your account. Please use the verification code below to complete the process:</p>
              
              <div class="otp-container">
                  ${OTP_CODE.split('')
										.map((digit) => `<div class="otp-digit">${digit}</div>`)
										.join('')}
              </div>
              
              <div class="expiry-notice">
                  <p>This code will expire in ${EXPIRE_TIME}</p>
              </div>
              
              <div class="security-notice">
                  <h3>Security Information</h3>
                  <ul>
                      <li>Never share this code with anyone, including our support team</li>
                      <li>We will never ask for your verification code via email or phone</li>
                      <li>If you didn't request this code, please ignore this email and secure your account</li>
                  </ul>
              </div>
          </div>
          
          <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Sijill. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
  `;
}
