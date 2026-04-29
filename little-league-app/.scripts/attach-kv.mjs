import fs from "node:fs";

const tomlText = fs.readFileSync(
  `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`,
  "utf8"
);
const token = tomlText.match(/oauth_token\s*=\s*"([^"]+)"/)[1];

const ACCOUNT_ID = "7e05800e544d9cd64233d80cdae674d6";
const PROJECT = "little-league-app";
const KV_ID = "85907a1d3b5f44f4be90b8e5c5d56507";

const body = {
  deployment_configs: {
    production: {
      kv_namespaces: {
        DEPTH_CHARTS: { namespace_id: KV_ID },
      },
    },
    preview: {
      kv_namespaces: {
        DEPTH_CHARTS: { namespace_id: KV_ID },
      },
    },
  },
};

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
);
const json = await res.json();
console.log("STATUS", res.status);
console.log("SUCCESS", json.success);
if (!json.success) {
  console.log("ERRORS", JSON.stringify(json.errors, null, 2));
} else {
  const prod = json.result?.deployment_configs?.production?.kv_namespaces;
  console.log("PROD KV BINDINGS:", JSON.stringify(prod, null, 2));
}
