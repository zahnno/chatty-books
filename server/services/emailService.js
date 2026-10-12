const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Initialize AWS SES client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Add this constant instead
const LOGO_URL = 'https://talkingbooks.s3.us-east-1.amazonaws.com/logo-light.png';

class EmailService {
  static async generateVerificationToken() {
    // Generate a random string
    const randomString = Math.random().toString(36).substring(2, 15);
    // Hash it
    const salt = await bcrypt.genSalt(10);
    const token = await bcrypt.hash(randomString, salt);
    // Return URL safe token
    return token.replace(/[/+=]/g, '');
  }

  static async sendVerificationEmail(user) {
    // Use hash route for verification link
    const verificationLink = `${process.env.CLIENT_URL}/#/verify-email?token=${user.emailVerificationToken}`;

    const emailParams = {
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [user.email]
      },
      Message: {
        Subject: {
          Data: 'Verify your email address',
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <img src="${LOGO_URL}" alt="Chatty Books Logo" style="max-width: 200px; height: auto;">
                </div>
                <h2 style="color: #333333; font-size: 24px; margin-bottom: 20px; text-align: center;">Verify Your Email Address</h2>
                <p style="color: #666666; font-size: 16px; line-height: 1.5; margin-bottom: 25px; text-align: center;">
                  Welcome to Chatty Books! To get started, please verify your email address by clicking the button below:
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${verificationLink}" 
                     style="background-color: #4CAF50; color: white; padding: 14px 28px; 
                            text-decoration: none; border-radius: 50px; font-weight: bold;
                            display: inline-block; font-size: 16px; transition: background-color 0.3s ease;">
                    Verify Email Address
                  </a>
                </div>
                <p style="color: #666666; font-size: 14px; margin-top: 25px; text-align: center;">
                  Or copy and paste this link in your browser:
                </p>
                <p style="color: #666666; font-size: 14px; word-break: break-all; text-align: center; margin-bottom: 25px;">
                  ${verificationLink}
                </p>
                <div style="border-top: 1px solid #eeeeee; margin-top: 25px; padding-top: 20px;">
                  <p style="color: #999999; font-size: 12px; text-align: center;">
                    This link will expire in 15 minutes.<br>
                    If you didn't create an account, you can safely ignore this email.
                  </p>
                </div>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      const command = new SendEmailCommand(emailParams);
      await sesClient.send(command);
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  static async sendPasswordResetEmail(user, resetToken) {
    // Update password reset link to use hash router format
    const resetLink = `${process.env.CLIENT_URL}/#/reset-password?token=${resetToken}`;

    const emailParams = {
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [user.email]
      },
      Message: {
        Subject: {
          Data: 'Reset your password',
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <img src="${LOGO_URL}" alt="Chatty Books Logo" style="max-width: 200px; height: auto;">
                </div>
                <h2 style="color: #333333; font-size: 24px; margin-bottom: 20px; text-align: center;">Reset Your Password</h2>
                <p style="color: #666666; font-size: 16px; line-height: 1.5; margin-bottom: 25px; text-align: center;">
                  We received a request to reset your password. Click the button below to create a new password:
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" 
                     style="background-color: #4CAF50; color: white; padding: 14px 28px; 
                            text-decoration: none; border-radius: 50px; font-weight: bold;
                            display: inline-block; font-size: 16px; transition: background-color 0.3s ease;">
                    Reset Password
                  </a>
                </div>
                <p style="color: #666666; font-size: 14px; margin-top: 25px; text-align: center;">
                  Or copy and paste this link in your browser:
                </p>
                <p style="color: #666666; font-size: 14px; word-break: break-all; text-align: center; margin-bottom: 25px;">
                  ${resetLink}
                </p>
                <div style="border-top: 1px solid #eeeeee; margin-top: 25px; padding-top: 20px;">
                  <p style="color: #999999; font-size: 12px; text-align: center;">
                    This link will expire in 1 hour.<br>
                    If you didn't request a password reset, you can safely ignore this email.
                  </p>
                </div>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      const command = new SendEmailCommand(emailParams);
      await sesClient.send(command);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  static async sendAuthorInquiryNotification(inquiry) {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.AWS_SES_FROM_EMAIL;

    const emailParams = {
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [adminEmail]
      },
      Message: {
        Subject: {
          Data: `New Author Inquiry: ${inquiry.bookTitle}`,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <img src="${LOGO_URL}" alt="Chatty Books Logo" style="max-width: 200px; height: auto;">
                </div>
                <h2 style="color: #333333; font-size: 24px; margin-bottom: 20px; text-align: center;">New Author Publishing Inquiry</h2>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <p style="color: #333333; font-size: 16px; margin: 0 0 12px 0;"><strong>Author Name:</strong> ${inquiry.name}</p>
                  <p style="color: #333333; font-size: 16px; margin: 0 0 12px 0;"><strong>Email:</strong> <a href="mailto:${inquiry.email}" style="color: #4CAF50;">${inquiry.email}</a></p>
                  <p style="color: #333333; font-size: 16px; margin: 0 0 12px 0;"><strong>Book Title:</strong> ${inquiry.bookTitle}</p>
                  ${inquiry.message ? `<p style="color: #333333; font-size: 16px; margin: 0;"><strong>Message:</strong><br>${inquiry.message}</p>` : ''}
                </div>
                <div style="text-align: center; margin: 20px 0;">
                  <a href="mailto:${inquiry.email}?subject=Re: Your Chatty Books Publishing Inquiry - ${inquiry.bookTitle}"
                     style="background-color: #4CAF50; color: white; padding: 14px 28px;
                            text-decoration: none; border-radius: 50px; font-weight: bold;
                            display: inline-block; font-size: 16px;">
                    Reply to Author
                  </a>
                </div>
                <div style="border-top: 1px solid #eeeeee; margin-top: 25px; padding-top: 20px;">
                  <p style="color: #999999; font-size: 12px; text-align: center;">
                    Submitted on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      const command = new SendEmailCommand(emailParams);
      await sesClient.send(command);
    } catch (error) {
      console.error('Error sending author inquiry notification:', error);
      throw new Error('Failed to send author inquiry notification');
    }
  }

  // Tells moderators about a new content report. Reported text is user-written,
  // so it is escaped before going into the HTML.
  static async sendContentReportNotification(report, reporter) {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.AWS_SES_FROM_EMAIL;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const label = { image: 'Gallery scene', comment: 'Comment', message: 'AI character reply' }[report.targetType];

    const command = new SendEmailCommand({
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [adminEmail] },
      Message: {
        Subject: { Data: `Content report: ${label} (${report.reason})`, Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1B1A17;">New content report</h2>
                <p><strong>Type:</strong> ${esc(label)}<br>
                   <strong>Reason:</strong> ${esc(report.reason)}<br>
                   <strong>Reported by:</strong> ${esc(reporter.email)}<br>
                   <strong>Report id:</strong> ${esc(report._id)}<br>
                   <strong>Content id:</strong> ${esc(report.targetId)}</p>
                ${report.details ? `<p><strong>Details:</strong><br>${esc(report.details)}</p>` : ''}
                <pre style="white-space: pre-wrap; background: #F1EDE5; padding: 12px; border-radius: 8px;">${esc(report.snapshot)}</pre>
                <p style="color: #5E5A52; font-size: 13px;">Resolve it with POST /admin/reports/${esc(report._id)}/resolve { "action": "remove" | "dismiss" }. Store policies expect reports to be acted on within 24 hours.</p>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    });
    await sesClient.send(command);
  }

  // Asks support to review a book submitted for publishing on Solana, with
  // the automated screening result. Book details come from the uploaded file
  // and the publisher, so everything is escaped.
  static async sendPublishingReviewRequest(book, publisher) {
    const to = process.env.PUBLISHING_REVIEW_EMAIL || 'support@chattybooks.com';
    const webUrl = (process.env.CLIENT_URL || process.env.PUBLIC_WEB_URL || 'https://www.chattybooks.com').replace(/\/$/, '');
    const reviewUrl = `${webUrl}/#/admin/publishing/${book._id}`;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sc = book.publishing?.screening || {};
    const flagged = sc.verdict === 'suspect';
    const verdict = { clear: 'Looks clear', suspect: 'Flagged as suspect', error: 'Screening failed' }[sc.verdict] || 'Not screened';
    const tone = flagged ? '#A33A2B' : sc.verdict === 'clear' ? '#2E7D4F' : '#8C877C';
    const who = publisher ? (publisher.username || publisher.email || 'Unknown') : 'Unknown';

    const command = new SendEmailCommand({
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `${flagged ? '[Flagged] ' : ''}Book approval needed: ${book.title}`, Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: `
              <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #FAF8F4; color: #1B1A17;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <img src="${LOGO_URL}" alt="Chatty Books" style="max-width: 180px; height: auto;">
                </div>
                <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; letter-spacing: 1.5px; color: #A33A2B; margin: 0 0 6px; font-weight: bold;">BOOK APPROVAL NEEDED</p>
                <h2 style="font-size: 26px; margin: 0 0 4px;">${esc(book.title)}</h2>
                <p style="font-size: 16px; color: #5E5A52; margin: 0 0 20px;">by ${esc(book.author || 'Unknown author')}</p>

                <div style="border-left: 4px solid ${tone}; background: #F1EDE5; padding: 14px 16px; border-radius: 6px; margin-bottom: 20px; font-family: 'Helvetica Neue', Arial, sans-serif;">
                  <p style="margin: 0 0 6px; font-weight: bold; color: ${tone};">Automated check: ${esc(verdict)}</p>
                  ${sc.summary ? `<p style="margin: 0 0 8px; font-size: 15px;">${esc(sc.summary)}</p>` : ''}
                  ${sc.copyrightRisk ? `<p style="margin: 0; font-size: 14px; color: #5E5A52;">Copyright risk: <strong>${esc(sc.copyrightRisk)}</strong> · Content risk: <strong>${esc(sc.contentRisk)}</strong>${sc.knownWork ? ` · Looks like: <strong>${esc(sc.knownWork)}</strong>` : ''}</p>` : ''}
                  ${sc.reasons?.length ? `<ul style="margin: 8px 0 0; padding-left: 18px; font-size: 14px; color: #5E5A52;">${sc.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
                  ${sc.error ? `<p style="margin: 6px 0 0; font-size: 14px; color: #5E5A52;">${esc(sc.error)}</p>` : ''}
                </div>

                <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #5E5A52; margin: 0 0 24px;">
                  Submitted by <strong>${esc(who)}</strong>${publisher?.email && publisher.email !== who ? ` (${esc(publisher.email)})` : ''}<br>
                  Wallet: ${esc(publisher?.walletAddress || 'none')}<br>
                  Book id: ${esc(book._id)}
                </p>

                <div style="text-align: center; margin: 28px 0;">
                  <a href="${reviewUrl}" style="background: #1B1A17; color: #FAF8F4; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: bold; display: inline-block;">
                    Read and review
                  </a>
                </div>
                <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #8C877C; text-align: center;">
                  The book stays private until it's approved. Admin sign-in required.
                </p>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    });
    await sesClient.send(command);
  }

  // Tells support a live (minted) book was edited by its holder, with what
  // changed and the automated check, so it can be reverted if needed.
  static async sendPublishingEditNotice(book, edit, editor) {
    const to = process.env.PUBLISHING_REVIEW_EMAIL || 'support@chattybooks.com';
    const webUrl = (process.env.CLIENT_URL || process.env.PUBLIC_WEB_URL || 'https://www.chattybooks.com').replace(/\/$/, '');
    const reviewUrl = `${webUrl}/#/admin/publishing/${book._id}`;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const show = (v) => (Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '(empty)' : String(v)).slice(0, 1500);
    const sc = edit.screening || {};
    const flagged = sc.verdict === 'suspect';
    const tone = flagged ? '#A33A2B' : sc.verdict === 'clear' ? '#2E7D4F' : '#8C877C';
    const verdict = { clear: 'Looks fine', suspect: 'Flagged as suspect', error: 'Check failed' }[sc.verdict] || 'Not checked';
    const fields = [...new Set([...Object.keys(edit.before || {}), ...Object.keys(edit.after || {})])]
      .filter((f) => edit.action === 'update' || ['firstName', 'lastName', 'description', 'intro', 'appearance'].includes(f));
    const rows = fields.map((f) => `
      <tr>
        <td style="padding: 8px; vertical-align: top; color: #5E5A52; white-space: nowrap;">${esc(f)}</td>
        <td style="padding: 8px; vertical-align: top; color: #8C877C; text-decoration: ${edit.action === 'delete' ? 'none' : 'line-through'};">${esc(show(edit.before?.[f]))}</td>
        <td style="padding: 8px; vertical-align: top;">${esc(show(edit.after?.[f]))}</td>
      </tr>`).join('');

    const command = new SendEmailCommand({
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `${flagged ? '[Flagged] ' : ''}Live book edited: ${book.title} (${edit.label})`, Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #FAF8F4; color: #1B1A17;">
                <p style="font-size: 12px; letter-spacing: 1.5px; color: #A33A2B; margin: 0 0 6px; font-weight: bold;">LIVE BOOK EDITED</p>
                <h2 style="font-family: Georgia, serif; font-size: 24px; margin: 0 0 4px;">${esc(book.title)}</h2>
                <p style="color: #5E5A52; margin: 0 0 18px;">${esc(edit.label)} · by ${esc(editor?.username || editor?.email || 'unknown')} (${esc(edit.wallet || 'no wallet')})</p>
                <div style="border-left: 4px solid ${tone}; background: #F1EDE5; padding: 12px 16px; border-radius: 6px; margin-bottom: 18px;">
                  <p style="margin: 0 0 4px; font-weight: bold; color: ${tone};">Automated check: ${esc(verdict)}</p>
                  ${sc.summary ? `<p style="margin: 0; font-size: 14px;">${esc(sc.summary)}</p>` : ''}
                  ${sc.reasons?.length ? `<ul style="margin: 6px 0 0; padding-left: 18px; font-size: 14px; color: #5E5A52;">${sc.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
                </div>
                ${rows ? `<table style="width: 100%; border-collapse: collapse; font-size: 14px; background: #FFFFFF; border-radius: 6px;">
                  <tr style="text-align: left; color: #8C877C; font-size: 12px;"><th style="padding: 8px;">Field</th><th style="padding: 8px;">Before</th><th style="padding: 8px;">After</th></tr>
                  ${rows}
                </table>` : ''}
                <div style="text-align: center; margin: 26px 0 10px;">
                  <a href="${reviewUrl}" style="background: #1B1A17; color: #FAF8F4; padding: 13px 26px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block;">Review or revert</a>
                </div>
                <p style="font-size: 12px; color: #8C877C; text-align: center;">The change is already live. Reverting puts back the values shown under Before.</p>
              </div>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    });
    await sesClient.send(command);
  }
}

module.exports = EmailService; 