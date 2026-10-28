// Entry point for Vercel. Vercel runs the API as a "serverless function": it starts this
// file when a request comes in instead of keeping a server running all the time.
// (src/server.js is for running the API on your own computer. It is not used on Vercel.)
// vercel.json sends every URL to this function, and Express then picks the right route.
const { createApp } = require('../src/app');

module.exports = createApp();
