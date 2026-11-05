import { withAuth } from "next-auth/middleware";

// Logged-out visitors are sent to our own /login page.
export default withAuth({ pages: { signIn: "/login" } });

// Every page is protected except these public ones. (Pages also re-check the session on the server.)
export const config = {
  matcher: [
    "/((?!login|register|forgot-password|reset-password|verify-email|unsubscribe|api/auth|api/cron|api/health|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
