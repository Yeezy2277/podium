// Vercel function entry: every /api/* request is rewritten here and handled by Nest.
module.exports = require("../apps/api/dist/serverless.js").default;
