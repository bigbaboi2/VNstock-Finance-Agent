import puppeteer from 'puppeteer';
import chalk from 'chalk';

let _browser = null;
let _browserTimer = null;
let _launchingPromise = null;

const IDLE_TIMEOUT = 3 * 60 * 1000;


let _crashCount = 0;
const MAX_CRASH_RETRIES = 3;

export const closeBrowser = async () => {
    if (_browser) {
        try { await _browser.close(); } catch {}
        _browser = null;
        console.log(chalk.gray('X [BrowserManager] Đã đóng Chromium để giải phóng RAM.'));
    }
};


export const respawnBrowser = async () => {
    if (_crashCount >= MAX_CRASH_RETRIES) {
        console.log(chalk.red(`[BrowserManager] Đã crash ${_crashCount} lần liên tiếp, không respawn thêm.`));
        return null;
    }
    _crashCount++;
    console.log(chalk.yellow(`[BrowserManager] Respawn lần ${_crashCount}/${MAX_CRASH_RETRIES}...`));
    clearTimeout(_browserTimer);
    _browser = null;
    _launchingPromise = null;
    return getBrowser();
};

export const getBrowser = async () => {

    if (_launchingPromise) {
        return await _launchingPromise;
    }

    if (_browser) {
        clearTimeout(_browserTimer);
        _browserTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);
        try {
            await _browser.version();
            _crashCount = 0; 
            return _browser;
        } catch {
            
            console.log(chalk.yellow('[BrowserManager] Browser không còn phản hồi, sẽ khởi động lại.'));
            _browser = null;
        }
    }

    console.log(chalk.yellowBright('+ [BrowserManager] Khởi động Chromium Engine dùng chung...'));

    _launchingPromise = puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
        ],
    }).then(browser => {
        _browser = browser;
        _launchingPromise = null;
        _crashCount = 0; 

        
        browser.on('disconnected', () => {
            console.log(chalk.yellow('[BrowserManager] Browser bị ngắt kết nối bất ngờ (crash/OOM).'));
            _browser = null;
            clearTimeout(_browserTimer);
        });

        clearTimeout(_browserTimer);
        _browserTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);

        return browser;
    }).catch(err => {
        _launchingPromise = null;
        console.error(chalk.red('[BrowserManager] Lỗi khởi động Puppeteer:'), err.message);
        return null;
    });

    return await _launchingPromise;
};