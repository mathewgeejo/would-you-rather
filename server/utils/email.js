const nodemailer = require('nodemailer');

class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.profile?.firstName || user.username;
    this.url = url;
    this.from = `Would You Rather <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      // Use production email service (e.g., SendGrid, AWS SES, etc.)
      return nodemailer.createTransporter({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD
        }
      });
    }

    // Development - use Mailtrap or Gmail
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async send(template, subject) {
    // Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html: template
    };

    // Create transport and send email
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    const template = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Would You Rather!</h1>
        </div>
        
        <div style="padding: 40px 20px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Hi ${this.firstName}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Welcome to Would You Rather - the most engaging social platform for thought-provoking dilemmas! 
            We're excited to have you join our community.
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
            To get started and verify your email address, please click the button below:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.url}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block;
                      font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Once verified, you'll be able to:
          </p>
          
          <ul style="color: #666; line-height: 1.8; margin-bottom: 30px;">
            <li>Vote on thousands of thought-provoking questions</li>
            <li>Create your own "Would You Rather" dilemmas</li>
            <li>Chat with other users in real-time</li>
            <li>Earn points and unlock achievements</li>
            <li>Climb the leaderboards</li>
          </ul>
          
          <p style="color: #888; font-size: 14px; margin-bottom: 10px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #667eea; font-size: 14px; word-break: break-all;">
            ${this.url}
          </p>
        </div>
        
        <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 14px;">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} Would You Rather. All rights reserved.
          </p>
        </div>
      </div>
    `;

    await this.send(template, 'Welcome to Would You Rather - Verify Your Email');
  }

  async sendPasswordReset() {
    const template = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
        </div>
        
        <div style="padding: 40px 20px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Hi ${this.firstName}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password for your Would You Rather account.
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
            Click the button below to reset your password. This link will expire in 10 minutes for security reasons.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.url}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block;
                      font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
            If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
          </p>
          
          <p style="color: #888; font-size: 14px; margin-bottom: 10px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #667eea; font-size: 14px; word-break: break-all;">
            ${this.url}
          </p>
        </div>
        
        <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 14px;">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} Would You Rather. All rights reserved.
          </p>
        </div>
      </div>
    `;

    await this.send(template, 'Password Reset Request - Would You Rather');
  }

  async sendNotification(type, data) {
    let template = '';
    let subject = '';

    switch (type) {
      case 'new_vote':
        subject = 'Someone voted on your question!';
        template = `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">New Vote!</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>Hi ${this.firstName}!</p>
              <p>Someone just voted on your question: "${data.question}"</p>
              <p>Check out the results <a href="${data.url}">here</a>!</p>
            </div>
          </div>
        `;
        break;

      case 'new_comment':
        subject = 'New comment on your question!';
        template = `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">New Comment!</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>Hi ${this.firstName}!</p>
              <p>${data.commenter} commented on your question: "${data.question}"</p>
              <p>Comment: "${data.comment}"</p>
              <p>Join the conversation <a href="${data.url}">here</a>!</p>
            </div>
          </div>
        `;
        break;

      case 'badge_earned':
        subject = 'Congratulations! You earned a new badge!';
        template = `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">New Badge Earned!</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9; text-align: center;">
              <p>Hi ${this.firstName}!</p>
              <h2 style="color: ${data.badgeColor};">${data.badgeIcon} ${data.badgeName}</h2>
              <p style="font-style: italic;">"${data.badgeDescription}"</p>
              <p>Keep up the great work!</p>
            </div>
          </div>
        `;
        break;
    }

    await this.send(template, subject);
  }
}

module.exports = Email;