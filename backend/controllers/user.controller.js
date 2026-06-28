const usersDal = require('../services/users');

// GET /api/users/profile
async function getProfile(req, res) {
  try {
    const user = await usersDal.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// PUT /api/users/profile
async function updateProfile(req, res) {
  try {
    const { name, email, profilePicture, profile_picture } = req.body;

    const existing = await usersDal.findById(req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If email changes, ensure unique
    if (email && email !== existing.email) {
      const emailOwner = await usersDal.findByEmail(email);
      if (emailOwner) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const incomingProfilePicture = profilePicture !== undefined
      ? profilePicture
      : (profile_picture !== undefined ? profile_picture : undefined);

    const updated = await usersDal.updateProfile(req.user.id, {
      name: name !== undefined ? name : existing.name,
      email: email !== undefined ? email : existing.email,
      profilePicture: incomingProfilePicture !== undefined ? incomingProfilePicture : existing.profilePicture,
    });

    res.json(updated);
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

module.exports = { getProfile, updateProfile };
