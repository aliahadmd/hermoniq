#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");
const appJsonPath = path.join(rootDir, "app.json");
const buildGradlePath = path.join(rootDir, "android", "app", "build.gradle");

const dryRun = process.argv.includes("--dry-run");

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseSemver(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(
			`Unsupported version format \"${version}\". Expected MAJOR.MINOR.PATCH (for example 0.0.1).`,
		);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

function bumpPatch(version) {
	const parsed = parseSemver(version);
	const nextPatch = parsed.patch + 1;
	return `${parsed.major}.${parsed.minor}.${nextPatch}`;
}

function replaceGradleVersion(gradleText, nextVersionName, nextVersionCode) {
	if (!/versionCode\s+\d+/.test(gradleText)) {
		throw new Error("Could not find versionCode in android/app/build.gradle.");
	}
	if (!/versionName\s+"[^"]+"/.test(gradleText)) {
		throw new Error("Could not find versionName in android/app/build.gradle.");
	}

	return gradleText
		.replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`)
		.replace(/versionName\s+"[^"]+"/, `versionName \"${nextVersionName}\"`);
}

function readGradleVersionCode(gradleText) {
	const match = gradleText.match(/versionCode\s+(\d+)/);
	if (!match) {
		throw new Error("Could not read versionCode from android/app/build.gradle.");
	}

	return Number(match[1]);
}

function main() {
	const packageJson = readJson(packageJsonPath);
	const packageLock = fs.existsSync(packageLockPath) ? readJson(packageLockPath) : null;
	const appJson = readJson(appJsonPath);
	const buildGradle = fs.readFileSync(buildGradlePath, "utf8");

	const currentVersion = packageJson.version;
	const nextVersion = bumpPatch(currentVersion);

	const gradleVersionCode = readGradleVersionCode(buildGradle);
	const appConfigVersionCode =
		typeof appJson?.expo?.android?.versionCode === "number" ? appJson.expo.android.versionCode : 0;
	const baselineVersionCode = Math.max(gradleVersionCode, appConfigVersionCode);
	const nextVersionCode = baselineVersionCode + 1;

	packageJson.version = nextVersion;

	if (packageLock) {
		if (typeof packageLock.version === "string") {
			packageLock.version = nextVersion;
		}
		if (packageLock.packages && packageLock.packages[""] && typeof packageLock.packages[""].version === "string") {
			packageLock.packages[""].version = nextVersion;
		}
	}

	if (!appJson.expo || typeof appJson.expo !== "object") {
		throw new Error("app.json is missing the expo object.");
	}
	appJson.expo.version = nextVersion;
	appJson.expo.android = appJson.expo.android ?? {};
	appJson.expo.android.versionCode = nextVersionCode;

	const nextGradle = replaceGradleVersion(buildGradle, nextVersion, nextVersionCode);

	if (!dryRun) {
		writeJson(packageJsonPath, packageJson);
		if (packageLock) {
			writeJson(packageLockPath, packageLock);
		}
		writeJson(appJsonPath, appJson);
		fs.writeFileSync(buildGradlePath, nextGradle);
	}

	console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);
	console.log(`Android versionCode: ${baselineVersionCode} -> ${nextVersionCode}`);
	if (dryRun) {
		console.log("Dry run enabled: no files were changed.");
	}
}

try {
	main();
} catch (error) {
	console.error(`Version bump failed: ${error.message}`);
	process.exit(1);
}
