const incidentsDal = require('../services/incidents');
const usersDal = require('../services/users');
const notificationsDal = require('../services/notifications');
const { query } = require('../database');
const emailService = require('../services/emailService');
const { formatStatusLabel } = require('../utils/emailFormatters');

// @route   POST /api/incidents
// @desc    Create new incident
// @access  Private
const createIncident = async (req, res) => {
  try {
    const { type, title, description, location, media, status } = req.body;

    // Validate input
    if (!type || !title || !description || !location) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide type, title, description, and location'
      });
    }

    // Create incident
    const incident = await incidentsDal.create({
      type,
      title,
      description,
      location,
      media: media || [],
      status: status || 'under-investigation',
      userId: req.user.id
    });
    // Only notify admins (DB + email) when incident is not a draft
    if (incident.status !== 'draft') {
      // Get all admin users
      const admins = await query(`SELECT id, name, email FROM Users WHERE role = 'admin' ORDER BY createdAt DESC`);

      // Create notifications for admins
      const notificationPromises = admins.map(admin => {
        const incidentType = incident.type === 'red-flag' ? 'Red-flag' : 'Intervention';
        const message = `New ${incidentType.toLowerCase()} incident reported: "${incident.title}"`;

        return notificationsDal.create({
          userId: admin.id,
          incidentId: incident.id,
          incidentTitle: incident.title,
          type: 'new-incident',
          message,
          newStatus: incident.status
        });
      });

      await Promise.all(notificationPromises);

      // Send email notifications to admins
      const emailPromises = admins.map(admin =>
        emailService.sendIncidentCreatedEmail(admin, incident, req.user)
      );

      await Promise.all(emailPromises);
    }

    res.status(201).json({
      status: 'success',
      message: 'Incident created successfully',
      data: { incident }
    });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating incident',
      error: error.message
    });
  }
};

// @route   GET /api/incidents
// @desc    Get all incidents (admins see all, users see only theirs)
// @access  Private
const getIncidents = async (req, res) => {
  try {
    const { status, type } = req.query;
    const whereConditions = {};

    if (req.user.role !== 'admin') {
      whereConditions.userId = req.user.id;
    }
    if (status) whereConditions.status = status;
    if (type) whereConditions.type = type;

    let incidents = await incidentsDal.findAll({ where: whereConditions, orderByCreatedDesc: true });

    // If admin and no explicit status filter provided, hide drafts from admin dashboard
    if (req.user.role === 'admin' && !status) {
      incidents = incidents.filter((inc) => inc.status !== 'draft');
    }

    // Enrich with user basic info
    const enriched = await Promise.all(
      incidents.map(async (inc) => {
        const user = await usersDal.findById(inc.userId);
        return {
          ...inc,
          user: user ? { id: user.id, name: user.name, email: user.email } : null,
        };
      })
    );

    res.json({
      status: 'success',
      count: enriched.length,
      data: { incidents: enriched }
    });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching incidents',
      error: error.message
    });
  }
};

// @route   GET /api/incidents/:id
// @desc    Get single incident
// @access  Private
const getIncidentById = async (req, res) => {
  try {
    const incident = await incidentsDal.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        status: 'error',
        message: 'Incident not found'
      });
    }

    // Check if user has permission to view incident
    if (req.user.role !== 'admin' && incident.userId !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    const user = await usersDal.findById(incident.userId);

    res.json({
      status: 'success',
      data: { incident: { ...incident, user: user ? { id: user.id, name: user.name, email: user.email } : null } }
    });
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching incident',
      error: error.message
    });
  }
};

// @route   PUT /api/incidents/:id
// @desc    Update incident
// @access  Private (owner or admin)
const updateIncident = async (req, res) => {
  try {
    const incident = await incidentsDal.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        status: 'error',
        message: 'Incident not found'
      });
    }

    // Check permissions
    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied'
      });
    }

    // Users can only edit draft incidents
    if (isOwner && !isAdmin && incident.status !== 'draft') {
      return res.status(403).json({
        status: 'error',
        message: 'You can only edit incidents in draft status'
      });
    }

    const oldStatus = incident.status;
    const { type, title, description, location, media, status, adminComment } = req.body;

    // Update incident
    const updated = await incidentsDal.update(req.params.id, {
      type: type ?? incident.type,
      title: title ?? incident.title,
      description: description ?? incident.description,
      location: location ?? incident.location,
      media: media !== undefined ? media : incident.media,
      status: status ?? incident.status,
      adminComment: adminComment !== undefined ? adminComment : incident.adminComment
    });

    // If admin updated status, send notification to incident owner
    if (isAdmin && status && status !== oldStatus) {
      const incidentOwner = await usersDal.findById(incident.userId);
      if (incidentOwner) {
        const statusText = formatStatusLabel(status);
        const message = `Your incident "${incident.title}" status has been updated to "${statusText}"`;

        await notificationsDal.create({
          userId: incidentOwner.id,
          incidentId: incident.id,
          incidentTitle: incident.title,
          type: 'status-update',
          message,
          oldStatus,
          newStatus: status
        });

        await emailService.sendStatusUpdateEmail(incidentOwner, { ...incident, status }, oldStatus, status);
      }
    }

    // If the owner published a draft (changed from 'draft' -> non-draft), notify admins
    if (isOwner && !isAdmin && status && status !== oldStatus && oldStatus === 'draft' && status !== 'draft') {
      try {
        const admins = await query(`SELECT id, name, email FROM Users WHERE role = 'admin' ORDER BY createdAt DESC`);

        const notificationPromises = admins.map(admin => {
          const incidentType = updated.type === 'red-flag' ? 'Red-flag' : 'Intervention';
          const message = `New ${incidentType.toLowerCase()} incident reported: "${updated.title}"`;
          return notificationsDal.create({
            userId: admin.id,
            incidentId: updated.id,
            incidentTitle: updated.title,
            type: 'new-incident',
            message,
            newStatus: updated.status
          });
        });

        await Promise.all(notificationPromises);

        const emailPromises = admins.map(admin =>
          emailService.sendIncidentCreatedEmail(admin, updated, req.user)
        );

        await Promise.all(emailPromises);
      } catch (err) {
        console.error('Error notifying admins after draft published:', err);
      }
    }

    res.json({
      status: 'success',
      message: 'Incident updated successfully',
      data: { incident: updated }
    });
  } catch (error) {
    console.error('Update incident error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating incident',
      error: error.message
    });
  }
};

// @route   DELETE /api/incidents/:id
// @desc    Delete incident
// @access  Private (owner with draft status or admin)
const deleteIncident = async (req, res) => {
  try {
    const incident = await incidentsDal.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        status: 'error',
        message: 'Incident not found'
      });
    }

    // Check permissions
    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Users can only delete draft incidents, admins can delete any
    if (!isAdmin && (!isOwner || incident.status !== 'draft')) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. You can only delete your own draft incidents.'
      });
    }

    await incidentsDal.destroy(req.params.id);

    res.json({
      status: 'success',
      message: 'Incident deleted successfully'
    });
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting incident',
      error: error.message
    });
  }
};

// @route   GET /api/incidents/stats/overview
// @desc    Get incident statistics (admin only)
// @access  Private (admin)
const getIncidentStats = async (req, res) => {
  try {
    const [
      total,
      resolved,
      underInvestigation,
      rejected,
      draft,
      redFlags,
      interventions
    ] = await Promise.all([
      incidentsDal.count(),
      incidentsDal.count({ status: 'resolved' }),
      incidentsDal.count({ status: 'under-investigation' }),
      incidentsDal.count({ status: 'rejected' }),
      incidentsDal.count({ status: 'draft' }),
      incidentsDal.count({ type: 'red-flag' }),
      incidentsDal.count({ type: 'intervention' })
    ]);

    res.json({
      status: 'success',
      data: {
        total,
        resolved,
        underInvestigation,
        rejected,
        draft,
        redFlags,
        interventions
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  getIncidentStats
};
