import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
    throw new Error("npm_package_version is not set.");
}

// Read minAppVersion from manifest.json and bump manifest version to target version.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

if (typeof minAppVersion !== "string" || minAppVersion.length === 0) {
    throw new Error("manifest.json must contain a valid minAppVersion.");
}

manifest.version = targetVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);

// Update versions.json with target version and minAppVersion.
// Check the version key, not the minAppVersion value.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

if (!Object.prototype.hasOwnProperty.call(versions, targetVersion)) {
    versions[targetVersion] = minAppVersion;
    writeFileSync("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);
}
