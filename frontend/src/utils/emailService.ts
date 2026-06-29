import { Incident, User, IncidentStatus } from '../types';

export interface EmailTemplate {
  to: string;
  subject: string;
  body: string;
  timestamp: string;
}

class EmailService {
  private sentEmails: EmailTemplate[] = [];

  // Send email notification to admin when incident is created
  sendIncidentCreatedEmail(admin: User, incident: Incident, createdBy: User): EmailTemplate {
    const incidentType = incident.type === 'red-flag' ? 'Red-flag' : 'Intervention';

    const email: EmailTemplate = {
      to: admin.email,
      subject: `🚨 New ${incidentType} Incident Reported`,
      body: `
Dear ${admin.name},

A new ${incidentType.toLowerCase()} incident has been reported by ${createdBy.name}.

Incident Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${incident.title}
Type: ${incidentType}
Location: ${incident.location.address || `${incident.location.lat}, ${incident.location.lng}`}
Reported on: ${new Date(incident.createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}

Description:
${incident.description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review this incident and take appropriate action.

You can view the full incident details and update its status through the admin dashboard.

Best regards,
Incident Reporting System
      `,
      timestamp: new Date().toISOString(),
    };

    this.sentEmails.push(email);
    this.logEmail(email);
    return email;
  }

  // Send email notification to user when status is updated
  sendStatusUpdateEmail(user: User, incident: Incident, oldStatus: IncidentStatus, newStatus: IncidentStatus): EmailTemplate {
    const statusText = newStatus.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const oldStatusText = oldStatus.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    let statusEmoji = '📊';
    if (newStatus === 'resolved') statusEmoji = '✅';
    if (newStatus === 'rejected') statusEmoji = '❌';
    if (newStatus === 'under-investigation') statusEmoji = '🔍';

    const email: EmailTemplate = {
      to: user.email,
      subject: `${statusEmoji} Incident Status Updated: ${incident.title}`,
      body: `
Dear ${user.name},

Your incident report has been updated by an administrator.

Incident: ${incident.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Previous Status: ${oldStatusText}
New Status: ${statusText}

${incident.adminComment ? `Admin Comment:\n${incident.adminComment}\n` : ''}
Last Updated: ${new Date(incident.updatedAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can view the full incident details through your dashboard.

Thank you for using our incident reporting system.

Best regards,
Incident Reporting System
      `,
      timestamp: new Date().toISOString(),
    };

    this.sentEmails.push(email);
    this.logEmail(email);
    return email;
  }

  // Log email to console (simulating actual email sending)
  private logEmail(email: EmailTemplate) {
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL SENT');
    console.log('='.repeat(60));
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Timestamp: ${new Date(email.timestamp).toLocaleString()}`);
    console.log('-'.repeat(60));
    console.log(email.body);
    console.log('='.repeat(60) + '\n');
  }
}

// Export singleton instance
export const emailService = new EmailService();
