// The marketing homepage, reachable while signed in.
//
// The bare domain "/" auto-redirects signed-in visitors to /app/compose
// (see src/proxy.ts). This route renders the same landing page but is NOT
// matched by the proxy, so the in-app logo can link here to reach home.
export { default } from "../page";
