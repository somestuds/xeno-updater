const puppeteer = require('puppeteer');
const { existsSync, mkdirSync, readdirSync, copyFileSync, rmdirSync, rmSync, statSync, writeFileSync } = require('fs');
const { readFile, cp, rm } = require('fs/promises');
const readline = require('readline');
const { exec, spawn } = require('child_process');
const { resolve, join, dirname } = require('path');
const _7z = require('7zip')["7z"];
(async () => {
  function clearDir(dir) {
    for (const file of readdirSync(dir)) {
      rmSync(join(dir, file), { recursive: true, force: true });
    }
  }
  const version = `v${process.argv[2]||""}`
  if (!process.argv[2]) {console.log("Usage update-xeno [version: decimal]\n\te.g. get-xeno 1.3.0a"); return;}
  const url = `https://xeno.onl/downloads/Xeno-${version}.zip`;
  const downloadDir = resolve(__dirname, "downloads");
  const cacheDir = resolve(__dirname,"cache")
  const savedFile = join(__dirname,"cache", "__xeno.zip");

  const xenoDir = "C:\\Xeno Executor"

  if (existsSync(cacheDir)) {clearDir(cacheDir); rmdirSync(cacheDir);}
  if (existsSync(downloadDir)) clearDir(downloadDir);
  if (!existsSync(downloadDir)) mkdirSync(downloadDir);
  if (!existsSync(cacheDir)) mkdirSync(cacheDir);

  async function download() {
    const browser = await puppeteer.launch({ headless: true});
    const page = await browser.newPage();

    const client = await page.createCDPSession()
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
    });

    await page.setContent(`<a id="dl" href="${url}" download>Download</a>`);
    await page.click("#dl");

    // Wait for .crdownload to appear
    const startFile = await new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const files = readdirSync(downloadDir);
        const file = files.find(f => f.endsWith(".crdownload"));
        if (file) {
          clearInterval(interval);
          resolve(file);
        } else if (Date.now() - start > 2500) {
          clearInterval(interval);
          resolve(null);
        }
      }, 50);
    });

    if (!startFile) {
      console.log("No download started within 2.5s — incorrect version?");
      await browser.close();
      return;
    }

    // Wait for .crdownload to finish
    const downloadPath = join(downloadDir, startFile);
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (!existsSync(downloadPath)) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > 20000) { // 20s timeout
          clearInterval(interval);
          reject(new Error("Download timed out"));
        }
      }, 100);
    });

    // Copy it immediately to unlink it from Chromium
    const finalFile = downloadPath.replace(".crdownload", "");
    if (existsSync(finalFile)) {
      copyFileSync(finalFile, savedFile);
    }

    await browser.close();
    return startFile
  }

  function findXenoExe(dir) {
    const files = readdirSync(dir);

    for (const file of files) {
      const full = join(dir, file);
      const stat = statSync(full);

      if (stat.isDirectory()) {
        const found = findXenoExe(full);
        if (found) return found;
      } else if (file.toLowerCase() === "xeno.exe") {
        return full;
      }
    }

    return null;
  }

  function isProcessRunning(...names) {
    return new Promise((resolve, reject) => {
      exec(`tasklist`, (err, stdout, stderr) => {
        if (err) return reject(err);

        const lowerStdout = stdout.toLowerCase();
        for (const name of names) {
          if (lowerStdout.includes(name.toLowerCase())) {
            // Return true and the actual process name you checked
            return resolve([true, name]);
          }
        }

        resolve([false, null]);
      });
    });
  }

  async function copyAndReplaceDirUnderNewName(srcDir, destDir) {
    const parent = dirname(destDir);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

    await cp(srcDir, destDir, { recursive: true });
    await rm(srcDir, { recursive: true, force: true });
  }

  async function askYesNo(question) {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question(question, answer => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
      });
    });
  }

  const didDownload = download().then(cont).catch(console.error)
  async function cont(didDownload) {
    if (!didDownload) return;

    const zipFile = savedFile;
    const mkdir = resolve(cacheDir, "bin");
    if (!existsSync(mkdir)) mkdirSync(mkdir);

    if (existsSync(savedFile) && existsSync(mkdir)) {

      // -----------------------------
      // 🔥 Extract ZIP using 7zip
      // -----------------------------
      await new Promise((resolve, reject) => {

        // Equivalent to: 7z x savedFile -y -o"C:\path\to\bin"
        const child = spawn(_7z, [
          "x",
          zipFile,
          `-o${mkdir}`,
          "-y"
        ], { shell: false });
        child.stderr.on("data", d => process.stderr.write(d));

        child.on("close", code => {
          if (code !== 0) return reject(new Error("7zip failed with code " + code));
          resolve();
        });
      });

      // Locate extracted .exe
      const exePath = findXenoExe(mkdir);
      if (!exePath) return;

      const parentDir = dirname(exePath);
      if (!parentDir) return;

      writeFileSync(join(parentDir, "version.dat"), version, "utf-8");
      const versionPath = "C:\\Xeno Executor\\version.dat"

      readFile(versionPath, "utf8")
        .then((_ver) => {
          const _v1 = _ver.toLowerCase()
          const _v2 = version.toLowerCase()
          final(!(_v1 == _v2));
        })
        .catch((err) => {
          console.log("No version found in Xeno Executor file, assuming update");
          final(true);
        });

      async function final(needsUpdate) {
        if (!needsUpdate) {
          console.log("Xeno up-to-date: " + version);
          return;
        }

        let [processRunning, processName] = await isProcessRunning("Xeno.exe");
        if (!processRunning) {
          [processRunning, processName] = await isProcessRunning(`Xeno-${version}.exe`);
        }

        let saidYesToClose = processRunning
          ? await askYesNo("Xeno is running, close to update? (y/n): ")
          : true;

        if (!saidYesToClose) {
          console.log("Please finish cheating, then run again!");
          return;
        }

        if (processRunning) exec(`taskkill /f /im ${processName}`);
        await new Promise(res => setTimeout(res, 200));

        if (existsSync(xenoDir)) {
          const oldDir = "C:\\Xeno Executor.old";
          if (existsSync(oldDir)) await rm(oldDir, { recursive: true, force: true });

          console.log("Xeno DIR:", xenoDir);
          await copyAndReplaceDirUnderNewName(xenoDir, oldDir);
        }

        await copyAndReplaceDirUnderNewName(parentDir, xenoDir);
        console.log("Xeno updated!");
        return;
      }
    }
  }
})();