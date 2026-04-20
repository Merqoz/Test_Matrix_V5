/**
 * SYNC-CONFIG.JS - Sync provider configuration
 * 
 * Currently supports JSONbin.io as sync backend.
 *
 * DO NOT commit this file to a public repo!
 *
 * ACTIVE_PROVIDER options:
 *   'none'    - no remote sync, localStorage only
 *   'jsonbin' - sync via JSONbin.io
 *
 * You can also right-click the sync icon (bottom-right) to switch.
 */

const SYNC_CONFIG = {

    // Which provider to use
    ACTIVE_PROVIDER: 'none',

    // JSONbin.io credentials
    // 1. Go to https://jsonbin.io and create account
    // 2. Create a Bin with content: {}
    // 3. Copy Bin ID and X-Master-Key below
    BIN_ID:   'YOUR_BIN_ID_HERE',
    API_KEY:  'YOUR_X_MASTER_KEY_HERE',
    ENABLED:  true,
};
