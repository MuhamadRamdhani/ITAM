/**
 * Auth Debug Logger
 * Utility untuk track auth/session/refresh flow
 * Enable dengan: localStorage.setItem('DEBUG_AUTH', 'true')
 */

const LOG_PREFIX = "[AUTH]";

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("DEBUG_AUTH") === "true";
}

export const authDebug = {
  refreshAttempt: (reason: string) => {
    if (isDebugEnabled()) {
      console.log(`${LOG_PREFIX} Refresh attempt:`, reason);
    }
  },
  refreshSuccess: () => {
    if (isDebugEnabled()) {
      console.log(`${LOG_PREFIX} Refresh SUCCESS - New token acquired`);
    }
  },

  refreshFailure: (reason: string) => {
    if (isDebugEnabled()) {
      console.error(`${LOG_PREFIX} Refresh FAILED:`, reason);
    }
  },

  /**
   * Log auto-retry
   */
  autoRetry: (endpoint: string, attempt: number = 1) => {
    if (isDebugEnabled()) {
      console.log(`${LOG_PREFIX} Auto-retry #${attempt} for ${endpoint}`);
    }
  },

  /**
   * Log session expiry
   */
  sessionExpired: (code: string) => {
    if (isDebugEnabled()) {
      console.error(`${LOG_PREFIX} SESSION EXPIRED - Code: ${code}`);
    }
  },

  /**
   * Get current token info (for debugging)
   */
  showCookies: () => {
    if (!isDebugEnabled()) {
      console.log(
        `${LOG_PREFIX} Debug mode not enabled. Run: localStorage.setItem('DEBUG_AUTH', 'true')`
      );
      return;
    }

    console.log(
      `${LOG_PREFIX} Cookies available in browser (check DevTools > Application > Cookies):`
    );
    console.log(
      `  - itam_at (access token) - httpOnly, should NOT be visible here`
    );
    console.log(
      `  - itam_rt (refresh token) - httpOnly, should NOT be visible here`
    );
    console.log(
      `  If you see them in DevTools, it means they are NOT properly httpOnly!`
    );
  },

  /**
   * Enable debug mode
   */
  enable: () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("DEBUG_AUTH", "true");
      console.log(`${LOG_PREFIX} Debug mode ENABLED`);
    }
  },

  /**
   * Disable debug mode
   */
  disable: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("DEBUG_AUTH");
      console.log(`${LOG_PREFIX} Debug mode DISABLED`);
    }
  },
};

// Export shorthand commands untuk console
if (typeof window !== "undefined") {
  (window as any).__auth = {
    debug: authDebug,
    enableDebug: () => authDebug.enable(),
    disableDebug: () => authDebug.disable(),
    showCookies: () => authDebug.showCookies(),
  };
}
