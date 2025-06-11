// backend/src/middleware/authMiddleware.js

// This middleware checks if a user is logged in.
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        // User is authenticated, proceed to the next middleware/route handler
        return next();
    }
    // User is not authenticated
    res.status(401).json({ error: 'Unauthorized: You must be logged in to perform this action.' });
}

module.exports = { isAuthenticated };
