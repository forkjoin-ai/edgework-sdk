import { execSync } from 'child_process';
import { resolve } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';

const __dirname = import.meta.dir;
const ROOT_DIR = resolve(__dirname, '..'); // packages/edgework-sdk
const MONOREPO_ROOT = resolve(ROOT_DIR, '../../'); // e:/emotions

const OPENAPI_FILE_REL =
  'apps/docs-app/public/api-docs/ai-gateway-openapi.json';
const OPENAPI_SPEC = resolve(MONOREPO_ROOT, OPENAPI_FILE_REL);

const OUTPUT_TS = resolve(ROOT_DIR, 'src/compute/gateway');
const OUTPUT_GO_REL = 'packages/edgework-sdk/generated/go';
const OUTPUT_RUST_REL = 'packages/edgework-sdk/generated/rust';

// Helper to check Docker
function isDockerRunning() {
  try {
    // 'docker info' checks if daemon is responsive
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log(`Generating clients from ${OPENAPI_SPEC}...`);

// Clean output directories
// Clean output directories
console.log('Cleaning output directories...');
const OUTPUT_GO = resolve(ROOT_DIR, 'generated/go');
const OUTPUT_RUST = resolve(ROOT_DIR, 'generated/rust');
const dirsToClean = [OUTPUT_TS, OUTPUT_GO, OUTPUT_RUST];
for (const dir of dirsToClean) {
  if (existsSync(dir)) {
    try {
      // Recursive delete. Requires Node 14.14+
      // @ts-expect-error -- require is not typed in Bun script context without specific types
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Failed to clean ${dir} (might be empty or locked)`);
    }
  }
}

// Generate TypeScript using @hey-api/openapi-ts (Native JS, fast, reliable)
console.log('--- TypeScript (@hey-api) ---');
try {
  // Generate config or pass args.
  // Use --name "EdgeworkGateway" to name the client class if necessary, but @hey-api usually exports generic functions
  const cmd = `bun x openapi-ts -i "${OPENAPI_SPEC}" -o "${OUTPUT_TS}" -c @hey-api/client-fetch`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  console.error('Failed to generate TypeScript client');
  process.exit(1);
}

// Generate Go and Rust using Docker if available
const DOCKER_IMAGE = 'openapitools/openapi-generator-cli:v7.11.0';
const CMD_BASE = `docker run --rm -v "${MONOREPO_ROOT}:/workspace" ${DOCKER_IMAGE}`;

// Helper to check Java
function getJavaVersion() {
  try {
    // Redirect stderr to stdout to capture version info
    const output = execSync('java -version 2>&1', { encoding: 'utf8' });
    return output;
  } catch (e: any) {
    // If command failed but produced output
    const out = e.stdout?.toString() || e.stderr?.toString();
    if (out) return out;
    return null;
  }
}

function patchRustClient() {
  console.log('--- Patching Rust Client ---');
  const rustDir = resolve(ROOT_DIR, 'generated/rust/src/models');

  // Patch Cargo.toml to disable default features for reqwest (crucial for WASM)
  const cargoPath = resolve(ROOT_DIR, 'generated/rust/Cargo.toml');
  if (existsSync(cargoPath)) {
    let content = readFileSync(cargoPath, 'utf8');
    if (!content.includes('default-features = false')) {
      console.log('Patching Cargo.toml...');
      // This regex targets [dependencies.reqwest] block and adds default-features = false
      content = content.replace(
        /\[dependencies\.reqwest\]\s*\nversion = "([^"]+)"/,
        '[dependencies.reqwest]\nversion = "$1"\ndefault-features = false'
      );
      writeFileSync(cargoPath, content);
    }
  }

  if (existsSync(rustDir)) {
    const files = readdirSync(rustDir);
    for (const file of files) {
      const filePath = resolve(rustDir, file);
      if (file.endsWith('.rs')) {
        let content = readFileSync(filePath, 'utf8');
        if (content.includes('OneOfstringarray')) {
          console.log(`Patching ${file}...`);
          // Remove Box wrapper from struct definition
          content = content.replace(
            /Option<Box<crate::models::OneOfstringarray>>/g,
            'Option<serde_json::Value>'
          );
          // Update new method signature
          content = content.replace(
            /Option<crate::models::OneOfstringarray>/g,
            'Option<serde_json::Value>'
          );
          // Remove Box::new from ANY field assignment (e.g. content: Box::new(content) or input: Box::new(input))
          content = content.replace(/(\w+):\s*Box::new\(\1\)/g, '$1');
          // Fallback cleanup
          content = content.replace(
            /crate::models::OneOfstringarray/g,
            'serde_json::Value'
          );
          content = content.replace(/OneOfstringarray/g, 'serde_json::Value');
          writeFileSync(filePath, content);
        }
      }
    }
  }
}

// Helper to build WASM client
function buildWasmClient() {
  console.log('--- Building Rust WASM Client ---');
  const wasmDir = resolve(ROOT_DIR, 'rust/wasm-wrapper');
  const outDir = resolve(ROOT_DIR, 'src/compute/gateway/wasm');

  try {
    execSync('wasm-pack --version', { stdio: 'ignore' });
  } catch {
    console.warn('wasm-pack not found. Skipping WASM build.');
    console.warn('Install with: cargo install wasm-pack');
    return;
  }

  try {
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    // wasm-pack output configuration
    const cmd = `wasm-pack build --target web --out-dir "${outDir}"`;
    console.log(`Running: ${cmd}`);
    execSync(cmd, { cwd: wasmDir, stdio: 'inherit' });
    console.log('--- WASM Client Built Successfully ---');
  } catch (e) {
    console.error('Failed to build WASM client:', e);
  }
}

if (isDockerRunning()) {
  // Generate Go
  console.log('--- Go (Docker) ---');
  try {
    const cmd = `${CMD_BASE} generate -i "/workspace/${OPENAPI_FILE_REL}" -g go -o "/workspace/${OUTPUT_GO_REL}" --additional-properties=packageName=edgework_sdk,packageVersion=1.0.0`;
    console.log(`Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to generate Go client via Docker');
  }

  // Generate Rust
  console.log('--- Rust (Docker) ---');
  try {
    const cmd = `${CMD_BASE} generate -i "/workspace/${OPENAPI_FILE_REL}" -g rust -o "/workspace/${OUTPUT_RUST_REL}" --additional-properties=packageName=edgework-sdk,packageVersion=1.0.0`;
    console.log(`Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to generate Rust client via Docker');
  }
} else {
  // Fallback to Java
  const javaVersion = getJavaVersion();
  if (javaVersion) {
    console.log('--- Docker not running, falling back to System Java ---');
    console.log(`Detected Java: ${javaVersion.split('\n')[0]}`);

    // If Java 8, we must use an older generator version (v5.x)
    // v6.x+ usually requires Java 11
    if (javaVersion.includes('1.8.0') || javaVersion.includes('"1.8"')) {
      console.log(
        'Java 8 detected. Using openapitools.json configuration (v5.4.0) for compatibility...'
      );
    }

    const OPENAPI_GENERATOR_CMD = 'bun openapi-generator-cli';
    const OUTPUT_GO = resolve(ROOT_DIR, 'generated/go');
    const OUTPUT_RUST = resolve(ROOT_DIR, 'generated/rust');

    // Generate Go (Java)
    console.log('--- Go (Java) ---');
    try {
      // Note: We use absolute paths here since we are not in Docker
      const cmd = `${OPENAPI_GENERATOR_CMD} generate -i "${OPENAPI_SPEC}" -g go -o "${OUTPUT_GO}" --skip-validate-spec --additional-properties=packageName=edgework_sdk,packageVersion=1.0.0`;
      console.log(`Running: ${cmd}`);
      execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
    } catch (e) {
      console.error('Failed to generate Go client via Java');
    }

    // Generate Rust (Java)
    console.log('--- Rust (Java) ---');
    try {
      const cmd = `${OPENAPI_GENERATOR_CMD} generate -i "${OPENAPI_SPEC}" -g rust -o "${OUTPUT_RUST}" --skip-validate-spec --additional-properties=packageName=edgework-sdk,packageVersion=1.0.0`;
      console.log(`Running: ${cmd}`);
      execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
    } catch (e) {
      console.error('Failed to generate Rust client via Java');
    }
  } else {
    console.warn('--- Go and Rust generation skipped ---');
    console.warn(
      'Docker is not running AND Java is not found. To generate Go/Rust clients, ensure Docker Desktop is running OR Java is installed.'
    );
  }
}

// Build WASM client after Rust generation
patchRustClient();
buildWasmClient();

console.log('Generation complete.');
