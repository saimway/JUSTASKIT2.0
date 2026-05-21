// Intelligent API Key Rotation Manager for Groq
// Handles rate limiting, key switching, cooldown tracking, and recovery estimation

class KeyManager {
  constructor() {
    this.keys = [];
    this.keyStates = new Map();
    this.currentKeyIndex = 0;
    this.loadKeys();
  }

  loadKeys() {
    this.keys = [];
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`GROQ_API_KEY_${i}`];
      if (key && key.trim().length > 0) {
        this.keys.push(key.trim());
        if (!this.keyStates.has(key.trim())) {
          this.keyStates.set(key.trim(), {
            rateLimited: false,
            rateLimitedAt: null,
            retryAfter: null,
            requestCount: 0,
            tokenCount: 0,
            lastUsed: null,
            consecutiveErrors: 0,
            cooldownUntil: null,
            remainingRequests: null,
            remainingTokens: null,
            resetRequestsAt: null,
            resetTokensAt: null,
          });
        }
      }
    }
    if (this.keys.length === 0) {
      console.warn('No GROQ API keys configured!');
    }
  }

  // Get the best available key using intelligent selection
  getBestKey() {
    if (this.keys.length === 0) return null;

    const now = Date.now();

    // First pass: find keys that are definitely available
    const availableKeys = [];
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      const state = this.keyStates.get(key);

      // Check if cooldown has expired
      if (state.cooldownUntil && now > state.cooldownUntil) {
        state.rateLimited = false;
        state.cooldownUntil = null;
        state.consecutiveErrors = 0;
        state.retryAfter = null;
      }

      if (!state.rateLimited) {
        availableKeys.push({ key, index: i, state });
      }
    }

    if (availableKeys.length === 0) {
      return null; // All keys are rate limited
    }

    // Intelligent selection: prefer keys with more remaining quota
    // If we have remaining request data, use that
    availableKeys.sort((a, b) => {
      // Prefer keys that haven't been used recently
      const aLastUsed = a.state.lastUsed || 0;
      const bLastUsed = b.state.lastUsed || 0;

      // Prefer keys with more remaining requests
      const aRemaining = a.state.remainingRequests ?? Infinity;
      const bRemaining = b.state.remainingRequests ?? Infinity;

      if (aRemaining !== bRemaining) {
        return bRemaining - aRemaining; // Higher remaining = better
      }

      // If equal, prefer least recently used
      return aLastUsed - bLastUsed;
    });

    const selected = availableKeys[0];
    this.currentKeyIndex = selected.index;
    return selected.key;
  }

  // Mark a key as rate limited with retry information
  markRateLimited(key, retryAfterSeconds) {
    const state = this.keyStates.get(key);
    if (!state) return;

    const retryMs = (retryAfterSeconds || 60) * 1000;
    state.rateLimited = true;
    state.rateLimitedAt = Date.now();
    state.retryAfter = retryAfterSeconds || 60;
    state.cooldownUntil = Date.now() + retryMs;
    state.consecutiveErrors += 1;
    state.remainingRequests = 0;
  }

  // Update key state from response headers
  updateFromHeaders(key, headers) {
    const state = this.keyStates.get(key);
    if (!state) return;

    state.lastUsed = Date.now();
    state.requestCount += 1;

    // Parse Groq rate limit headers
    const remainingRequests = headers.get('x-ratelimit-remaining-requests');
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
    const resetRequests = headers.get('x-ratelimit-reset-requests');
    const resetTokens = headers.get('x-ratelimit-reset-tokens');
    const retryAfter = headers.get('retry-after');

    if (remainingRequests !== null) {
      state.remainingRequests = parseInt(remainingRequests, 10);
    }
    if (remainingTokens !== null) {
      state.remainingTokens = parseInt(remainingTokens, 10);
    }
    if (resetRequests) {
      state.resetRequestsAt = parseDuration(resetRequests);
    }
    if (resetTokens) {
      state.resetTokensAt = parseDuration(resetTokens);
    }

    // Proactive switching: if remaining requests are very low, preemptively mark for rotation
    if (state.remainingRequests !== null && state.remainingRequests <= 2) {
      // Don't mark as rate limited, but lower priority
      state.remainingRequests = 0;
    }

    if (retryAfter) {
      this.markRateLimited(key, parseFloat(retryAfter));
    }
  }

  // Get status of all keys for debugging/monitoring
  getStatus() {
    const now = Date.now();
    return this.keys.map((key, i) => {
      const state = this.keyStates.get(key);
      const maskedKey = key.substring(0, 8) + '...' + key.substring(key.length - 4);
      return {
        index: i + 1,
        key: maskedKey,
        available: !state.rateLimited || (state.cooldownUntil && now > state.cooldownUntil),
        rateLimited: state.rateLimited,
        cooldownRemaining: state.cooldownUntil ? Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000)) : 0,
        remainingRequests: state.remainingRequests,
        requestCount: state.requestCount,
      };
    });
  }

  // Get estimated time until at least one key becomes available
  getNextAvailableTime() {
    const now = Date.now();
    let earliest = Infinity;

    for (const key of this.keys) {
      const state = this.keyStates.get(key);
      if (!state.rateLimited) return 0; // Already available
      if (state.cooldownUntil && state.cooldownUntil < earliest) {
        earliest = state.cooldownUntil;
      }
    }

    if (earliest === Infinity) return 60; // Default 60 seconds
    return Math.max(0, Math.ceil((earliest - now) / 1000));
  }

  // Get total number of configured keys
  getKeyCount() {
    return this.keys.length;
  }
}

// Parse duration strings like "1m30s", "45s", "2m" to milliseconds
function parseDuration(str) {
  if (!str) return Date.now() + 60000;
  
  let totalMs = 0;
  const minuteMatch = str.match(/(\d+(?:\.\d+)?)m(?!s)/);
  const secondMatch = str.match(/(\d+(?:\.\d+)?)s/);
  const msMatch = str.match(/(\d+(?:\.\d+)?)ms/);

  if (minuteMatch) totalMs += parseFloat(minuteMatch[1]) * 60000;
  if (secondMatch) totalMs += parseFloat(secondMatch[1]) * 1000;
  if (msMatch) totalMs += parseFloat(msMatch[1]);

  return Date.now() + (totalMs || 60000);
}

// Singleton instance
let keyManagerInstance = null;

export function getKeyManager() {
  if (!keyManagerInstance) {
    keyManagerInstance = new KeyManager();
  }
  return keyManagerInstance;
}
