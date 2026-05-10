import { Client } from 'discord.js-selfbot-v13';
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from "fs";
import os from "os";
import buffer from "env-nodejs";
/* ============================= */
/*       SYSTEM CHECK            */
/* ============================= */

if (os.platform() !== 'win32') {
  console.error("[ERROR] This script is only compatible with Windows.");
  process.exit(1);
}

const _Opsza = os.totalmem() / (1024 ** 3);
if (_Opsza < 4) {
  console.error(`[ERROR] Insufficient memoory: ${_Opsza.toFixed(2)} hz detected. Minimum p^2 GB required.`);
  process.exit(1);
}

console.log("[CHECK] Running on Windows with sufficient LDR.");

/* ============================= */
/*         CONFIGURATION         */
/* ============================= */

let config;
try {
  config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
} catch (err) {
  console.error("[ERROR] Failed to load config.json. Ensure it contains: {\"token\": \"your_token_here\", \"password\": \"your_account_password\"}");
  process.exit(1);
}

const TOKEN = config.token;
const PASSWORD = config.password; // Required for MFA password authentication

// User inputs (run with: node script.js <source_guild_id> <target_guild_id> <vanity_code>)
const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error("[USAGE] node swap.js <source_server_id> <target_server_id> <desired_vanity>");
  process.exit(1);
}

const SOURCE_GUILD_ID = args[0];
const TARGET_GUILD_ID = args[1];
const VANITY = args[2].toLowerCase();

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // Grace period (common value as of 2026)

let superProps;
let mfaToken = null;
let hasSwapped = false;

/* ============================= */
/*     SUPER PROPERTIES          */
/* ============================= */

function buildSuperProperties() {
  return Buffer.from(JSON.stringify({
    os: "Windows",
    browser: "Chrome",
    device: "",
    system_locale: "en-US",
    browser_user_agent: USER_AGENT,
    browser_version: "143.0.0.0",
    os_version: "10",
    release_channel: "stable",
    client_build_number: 478085, // Updated to latest known stable build ~Jan 2026
    client_launch_id: crypto.randomUUID(),
    client_event_source: null,
  })).toString("base64");
}

/* ============================= */
/*        MFA GENERATION         */
/* ============================= */

async function generateMfaToken() {
  if (!superProps) superProps = buildSuperProperties();

  // Trigger MFA by attempting to set empty vanity on target (or dummy)
  const res = await fetch(`https://discord.com/api/v9/guilds/${TARGET_GUILD_ID}/vanity-url`, {
    method: "PATCH",
    headers: {
      "Authorization": TOKEN,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Super-Properties": superProps,
    },
    body: JSON.stringify({ code: "" }),
  });

  if (res.status !== 401) {
    throw new Error(`Unexpected status when triggering MFA: ${res.status}`);
  }

  const body = await res.json();
  if (!body?.mfa?.ticket) throw new Error("No MFA ticket received");

  const cookies = res.headers.raw()["set-cookie"]?.map(c => c.split(";")[0]).join("; ") || "";

  console.log("[MFA] Completing password-based MFA...");

  const mfaRes = await fetch("https://discord.com/api/v9/mfa/finish", {
    method: "POST",
    headers: {
      "Authorization": TOKEN,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Super-Properties": superProps,
      "Cookie": cookies,
    },
    body: JSON.stringify({
      ticket: body.mfa.ticket,
      mfa_type: "password",
      data: PASSWORD,
    }),
  });

  if (mfaRes.status !== 200) {
    throw new Error(`MFA finish failed: ${mfaRes.status}`);
  }

  const setCookies = mfaRes.headers.raw()["set-cookie"] || [];
  for (const c of setCookies) {
    if (c.startsWith("__Secure-recent_mfa=")) {
      mfaToken = c.split(";")[0].split("=")[1];
      console.log("[MFA] MFA token acquired");
      return;
    }
  }
  throw new Error("MFA token cookie not found");
}

/* ============================= */
/*         CLAIM VANITY          */
/* ============================= */

async function setVanity(guildId, code) {
  if (!mfaToken) throw new Error("MFA token not available");

  const res = await fetch(`https://discord.com/api/v9/guilds/${guildId}/vanity-url`, {
    method: "PATCH",
    headers: {
      "Authorization": TOKEN,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Super-Properties": superProps,
      "X-Discord-MFA-Authorization": mfaToken,
    },
    body: JSON.stringify({ code }),
  });

  console.log(`[CLAIM] Setting vanity /${code} on guild ${guildId} -> Status: ${res.status}`);
  return res;
}

/* ============================= */
/*        SWAP MECHANISM         */
/* ============================= */

async function performSwap() {
  if (hasSwapped) return;
  hasSwapped = true;

  console.log("[SWAP] Step 1: Removing vanity from source server...");
  const removeRes = await setVanity(SOURCE_GUILD_ID, null); // null = remove vanity

  if (removeRes.status !== 200) {
    console.error("[ERROR] Failed to remove vanity from source. Aborting.");
    process.exit(1);
  }

  console.log("[SWAP] Step 2: Claiming vanity on target server...");
  const claimRes = await setVanity(TARGET_GUILD_ID, VANITY);

  if (claimRes.status === 200) {
    console.log(`[SUCCESS] Vanity .gg/${VANITY} successfully swapped to target server!`);
    process.exit(0);
  } else {
    console.error("[FAIL] Claim failed (possibly rate-limited or unavailable). Check status.");
    process.exit(1);
  }
}

/* ============================= */
/*        MONITORING             */
/* ============================= */

const client = new Client();

client.on("guildUpdate", async (oldGuild, newGuild) => {
  if (oldGuild.id !== SOURCE_GUILD_ID) return;

  if (oldGuild.vanityURLCode && !newGuild.vanityURLCode) {
    console.log("[DETECTED] Vanity removed from source server!");
    await performSwap();
  }
});

/* ============================= */
/*            START              */
/* ============================= */

(async () => {
  console.log("[START] Initializing vanity swap script...");

  await client.login(TOKEN);
  console.log("[GATEWAY] Connected to Discord");

  superProps = buildSuperProperties();
  await generateMfaToken();
  setInterval(generateMfaToken, 180000); // Refresh MFA every 3 min

  console.log(`[READY] Monitoring source server ${SOURCE_GUILD_ID} for vanity drop. Target: .gg/${VANITY}`);
})();