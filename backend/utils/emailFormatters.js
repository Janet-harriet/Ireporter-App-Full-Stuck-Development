// Shared email formatting utilities
const formatStatusLabel = (value = '') =>
    value
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const formatDate = (value) =>
    new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const getIncidentTypeLabel = (type) => (type === 'red-flag' ? 'Red-flag' : 'Intervention');

module.exports = { formatStatusLabel, formatDate, getIncidentTypeLabel };
