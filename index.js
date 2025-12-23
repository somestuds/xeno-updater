const { existsSync, mkdirSync, readdirSync, copyFileSync, rmdirSync, rmSync, statSync, writeFileSync, readFileSync } = require('fs');
const { readFile, cp, rm } = require('fs/promises');
const { resolve, join, dirname } = require('path');
const { exec, spawn } = require('child_process');
const readline = require('readline');

const _7z = require('7zip')["7z"];
const { Command } = require("commander")
const { stringify, parse } = require("ini")
const nfd = require("native-file-dialog")
const puppeteer = require('puppeteer');


async function getXenoDownload() {
  return new Promise(async (res, rej) => {
    async function Page(browser, url) {
      let page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return page;
    }

    async function waitForSelectorOrNull(page, selector, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = await page.$(selector);
        if (el) return el;
        await new Promise(r => setTimeout(r, 100))
      }
      return null;
    }
    async function waitForParentOfSelectorWithText(page, selector, text, timeout = 5000) {
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const elements = await page.$$(selector);
        for (const el of elements) {
          const elText = await el.evaluate(e => e.textContent.trim());
          if (elText === text) { // exact match; use includes() for partial match
            const parentHandle = await el.evaluateHandle(e => e.parentElement);
            return parentHandle;
          }
        }
        await new Promise(r => setTimeout(r, 100)); // poll every 100ms
      }

      return null; // not found
    }

    let browser = await puppeteer.launch({ headless: true });
    let page = await Page(browser, 'https://xeno.onl/method')

    const adLinkAnchor = await waitForSelectorOrNull(page, 'a[href*="loot-link.com"]', 1200)
    const adLink = await page.evaluate(el => el.href, adLinkAnchor);

    await page.close();

    if (!adLinkAnchor || !adLink) {
      console.log("Could not find Xeno ad-link.");
      rej("Could not find Xeno ad-link.")
    }
    console.log("Obtained Xeno Ad-Link:", adLink)
    page = await Page(browser, `https://link-bypass.com/bypass?url-input=${encodeURIComponent(adLink)}`);

    // await page.evaluateOnNewDocument(() => {
    //     window.open = () => null;
    // });

    browser.on("targetcreated", async target => {
      //console.log(target, target.type())
      if (target.type() === "page") {
        const newPage = await target.page();
        const url = newPage.url();
        console.log("opened: ", url)
        if (!(url.includes("link-bypass") || url.includes("xeno.onl"))) {
          newPage.close();
        }
      }
    });
    // page.setRequestInterception(true)
    // page.on('request', (request) => {
    //     const url = request.url();

    //     // Block Google Ads domains or requests containing /ads/
    //      if (!url.includes('google') && !url.includes("link-bypass")) {
    //          request.abort()
    //      } else {
    //         console.log(url);
    //      }
    // });

    const urlSubmitButton = await page.$('#access-btn');
    await new Promise(r => setTimeout(r, 1200))
    console.log("Bypassing Ad-Link...")
    await urlSubmitButton.click();

    let targetXenoPageAnchor = await waitForSelectorOrNull(page, "a.header-order-button-slid.input-glow.search-btn", 8000)
    if (!targetXenoPageAnchor) {
      console.log("Could not bypass Ad-Link");
      await browser.close();
      return;
    }

    const xenoDownloadPage = await page.evaluate(el => el.href, targetXenoPageAnchor)
    console.log("Xeno Download Page:", xenoDownloadPage)

    await page.close()
    //await browser.close();

    browser.removeAllListeners("targetcreated")

    //browser = await puppeteer.launch({headless: false})
    page = await Page(browser, xenoDownloadPage)
    const legacyOldUiButton = await waitForParentOfSelectorWithText(page, 'div', 'Legacy', 600)
    await legacyOldUiButton.click();

    const submitSpan = await waitForParentOfSelectorWithText(page, 'span', 'Download')
    if (!submitSpan) {
      console.log("Failed to obtain Xeno Submit button");
      await browser.close();
      rej("Failed to obtain Xeno Submit button")
    }

    const client = await page.target().createCDPSession();
    await client.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: "./downloads",
      eventsEnabled: true
    });
    client.on("Browser.downloadWillBegin", async (event) => {
      let name = event.suggestedFilename
      let fileUrl = event.url

      if (name.toLowerCase().includes("xeno") && name.toLowerCase().endsWith(".zip")) {
        await browser.close();
        res(fileUrl);
      }
    });

    const submitButton = await submitSpan.evaluateHandle(el => el.parentElement)
    await new Promise(r => setTimeout(r, 500))
    await submitButton.click();

    await new Promise(r => { setTimeout })
    console.log("Timed out")
  })
}

if (!existsSync(".config")) {
  writeFileSync(".config","","utf-8")
}

const config = parse(readFileSync(".config", "utf-8"))


const defaultInstallDirectory = "C:\\Xeno Executor"
let installDirectory = config.installDir ?? defaultInstallDirectory

const optManager = new Command("update-xeno")
  .helpOption("-h, --help", "Shows the help print")
  .option("-o, --output", "Sets output directory, (saves in config for future)")
  .option("-d, --get-output-dir", "Reads you your last chosen output directory")

optManager.parse(process.argv)

const options = optManager.opts()
if (options.getOutputDir) {
  console.log(installDirectory)
  return;
}
if (options.output && !options.getOutputDir) {
  const path = nfd.folder_dialog()
  if (path == "UserCancelled") {
    console.log("Cancelled, using regular directory: " + installDirectory)
  } else {
    console.log("From now on, this updater will use:", path);
    installDirectory = path;
    config.installDir = path;
    writeFileSync(".config", stringify(config))
  }
}
const installOldDir = installDirectory + ".old";

(async () => {
  function clearDir(dir) {
    for (const file of readdirSync(dir)) {
      rmSync(join(dir, file), { recursive: true, force: true });
    }
  }
  const url = await new Promise(res => {
    getXenoDownload().then(res).catch((reason) => {
      console.log("Could not obtain Xeno Download Url;\n", reason)
      return;
    })
  })
  console.log("Obtained Xeno download url:", url)

  const downloadDir = resolve(__dirname, "downloads");
  const cacheDir = resolve(__dirname,"cache")
  const savedFile = join(__dirname,"cache", "__xeno.zip");

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
      console.log("No download started within 2.5s");
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
          console.log("Extracted Xeno Binary");
          resolve();
        });
      });

      // Locate extracted .exe
      const exePath = findXenoExe(mkdir);
      if (!exePath) return;

      const parentDir = dirname(exePath);
      if (!parentDir) return;

      const version = url.split("Xeno-")[1].split("-")[0]
      console.log("New Version:", version)

      writeFileSync(join(parentDir, "version.dat"), version, "utf-8");
      const versionPath = join(installDirectory,"version.dat")

      readFile(versionPath, "utf8")
        .then((_ver) => {
          const _v1 = _ver.toLowerCase()
          const _v2 = version.toLowerCase()
          final(!(_v1 == _v2), _v1);
        })
        .catch(() => {
          console.log("No version found in Xeno Executor file, assuming update");
          final(true, null);
        });

      async function final(needsUpdate, oldVersion) {
        if (!needsUpdate) {
          console.log("Xeno up-to-date: " + oldVersion + " | " + version + " (latest)");
          return;
        } else {
          console.log("Xeno updating: " + (oldVersion ?? "v0.0.0") + " -> " + version)
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

        if (existsSync(installDirectory)) {
          if (existsSync(installOldDir)) await rm(installOldDir, { recursive: true, force: true });

          console.log("Xeno installed to:", installDirectory);
          await copyAndReplaceDirUnderNewName(installDirectory, installOldDir);
        }

        await copyAndReplaceDirUnderNewName(parentDir, installDirectory);
        console.log("Xeno updated successfully!");
        return;
      }
    }
  }
})();