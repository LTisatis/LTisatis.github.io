// Adapter from https://github.com/walinejs/netlify-starter
const http = require('node:http');
// Netlify reserves SITE_NAME for its own project name.
process.env.SITE_NAME = process.env.WALINE_SITE_NAME || 'LTisatisのblog';
const Waline = require('@waline/vercel');
const serverless = require('serverless-http');

const app = Waline({
  env: 'netlify',
  plugins: [],
  // Guest comments and existing password-based admin login do not need OAuth.
  // Return an empty provider list locally instead of making a remote request.
  oauthUrl: 'data:application/json,%7B%22services%22%3A%5B%5D%7D',
});
module.exports.handler = serverless(http.createServer(app));
