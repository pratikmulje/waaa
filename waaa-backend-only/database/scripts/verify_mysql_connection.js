/*
==============================================================================
WAAA - Pre-Flight MySQL Connectivity & Version Verification Script
==============================================================================
Tests connectivity to MySQL 8.0+, validates privileges, and outputs
status. Run with: node database/scripts/verify_mysql_connection.js
==============================================================================
*/

import "dotenv/config";
import { testConnection, getPoolConfig } from "../../src/db/mysqlClient.js";

async function main() {
  console.log("==================================================");
  console.log("🔍 WAAA MySQL Pre-Flight Connectivity Check");
  console.log("==================================================");

  const config = getPoolConfig();
  console.log(`Connecting to MySQL at: ${config.host}:${config.port}`);
  console.log(`User:                   ${config.user}`);
  console.log(`Target Database:        ${config.database}`);

  const result = await testConnection();

  if (result.ok) {
    console.log("\n✅ MySQL Server is REACHABLE and READY!");
    console.log(`  Version:  ${result.version}`);
    console.log(`  Auth User: ${result.user}`);
    
    // Check if version is 8.0+
    const versionMatch = result.version.match(/^(\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10);
      if (major >= 8) {
        console.log(`  Version Check: Compatible MySQL 8.0+ detected (${result.version}).`);
      } else {
        console.warn(`  ⚠️ Warning: Detected MySQL version ${result.version}. Recommended version is MySQL 8.0+.`);
      }
    }
    process.exit(0);
  } else {
    console.error("\n❌ MySQL Server Connection FAILED:");
    console.error(`  Error Code:    ${result.code || "N/A"}`);
    console.error(`  Error Message: ${result.error}`);
    console.log("\n🔧 Troubleshooting Instructions:");
    console.log("  1. Verify MySQL 8.0+ is installed and running on your system.");
    console.log("     - Windows: Check Windows Services for 'MySQL80' or start MySQL.");
    console.log("     - Install via winget: winget install --id Oracle.MySQL -e");
    console.log("  2. Verify credentials in your .env file (MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD).");
    console.log("  3. Verify port 3306 is not blocked by local firewall.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error during check:", err);
  process.exit(1);
});
